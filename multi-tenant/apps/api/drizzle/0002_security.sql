-- ════════════════════════════════════════════════════════════════════════════════════════
-- Security layer: privileges, row-level security, integrity triggers.
-- See docs/architecture/MULTITENANCY.md and docs/architecture/FINANCE_MODEL.md.
--
-- Roles (created outside migrations, see infra/docker/postgres/init/01-roles.sh):
--   app_owner    owns every object, runs migrations, has NO policies (FORCE RLS → sees nothing)
--   app_runtime  request-scoped tenant access (tenant + branch policies)
--   app_system   workers / platform / pre-auth flows (explicit permissive policies)
-- ════════════════════════════════════════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO app_runtime, app_system;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO app_runtime, app_system;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_runtime, app_system;
--> statement-breakpoint

-- ── Privileges ───────────────────────────────────────────────────────────────────────────

-- Global permission catalog: readable by the runtime, maintained by the system role.
GRANT SELECT ON permissions TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON permissions TO app_system;
--> statement-breakpoint

GRANT SELECT, UPDATE ON organizations TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON organizations TO app_system;
--> statement-breakpoint

-- Users: the runtime role never sees password hashes, lockout counters or reset state.
GRANT SELECT (id, email, full_name, phone, status, platform_role, locale, email_verified_at,
              last_login_at, created_at, updated_at) ON users TO app_runtime;
--> statement-breakpoint
GRANT UPDATE (full_name, phone, locale, updated_at) ON users TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users TO app_system;
--> statement-breakpoint

-- Credentials and sessions: system role only.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, password_reset_tokens TO app_system;
--> statement-breakpoint

-- Tenant business tables: no DELETE. Records are archived, cancelled or reversed instead.
GRANT SELECT, INSERT, UPDATE ON
  branches, memberships, invitations, roles, organization_modules, document_sequences,
  academic_years, grade_levels, personnel, students, guardians, enrollments, classes,
  class_enrollments, teacher_assignments,
  financial_accounts, tuition_agreements, agreement_discounts, payment_plans, receivables,
  payments, payment_allocations, payment_intents
TO app_runtime, app_system;
--> statement-breakpoint

-- Association tables where removing a link is the natural operation.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  membership_branches, membership_roles, role_permissions, student_guardians
TO app_runtime, app_system;
--> statement-breakpoint

-- Audit log: append-only for everybody.
GRANT SELECT, INSERT ON audit_logs TO app_runtime, app_system;
--> statement-breakpoint

-- Outbox: the runtime can only append; relaying and retention belong to the system role.
GRANT INSERT ON outbox_events TO app_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox_events TO app_system;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON payment_provider_events TO app_system;
--> statement-breakpoint

-- ── Row-level security ───────────────────────────────────────────────────────────────────

