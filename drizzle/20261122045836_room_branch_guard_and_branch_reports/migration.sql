-- Rooms must belong to the class's branch (docs/db/01_core.sql section 7)

-- Phòng của một cơ sở chỉ được dùng cho lớp của đúng cơ sở đó (ca học cố định và buổi học)
CREATE FUNCTION core.trg_room_in_class_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.room_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM core.rooms r JOIN core.classes c ON c.branch_id = r.branch_id
        WHERE r.id = NEW.room_id AND c.id = NEW.class_id) THEN
    RAISE EXCEPTION 'Phòng học phải thuộc cùng cơ sở với lớp';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER schedules_room_in_class_branch BEFORE INSERT OR UPDATE OF class_id, room_id ON core.class_schedules
  FOR EACH ROW EXECUTE FUNCTION core.trg_room_in_class_branch();
--> statement-breakpoint

CREATE TRIGGER sessions_room_in_class_branch BEFORE INSERT OR UPDATE OF class_id, room_id ON core.sessions
  FOR EACH ROW EXECUTE FUNCTION core.trg_room_in_class_branch();
--> statement-breakpoint


-- Đổi cơ sở của lớp / phòng: không được làm lệch các ca học, buổi học đang dùng phòng
CREATE FUNCTION core.trg_branch_change_keeps_rooms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM (SELECT class_id, room_id FROM core.class_schedules
                      UNION ALL
                      SELECT class_id, room_id FROM core.sessions) x
         JOIN core.classes c ON c.id = x.class_id
         JOIN core.rooms   r ON r.id = x.room_id
        WHERE (TG_TABLE_NAME = 'classes' AND c.id = NEW.id AND r.branch_id <> NEW.branch_id)
           OR (TG_TABLE_NAME = 'rooms'   AND r.id = NEW.id AND c.branch_id <> NEW.branch_id)) THEN
    RAISE EXCEPTION 'Không thể đổi cơ sở: còn ca học / buổi học dùng phòng của cơ sở khác';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER classes_branch_change BEFORE UPDATE OF branch_id ON core.classes
  FOR EACH ROW EXECUTE FUNCTION core.trg_branch_change_keeps_rooms();
--> statement-breakpoint

CREATE TRIGGER rooms_branch_change BEFORE UPDATE OF branch_id ON core.rooms
  FOR EACH ROW EXECUTE FUNCTION core.trg_branch_change_keeps_rooms();
--> statement-breakpoint

-- Reports gain p_branch_id (NULL = whole center); payroll_total only counts approved periods.
-- The signature changes, so the old functions are dropped instead of replaced.
DROP FUNCTION core.monthly_report(date);
--> statement-breakpoint
DROP FUNCTION core.monthly_class_report(date);
--> statement-breakpoint

