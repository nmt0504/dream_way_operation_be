-- =============================================================================
-- DreamWay LMS · Phần 1: CORE VẬN HÀNH
-- Tổ chức & tài khoản · Lớp, giáo viên & học viên · Buổi học, điểm danh & nhắc lịch
-- Học phí · Chấm công & lương · Báo cáo tháng · Hạ tầng dùng chung (audit, thông báo)
--
-- PostgreSQL 15+ · Chạy file này TRƯỚC 02_lms.sql
-- QUY ƯỚC RANH GIỚI: schema `core` KHÔNG BAO GIỜ tham chiếu tới schema `lms`.
-- Tiền: bigint (VND). Thời gian: timestamptz, mọi phép tính theo Asia/Ho_Chi_Minh.
-- PHẠM VI: một trung tâm duy nhất (DreamWay), có thể có nhiều cơ sở (core.branches).
-- Không có cột center_id; dữ liệu được tách theo cơ sở qua branch_id và core.user_branches.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- tìm kiếm học viên (STU-01)
CREATE SCHEMA IF NOT EXISTS core;

-- -----------------------------------------------------------------------------
-- ENUM
-- -----------------------------------------------------------------------------
CREATE TYPE core.user_role         AS ENUM ('admin', 'staff', 'teacher', 'parent', 'student');  -- student: chỉ đăng nhập trang LMS
CREATE TYPE core.record_status     AS ENUM ('active', 'inactive');
CREATE TYPE core.honorific         AS ENUM ('co', 'thay');
CREATE TYPE core.fee_cycle         AS ENUM ('month', 'course');
CREATE TYPE core.class_status      AS ENUM ('open', 'closed');
CREATE TYPE core.student_status    AS ENUM ('active', 'left');
CREATE TYPE core.enrollment_status AS ENUM ('active', 'paused', 'ended');
CREATE TYPE core.session_kind      AS ENUM ('regular', 'makeup', 'extra');
CREATE TYPE core.session_status    AS ENUM ('scheduled', 'cancelled');
CREATE TYPE core.attendance_status AS ENUM ('present', 'absent', 'late');
CREATE TYPE core.reminder_channel  AS ENUM ('zalo', 'sms');
CREATE TYPE core.reminder_status   AS ENUM ('queued', 'sent', 'failed', 'cancelled');
CREATE TYPE core.rate_type         AS ENUM ('hour', 'session');
CREATE TYPE core.payroll_status    AS ENUM ('pending', 'approved');
CREATE TYPE core.invoice_status    AS ENUM ('unpaid', 'partial', 'overdue', 'paid', 'cancelled');
CREATE TYPE core.invoice_source    AS ENUM ('auto', 'manual');
CREATE TYPE core.payment_method    AS ENUM ('cash', 'transfer');

-- =============================================================================
-- 1. TỔ CHỨC & TÀI KHOẢN
-- =============================================================================
-- Cài đặt chung của trung tâm: luôn có đúng một dòng (id = true)
CREATE TABLE core.settings (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  center_name  text NOT NULL DEFAULT 'DreamWay',
  timezone     text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  -- {"reminder": {"channel": "zalo", "offset_min": 60}, "revenue_target": 300000000}
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO core.settings DEFAULT VALUES;

CREATE TABLE core.branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,                       -- "Cơ sở Q.3"
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Đăng nhập: một ô "SĐT hoặc tên đăng nhập" — dạng 0xxxxxxxxx thì tìm theo phone, còn lại theo username.
  -- Phụ huynh / nhân viên / GV đăng nhập bằng SĐT (username null). Học viên đăng nhập bằng username và
  -- theo quy ước KHÔNG lưu phone (phone unique, hay trùng số PH); SĐT liên lạc nằm ở students.phone.
  phone          text CHECK (phone ~ '^0[0-9]{9}$'),     -- học viên có thể chưa có SĐT riêng
  -- mặc định = mã học viên viết thường (vd "hv-0001"), Admin đổi được; không toàn chữ số để không nhầm SĐT
  username       text UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$' AND username !~ '^[0-9]+$'),
  full_name      text NOT NULL,
  role           core.user_role NOT NULL,
  status         core.record_status NOT NULL DEFAULT 'active',
  password_hash  text,                                   -- bcrypt/argon2; null khi chưa đặt mật khẩu
  must_change_password boolean NOT NULL DEFAULT true,     -- bật lại khi Admin đặt mật khẩu tạm
  failed_login_count  smallint NOT NULL DEFAULT 0,        -- khóa tạm sau 5 lần sai
  locked_until   timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone),
  CONSTRAINT users_phone_required_chk CHECK (role = 'student' OR phone IS NOT NULL),
  CONSTRAINT users_username_required_chk CHECK (role <> 'student' OR username IS NOT NULL)
);

