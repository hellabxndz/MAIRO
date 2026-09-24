#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres (with a minimal
# Supabase auth stub) and runs the SQL test suite in supabase/tests.
# Requires the Postgres server binaries (initdb, pg_ctl) on PATH or in
# /usr/lib/postgresql/*/bin.
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
DATA="$(mktemp -d)"
PORT="${TEST_PG_PORT:-54329}"
SOCK="$DATA/sock"
mkdir -p "$SOCK"

cleanup() { pg_ctl -D "$DATA/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA" 2>/dev/null && RUN_AS="postgres" || true
fi
as_pg() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -s /bin/bash -c "PATH=$PATH $*"; else bash -c "$*"; fi; }

as_pg "initdb -D '$DATA/db' -U postgres --auth=trust >/dev/null"
as_pg "pg_ctl -D '$DATA/db' -o \"-p $PORT -k $SOCK -c listen_addresses=''\" -l '$DATA/log' -w start >/dev/null"

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres)
"${PSQL[@]}" -c "create database mairo_assist_test" >/dev/null
DB=("${PSQL[@]}" -d mairo_assist_test)

"${DB[@]}" -f supabase/tests/00_supabase_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${DB[@]}" -f "$f" >/dev/null
done
for f in supabase/tests/[1-9]*.sql; do
  echo "test     $(basename "$f")"
  "${DB[@]}" -o /dev/null -f "$f" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
  [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "FAILED: $f"; exit 1; }
done
echo "All database tests passed."
