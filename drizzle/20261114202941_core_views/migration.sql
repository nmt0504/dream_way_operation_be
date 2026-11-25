-- Section 8 of docs/db/01_core.sql: views & read functions (computed status, payroll, reports)

-- 8. VIEW & HÀM ĐỌC (trạng thái tính toán, lương, báo cáo)
-- =============================================================================

-- Trạng thái buổi học (mục 5): không lưu cứng để không bao giờ lệch
CREATE VIEW core.v_sessions AS
SELECT s.*,
       s.starts_at + make_interval(mins => s.duration_min) AS ends_at,
       (s.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date  AS local_date,
       CASE
         WHEN s.status = 'cancelled'                 THEN 'cancelled'
         WHEN s.attendance_taken_at IS NOT NULL      THEN 'attended'
         WHEN now() >= s.starts_at
          AND now() <  s.starts_at + make_interval(mins => s.duration_min) THEN 'in_progress'
         ELSE 'not_attended'
       END AS display_status,
       -- DB-02 "buổi chưa điểm danh": đã tới giờ bắt đầu mà chưa lưu
       (s.status = 'scheduled' AND s.attendance_taken_at IS NULL AND s.starts_at <= now()) AS needs_attendance,
       -- ATT: chỉ điểm danh từ 15 phút trước giờ bắt đầu
       (s.status = 'scheduled' AND now() >= s.starts_at - interval '15 minutes') AS attendance_open
  FROM core.sessions s;
--> statement-breakpoint


-- Chuyên cần theo ghi danh (ATT-05, ATT-08, STU-02)
-- CÔNG THỨC TẠM: (Có mặt + Trễ) / tổng buổi đã điểm danh — chờ chốt câu hỏi mở số 1 (vắng có phép)
CREATE VIEW core.v_enrollment_attendance AS
SELECT ar.enrollment_id,
       ar.student_id,
       count(*)                                                        AS sessions_taken,
       count(*) FILTER (WHERE ar.status = 'present')                   AS present_count,
       count(*) FILTER (WHERE ar.status = 'late')                      AS late_count,
       count(*) FILTER (WHERE ar.status = 'absent' AND ar.absence_excused)     AS absent_excused,
       count(*) FILTER (WHERE ar.status = 'absent' AND NOT ar.absence_excused) AS absent_unexcused,
       round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / NULLIF(count(*), 0), 1)
                                                                       AS attendance_rate
  FROM core.attendance_records ar
  JOIN core.sessions s ON s.id = ar.session_id AND s.status = 'scheduled' AND s.attendance_taken_at IS NOT NULL
 GROUP BY ar.enrollment_id, ar.student_id;
--> statement-breakpoint


-- Trạng thái học phí của học viên = hóa đơn xấu nhất: Quá hạn > Còn nợ > Đủ học phí
CREATE VIEW core.v_student_fee_status AS
SELECT st.id AS student_id,
       CASE
         WHEN bool_or(i.status = 'overdue')                 THEN 'overdue'
         WHEN bool_or(i.status IN ('unpaid', 'partial'))    THEN 'owing'
         ELSE 'paid'
       END AS fee_status,
       COALESCE(sum(i.total_amount - i.paid_amount) FILTER (WHERE i.status <> 'cancelled'), 0)::bigint AS outstanding
  FROM core.students st
  LEFT JOIN core.invoices i ON i.student_id = st.id AND i.status <> 'cancelled'
 GROUP BY st.id;
--> statement-breakpoint


-- Bảng lương tạm tính (PAY-02..05): từ buổi đã điểm danh, đơn giá hiệu lực tại cuối kỳ
CREATE VIEW core.v_payroll_preview AS
WITH agg AS (
  SELECT date_trunc('month', s.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS period,
         s.teacher_id,
         count(*)                                    AS sessions_count,
         round(sum(s.duration_min) / 60.0, 2)        AS hours
    FROM core.sessions s
   WHERE s.status = 'scheduled' AND s.attendance_taken_at IS NOT NULL
   GROUP BY 1, 2
)
SELECT a.*, r.rate_type, r.rate,
       CASE r.rate_type
         WHEN 'hour'    THEN round(a.hours * r.rate)
         WHEN 'session' THEN a.sessions_count * r.rate
       END::bigint AS amount
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT tr.rate_type, tr.rate
      FROM core.teacher_rates tr
     WHERE tr.teacher_id = a.teacher_id
       AND tr.effective_from < (a.period + interval '1 month')::date
     ORDER BY tr.effective_from DESC
     LIMIT 1
  ) r ON true;