-- Organization-owned tables: tenant isolation only.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'membership_branches', 'membership_roles', 'invitations', 'roles', 'role_permissions',
    'organization_modules', 'document_sequences', 'academic_years', 'grade_levels',
    'guardians', 'student_guardians'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL TO app_runtime
         USING (organization_id = app.current_org_id())
         WITH CHECK (organization_id = app.current_org_id())', t);
    EXECUTE format(
      'CREATE POLICY system_access ON %I AS PERMISSIVE FOR ALL TO app_system
         USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Branch-owned tables: tenant isolation plus the coarse branch boundary.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'personnel', 'students', 'enrollments', 'classes', 'class_enrollments',
    'teacher_assignments', 'financial_accounts', 'tuition_agreements', 'agreement_discounts',
    'payment_plans', 'receivables', 'payments', 'payment_allocations', 'payment_intents'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL TO app_runtime
         USING (organization_id = app.current_org_id() AND app.branch_allowed(branch_id))
         WITH CHECK (organization_id = app.current_org_id() AND app.branch_allowed(branch_id))', t);
    EXECUTE format(
      'CREATE POLICY system_access ON %I AS PERMISSIVE FOR ALL TO app_system
         USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- Branches: the branch boundary applies to the branch row itself.
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON branches AS PERMISSIVE FOR ALL TO app_runtime
  USING (organization_id = app.current_org_id() AND app.branch_allowed(id))
  WITH CHECK (organization_id = app.current_org_id() AND app.branch_allowed(id));
--> statement-breakpoint
CREATE POLICY system_access ON branches AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Memberships: the active organization's memberships plus the user's own (organization switcher).
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON memberships AS PERMISSIVE FOR SELECT TO app_runtime
  USING (organization_id = app.current_org_id() OR user_id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY tenant_insert ON memberships AS PERMISSIVE FOR INSERT TO app_runtime
  WITH CHECK (organization_id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY tenant_update ON memberships AS PERMISSIVE FOR UPDATE TO app_runtime
  USING (organization_id = app.current_org_id())
  WITH CHECK (organization_id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY system_access ON memberships AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Organizations: the active one, plus organizations the user belongs to (names for the switcher).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON organizations AS PERMISSIVE FOR SELECT TO app_runtime
  USING (
    id = app.current_org_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id AND m.user_id = app.current_user_id()
    )
  );
--> statement-breakpoint
CREATE POLICY tenant_update ON organizations AS PERMISSIVE FOR UPDATE TO app_runtime
  USING (id = app.current_org_id())
  WITH CHECK (id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY system_access ON organizations AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Users (global identities): yourself, or members of the active organization.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON users AS PERMISSIVE FOR SELECT TO app_runtime
  USING (
    id = app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = users.id AND m.organization_id = app.current_org_id()
    )
  );
--> statement-breakpoint
CREATE POLICY self_update ON users AS PERMISSIVE FOR UPDATE TO app_runtime
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY system_access ON users AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Credentials: system role only (the runtime role has no privileges either).
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_access ON sessions AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_access ON password_reset_tokens AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Audit log: tenant-scoped reads within the branch boundary; inserts for the active tenant only.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON audit_logs AS PERMISSIVE FOR SELECT TO app_runtime
  USING (organization_id = app.current_org_id() AND app.branch_allowed(branch_id));
--> statement-breakpoint
CREATE POLICY tenant_insert ON audit_logs AS PERMISSIVE FOR INSERT TO app_runtime
  WITH CHECK (organization_id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY system_access ON audit_logs AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Outbox: append-only for the active tenant.
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_insert ON outbox_events AS PERMISSIVE FOR INSERT TO app_runtime
  WITH CHECK (organization_id = app.current_org_id());
--> statement-breakpoint
CREATE POLICY system_access ON outbox_events AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- Webhook inbox: system role only.
ALTER TABLE payment_provider_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_provider_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_access ON payment_provider_events AS PERMISSIVE FOR ALL TO app_system
  USING (true) WITH CHECK (true);
--> statement-breakpoint

-- ── Generic triggers ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION app.set_updated_at()', t);
  END LOOP;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.audit_logs_append_only()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_append_only();
--> statement-breakpoint

-- ── Finance integrity ────────────────────────────────────────────────────────────────────

-- Agreements, receivables, payments and intents must match their account's student and currency.
CREATE OR REPLACE FUNCTION app.finance_account_consistency()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  account_student uuid;
  account_currency char(3);
BEGIN
  SELECT student_id, currency INTO account_student, account_currency
  FROM financial_accounts
  WHERE organization_id = NEW.organization_id AND id = NEW.account_id;

  IF account_student IS NULL THEN
    RAISE EXCEPTION 'financial account % not found', NEW.account_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF account_student <> NEW.student_id OR account_currency <> NEW.currency THEN
    RAISE EXCEPTION 'row does not match the student/currency of account %', NEW.account_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'finance_account_consistency';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER finance_account_consistency BEFORE INSERT ON tuition_agreements
  FOR EACH ROW EXECUTE FUNCTION app.finance_account_consistency();
--> statement-breakpoint
CREATE TRIGGER finance_account_consistency BEFORE INSERT ON receivables
  FOR EACH ROW EXECUTE FUNCTION app.finance_account_consistency();
--> statement-breakpoint
CREATE TRIGGER finance_account_consistency BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION app.finance_account_consistency();
--> statement-breakpoint
CREATE TRIGGER finance_account_consistency BEFORE INSERT ON payment_intents
  FOR EACH ROW EXECUTE FUNCTION app.finance_account_consistency();
--> statement-breakpoint

-- Payments are immutable. The only transition is completed → reversed (final).
-- allocated_minor is always recomputed from active allocations, so the cache cannot drift.
CREATE OR REPLACE FUNCTION app.payments_guard()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.branch_id <> OLD.branch_id
     OR NEW.account_id <> OLD.account_id
     OR NEW.student_id <> OLD.student_id
     OR NEW.currency <> OLD.currency
     OR NEW.amount_minor <> OLD.amount_minor
     OR NEW.method <> OLD.method
     OR NEW.received_at <> OLD.received_at
     OR NEW.receipt_number <> OLD.receipt_number
     OR NEW.payer_guardian_id IS DISTINCT FROM OLD.payer_guardian_id
     OR NEW.payer_name IS DISTINCT FROM OLD.payer_name
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
     OR NEW.recorded_by_membership_id IS DISTINCT FROM OLD.recorded_by_membership_id
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'completed payments are immutable; use a reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_immutable';
  END IF;

  IF OLD.status = 'reversed' AND (
       NEW.status <> 'reversed'
       OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
       OR NEW.reversed_by_membership_id IS DISTINCT FROM OLD.reversed_by_membership_id
       OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason) THEN
    RAISE EXCEPTION 'payment reversal is final'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_reversal_final';
  END IF;

  NEW.allocated_minor := (
    SELECT coalesce(sum(a.amount_minor), 0)
    FROM payment_allocations a
    WHERE a.organization_id = NEW.organization_id
      AND a.payment_id = NEW.id
      AND a.reversed_at IS NULL
  );
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION app.payments_guard();
--> statement-breakpoint

-- Receivables: identity and amount are immutable; cancellation is final;
-- allocated_minor and the paid/open status are derived from active allocations.
CREATE OR REPLACE FUNCTION app.receivables_guard()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.branch_id <> OLD.branch_id
     OR NEW.account_id <> OLD.account_id
     OR NEW.student_id <> OLD.student_id
     OR NEW.kind <> OLD.kind
     OR NEW.currency <> OLD.currency
     OR NEW.amount_minor <> OLD.amount_minor
     OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
     OR NEW.payment_plan_id IS DISTINCT FROM OLD.payment_plan_id
     OR NEW.sequence_no IS DISTINCT FROM OLD.sequence_no
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'receivable identity and amount are immutable; cancel and re-issue instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'receivables_immutable';
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'receivable cancellation is final'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'receivables_cancellation_final';
  END IF;

  NEW.allocated_minor := (
    SELECT coalesce(sum(a.amount_minor), 0)
    FROM payment_allocations a
    WHERE a.organization_id = NEW.organization_id
      AND a.receivable_id = NEW.id
      AND a.reversed_at IS NULL
  );

  IF NEW.status <> 'cancelled' THEN
    NEW.status := CASE WHEN NEW.allocated_minor = NEW.amount_minor THEN 'paid' ELSE 'open' END;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER receivables_guard BEFORE UPDATE ON receivables
  FOR EACH ROW EXECUTE FUNCTION app.receivables_guard();
--> statement-breakpoint

-- Allocations: validated on insert, insert-only afterwards except for the one-way reversal.
CREATE OR REPLACE FUNCTION app.payment_allocations_guard()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  p record;
  r record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT account_id, currency, status INTO p
    FROM payments WHERE organization_id = NEW.organization_id AND id = NEW.payment_id;
    SELECT account_id, currency, status INTO r
    FROM receivables WHERE organization_id = NEW.organization_id AND id = NEW.receivable_id;

    IF p.status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION 'only completed payments can be allocated'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_payment_status';
    END IF;
    IF r.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'only open receivables can receive allocations'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_receivable_status';
    END IF;
    IF p.account_id <> NEW.account_id OR r.account_id <> NEW.account_id
       OR p.currency <> r.currency THEN
      RAISE EXCEPTION 'payment and receivable must share account and currency'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_account_match';
    END IF;
    IF NEW.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'allocations cannot be created reversed'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_reversal';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only the reversal columns may change, once.
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.branch_id <> OLD.branch_id
     OR NEW.account_id <> OLD.account_id
     OR NEW.payment_id <> OLD.payment_id
     OR NEW.receivable_id <> OLD.receivable_id
     OR NEW.amount_minor <> OLD.amount_minor
     OR NEW.created_at <> OLD.created_at
     OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
     OR OLD.reversed_at IS NOT NULL
     OR NEW.reversed_at IS NULL THEN
    RAISE EXCEPTION 'allocations are insert-only; the only permitted change is a reversal'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payment_allocations_immutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER payment_allocations_guard BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.payment_allocations_guard();
--> statement-breakpoint

-- After an allocation changes, touch the parents so their guards recompute the cached sums.
-- The parents' CHECK constraints then reject any over-allocation, rolling back the statement.
CREATE OR REPLACE FUNCTION app.payment_allocations_sync()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE payments SET allocated_minor = allocated_minor
  WHERE organization_id = NEW.organization_id AND id = NEW.payment_id;
  UPDATE receivables SET allocated_minor = allocated_minor
  WHERE organization_id = NEW.organization_id AND id = NEW.receivable_id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER payment_allocations_sync AFTER INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.payment_allocations_sync();
--> statement-breakpoint

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_runtime, app_system;
