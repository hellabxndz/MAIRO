#!/usr/bin/env bash
# E2E ONLY: starts a throwaway Supabase-compatible stack on this machine —
# Postgres (with the app's migrations), GoTrue (Supabase Auth), PostgREST,
# a tiny gateway and an SMTP sink — and writes e2e/.env.e2e for the app.
#
#   bash e2e/stack/start.sh      # start (idempotent: restarts from scratch)
#   bash e2e/stack/stop.sh       # stop and delete everything
#
# Needs Postgres server binaries (initdb/pg_ctl) and network access to GitHub
# releases the first time (GoTrue and PostgREST binaries are cached).
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$PWD"
STATE="${E2E_STATE_DIR:-$ROOT/.e2e}"
CACHE="${E2E_CACHE_DIR:-$HOME/.cache/mairo-assist-e2e}"
GOTRUE_VERSION="v2.180.0"
POSTGREST_VERSION="v13.0.4"
PG_PORT=54340; GOTRUE_PORT=9999; POSTGREST_PORT=54330; GATEWAY_PORT=54321; SMTP_PORT=54325; SMTP_HTTP_PORT=54326; FAKE_OPENAI_PORT=54327; FAKE_SHOPIFY_PORT=54328
JWT_SECRET="e2e-super-secret-jwt-token-with-at-least-32-characters"

bash "$ROOT/e2e/stack/stop.sh" >/dev/null 2>&1 || true
mkdir -p "$STATE/logs" "$CACHE"

# --- binaries -----------------------------------------------------------------
if [ ! -x "$CACHE/auth" ]; then
  curl -sSL "https://github.com/supabase/auth/releases/download/$GOTRUE_VERSION/auth-$GOTRUE_VERSION-x86.tar.gz" | tar xz -C "$CACHE"
fi
if [ ! -x "$CACHE/postgrest" ]; then
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x86-64.tar.xz" | tar xJ -C "$CACHE"
fi

# --- postgres -----------------------------------------------------------------
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="postgres"; chown -R postgres "$STATE"; fi
as_pg() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -s /bin/bash -c "PATH=$PATH $*"; else bash -c "$*"; fi; }
as_pg "initdb -D '$STATE/pg' -U postgres --auth=trust >/dev/null"
as_pg "pg_ctl -D '$STATE/pg' -o '-p $PG_PORT -c listen_addresses=127.0.0.1 -k /tmp' -l '$STATE/logs/postgres.log' -w start >/dev/null"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres)
"${PSQL[@]}" -f e2e/stack/roles.sql >/dev/null

# --- GoTrue (runs its own migrations into the auth schema) ------------------------
export GOTRUE_API_HOST=127.0.0.1 PORT=$GOTRUE_PORT
export API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1"
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://supabase_auth_admin:auth-admin-e2e@127.0.0.1:$PG_PORT/postgres?sslmode=disable"
export GOTRUE_DB_DATABASE_URL="$DATABASE_URL"
export GOTRUE_SITE_URL="http://localhost:3100"
export GOTRUE_URI_ALLOW_LIST="http://localhost:3100/**"
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
export GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false
export GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=$SMTP_PORT GOTRUE_SMTP_ADMIN_EMAIL=no-reply@mairo-assist.test GOTRUE_SMTP_SENDER_NAME="Mairo Assist"
export GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_RATE_LIMIT_EMAIL_SENT=1000
export GOTRUE_MAILER_TEMPLATES_CONFIRMATION="http://127.0.0.1:$GATEWAY_PORT/templates/confirmation.html"
export GOTRUE_MAILER_TEMPLATES_RECOVERY="http://127.0.0.1:$GATEWAY_PORT/templates/recovery.html"
export GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE="http://127.0.0.1:$GATEWAY_PORT/templates/email_change.html"
export GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true
export GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false
export GOTRUE_EXTERNAL_GOOGLE_ENABLED=true GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=e2e-google-client
export GOTRUE_EXTERNAL_GOOGLE_SECRET=e2e-google-secret
export GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI="http://127.0.0.1:$GATEWAY_PORT/auth/v1/callback"
export GOTRUE_LOG_LEVEL=warn
(cd "$CACHE" && ./auth migrate >"$STATE/logs/gotrue-migrate.log" 2>&1)

