# SokoOS Wines & Spirits

**Standalone Commercial POS, Cellar Inventory, Purchasing, Credit & eTIMS Management System for Wines, Spirits & Beverage Retail**

SokoOS Wines & Spirits (`PRODUCT_EDITION=WINES_SPIRITS`) is a complete, unified business management application purpose-built for wines, spirits, beer, cider, champagne, and mixer retail/wholesale operations.

## Key Capabilities

- **Unified Single Application & Login:** One web application (`apps/admin-dashboard`) with one login (`/login`), shared session/permissions, and automatic role-based routing:
  - **Owner / Manager** → `/dashboard`
  - **Cashier / Sales Attendant** → `/pos`
  - **Stock Controller** → `/inventory`
  - **Procurement Officer** → `/purchases`
  - **Accountant / Auditor** → `/reports`
- **High-Speed Offline-First POS (`/pos`):** USB/HID barcode wedge scanner support, instant search, category chips, Retail vs. Wholesale price toggle, held/suspended sales (`F4`), deterministic cash tendered & change calculation, M-Pesa/Card/Bank/Credit/Split payments, in-POS returns, and `SyncEnvelope` v1 offline synchronization.
- **Wines & Spirits Cellar Inventory (`/products`, `/inventory`):** Bottle, pack, and case packaging (`1 CASE = 12 BOTTLES`) with atomic case-to-bottle conversion, physical stock count reconciliation, damage/expiry write-offs, inter-warehouse transfers, and pre-commit CSV import validation.
- **Purchasing & Supplier Payables (`/purchases`, `/suppliers`):** Local Purchase Orders (LPO), approval, partial/full goods receiving, supplier statements, and supplier payment recording.
- **Customers & Credit Management (`/customers`):** Customer profiles, credit limits, credit sale enforcement, credit repayments, and statements.
- **KRA eTIMS Queue (`/etims`) & Printing:** Adapter boundary and persistent submission queue (`NOT_CONFIGURED`, `PENDING`, `RETRYING`, `ACCEPTED`, `FAILED`) with idempotent retries, plus `80mm` (X-80), `58mm`, and `A4` receipt/invoice printing.

---

## Quick Start (Local Development)

```bash
pnpm install
cp .env.example .env

# 1. Start local PostgreSQL + Redis containers
docker compose up -d postgres redis

# 2. Build packages and apply migrations (does NOT wipe JAYWINES)
pnpm build
pnpm --filter @sokoos/database exec prisma migrate deploy

# Fresh empty DB only — creates JAYWINES + owner (0 sample products/sales):
# BOOTSTRAP_OWNER_PASSWORD='YourStrongPassword123!' pnpm db:bootstrap

# 3. Start API on http://127.0.0.1:3001 (supports both /api/v1 and /v1)
./scripts/start-api-only.sh

# 4. Start Unified Web Application on http://127.0.0.1:5175 (separate terminal)
pnpm dev
```

### Production login (JAYWINES)

Sign in with **email + password only**. The API resolves tenant `jaywines` automatically. Store code `demo` is ignored.

Local bootstrap owner (after `pnpm db:bootstrap`): `owner@jaywines.local` — use the password you set in `BOOTSTRAP_OWNER_PASSWORD`.

Do not run the synthetic seed in production.

---

## Documentation

- [Integration & Functional Audit](./docs/audit/WINES-SPIRITS-INTEGRATION-AUDIT.md)
- [Application Architecture](./docs/architecture/WINES-SPIRITS-APPLICATION.md)
- [Production Deployment Guide](./docs/deployment/PRODUCTION-DEPLOYMENT.md)
- [Vercel Frontend Configuration](./docs/deployment/VERCEL-FRONTEND.md)
- [Backup & Restore Procedure](./docs/operations/BACKUP-AND-RESTORE.md)
- [Production Release Checklist](./docs/operations/RELEASE-CHECKLIST.md)
