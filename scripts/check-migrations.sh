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

# Tables deliberately sealed against every client: row-level security on and no
# policies at all, reached only by an edge function holding the service role key,
# which bypasses row-level security. That is Supabase's shape for "clients cannot
# touch this", and it is indistinguishable from an accidental lockout by
# inspection — both are RLS-on with no readable policy. The only thing that
# separates them is intent, so intent gets written down here.
#
# Adding a name to this list means: nothing signed in may ever read this table,
# and we have decided that on purpose. It is a visible diff for a reason.
#
#   email_unsubscribe_tokens — (email, token) for every address the platform has
#     ever emailed. Written and read only by process-message-queue. A policy
#     admitting authenticated would let any signed-in user enumerate those
#     addresses and the token that unsubscribes each one.
#
# NOTE: do not be tempted to infer this from grants instead. In the replay
# database anon and authenticated hold SELECT on only 29 of the 72 public tables
# — Supabase's default privileges are not part of the migration set — so a grant
# test would quietly skip schools, students, invoices and 40 others and report
# green while checking almost nothing.
PRIVATE_TABLES="email_unsubscribe_tokens"

private_sql=$(printf "'%s'," $PRIVATE_TABLES); private_sql="${private_sql%,}"

# Row-level security with no readable policy locks every user out of the table.
locked=$(target -c "
  SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND c.relname NOT IN ($private_sql)
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polcmd IN ('r', '*')
    );")
[[ -z "$locked" ]] || fail "tables have row-level security on but no readable policy: $locked"
pass "every table with row-level security can still be read by someone"

# …and the exemptions do not rot. A sealed table that has since gained a policy
# is no longer sealed, so the entry is stale and someone should re-read it
# rather than let it keep a real lockout hidden.
unsealed=$(target -c "
  SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relname IN ($private_sql)
    AND (NOT c.relrowsecurity OR EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
    ));")
[[ -z "$unsealed" ]] || fail "listed as private but no longer sealed — drop from PRIVATE_TABLES: $unsealed"

missing_private=$(target -c "
  SELECT coalesce(string_agg(n, ', '), '')
  FROM unnest(ARRAY[$private_sql]) n
  WHERE to_regclass('public.' || n) IS NULL;")
[[ -z "$missing_private" ]] || fail "listed as private but no longer exists — drop from PRIVATE_TABLES: $missing_private"
pass "every deliberately private table is still sealed"

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

# A view is a hole in row-level security unless it says otherwise. Postgres
# runs a plain view with its owner's privileges, so it reads its base tables
# past every policy on them — and Supabase grants SELECT on new public views to
# anon and authenticated by default. users_with_multiple_roles shipped exactly
# like that and exposed every account's org memberships to any signed-in user.
#
# Worse, the option is easy to lose again: CREATE OR REPLACE VIEW replaces
# reloptions wholesale rather than merging them, so a later replace with no
# WITH clause silently drops it.
#
# Deliberately not filtered by current grants. The replay database is not a
# Supabase project and does not carry its default privileges, so at this point
# nothing is granted to anon or authenticated yet — an earlier version of this
# check joined on the grants and passed against a view that was provably
# leaking. Every view in public is required to be security_invoker whether or
# not this database happens to have granted it yet.
leaky_views=$(target -c "
  SELECT coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'v'
    AND NOT coalesce(c.reloptions, '{}') @> ARRAY['security_invoker=true'];")
[[ -z "$leaky_views" ]] || fail "view without security_invoker reads its base tables past row-level security: $leaky_views"
pass "every view in public runs under the caller's row-level security"

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
expected_tables="ai_usage_events applications cbt_answers cbt_attempts cbt_questions cbt_test_questions cbt_tests class_teachers invoice_adjustments report_traits result_holds school_events school_notices student_transport subject_teachers term_report_comments term_report_ratings term_report_releases transport_routes transport_stops"
for table in $expected_tables; do
  exists=$(target -c "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='$table';")
  [[ "$exists" == "1" ]] || fail "expected table '$table' is missing after replay"
done
pass "all expected tables exist"

# --- Behaviour ---------------------------------------------------------------
# The checks above prove the policies exist. These seed real rows and query as a
# real teacher and student to prove they do the right thing. Every assertion in
# there corresponds to a hole that was actually open.
if ! rls_output=$(target -f "$ROOT/supabase/tests/rls.sql" 2>&1); then
  printf '\n\033[31mFAIL\033[0m  row-level security behaviour\n' >&2
  echo "$rls_output" | grep -E "ASSERTION FAILED|ERROR|DETAIL" >&2 || echo "$rls_output" >&2
  exit 1
fi
pass "row-level security behaves correctly for a teacher and a student"

echo
echo "Migration replay checks passed."