# --- app migrations -------------------------------------------------------------
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" >/dev/null; done

# --- services ---------------------------------------------------------------------
node e2e/stack/smtp-sink.mjs >"$STATE/logs/smtp.log" 2>&1 & echo $! >"$STATE/smtp.pid"
FAKE_OPENAI_PORT=$FAKE_OPENAI_PORT node e2e/stack/fake-openai.mjs >"$STATE/logs/fake-openai.log" 2>&1 & echo $! >"$STATE/fake-openai.pid"
FAKE_SHOPIFY_PORT=$FAKE_SHOPIFY_PORT SHOPIFY_API_KEY=e2e-shopify-key SHOPIFY_API_SECRET=e2e-shopify-secret \
  node e2e/stack/fake-shopify.mjs >"$STATE/logs/fake-shopify.log" 2>&1 & echo $! >"$STATE/fake-shopify.pid"
GATEWAY_PORT=$GATEWAY_PORT GOTRUE_PORT=$GOTRUE_PORT POSTGREST_PORT=$POSTGREST_PORT \
  node e2e/stack/gateway.mjs >"$STATE/logs/gateway.log" 2>&1 & echo $! >"$STATE/gateway.pid"
(cd "$CACHE" && exec ./auth serve) >"$STATE/logs/gotrue.log" 2>&1 & echo $! >"$STATE/gotrue.pid"
PGRST_DB_URI="postgres://authenticator:authenticator-e2e@127.0.0.1:$PG_PORT/postgres" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=$POSTGREST_PORT PGRST_SERVER_HOST=127.0.0.1 PGRST_LOG_LEVEL=warn \
  "$CACHE/postgrest" >"$STATE/logs/postgrest.log" 2>&1 & echo $! >"$STATE/postgrest.pid"

# --- keys + env -------------------------------------------------------------------
KEYS=$(JWT_SECRET="$JWT_SECRET" node -e '
const c=require("node:crypto");const s=process.env.JWT_SECRET;
const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
const sign=(role)=>{const h=b({alg:"HS256",typ:"JWT"}),p=b({role,iss:"supabase",iat:1700000000,exp:2000000000});
return h+"."+p+"."+c.createHmac("sha256",s).update(h+"."+p).digest("base64url")};
console.log(sign("anon")+" "+sign("service_role"))')
ANON_KEY=${KEYS% *}; SERVICE_KEY=${KEYS#* }
cat >"$ROOT/e2e/.env.e2e" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SECRET_KEY=$SERVICE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3100
ENCRYPTION_KEY=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))')
E2E_DATABASE_URL=postgres://postgres@127.0.0.1:$PG_PORT/postgres
E2E_SMTP_HTTP=http://127.0.0.1:$SMTP_HTTP_PORT
OPENAI_API_KEY=e2e-fake-key
OPENAI_MODEL=fake-model
OPENAI_BASE_URL=http://127.0.0.1:$FAKE_OPENAI_PORT/v1
OPENAI_PRICE_INPUT_PER_MTOK=1
OPENAI_PRICE_CACHED_INPUT_PER_MTOK=0.5
OPENAI_PRICE_OUTPUT_PER_MTOK=4
E2E_FAKE_OPENAI=http://127.0.0.1:$FAKE_OPENAI_PORT
CRON_SECRET=e2e-cron-secret
AUTH_GOOGLE_ENABLED=true
SHOPIFY_API_KEY=e2e-shopify-key
SHOPIFY_API_SECRET=e2e-shopify-secret
SHOPIFY_TEST_API_BASE_URL=http://127.0.0.1:$FAKE_SHOPIFY_PORT
E2E_FAKE_SHOPIFY=http://127.0.0.1:$FAKE_SHOPIFY_PORT
ENV

for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health" >/dev/null && curl -sf "http://127.0.0.1:$GATEWAY_PORT/rest/v1/" -H "apikey: $ANON_KEY" >/dev/null; then
    echo "E2E stack ready (env in e2e/.env.e2e)"; exit 0
  fi
  sleep 0.5
done
echo "Stack did not become healthy; see $STATE/logs" >&2
exit 1
