#!/usr/bin/env bash
# Restore a reliable local Wines & Spirits demo (does NOT wipe the database).
# Run in a second terminal while the API stays up.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Ensure Postgres + Redis containers are running"
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker start sokoos-postgres sokoos-redis >/dev/null 2>&1 || true
  docker compose up -d postgres redis >/dev/null 2>&1 || true
fi

echo "==> Wait for Postgres"
for i in $(seq 1 30); do
  if (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then break; fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "Postgres not reachable. Start it first: docker start sokoos-postgres"
    exit 1
  fi
done

echo "==> Seed Wines & Spirits demo users and catalogue (safe upsert)"
export DATABASE_URL="${DATABASE_URL:-postgresql://sokoos:sokoos@127.0.0.1:5432/sokoos_wines_spirits?schema=public}"
export PRODUCT_EDITION="${PRODUCT_EDITION:-WINES_SPIRITS}"
pnpm --filter @sokoos/api seed

echo "==> Verify login"
demo="$(curl -sS -o /tmp/soko-demo-login.json -w '%{http_code}' \
  -X POST http://127.0.0.1:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@sokoos.local","password":"Demo123!","tenantSlug":"demo"}')"

echo "Owner login HTTP $demo"
if [[ "$demo" != 2* ]]; then
  echo "Login verify failed — is the API running? ./scripts/start-api-only.sh"
  cat /tmp/soko-demo-login.json 2>/dev/null || true
  exit 1
fi
echo "Login OK — Wines & Spirits demo accounts verified."

cat <<'EOF'

SokoOS Wines & Spirits Demo is ready. Keep API terminal open.

  Unified Application: http://127.0.0.1:5175  (Login -> Dashboard / POS / Inventory / Reports)
  Desktop POS build:   http://127.0.0.1:5174

  Store Code: demo
  - Business Owner:   demo@sokoos.local / Demo123!       (lands on /dashboard)
  - Cashier:          cashier@sokoos.local / Cashier123! (lands on /pos)
  - Stock Controller: stock@sokoos.local / Stock123!     (lands on /inventory)
  - Accountant:       accountant@sokoos.local / Accountant123! (lands on /reports)

EOF