-- =============================================================================
-- 2. LỚP, GIÁO VIÊN & HỌC VIÊN
-- =============================================================================
CREATE TABLE core.teachers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE REFERENCES core.users(id),   -- null khi GV chưa có tài khoản
  full_name   text NOT NULL,
  honorific   core.honorific NOT NULL,                 -- "Cô" / "Thầy"
  subject     text,
  status      core.record_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.guardians (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid UNIQUE REFERENCES core.users(id),   -- null khi PH chưa có tài khoản
  full_name   text NOT NULL,
  phone       text NOT NULL CHECK (phone ~ '^0[0-9]{9}$'),
  zalo_id     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guardians_phone_idx ON core.guardians (phone);

-- Phạm vi cơ sở của nhân viên và giáo viên. Admin không cần dòng nào ở đây (thấy toàn trung tâm).
CREATE TABLE core.user_branches (
  user_id    uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES core.branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX user_branches_branch_idx ON core.user_branches (branch_id);

-- Refresh token (cookie httpOnly, 30 ngày): chỉ lưu SHA-256 của token; mỗi lần refresh thu hồi token cũ, cấp token mới
CREATE TABLE core.refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON core.refresh_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE core.rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid NOT NULL REFERENCES core.branches(id),
  name        text NOT NULL,
  capacity    int CHECK (capacity > 0),
  UNIQUE (branch_id, name)
);

CREATE TABLE core.classes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id        uuid NOT NULL REFERENCES core.branches(id),
  name             text NOT NULL,                         -- "Toán 9A · Luyện thi vào 10"
  subject          text,
  fee_cycle        core.fee_cycle NOT NULL DEFAULT 'month',
  fee_amount       bigint NOT NULL CHECK (fee_amount >= 0),
  due_day          smallint NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  color            text NOT NULL DEFAULT '#2563EB' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  status           core.class_status NOT NULL DEFAULT 'open',
  starts_on        date,
  ends_on          date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX classes_branch_idx ON core.classes (branch_id, status);

-- Giáo viên phụ trách lớp: một lớp có nhiều giáo viên, một giáo viên phụ trách nhiều lớp.
-- Mọi giáo viên phụ trách đều xem lớp, điểm danh, giao bài và chấm bài được.
CREATE TABLE core.class_teachers (
  class_id    uuid NOT NULL REFERENCES core.classes(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES core.teachers(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, teacher_id)
);
CREATE INDEX class_teachers_teacher_idx ON core.class_teachers (teacher_id);

CREATE TABLE core.students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid UNIQUE REFERENCES core.users(id),   -- tài khoản đăng nhập trang LMS (null nếu chưa cấp)
  code         text NOT NULL CHECK (code ~ '^HV-[0-9]{4,}$'),   -- HV-NNNN, không tái sử dụng
  full_name    text NOT NULL,
  -- tên + lớp + SĐT + tên PH, viết thường KHÔNG DẤU; app cập nhật khi dữ liệu nguồn đổi
  search_text  text NOT NULL DEFAULT '',
  dob          date,
  phone        text CHECK (phone IS NULL OR phone ~ '^0[0-9]{9}$'),  -- trùng được (anh chị em)
  status       core.student_status NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);
CREATE INDEX students_search_trgm_idx ON core.students USING gin (search_text gin_trgm_ops);
CREATE INDEX students_phone_idx       ON core.students (phone);

CREATE TABLE core.student_guardians (
  student_id   uuid NOT NULL REFERENCES core.students(id) ON DELETE CASCADE,
  guardian_id  uuid NOT NULL REFERENCES core.guardians(id) ON DELETE CASCADE,
  relation     text,                                   -- "Mẹ", "Bố"...
  is_primary   boolean NOT NULL DEFAULT false,         -- người nhận tin nhắc ưu tiên
  PRIMARY KEY (student_id, guardian_id)
);
CREATE UNIQUE INDEX student_guardians_one_primary
  ON core.student_guardians (student_id) WHERE is_primary;

CREATE TABLE core.enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES core.students(id),
  class_id    uuid NOT NULL REFERENCES core.classes(id),
  start_date  date NOT NULL,
  end_date    date,
  status      core.enrollment_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
-- một học viên chỉ có một ghi danh còn hiệu lực trong một lớp
CREATE UNIQUE INDEX enrollments_one_live
  ON core.enrollments (student_id, class_id) WHERE status <> 'ended';
CREATE INDEX enrollments_class_idx ON core.enrollments (class_id, status);

-- =============================================================================
-- 3. BUỔI HỌC, ĐIỂM DANH & NHẮC LỊCH
-- =============================================================================
CREATE TABLE core.class_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid NOT NULL REFERENCES core.classes(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = T2, 7 = CN
  start_time    time NOT NULL,
  duration_min  int NOT NULL CHECK (duration_min > 0),
  room_id       uuid REFERENCES core.rooms(id),
  teacher_id    uuid NOT NULL REFERENCES core.teachers(id),          -- GV dạy ca này, phải là GV phụ trách lớp
  valid_from    date NOT NULL,
  valid_to      date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE TABLE core.payroll_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period       date NOT NULL CHECK (period = date_trunc('month', period)::date),  -- ngày 1 của tháng
  status       core.payroll_status NOT NULL DEFAULT 'pending',
  approved_by  uuid REFERENCES core.users(id),
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period),
  CHECK (status = 'pending' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE core.sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id             uuid NOT NULL REFERENCES core.classes(id),
  schedule_id          uuid REFERENCES core.class_schedules(id),   -- null = buổi bù / buổi lẻ
  teacher_id           uuid NOT NULL REFERENCES core.teachers(id), -- GV dạy THỰC TẾ, có thể là GV dạy thay ngoài lớp (PAY-07)
  room_id              uuid REFERENCES core.rooms(id),
  starts_at            timestamptz NOT NULL,
  duration_min         int NOT NULL CHECK (duration_min > 0),
  kind                 core.session_kind NOT NULL DEFAULT 'regular',
  status               core.session_status NOT NULL DEFAULT 'scheduled',
  cancel_reason        text,
  reminder_enabled     boolean NOT NULL DEFAULT true,
  attendance_taken_at  timestamptz,
  attendance_taken_by  uuid REFERENCES core.users(id),
  payroll_period_id    uuid REFERENCES core.payroll_periods(id),   -- set khi duyệt lương → khóa điểm danh
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, starts_at),                                 -- job sinh buổi chạy lại không bị trùng
  CHECK (status = 'scheduled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX sessions_class_time_idx   ON core.sessions (class_id, starts_at);
CREATE INDEX sessions_time_idx        ON core.sessions (starts_at);
CREATE INDEX sessions_teacher_time_idx ON core.sessions (teacher_id, starts_at);
CREATE INDEX sessions_room_time_idx    ON core.sessions (room_id, starts_at);  -- cảnh báo trùng phòng (SCH-06)

CREATE TABLE core.attendance_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  enrollment_id    uuid NOT NULL REFERENCES core.enrollments(id),
  student_id       uuid NOT NULL REFERENCES core.students(id),
  status           core.attendance_status NOT NULL DEFAULT 'present',
  absence_excused  boolean,            -- bắt buộc khi Vắng, phải null khi Có mặt/Trễ (ATT-04)
  note             text,
  updated_by       uuid REFERENCES core.users(id),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  CONSTRAINT attendance_absent_excused_chk CHECK ((status = 'absent') = (absence_excused IS NOT NULL))
);
CREATE INDEX attendance_student_idx ON core.attendance_records (student_id);

CREATE TABLE core.reminder_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES core.students(id),
  recipient_phone  text NOT NULL,                     -- snapshot SĐT lúc xếp hàng
  channel          core.reminder_channel NOT NULL,
  scheduled_at     timestamptz NOT NULL,
  status           core.reminder_status NOT NULL DEFAULT 'queued',
  attempts         smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),  -- 1 lần + thử lại 2
  sent_at          timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminder_queue_idx ON core.reminder_messages (scheduled_at) WHERE status = 'queued';

