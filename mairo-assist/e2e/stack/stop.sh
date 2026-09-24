#!/usr/bin/env bash
# E2E ONLY: stops the local stack started by start.sh and deletes its data.
cd "$(dirname "$0")/../.."
STATE="${E2E_STATE_DIR:-$PWD/.e2e}"
for svc in gotrue postgrest gateway smtp fake-openai fake-shopify; do
  [ -f "$STATE/$svc.pid" ] && kill "$(cat "$STATE/$svc.pid")" 2>/dev/null || true
done
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -d "$STATE/pg" ]; then
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D '$STATE/pg' -m immediate stop" >/dev/null 2>&1
  else "$PGBIN/pg_ctl" -D "$STATE/pg" -m immediate stop >/dev/null 2>&1; fi
fi
rm -rf "$STATE" e2e/.env.e2e
