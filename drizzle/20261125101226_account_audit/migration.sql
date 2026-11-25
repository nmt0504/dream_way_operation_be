-- Account audit: role change, lock/unlock, password reset, branch assignment.
-- Actor comes from app.actor_id: the API calls set_config('app.actor_id', <user_id>, true) inside the transaction.
CREATE FUNCTION core.current_actor() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid $$;
--> statement-breakpoint
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
  -- Password reset = new hash with must_change_password on (a self-service change turns the flag off)
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash AND NEW.must_change_password THEN
    INSERT INTO core.audit_logs (actor_id, action, entity_type, entity_id)
    VALUES (core.current_actor(), 'user.password_reset', 'user', NEW.id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER users_audit AFTER UPDATE OF role, status, password_hash ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.trg_users_audit();
--> statement-breakpoint
-- Branch assignment: one audit row per branch added / removed
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
--> statement-breakpoint
CREATE TRIGGER user_branches_audit AFTER INSERT OR DELETE ON core.user_branches
  FOR EACH ROW EXECUTE FUNCTION core.trg_user_branches_audit();
