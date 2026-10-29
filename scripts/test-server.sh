#!/bin/zsh
# Runs the five apps as a FAST private test server: a production build
# (small, cached pages) with test helpers kept on (ALLOW_TEST_PROVIDERS=YES:
# local file storage, on-screen OTP codes, sandbox KYC). Same ports as dev, so
# the phone links (scripts/dev-tunnels.sh) keep working. After code changes,
# run this again to rebuild. Never use ALLOW_TEST_PROVIDERS on the live site.
#   scripts/test-server.sh            build + start
#   scripts/test-server.sh --no-build start only
set -e
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/node22/bin:$PATH"
set -a; source ../azadimart/.env.local; set +a
# The env file is for development (NODE_ENV=development); this server is a production build.
export NODE_ENV=production
export ALLOW_TEST_PROVIDERS=YES NEXT_PUBLIC_STUDIO_URL="${NEXT_PUBLIC_STUDIO_URL:-http://localhost:3003}" NEXT_TELEMETRY_DISABLED=1
LOGS="${TMPDIR:-/tmp}/loimart-test-server"; mkdir -p "$LOGS"
pkill -f "turbo dev" 2>/dev/null || true; pkill -f "next dev" 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; sleep 2
if [[ "${1:-}" != "--no-build" ]]; then
  rm -rf apps/*/.next
  pnpm exec turbo build --env-mode=loose --filter=@azadimart/storefront --filter=@azadimart/seller --filter=@azadimart/admin --filter=@azadimart/studio --filter=@azadimart/payroll > "$LOGS/build.log" 2>&1 || { tail -40 "$LOGS/build.log"; exit 1; }
fi
for app in storefront seller admin studio payroll; do
  (cd "apps/$app" && nohup pnpm exec next start -p "$(node -p "({storefront:3000,seller:3001,admin:3002,studio:3003,payroll:3004})['$app']")" > "$LOGS/$app.log" 2>&1 &)
done
for port in 3000 3001 3002 3003 3004; do
  for _ in {1..60}; do curl -s -o /dev/null -m 5 "http://localhost:$port/" && break; sleep 1; done
  echo "port $port: $(curl -s -o /dev/null -w '%{http_code}' -m 20 "http://localhost:$port/")"
done
echo "Test server running (production build). Logs: $LOGS"
