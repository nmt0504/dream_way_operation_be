ALTER TABLE "core"."users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_username_key" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_username_format_chk" CHECK ("username" ~ '^[a-z0-9._-]{3,32}$' AND "username" !~ '^[0-9]+$');--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_username_required_chk" CHECK ("role" <> 'student' OR "username" IS NOT NULL);