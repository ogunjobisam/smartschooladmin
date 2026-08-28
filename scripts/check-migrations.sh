#!/usr/bin/env bash
#
# Replay every migration against an empty database, then assert the invariants
# that matter.
#
# This exists because the migration set silently stopped being replayable: two
# overlapping sets of files created the same policies, and `CREATE POLICY` has
# no `IF NOT EXISTS`, so a fresh `supabase db push` failed on a duplicate name.
# Nothing caught it, because nothing had ever replayed the migrations from
# scratch. Now something does.
#
# Usage:
#   scripts/check-migrations.sh
#
# Connection comes from the standard PG* variables, or DATABASE_URL. Defaults
# suit the postgres service container used in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
BOOTSTRAP="$ROOT/supabase/tests/bootstrap.sql"
DB_NAME="${MIGRATION_TEST_DB:-migration_replay}"

PSQL_BASE=(psql -v ON_ERROR_STOP=1 -qAt)
if [[ -n "${DATABASE_URL:-}" ]]; then
  ADMIN_URL="$DATABASE_URL"
  TARGET_URL="${DATABASE_URL%/*}/$DB_NAME"
  admin() { "${PSQL_BASE[@]}" "$ADMIN_URL" "$@"; }
  target() { "${PSQL_BASE[@]}" "$TARGET_URL" "$@"; }
else
  admin() { "${PSQL_BASE[@]}" -d "${PGDATABASE:-postgres}" "$@"; }
  target() { "${PSQL_BASE[@]}" -d "$DB_NAME" "$@"; }
fi

fail() { printf '\n\033[31mFAIL\033[0m  %s\n' "$1" >&2; exit 1; }
pass() { printf '\033[32mok\033[0m    %s\n' "$1"; }

echo "Replaying migrations into a fresh '$DB_NAME'..."
admin -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
admin -c "CREATE DATABASE $DB_NAME;" >/dev/null
target -f "$BOOTSTRAP" >/dev/null

count=0
for file in "$MIGRATIONS"/*.sql; do
  if ! output=$(target -f "$file" 2>&1); then
    printf '\n\033[31mFAIL\033[0m  %s\n' "$(basename "$file")" >&2
    echo "$output" | grep -E "ERROR|DETAIL" >&2 || echo "$output" >&2
    exit 1
  fi
  count=$((count + 1))
done
pass "$count migrations applied in filename order"

# --- Invariants -------------------------------------------------------------
# Each of these is a property someone could plausibly break with a careless
# migration, and each has a real consequence.

# Row-level security with no readable policy locks every user out of the table.
locked=$(target -c "
  SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
    );")
[[ -z "$locked" ]] || fail "tables have row-level security on but no readable policy: $locked"
pass "every table with row-level security can still be read by someone"

# Applications and notices are written only by the admissions edge function
# using the service role. A policy granting anon or PUBLIC would expose every
# family's application to the internet.
public_grants=$(target -c "
  SELECT coalesce(string_agg(c.relname || '.' || p.polname || ' -> ' || coalesce(r.rolname, 'PUBLIC'), ', '), '')
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  LEFT JOIN LATERAL unnest(p.polroles) pr(oid) ON true
  LEFT JOIN pg_roles r ON r.oid = pr.oid
  WHERE c.relname IN ('applications', 'school_notices')
    AND (r.rolname IS NULL OR r.rolname IN ('anon', 'public'));")
[[ -z "$public_grants" ]] || fail "anonymous access granted on admissions data: $public_grants"
pass "no anonymous or public grant on applications or school_notices"

# has_role() gives super_admin every role except the self-service ones. If
# 'student' were dropped from that exclusion, a platform admin would satisfy
# every student-scoped policy.
student_guard=$(target -c "
  SELECT count(*) FROM pg_proc
  WHERE proname = 'has_role'
    AND pronamespace = 'public'::regnamespace
    AND pg_get_functiondef(oid) LIKE '%''student''::app_role%';")
[[ "$student_guard" == "1" ]] || fail "has_role() no longer excludes 'student' for super_admin"
pass "has_role() still excludes 'student' for super_admin"

# A crude but effective check that a migration was not silently dropped.
expected_tables="ai_usage_events applications class_teachers school_events school_notices student_transport transport_routes transport_stops"
for table in $expected_tables; do
  exists=$(target -c "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='$table';")
  [[ "$exists" == "1" ]] || fail "expected table '$table' is missing after replay"
done
pass "all expected tables exist"

echo
echo "Migration replay checks passed."