-- Báo cáo tháng (RPT-02) — 6 chỉ số theo định nghĩa ở spec
-- p_branch_id NULL = báo cáo tổng quan toàn trung tâm; có giá trị = báo cáo theo cơ sở.
-- Hóa đơn, thanh toán, buổi học thuộc cơ sở của LỚP tương ứng.
CREATE FUNCTION core.monthly_report(p_month date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (
  revenue_recognized  bigint,    -- tổng HĐ có kỳ thuộc tháng
  collected           bigint,    -- tổng thanh toán có ngày thu trong tháng
  carried_debt        bigint,    -- còn thiếu tại 23:59 ngày cuối tháng
  payroll_total       bigint,    -- chi lương kỳ tháng đó (chỉ kỳ đã duyệt)
  avg_class_size      numeric,   -- ghi danh hiệu lực cuối tháng ÷ số lớp đang mở
  attendance_rate     numeric    -- (Có mặt + Trễ) ÷ tổng lượt điểm danh
) LANGUAGE sql STABLE AS $$
WITH b AS (
  SELECT date_trunc('month', p_month)::date                        AS m_start,
         (date_trunc('month', p_month) + interval '1 month')::date AS m_next,
         ((date_trunc('month', p_month) + interval '1 month')::timestamp
            AT TIME ZONE 'Asia/Ho_Chi_Minh')                       AS m_next_ts
),
cls AS (SELECT c.* FROM core.classes c WHERE p_branch_id IS NULL OR c.branch_id = p_branch_id)
SELECT
  (SELECT COALESCE(sum(i.total_amount), 0)
     FROM core.invoices i JOIN cls c ON c.id = i.class_id, b
    WHERE i.cancelled_at IS NULL
      AND i.period_start >= b.m_start AND i.period_start < b.m_next)::bigint,

  (SELECT COALESCE(sum(p.amount), 0)
     FROM core.payments p
     JOIN core.invoices i ON i.id = p.invoice_id
     JOIN cls c ON c.id = i.class_id, b
    WHERE p.voided_at IS NULL
      AND p.paid_on >= b.m_start AND p.paid_on < b.m_next)::bigint,

  (SELECT COALESCE(sum(i.total_amount - COALESCE(pp.paid, 0)), 0)
     FROM core.invoices i JOIN cls c ON c.id = i.class_id CROSS JOIN b
     LEFT JOIN LATERAL (
       SELECT sum(p.amount) AS paid FROM core.payments p
        WHERE p.invoice_id = i.id AND p.paid_on < b.m_next
          AND (p.voided_at IS NULL OR p.voided_at >= b.m_next_ts)
     ) pp ON true
    WHERE i.created_at < b.m_next_ts
      AND (i.cancelled_at IS NULL OR i.cancelled_at >= b.m_next_ts))::bigint,

  -- Tổng quan: tổng dòng lương đã duyệt. Theo cơ sở: phân bổ từng buổi đã khóa theo cơ sở của lớp,
  -- dùng đơn giá snapshot; do làm tròn theo buổi, tổng các cơ sở có thể lệch vài đồng so với tổng quan.
  CASE WHEN p_branch_id IS NULL THEN
    (SELECT COALESCE(sum(pi.amount), 0)
       FROM core.payroll_items pi
       JOIN core.payroll_periods pp ON pp.id = pi.period_id, b
      WHERE pp.period = b.m_start AND pp.status = 'approved')
  ELSE
    (SELECT COALESCE(round(sum(CASE pi.rate_type
                                 WHEN 'hour'    THEN s.duration_min / 60.0 * pi.rate
                                 WHEN 'session' THEN pi.rate
                               END)), 0)
       FROM core.payroll_periods pp
       JOIN core.sessions s       ON s.payroll_period_id = pp.id
       JOIN cls c                 ON c.id = s.class_id
       JOIN core.payroll_items pi ON pi.period_id = pp.id AND pi.teacher_id = s.teacher_id, b
      WHERE pp.period = b.m_start AND pp.status = 'approved')
  END::bigint,

  (SELECT round(count(e.id)::numeric / NULLIF(count(DISTINCT c.id), 0), 1)
     FROM cls c CROSS JOIN b
     LEFT JOIN core.enrollments e
       ON e.class_id = c.id AND e.start_date < b.m_next
      AND (e.end_date IS NULL OR e.end_date >= b.m_next - 1)
    WHERE c.status = 'open'),

  (SELECT round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / NULLIF(count(*), 0), 1)
     FROM core.attendance_records ar
     JOIN core.sessions s ON s.id = ar.session_id
     JOIN cls c ON c.id = s.class_id, b
    WHERE s.status = 'scheduled'
      AND s.starts_at >= (b.m_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND s.starts_at <  b.m_next_ts)
$$;
--> statement-breakpoint


-- Báo cáo theo lớp (RPT-03); p_branch_id NULL = mọi cơ sở
CREATE FUNCTION core.monthly_class_report(p_month date, p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (class_id uuid, class_name text, branch_id uuid, enrolled bigint, sessions_held bigint, attendance_rate numeric)
LANGUAGE sql STABLE AS $$
WITH b AS (
  SELECT date_trunc('month', p_month)::date AS m_start,
         (date_trunc('month', p_month) + interval '1 month')::date AS m_next
)
SELECT c.id, c.name, c.branch_id,
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
 WHERE p_branch_id IS NULL OR c.branch_id = p_branch_id
 ORDER BY c.name
$$;