-- =============================================================================
-- 4. CHẤM CÔNG & LƯƠNG
-- =============================================================================
CREATE TABLE core.teacher_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES core.teachers(id),
  rate_type       core.rate_type NOT NULL,
  rate            bigint NOT NULL CHECK (rate > 0),
  effective_from  date NOT NULL,
  UNIQUE (teacher_id, effective_from)
);

CREATE TABLE core.payroll_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES core.payroll_periods(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES core.teachers(id),
  sessions_count  int NOT NULL,
  hours           numeric(7,2) NOT NULL,
  rate_type       core.rate_type NOT NULL,   -- snapshot lúc duyệt
  rate            bigint NOT NULL,           -- snapshot lúc duyệt
  amount          bigint NOT NULL,
  UNIQUE (period_id, teacher_id)
);

-- =============================================================================
-- 5. HỌC PHÍ
-- =============================================================================
-- Bộ đếm mã dùng chung: scope 'student' (period '') → HV-NNNN; scope 'invoice' (period 'YYMM') → HD-YYMM-NNNN
CREATE TABLE core.code_sequences (
  scope      text NOT NULL,
  period     text NOT NULL DEFAULT '',
  last_no    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, period)
);

CREATE TABLE core.invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL CHECK (code ~ '^HD-[0-9]{4}-[0-9]{3,}$'),
  student_id     uuid NOT NULL REFERENCES core.students(id),
  class_id       uuid NOT NULL REFERENCES core.classes(id),
  enrollment_id  uuid REFERENCES core.enrollments(id),   -- null với một số HĐ thủ công
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  due_date       date NOT NULL,
  total_amount   bigint NOT NULL CHECK (total_amount > 0),
  paid_amount    bigint NOT NULL DEFAULT 0,              -- denormalized, cập nhật bằng trigger
  status         core.invoice_status NOT NULL DEFAULT 'unpaid',  -- tính tự động bằng trigger
  source         core.invoice_source NOT NULL DEFAULT 'auto',
  note           text,
  cancelled_at   timestamptz,
  cancelled_by   uuid REFERENCES core.users(id),
  cancel_reason  text,
  created_by     uuid REFERENCES core.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code),
  CHECK (period_end >= period_start),
  CHECK (paid_amount BETWEEN 0 AND total_amount),
  CHECK ((cancelled_at IS NULL) = (cancel_reason IS NULL)),
  CONSTRAINT invoices_cancel_requires_no_payment_chk CHECK (cancelled_at IS NULL OR paid_amount = 0)        -- phải hủy hết thanh toán trước khi hủy HĐ
);
-- chặn sinh trùng hóa đơn tự động cho cùng ghi danh, cùng kỳ
CREATE UNIQUE INDEX invoices_one_per_period
  ON core.invoices (enrollment_id, period_start) WHERE cancelled_at IS NULL;
