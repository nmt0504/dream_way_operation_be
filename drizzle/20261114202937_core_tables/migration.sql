CREATE SCHEMA "core";
--> statement-breakpoint
CREATE TYPE "core"."attendance_status" AS ENUM('present', 'absent', 'late');--> statement-breakpoint
CREATE TYPE "core"."class_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "core"."enrollment_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "core"."fee_cycle" AS ENUM('month', 'course');--> statement-breakpoint
CREATE TYPE "core"."honorific" AS ENUM('co', 'thay');--> statement-breakpoint
CREATE TYPE "core"."invoice_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "core"."invoice_status" AS ENUM('unpaid', 'partial', 'overdue', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "core"."payment_method" AS ENUM('cash', 'transfer');--> statement-breakpoint
CREATE TYPE "core"."payroll_status" AS ENUM('pending', 'approved');--> statement-breakpoint
CREATE TYPE "core"."rate_type" AS ENUM('hour', 'session');--> statement-breakpoint
CREATE TYPE "core"."record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "core"."reminder_channel" AS ENUM('zalo', 'sms');--> statement-breakpoint
CREATE TYPE "core"."reminder_status" AS ENUM('queued', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "core"."session_kind" AS ENUM('regular', 'makeup', 'extra');--> statement-breakpoint
CREATE TYPE "core"."session_status" AS ENUM('scheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "core"."student_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "core"."user_role" AS ENUM('admin', 'staff', 'teacher', 'parent', 'student');--> statement-breakpoint
CREATE TABLE "core"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."settings" (
	"id" boolean PRIMARY KEY DEFAULT true,
	"center_name" text DEFAULT 'DreamWay' NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton_chk" CHECK ("id")
);
--> statement-breakpoint
CREATE TABLE "core"."user_branches" (
	"user_id" uuid,
	"branch_id" uuid,
	CONSTRAINT "user_branches_pkey" PRIMARY KEY("user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"phone" text CONSTRAINT "users_phone_key" UNIQUE,
	"full_name" text NOT NULL,
	"role" "core"."user_role" NOT NULL,
	"status" "core"."record_status" DEFAULT 'active'::"core"."record_status" NOT NULL,
	"password_hash" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_login_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_format_chk" CHECK ("phone" ~ '^0[0-9]{9}$'),
	CONSTRAINT "users_phone_required_chk" CHECK ("role" = 'student' OR "phone" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "core"."class_teachers" (
	"class_id" uuid,
	"teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_teachers_pkey" PRIMARY KEY("class_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "core"."classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"fee_cycle" "core"."fee_cycle" DEFAULT 'month'::"core"."fee_cycle" NOT NULL,
	"fee_amount" bigint NOT NULL,
	"due_day" smallint DEFAULT 10 NOT NULL,
	"color" text DEFAULT '#2563EB' NOT NULL,
	"status" "core"."class_status" DEFAULT 'open'::"core"."class_status" NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_fee_amount_chk" CHECK ("fee_amount" >= 0),
	CONSTRAINT "classes_due_day_chk" CHECK ("due_day" BETWEEN 1 AND 28),
	CONSTRAINT "classes_color_chk" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "classes_dates_chk" CHECK ("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE "core"."enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "core"."enrollment_status" DEFAULT 'active'::"core"."enrollment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_dates_chk" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);
--> statement-breakpoint
CREATE TABLE "core"."guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid CONSTRAINT "guardians_user_id_key" UNIQUE,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"zalo_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_phone_format_chk" CHECK ("phone" ~ '^0[0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "core"."rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	CONSTRAINT "rooms_branch_id_name_key" UNIQUE("branch_id","name"),
	CONSTRAINT "rooms_capacity_chk" CHECK ("capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."student_guardians" (
	"student_id" uuid,
	"guardian_id" uuid,
	"relation" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "student_guardians_pkey" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "core"."students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid CONSTRAINT "students_user_id_key" UNIQUE,
	"code" text NOT NULL CONSTRAINT "students_code_key" UNIQUE,
	"full_name" text NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"dob" date,
	"phone" text,
	"status" "core"."student_status" DEFAULT 'active'::"core"."student_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_code_format_chk" CHECK ("code" ~ '^HV-[0-9]{4,}$'),
	CONSTRAINT "students_phone_format_chk" CHECK ("phone" IS NULL OR "phone" ~ '^0[0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "core"."teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid CONSTRAINT "teachers_user_id_key" UNIQUE,
	"full_name" text NOT NULL,
	"honorific" "core"."honorific" NOT NULL,
	"subject" text,
	"status" "core"."record_status" DEFAULT 'active'::"core"."record_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"period_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"sessions_count" integer NOT NULL,
	"hours" numeric(7,2) NOT NULL,
	"rate_type" "core"."rate_type" NOT NULL,
	"rate" bigint NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "payroll_items_period_id_teacher_id_key" UNIQUE("period_id","teacher_id")
);
--> statement-breakpoint
CREATE TABLE "core"."payroll_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"period" date NOT NULL CONSTRAINT "payroll_periods_period_key" UNIQUE,
	"status" "core"."payroll_status" DEFAULT 'pending'::"core"."payroll_status" NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_periods_period_chk" CHECK ("period" = date_trunc('month', "period")::date),
	CONSTRAINT "payroll_periods_approved_chk" CHECK ("status" = 'pending' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "core"."teacher_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"teacher_id" uuid NOT NULL,
	"rate_type" "core"."rate_type" NOT NULL,
	"rate" bigint NOT NULL,
	"effective_from" date NOT NULL,
	CONSTRAINT "teacher_rates_teacher_id_effective_from_key" UNIQUE("teacher_id","effective_from"),
	CONSTRAINT "teacher_rates_rate_chk" CHECK ("rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "core"."attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "core"."attendance_status" DEFAULT 'present'::"core"."attendance_status" NOT NULL,
	"absence_excused" boolean,
	"note" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_session_id_student_id_key" UNIQUE("session_id","student_id"),
	CONSTRAINT "attendance_absent_excused_chk" CHECK (("status" = 'absent') = ("absence_excused" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "core"."class_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"class_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"duration_min" integer NOT NULL,
	"room_id" uuid,
	"teacher_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "class_schedules_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7),
	CONSTRAINT "class_schedules_duration_min_chk" CHECK ("duration_min" > 0),
	CONSTRAINT "class_schedules_valid_dates_chk" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "core"."reminder_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"recipient_phone" text NOT NULL,
	"channel" "core"."reminder_channel" NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "core"."reminder_status" DEFAULT 'queued'::"core"."reminder_status" NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_messages_attempts_chk" CHECK ("attempts" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"class_id" uuid NOT NULL,
	"schedule_id" uuid,
	"teacher_id" uuid NOT NULL,
	"room_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"kind" "core"."session_kind" DEFAULT 'regular'::"core"."session_kind" NOT NULL,
	"status" "core"."session_status" DEFAULT 'scheduled'::"core"."session_status" NOT NULL,
	"cancel_reason" text,
	"reminder_enabled" boolean DEFAULT true NOT NULL,
	"attendance_taken_at" timestamp with time zone,
	"attendance_taken_by" uuid,
	"payroll_period_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_schedule_id_starts_at_key" UNIQUE("schedule_id","starts_at"),
	CONSTRAINT "sessions_duration_min_chk" CHECK ("duration_min" > 0),
	CONSTRAINT "sessions_cancel_reason_chk" CHECK ("status" = 'scheduled' OR "cancel_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "core"."code_sequences" (
	"scope" text,
	"period" text DEFAULT '',
	"last_no" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "code_sequences_pkey" PRIMARY KEY("scope","period")
);
--> statement-breakpoint
CREATE TABLE "core"."invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL CONSTRAINT "invoices_code_key" UNIQUE,
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due_date" date NOT NULL,
	"total_amount" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"status" "core"."invoice_status" DEFAULT 'unpaid'::"core"."invoice_status" NOT NULL,
	"source" "core"."invoice_source" DEFAULT 'auto'::"core"."invoice_source" NOT NULL,
	"note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_code_format_chk" CHECK ("code" ~ '^HD-[0-9]{4}-[0-9]{3,}$'),
	CONSTRAINT "invoices_total_amount_chk" CHECK ("total_amount" > 0),
	CONSTRAINT "invoices_period_chk" CHECK ("period_end" >= "period_start"),
	CONSTRAINT "invoices_paid_amount_chk" CHECK ("paid_amount" BETWEEN 0 AND "total_amount"),
	CONSTRAINT "invoices_cancel_chk" CHECK (("cancelled_at" IS NULL) = ("cancel_reason" IS NULL)),
	CONSTRAINT "invoices_cancel_requires_no_payment_chk" CHECK ("cancelled_at" IS NULL OR "paid_amount" = 0)
);
--> statement-breakpoint
CREATE TABLE "core"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"invoice_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "core"."payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"receipt_no" text NOT NULL CONSTRAINT "payments_receipt_no_key" UNIQUE,
	"note" text,
	"collected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "payments_void_chk" CHECK (("voided_at" IS NULL) = ("void_reason" IS NULL) AND ("voided_at" IS NULL) = ("voided_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "core"."audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_branches_branch_idx" ON "core"."user_branches" ("branch_id");--> statement-breakpoint
CREATE INDEX "class_teachers_teacher_idx" ON "core"."class_teachers" ("teacher_id");--> statement-breakpoint
CREATE INDEX "classes_branch_idx" ON "core"."classes" ("branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_one_live" ON "core"."enrollments" ("student_id","class_id") WHERE "status" <> 'ended';--> statement-breakpoint
CREATE INDEX "enrollments_class_idx" ON "core"."enrollments" ("class_id","status");--> statement-breakpoint
CREATE INDEX "guardians_phone_idx" ON "core"."guardians" ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_primary" ON "core"."student_guardians" ("student_id") WHERE "is_primary";--> statement-breakpoint
CREATE INDEX "students_search_trgm_idx" ON "core"."students" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "students_phone_idx" ON "core"."students" ("phone");--> statement-breakpoint
CREATE INDEX "attendance_student_idx" ON "core"."attendance_records" ("student_id");--> statement-breakpoint
CREATE INDEX "reminder_queue_idx" ON "core"."reminder_messages" ("scheduled_at") WHERE "status" = 'queued';--> statement-breakpoint
CREATE INDEX "sessions_class_time_idx" ON "core"."sessions" ("class_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_time_idx" ON "core"."sessions" ("starts_at");--> statement-breakpoint
CREATE INDEX "sessions_teacher_time_idx" ON "core"."sessions" ("teacher_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_room_time_idx" ON "core"."sessions" ("room_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_per_period" ON "core"."invoices" ("enrollment_id","period_start") WHERE "cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX "invoices_list_idx" ON "core"."invoices" ("status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "core"."invoices" ("student_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "core"."payments" ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "core"."payments" ("paid_on");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "core"."audit_logs" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "core"."audit_logs" ("created_at" DESC);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "core"."notifications" ("user_id","created_at" DESC) WHERE "read_at" IS NULL;--> statement-breakpoint
ALTER TABLE "core"."user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."class_teachers" ADD CONSTRAINT "class_teachers_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_teachers_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_branch_id_branches_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id");--> statement-breakpoint
ALTER TABLE "core"."enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id");--> statement-breakpoint
ALTER TABLE "core"."guardians" ADD CONSTRAINT "guardians_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."rooms" ADD CONSTRAINT "rooms_branch_id_branches_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "core"."branches"("id");--> statement-breakpoint
ALTER TABLE "core"."student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "core"."guardians"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."students" ADD CONSTRAINT "students_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."teachers" ADD CONSTRAINT "teachers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."payroll_items" ADD CONSTRAINT "payroll_items_period_id_payroll_periods_id_fkey" FOREIGN KEY ("period_id") REFERENCES "core"."payroll_periods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."payroll_items" ADD CONSTRAINT "payroll_items_teacher_id_teachers_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
ALTER TABLE "core"."payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_users_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."teacher_rates" ADD CONSTRAINT "teacher_rates_teacher_id_teachers_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
ALTER TABLE "core"."attendance_records" ADD CONSTRAINT "attendance_records_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "core"."sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_enrollments_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "core"."enrollments"("id");--> statement-breakpoint
ALTER TABLE "core"."attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id");--> statement-breakpoint
ALTER TABLE "core"."attendance_records" ADD CONSTRAINT "attendance_records_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."class_schedules" ADD CONSTRAINT "class_schedules_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."class_schedules" ADD CONSTRAINT "class_schedules_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "core"."rooms"("id");--> statement-breakpoint
ALTER TABLE "core"."class_schedules" ADD CONSTRAINT "class_schedules_teacher_id_teachers_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
ALTER TABLE "core"."reminder_messages" ADD CONSTRAINT "reminder_messages_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "core"."sessions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."reminder_messages" ADD CONSTRAINT "reminder_messages_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_schedule_id_class_schedules_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "core"."class_schedules"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_teacher_id_teachers_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "core"."teachers"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_room_id_rooms_id_fkey" FOREIGN KEY ("room_id") REFERENCES "core"."rooms"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_attendance_taken_by_users_id_fkey" FOREIGN KEY ("attendance_taken_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_payroll_period_id_payroll_periods_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "core"."payroll_periods"("id");--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_student_id_students_id_fkey" FOREIGN KEY ("student_id") REFERENCES "core"."students"("id");--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_class_id_classes_id_fkey" FOREIGN KEY ("class_id") REFERENCES "core"."classes"("id");--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_enrollment_id_enrollments_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "core"."enrollments"("id");--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_cancelled_by_users_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."invoices" ADD CONSTRAINT "invoices_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "core"."invoices"("id");--> statement-breakpoint
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_collected_by_users_id_fkey" FOREIGN KEY ("collected_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."payments" ADD CONSTRAINT "payments_voided_by_users_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id");--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;