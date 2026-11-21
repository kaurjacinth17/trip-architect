#!/bin/sh
# Apply supabase/migrations to a scratch database and run the RLS tests (tests/sql). Needs a local Postgres 15+
# reachable through the usual PG* variables (PGHOST, PGPORT, PGUSER). Not part of CI.
set -e
DB=${TA_TEST_DB:-ta_rls_test}
psql -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f tests/sql/supabase-shim.sql $(for f in supabase/migrations/*.sql; do printf -- '-f %s ' "$f"; done) >/dev/null
psql -d "$DB" -q -f tests/sql/rls.test.sql 2>&1 | sed 's/^psql:[^ ]* //'