--> statement-breakpoint


-- Duyệt bảng lương (PAY-06): snapshot dòng lương, khóa buổi học, ghi nhật ký
CREATE FUNCTION core.approve_payroll(p_period_id uuid, p_approver uuid) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
  p core.payroll_periods;
  v_total bigint;
BEGIN
  SELECT * INTO p FROM core.payroll_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kỳ lương'; END IF;
  IF p.status = 'approved' THEN RAISE EXCEPTION 'Kỳ lương đã được duyệt'; END IF;

  IF EXISTS (SELECT 1 FROM core.v_payroll_preview v
              WHERE v.period = p.period AND v.rate IS NULL) THEN
    RAISE EXCEPTION 'Có giáo viên chưa được cấu hình đơn giá trong kỳ này';
  END IF;

  DELETE FROM core.payroll_items WHERE period_id = p_period_id;
  INSERT INTO core.payroll_items (period_id, teacher_id, sessions_count, hours, rate_type, rate, amount)
  SELECT p_period_id, v.teacher_id, v.sessions_count, v.hours, v.rate_type, v.rate, v.amount
    FROM core.v_payroll_preview v
   WHERE v.period = p.period;

  UPDATE core.sessions s SET payroll_period_id = p_period_id
   WHERE s.status = 'scheduled' AND s.attendance_taken_at IS NOT NULL
     AND date_trunc('month', s.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p.period;

  UPDATE core.payroll_periods
     SET status = 'approved', approved_by = p_approver, approved_at = now()
   WHERE id = p_period_id;

  SELECT COALESCE(sum(amount), 0)::bigint INTO v_total FROM core.payroll_items WHERE period_id = p_period_id;

  INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, new_value)
  VALUES (p_approver, 'payroll.approve', 'payroll_period', p_period_id,
          jsonb_build_object('total', v_total, 'period', p.period));
  RETURN v_total;
END $$;
--> statement-breakpoint


