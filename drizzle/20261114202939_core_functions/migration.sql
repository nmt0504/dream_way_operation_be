-- Section 7 of docs/db/01_core.sql: business functions & triggers

-- Center-wide settings: always exactly one row (core.settings, id = true)
INSERT INTO core.settings DEFAULT VALUES;
--> statement-breakpoint

-- 7. HÀM & TRIGGER NGHIỆP VỤ
-- =============================================================================

-- Ngày hiện tại theo giờ Việt Nam
CREATE FUNCTION core.today_vn() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $$;
--> statement-breakpoint


-- Giáo viên có phụ trách lớp này không (dùng chung cho core và lms)
CREATE FUNCTION core.is_class_teacher(p_class_id uuid, p_teacher_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM core.class_teachers ct
                  WHERE ct.class_id = p_class_id AND ct.teacher_id = p_teacher_id)
$$;
--> statement-breakpoint


-- Lịch cố định chỉ được gán cho giáo viên phụ trách lớp
CREATE FUNCTION core.trg_schedules_teacher_in_class() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT core.is_class_teacher(NEW.class_id, NEW.teacher_id) THEN
    RAISE EXCEPTION 'Giáo viên của ca học phải là giáo viên phụ trách lớp';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER schedules_teacher_in_class BEFORE INSERT OR UPDATE OF class_id, teacher_id ON core.class_schedules
  FOR EACH ROW EXECUTE FUNCTION core.trg_schedules_teacher_in_class();
--> statement-breakpoint


-- Cấp số thứ tự kế tiếp cho mã (atomic, an toàn khi nhiều người tạo cùng lúc)
CREATE FUNCTION core.next_code_no(p_scope text, p_period text DEFAULT '')
RETURNS int LANGUAGE sql AS $$
  INSERT INTO core.code_sequences AS s (scope, period, last_no)
  VALUES (p_scope, p_period, 1)
  ON CONFLICT (scope, period) DO UPDATE SET last_no = s.last_no + 1
  RETURNING last_no
$$;
--> statement-breakpoint

-- Ví dụ: 'HV-'  || lpad(core.next_code_no('student')::text, 4, '0')
--        'HD-2608-' || lpad(core.next_code_no('invoice', '2608')::text, 4, '0')

-- 7.1 Hóa đơn: trạng thái theo từ điển mục 5 của spec ------------------------
CREATE FUNCTION core.invoice_status_of(
  p_total bigint, p_paid bigint, p_due date, p_cancelled boolean, p_today date
) RETURNS core.invoice_status LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE
    WHEN p_cancelled         THEN 'cancelled'
    WHEN p_paid >= p_total   THEN 'paid'
    WHEN p_today > p_due     THEN 'overdue'
    WHEN p_paid > 0          THEN 'partial'
    ELSE 'unpaid'
  END)::core.invoice_status
$$;
--> statement-breakpoint


CREATE FUNCTION core.trg_invoices_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.status := core.invoice_status_of(NEW.total_amount, NEW.paid_amount, NEW.due_date,
                                       NEW.cancelled_at IS NOT NULL, core.today_vn());
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER invoices_status BEFORE INSERT OR UPDATE ON core.invoices
  FOR EACH ROW EXECUTE FUNCTION core.trg_invoices_status();
--> statement-breakpoint


-- Job chạy 00:05 hằng ngày: chuyển hóa đơn quá hạn (trigger trên tự tính lại status)
CREATE FUNCTION core.mark_overdue_invoices() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE core.invoices SET paid_amount = paid_amount
   WHERE status IN ('unpaid', 'partial') AND due_date < core.today_vn();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
--> statement-breakpoint


-- 7.2 Thanh toán: không vượt số còn thiếu, không sửa/xóa, chỉ được hủy ---------
CREATE FUNCTION core.trg_payments_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv core.invoices;
BEGIN
  SELECT * INTO inv FROM core.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF inv.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hóa đơn % đã hủy, không thể ghi nhận thanh toán', inv.code;
  END IF;
  IF NEW.amount > inv.total_amount - inv.paid_amount THEN
    RAISE EXCEPTION 'Số tiền thu (%) lớn hơn số còn thiếu (%)',
      NEW.amount, inv.total_amount - inv.paid_amount;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER payments_before_insert BEFORE INSERT ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_before_insert();
--> statement-breakpoint


CREATE FUNCTION core.trg_payments_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Thanh toán đã hủy, không thể thay đổi';
  END IF;
  IF NEW.amount <> OLD.amount OR NEW.invoice_id <> OLD.invoice_id
     OR NEW.paid_on <> OLD.paid_on OR NEW.method <> OLD.method THEN
    RAISE EXCEPTION 'Không được sửa thanh toán đã ghi — hãy hủy và ghi lại';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER payments_before_update BEFORE UPDATE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_before_update();
--> statement-breakpoint


CREATE FUNCTION core.trg_payments_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không được xóa thanh toán — chỉ được hủy kèm lý do';
END $$;
--> statement-breakpoint

CREATE TRIGGER payments_no_delete BEFORE DELETE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_no_delete();
--> statement-breakpoint


-- Sau khi ghi / hủy thanh toán: cập nhật paid_amount (status tự tính lại) + nhật ký khi hủy
CREATE FUNCTION core.trg_payments_after() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE core.invoices i
     SET paid_amount = (SELECT COALESCE(sum(p.amount), 0)::bigint
                          FROM core.payments p
                         WHERE p.invoice_id = i.id AND p.voided_at IS NULL)
   WHERE i.id = NEW.invoice_id;

  IF TG_OP = 'UPDATE' AND OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (NEW.voided_by, 'payment.void', 'payment', NEW.id,
            jsonb_build_object('amount', OLD.amount, 'invoice_id', OLD.invoice_id),
            jsonb_build_object('void_reason', NEW.void_reason));
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint

CREATE TRIGGER payments_after AFTER INSERT OR UPDATE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_after();
--> statement-breakpoint


-- 7.3 Điểm danh: khóa khi kỳ lương đã duyệt + nhật ký khi sửa -----------------
-- Quy tắc GV chỉ được sửa trong 24h sau khi lưu: kiểm tra ở tầng API (cần biết vai trò người gọi).
CREATE FUNCTION core.trg_attendance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_session core.sessions;
BEGIN
  SELECT * INTO v_session FROM core.sessions
   WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  IF v_session.payroll_period_id IS NOT NULL THEN
    RAISE EXCEPTION 'Buổi học thuộc kỳ lương đã duyệt, không thể sửa điểm danh';
  END IF;

  IF TG_OP = 'UPDATE' AND v_session.attendance_taken_at IS NOT NULL
     AND (NEW.status, NEW.absence_excused) IS DISTINCT FROM (OLD.status, OLD.absence_excused) THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (NEW.updated_by, 'attendance.update', 'attendance_record', NEW.id,
            jsonb_build_object('status', OLD.status, 'absence_excused', OLD.absence_excused),
            jsonb_build_object('status', NEW.status, 'absence_excused', NEW.absence_excused));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON core.attendance_records
  FOR EACH ROW EXECUTE FUNCTION core.trg_attendance_guard();
