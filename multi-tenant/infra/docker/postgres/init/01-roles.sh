#!/bin/sh
# Creates the three database roles the platform relies on. Runs once, on the
# first start of an empty data volume (docker-entrypoint-initdb.d semantics).
#
#   app_owner   owns the schema, runs migrations. Never used by the running app.
#   app_runtime request-scoped tenant access. Subject to tenant/branch RLS.
#   app_system  workers, platform administration and pre-auth flows.
#               Subject to its own (explicit) RLS policies; never BYPASSRLS.
#
# See docs/architecture/MULTITENANCY.md.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE app_owner   LOGIN PASSWORD '${APP_OWNER_PASSWORD}'   NOSUPERUSER NOCREATEROLE NOBYPASSRLS;
CREATE ROLE app_runtime LOGIN PASSWORD '${APP_RUNTIME_PASSWORD}' NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
CREATE ROLE app_system  LOGIN PASSWORD '${APP_SYSTEM_PASSWORD}'  NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;

ALTER DATABASE ${POSTGRES_DB} OWNER TO app_owner;
REVOKE ALL ON DATABASE ${POSTGRES_DB} FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE ${POSTGRES_DB} TO app_runtime, app_system;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
ALTER SCHEMA public OWNER TO app_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_runtime, app_system;
EOSQL
