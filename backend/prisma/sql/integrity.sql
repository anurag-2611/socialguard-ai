-- SocialGuard AI — database integrity rules that Prisma's schema language cannot express.
-- Idempotent: safe to re-run after every `prisma migrate deploy`.
-- Run with: npm run db:integrity --workspace @socialguard/api

-- 1) Human-readable case numbers: CASE-YYYY-NNNNNN. The counter is global (does not reset yearly).
CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1;

CREATE OR REPLACE FUNCTION next_case_number() RETURNS text AS $$
  SELECT 'CASE-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' ||
         lpad(nextval('case_number_seq')::text, 6, '0');
$$ LANGUAGE sql VOLATILE;

-- 2) audit_logs is append-only. The only permitted UPDATE is the FK action that nulls actor_id
--    when a user row is hard-deleted by the retention job.
CREATE OR REPLACE FUNCTION audit_logs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_logs is append-only (DELETE blocked)';
  END IF;
  IF NEW.actor_id IS NULL
     AND NEW.id = OLD.id
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.action = OLD.action
     AND NEW.entity_type = OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.outcome = OLD.outcome
     AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id
     AND NEW.ip_hash IS NOT DISTINCT FROM OLD.ip_hash
     AND NEW.details = OLD.details THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only (UPDATE blocked)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_guard();

-- 3) Data-quality constraints.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase;
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));

ALTER TABLE detection_results DROP CONSTRAINT IF EXISTS detection_probability_range;
ALTER TABLE detection_results ADD CONSTRAINT detection_probability_range
  CHECK (risk_probability >= 0 AND risk_probability <= 1);

ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_has_parent;
ALTER TABLE evidence ADD CONSTRAINT evidence_has_parent
  CHECK (case_id IS NOT NULL OR detection_id IS NOT NULL);

ALTER TABLE evidence DROP CONSTRAINT IF EXISTS evidence_sha256_format;
ALTER TABLE evidence ADD CONSTRAINT evidence_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_sha256_format;
ALTER TABLE reports ADD CONSTRAINT reports_sha256_format
  CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_number_format;
ALTER TABLE cases ADD CONSTRAINT cases_number_format CHECK (case_number ~ '^CASE-[0-9]{4}-[0-9]{6}$');

-- 4) At most one ACTIVE model version per model name.
CREATE UNIQUE INDEX IF NOT EXISTS model_versions_one_active_per_name
  ON model_versions (name) WHERE status = 'ACTIVE';

-- 5) Partial index for the common "open cases" query.
CREATE INDEX IF NOT EXISTS cases_open_idx
  ON cases (status, created_at)
  WHERE deleted_at IS NULL AND status NOT IN ('CLOSED', 'RESOLVED');
