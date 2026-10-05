-- Extensions and helper functions that the table definitions depend on.
-- All extensions used here are "trusted" (PostgreSQL 13+): the database owner can create them.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
COMMENT ON SCHEMA app IS 'Platform helper functions used by row-level security policies and triggers.';
--> statement-breakpoint

-- Turkish-safe search normalization: unaccent folds İ/ı/ş/ğ/ü/ö/ç/â/î/û to ASCII, then lower().
-- Declared IMMUTABLE (with an explicit dictionary) so it can back generated columns and indexes.
CREATE OR REPLACE FUNCTION app.search_normalize(input text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, input))
$$;
--> statement-breakpoint

-- Tenant context. Set per transaction by the API with set_config(..., true).
-- An unset context yields NULL, which makes every tenant policy evaluate to false (fail closed).
CREATE OR REPLACE FUNCTION app.current_org_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_user_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint

-- Coarse branch boundary: '*' allows every branch; otherwise a comma-separated list of branch ids.
-- Rows without a branch (organization-level rows) are allowed; the tenant check still applies.
CREATE OR REPLACE FUNCTION app.branch_allowed(branch uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN current_setting('app.branch_ids', true) = '*' THEN true
    WHEN branch IS NULL THEN true
    ELSE branch = ANY (string_to_array(nullif(current_setting('app.branch_ids', true), ''), ',')::uuid[])
  END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