-- Mở lại kỳ lương đã duyệt (business chốt 15/11/2026): gỡ khóa buổi học, ghi nhật ký kèm lý do.
-- Dòng lương cũ được giữ tới khi duyệt lại; approve_payroll() sẽ xóa và tính lại từ đầu.
CREATE FUNCTION core.reopen_payroll(p_period_id uuid, p_actor uuid, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE p core.payroll_periods;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Phải ghi lý do khi mở lại kỳ lương';
  END IF;
  SELECT * INTO p FROM core.payroll_periods WHERE id = p_period_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kỳ lương'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'Kỳ lương chưa được duyệt'; END IF;

  UPDATE core.sessions SET payroll_period_id = NULL WHERE payroll_period_id = p_period_id;
  UPDATE core.payroll_periods SET status = 'pending', approved_by = NULL, approved_at = NULL
   WHERE id = p_period_id;

  INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (p_actor, 'payroll.reopen', 'payroll_period', p_period_id,
          jsonb_build_object('approved_by', p.approved_by, 'approved_at', p.approved_at,
                             'total', (SELECT COALESCE(sum(amount), 0) FROM core.payroll_items WHERE period_id = p_period_id)),
          jsonb_build_object('reason', p_reason));
END $$;
--> statement-breakpoint


-- Báo cáo tháng (RPT-02) — 6 chỉ số theo định nghĩa ở spec
CREATE FUNCTION core.monthly_report(p_month date)
RETURNS TABLE (
  revenue_recognized  bigint,    -- tổng HĐ có kỳ thuộc tháng
  collected           bigint,    -- tổng thanh toán có ngày thu trong tháng
  carried_debt        bigint,    -- còn thiếu tại 23:59 ngày cuối tháng
  payroll_total       bigint,    -- chi lương kỳ tháng đó
  avg_class_size      numeric,   -- ghi danh hiệu lực cuối tháng ÷ số lớp đang mở
  attendance_rate     numeric    -- (Có mặt + Trễ) ÷ tổng lượt điểm danh
) LANGUAGE sql STABLE AS $$
WITH b AS (
  SELECT date_trunc('month', p_month)::date                        AS m_start,
         (date_trunc('month', p_month) + interval '1 month')::date AS m_next,
         ((date_trunc('month', p_month) + interval '1 month')::timestamp
            AT TIME ZONE 'Asia/Ho_Chi_Minh')                       AS m_next_ts
)
SELECT
  (SELECT COALESCE(sum(i.total_amount), 0) FROM core.invoices i, b
    WHERE i.cancelled_at IS NULL
      AND i.period_start >= b.m_start AND i.period_start < b.m_next)::bigint,

  (SELECT COALESCE(sum(p.amount), 0) FROM core.payments p, b
    WHERE p.voided_at IS NULL
      AND p.paid_on >= b.m_start AND p.paid_on < b.m_next)::bigint,

  (SELECT COALESCE(sum(i.total_amount - COALESCE(pp.paid, 0)), 0)
     FROM core.invoices i CROSS JOIN b
     LEFT JOIN LATERAL (
       SELECT sum(p.amount) AS paid FROM core.payments p
        WHERE p.invoice_id = i.id AND p.paid_on < b.m_next
          AND (p.voided_at IS NULL OR p.voided_at >= b.m_next_ts)
     ) pp ON true
    WHERE i.created_at < b.m_next_ts
      AND (i.cancelled_at IS NULL OR i.cancelled_at >= b.m_next_ts))::bigint,

  (SELECT COALESCE(sum(pi.amount), 0)
     FROM core.payroll_items pi
     JOIN core.payroll_periods pp ON pp.id = pi.period_id, b
    WHERE pp.period = b.m_start)::bigint,

  (SELECT round(count(e.id)::numeric / NULLIF(count(DISTINCT c.id), 0), 1)
     FROM core.classes c CROSS JOIN b
     LEFT JOIN core.enrollments e
       ON e.class_id = c.id AND e.start_date < b.m_next
      AND (e.end_date IS NULL OR e.end_date >= b.m_next - 1)
    WHERE c.status = 'open'),

  (SELECT round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / NULLIF(count(*), 0), 1)
     FROM core.attendance_records ar
     JOIN core.sessions s ON s.id = ar.session_id, b
    WHERE s.status = 'scheduled'
      AND s.starts_at >= (b.m_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND s.starts_at <  b.m_next_ts)
$$;
--> statement-breakpoint


-- Báo cáo theo lớp (RPT-03)
CREATE FUNCTION core.monthly_class_report(p_month date)
RETURNS TABLE (class_id uuid, class_name text, enrolled bigint, sessions_held bigint, attendance_rate numeric)
LANGUAGE sql STABLE AS $$
WITH b AS (
  SELECT date_trunc('month', p_month)::date AS m_start,
         (date_trunc('month', p_month) + interval '1 month')::date AS m_next
)
SELECT c.id, c.name,
       (SELECT count(*) FROM core.enrollments e
         WHERE e.class_id = c.id AND e.start_date < b.m_next
           AND (e.end_date IS NULL OR e.end_date >= b.m_next - 1)),
       (SELECT count(*) FROM core.sessions s
         WHERE s.class_id = c.id AND s.status = 'scheduled' AND s.attendance_taken_at IS NOT NULL
           AND s.starts_at >= (b.m_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
           AND s.starts_at <  (b.m_next::timestamp  AT TIME ZONE 'Asia/Ho_Chi_Minh')),
       (SELECT round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / NULLIF(count(*), 0), 1)
          FROM core.attendance_records ar
          JOIN core.sessions s ON s.id = ar.session_id
         WHERE s.class_id = c.id AND s.status = 'scheduled'
           AND s.starts_at >= (b.m_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
           AND s.starts_at <  (b.m_next::timestamp  AT TIME ZONE 'Asia/Ho_Chi_Minh'))
  FROM core.classes c CROSS JOIN b
 ORDER BY c.name
$$;