CREATE INDEX invoices_list_idx    ON core.invoices (status, due_date);   -- FEE-03
CREATE INDEX invoices_student_idx ON core.invoices (student_id);

CREATE TABLE core.payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES core.invoices(id),
  amount        bigint NOT NULL CHECK (amount > 0),
  method        core.payment_method NOT NULL,
  paid_on       date NOT NULL,
  receipt_no    text NOT NULL,
  note          text,
  collected_by  uuid REFERENCES core.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  voided_at     timestamptz,
  voided_by     uuid REFERENCES core.users(id),
  void_reason   text,
  UNIQUE (receipt_no),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL) AND (voided_at IS NULL) = (voided_by IS NULL))
);
CREATE INDEX payments_invoice_idx ON core.payments (invoice_id);
CREATE INDEX payments_paid_on_idx ON core.payments (paid_on);

-- =============================================================================
-- 6. HẠ TẦNG DÙNG CHUNG (cả core và lms đều ghi vào)
-- =============================================================================
CREATE TABLE core.audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES core.users(id),
  action       text NOT NULL,          -- payment.void · payroll.approve · attendance.update ...
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON core.audit_logs (entity_type, entity_id);
CREATE INDEX audit_time_idx   ON core.audit_logs (created_at DESC);

CREATE TABLE core.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {"href": "/hoc-phi/HD-2608-014"}
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON core.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Header Idempotency-Key: gửi lại cùng key trong 24 giờ thì trả lại đúng kết quả lần đầu
CREATE TABLE core.idempotency_keys (
  user_id       uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  key           text NOT NULL,
  request_hash  text NOT NULL,          -- SHA-256 của method + path + body; khác hash → lỗi dùng lại key
  status_code   smallint,               -- null khi request đầu còn đang chạy
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- =============================================================================
-- 7. HÀM & TRIGGER NGHIỆP VỤ
-- =============================================================================

-- Ngày hiện tại theo giờ Việt Nam
CREATE FUNCTION core.today_vn() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $$;

-- Giáo viên có phụ trách lớp này không (dùng chung cho core và lms)
CREATE FUNCTION core.is_class_teacher(p_class_id uuid, p_teacher_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM core.class_teachers ct
                  WHERE ct.class_id = p_class_id AND ct.teacher_id = p_teacher_id)
$$;

-- Lịch cố định chỉ được gán cho giáo viên phụ trách lớp
CREATE FUNCTION core.trg_schedules_teacher_in_class() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT core.is_class_teacher(NEW.class_id, NEW.teacher_id) THEN
    RAISE EXCEPTION 'Giáo viên của ca học phải là giáo viên phụ trách lớp';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schedules_teacher_in_class BEFORE INSERT OR UPDATE OF class_id, teacher_id ON core.class_schedules
  FOR EACH ROW EXECUTE FUNCTION core.trg_schedules_teacher_in_class();

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
CREATE TRIGGER schedules_room_in_class_branch BEFORE INSERT OR UPDATE OF class_id, room_id ON core.class_schedules
  FOR EACH ROW EXECUTE FUNCTION core.trg_room_in_class_branch();
CREATE TRIGGER sessions_room_in_class_branch BEFORE INSERT OR UPDATE OF class_id, room_id ON core.sessions
  FOR EACH ROW EXECUTE FUNCTION core.trg_room_in_class_branch();

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
CREATE TRIGGER classes_branch_change BEFORE UPDATE OF branch_id ON core.classes
  FOR EACH ROW EXECUTE FUNCTION core.trg_branch_change_keeps_rooms();
CREATE TRIGGER rooms_branch_change BEFORE UPDATE OF branch_id ON core.rooms
  FOR EACH ROW EXECUTE FUNCTION core.trg_branch_change_keeps_rooms();

-- Cấp số thứ tự kế tiếp cho mã (atomic, an toàn khi nhiều người tạo cùng lúc)
CREATE FUNCTION core.next_code_no(p_scope text, p_period text DEFAULT '')
RETURNS int LANGUAGE sql AS $$
  INSERT INTO core.code_sequences AS s (scope, period, last_no)
  VALUES (p_scope, p_period, 1)
  ON CONFLICT (scope, period) DO UPDATE SET last_no = s.last_no + 1
  RETURNING last_no
$$;
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

CREATE FUNCTION core.trg_invoices_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.status := core.invoice_status_of(NEW.total_amount, NEW.paid_amount, NEW.due_date,
                                       NEW.cancelled_at IS NOT NULL, core.today_vn());
  RETURN NEW;
END $$;
CREATE TRIGGER invoices_status BEFORE INSERT OR UPDATE ON core.invoices
  FOR EACH ROW EXECUTE FUNCTION core.trg_invoices_status();

-- Job chạy 00:05 hằng ngày: chuyển hóa đơn quá hạn (trigger trên tự tính lại status)
CREATE FUNCTION core.mark_overdue_invoices() RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE core.invoices SET paid_amount = paid_amount
   WHERE status IN ('unpaid', 'partial') AND due_date < core.today_vn();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

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
CREATE TRIGGER payments_before_insert BEFORE INSERT ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_before_insert();

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
CREATE TRIGGER payments_before_update BEFORE UPDATE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_before_update();

CREATE FUNCTION core.trg_payments_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Không được xóa thanh toán — chỉ được hủy kèm lý do';
END $$;
CREATE TRIGGER payments_no_delete BEFORE DELETE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_no_delete();

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
CREATE TRIGGER payments_after AFTER INSERT OR UPDATE ON core.payments
  FOR EACH ROW EXECUTE FUNCTION core.trg_payments_after();

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
CREATE TRIGGER attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON core.attendance_records
  FOR EACH ROW EXECUTE FUNCTION core.trg_attendance_guard();

-- 7.4 Tài khoản: nhật ký đổi vai trò, khóa/mở, đặt lại mật khẩu, gán cơ sở ----
-- Người thao tác lấy từ app.actor_id: API gọi set_config('app.actor_id', <user_id>, true) trong transaction.
CREATE FUNCTION core.current_actor() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid $$;

CREATE FUNCTION core.trg_users_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (core.current_actor(), 'user.role_change', 'user', NEW.id,
            jsonb_build_object('role', OLD.role), jsonb_build_object('role', NEW.role));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (core.current_actor(), 'user.status_change', 'user', NEW.id,
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  -- Đặt lại mật khẩu = đổi hash và bật must_change_password (người dùng tự đổi thì cờ này tắt)
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash AND NEW.must_change_password THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (core.current_actor(), 'user.password_reset', 'user', NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER users_audit AFTER UPDATE OF role, status, password_hash ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.trg_users_audit();

-- Gán cơ sở: mỗi cơ sở thêm / bỏ là một dòng nhật ký
CREATE FUNCTION core.trg_user_branches_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, new_value)
    VALUES (core.current_actor(), 'user.branch_add', 'user', NEW.user_id,
            jsonb_build_object('branch_id', NEW.branch_id));
  ELSE
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id, old_value)
    VALUES (core.current_actor(), 'user.branch_remove', 'user', OLD.user_id,
            jsonb_build_object('branch_id', OLD.branch_id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER user_branches_audit AFTER INSERT OR DELETE ON core.user_branches
  FOR EACH ROW EXECUTE FUNCTION core.trg_user_branches_audit();

-- =============================================================================
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

COMMIT;