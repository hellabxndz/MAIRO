#!/usr/bin/env bash
# Full end-to-end run: start the local stack, build and start the app against
# it, run the Playwright suite, then tear everything down.
set -euo pipefail
cd "$(dirname "$0")/.."
bash e2e/stack/start.sh
set -a; . e2e/.env.e2e; set +a
npx next build >/dev/null
if curl -sf http://localhost:3100/ >/dev/null; then echo "Port 3100 is already in use" >&2; exit 1; fi
node node_modules/next/dist/bin/next start --port 3100 >"${E2E_APP_LOG:-/tmp/mairo-assist-e2e-app.log}" 2>&1 & APP=$!
trap 'kill $APP 2>/dev/null; bash e2e/stack/stop.sh' EXIT
for i in $(seq 1 60); do curl -sf http://localhost:3100/ >/dev/null && break; sleep 0.5; done
npx playwright test "$@"
