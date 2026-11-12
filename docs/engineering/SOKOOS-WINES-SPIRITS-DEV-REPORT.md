# SokoOS Wines & Spirits — Engineering & Development Report

**Repository:** `ropkipyego/sokoOS-wines-spirits`  
**Upstream Platform Baseline:** `ropkipyego/sokoOS` (`3e7fd1df81c5db62f88686e3b7eaaa8d2f06d9d0`)  
**Product Edition:** `WINES_SPIRITS` (**SokoOS Wines & Spirits**)  
**Last Updated:** 2026-11-12  

---

## 1. Executive Summary & Honest Status

- **Architecture:** Derived from the verified SokoOS modular monolith (`services/api` NestJS 11 + Prisma PostgreSQL + Redis/BullMQ, `apps/admin-dashboard` React/TanStack Router, `apps/desktop-pos` offline-first React/Zustand/SyncEnvelope v1).
- **Specialization:** Configured with `PRODUCT_EDITION = "WINES_SPIRITS"` in `@sokoos/types`. Irrelevant industry surfaces (`hotel`, `restaurant`, `pharmacy`, `services`) are disabled in both frontend navigation/routing and backend `@RequireEditionModule(...)` guard enforcement, while preserving reusable core infrastructure.
- **Compliance & Live Readiness Disclaimer:**
  - **NOT claimed KRA-certified or live-compliant:** The KRA eTIMS OSCU/VSCU adapter, persistent submission queue (`ACCEPTED`, `PENDING`, `FAILED`, `RETRYING`, `NOT_CONFIGURED`), idempotency, and retry workflows are implemented and verified against the local test harness, but real KRA certification requires taxpayer-specific KRA eTIMS OSCU/VSCU credentials, CMC key initialization, and KRA sandbox/production sign-off.
  - **M-Pesa Daraja:** Remains strictly callback-verified; STK push requests stay `pending` until a verified callback arrives.

---

## 2. Phase 0 — Baseline Audit

- Established `main` branch from the verified `ropkipyego/sokoOS` baseline (`3e7fd1d`).
- Verified all 12 workspace packages build and typecheck cleanly (`turbo run build`, `turbo run typecheck`).
- Configured Vitest `pool: "threads"` in `services/api/vitest.config.ts` so tests run reliably in both sandboxed and host environments.
- Created a dedicated, isolated local development PostgreSQL database (`sokoos_wines_spirits` on `127.0.0.1:5432`) so existing databases (`sokoos`) are untouched.

---

## 3. Architecture & Implemented Capabilities (Phases 1–6)

### Phase 1 — Product Edition & Module Entitlement Architecture
- Defined `PRODUCT_EDITIONS` (`WINES_SPIRITS`, `PHARMACY`, `RETAIL`, `RESTAURANT`, `HOTEL`, `WHOLESALE`) and `PRODUCT_EDITION = "WINES_SPIRITS"` in `packages/types/src/business-profile.ts`.
- Added `@RequireEditionModule(moduleKey)` decorator and `PermissionsGuard` check (`services/api/src/common/guards/permissions.guard.ts`) that returns `403 MODULE_NOT_ENTITLED` when disabled industry endpoints (`/v1/hotel/*`, `/v1/kitchen/*`, `/v1/dining/*`, `/v1/pharmacy/*`, `/v1/services/*`) are called under `WINES_SPIRITS`.
- Specialized `apps/admin-dashboard` navigation (`AppShell.tsx`) and routing (`router.tsx`) for Wines & Spirits:
  - **Overview** (`/`), **Business Intelligence** (`/intelligence`)
  - **Sales & POS** (`POS Terminal`, `/sales`, `/returns`, `/deliveries`)
  - **Inventory & Cellar** (`/products`, `/categories`, `/brands`, `/inventory`, `/movements`, `/transfers`, `/warehouses`)
  - **Purchasing** (`/purchases`, `/suppliers`)
  - **Customers & Finance** (`/customers`, `/expenses`, `/reports`, `/etims`)
  - **Administration** (`/users`, `/roles`, `/branches`, `/departments`, `/devices`, `/audit`, `/settings`, `/integrations`, `/config`)

### Phase 2 — Wines & Spirits Inventory, Packaging, Import & Business Operations
- **Bottle & Case Packaging Model:**
  - Products support `size` (e.g. `750ml`, `12x750ml`), `abv`, `packagingType` (`bottle`, `case`, `can`, `pack`, `keg`), `packSize`, `caseQuantity`, `wholesalePriceMinor`, `supplierId`, `bottleProductId`, and `conversionFactor`.
  - Implemented deterministic packaging conversion (`calculatePackagingConversion` in `stock-balance.math.ts` and `POST /v1/inventory/convert-packaging`) to break cases into individual bottles (`1 CASE = 12 BOTTLES`) inside a single database transaction with linked `PACKAGING_CONVERSION` movements.
- **Auditable Stock Control:**
  - Added dedicated endpoints `POST /v1/inventory/receive`, `POST /v1/inventory/adjust`, `POST /v1/inventory/count` (`COUNT_RECONCILIATION`), and `POST /v1/inventory/writeoff` (`DAMAGE`, `EXPIRED`, `WRITE_OFF`).
  - Every stock movement records `beforeQuantity`, `afterQuantity`, `quantityDelta`, `reason`, `actorUserId`, `branchId`, `warehouseId`, and an `AuditLog` event.
- **CSV Import Pre-Commit Validation:**
  - Added `POST /v1/products/import/validate` and enhanced `POST /v1/products/import` to validate `sku`, `barcode`, `name`, `category`, `brand`, `unit`, `size`, `packSize`, `cost`, `price`, `wholesalePrice`, `tax`, `reorderLevel`, and `supplier`.
  - Reports `validRows`, `invalidRows`, `duplicateRows`, and `warnings` before committing so malformed rows never corrupt the catalogue.
- **Customers, Suppliers, Purchasing & Reports:**
  - Added customer credit/loyalty hydration and statements (`GET /v1/customers/:id/statement`).
  - Added supplier balances and statements (`GET /v1/suppliers/:id/statement`) and purchase approval (`POST /v1/purchases/:id/approve`).
  - Added `GET /v1/reports/comprehensive` covering gross sales, discounts, returns, net sales, COGS, gross profit, margin %, sales by cashier/branch/product/category/payment method, stock valuation (cost & retail), low stock, supplier balances, expenses, and eTIMS status counts.

### Phase 3 — POS Speed, Payments, Held Sales, Returns & Receipts
- Removed restaurant table/dine-in clutter from the Wines & Spirits POS terminal (`apps/desktop-pos/src/PosApp.tsx`).
- Added:
  - Retail vs. Wholesale price-tier toggle per cart line.
  - Suspended / Held sales (`F4` or Hold button) with resume/discard modal.
  - Permission-gated cart discounts (`sales.discount`), credit tender (`customers.credit`), and in-POS returns & restock modal (`sales.refund` / `returns.create`).
  - Deterministic cash tendered & change calculation (`calculateCashChange` on client + `computeCashPaymentChange` on server) with quick denomination buttons.
  - X-80 (`80mm` thermal), `58mm` thermal, and `A4` commercial/tax invoice print layouts with truthful eTIMS status banner.

### Phase 4 — Offline-First SyncEnvelope v1 & Idempotency
- Fixed `SyncWorker` online detection in Node/Electron environments (`navigator.onLine === false`).
- Preserved `SyncEnvelope` v1 (`protocolVersion: 1`) with UUID `changeId` and `entityId`, sale-only outbox queueing, and SHA-256 `payloadHash` deduplication in `SyncService.push`.
- Verified complete offline sale -> local persistence -> reconnect -> sync push -> server ack -> outbox removal -> duplicate envelope replay (proving zero duplicate sales or double stock deductions).

### Phase 5 — eTIMS / KRA Integration Boundary & Queue
- Created `services/api/src/integrations/etims.adapter.ts` (`EtimsAdapter`, `DefaultEtimsAdapter`, `EtimsSubmissionRecord`).
- Implemented persistent per-sale eTIMS submission tracking (`NOT_CONFIGURED`, `PENDING`, `RETRYING`, `ACCEPTED`, `FAILED`) in `IntegrationsService` (`GET /v1/integrations/etims/submissions`, `GET /v1/integrations/etims/sales/:saleId`, `POST /v1/integrations/etims/sales/:saleId/submit`, `POST /v1/integrations/etims/sales/:saleId/retry`).
- Automatically queues `PENDING` eTIMS records on sale completion when tenant eTIMS is enabled, without ever blocking or losing local POS sales if eTIMS is unavailable.
- Built the Admin **KRA eTIMS Compliance & Queue** page (`/etims`) with status filter cards and one-click submit/retry.

### Phase 6 — RBAC, Security Hardening, Demo Seed & End-to-End Verification
- Expanded `CORE_PERMISSION_KEYS` (99 permissions) and `PERMISSION_EQUIVALENTS` in `@sokoos/types`.
- Configured role permission templates in `RolesService` for:
  - `BusinessOwner` (`business_owner`)
  - `GeneralManager` (`general_manager`)
  - `BranchManager` (`branch_manager`)
  - `Cashier` (`cashier`)
  - `SalesAttendant` (`sales_attendant`)
  - `StockController` (`stock_controller`)
  - `ProcurementOfficer` (`procurement_officer`)
  - `Accountant` (`accountant`)
  - `Auditor` (`auditor`)
- Created initial Prisma migration `packages/database/prisma/migrations/20261112000000_init_wines_spirits/migration.sql` and deployed to isolated local database `sokoos_wines_spirits`.
- Seeded synthetic Wines & Spirits demo data (`pnpm --filter @sokoos/api seed`): 14 categories, 18 beverage SKUs (including linked bottle + case), 2 branches, 2 warehouses, 3 suppliers, 3 role accounts, and a second isolated tenant (`cellar-b`).

---

## 4. Test Results & Verification Evidence

| Suite | Command | Status | Details |
|-------|---------|--------|---------|
| Workspace Build | `pnpm build` | **PASS** | 12/12 packages built (Database, Types, Utils, Shared, Sync-Protocol, UI, Plugin-SDK, Pharmacy, API, Admin, POS, Public-Web) |
| Workspace Typecheck | `pnpm typecheck` | **PASS** | 12/12 packages `tsc --noEmit` zero errors |
| API Unit + E2E Suite | `pnpm --filter @sokoos/api test` | **PASS** | **17 test files / 79 tests passed** (including live DB `wines-spirits.e2e.test.ts`) |
| Desktop POS Unit Suite | `pnpm --filter @sokoos/desktop-pos test` | **PASS** | **5/5 tests passed** (money/discounts/cash change, hold/resume, offline sale, SyncEnvelope v1, offline->sync->ack lifecycle) |
| Admin Dashboard Suite | `pnpm --filter @sokoos/admin-dashboard test` | **PASS** | **1/1 test passed** |

### End-to-End Verification Checklist (`services/api/test/wines-spirits.e2e.test.ts`)
- [x] Business setup, branches (`MAIN`, `KAREN`), and warehouses (`Main Retail Cellar & Counter`, `Bonded Case Reserve Store`)
- [x] Users & Roles login (`Owner`, `Cashier`, `Tenant B Owner`)
- [x] Irrelevant industry endpoints (`/hotel/rooms`, `/kitchen/tickets`, `/pharmacy/batches`, `/services/jobs`) blocked with `403`
- [x] Cashier attempting `POST /v1/inventory/adjust` and `POST /v1/inventory/writeoff` denied with `403 FORBIDDEN`
- [x] Cross-tenant isolation: Tenant A (`demo`) cannot read Tenant B (`cellar-b`) product (`404`), and Tenant B cannot read Tenant A product (`404`)
- [x] Product CSV import validation (`POST /v1/products/import/validate`) separates valid, invalid, and duplicate rows
- [x] Packaging conversion (`POST /v1/inventory/convert-packaging`): 1 Case of `JW-BLACK-CASE12` broken into +12 Bottles of `JW-BLACK-750ML`
- [x] POS sale (`POST /v1/sales`) with customer, cash tendered (`800,000` minor units for `720,000` sale -> `80,000` change), receipt number, and automatic stock deduction
- [x] Return/refund (`POST /v1/returns`) restocks returned bottles and updates return totals
- [x] Offline sale `SyncEnvelope` v1 push (`POST /v1/sync/push`) + duplicate replay idempotency (stock deducted once, zero duplicate sales)
- [x] eTIMS submission (`FAILED` -> `RETRYING` -> `ACCEPTED` with `KRA-CU-2026-000912`)
- [x] Comprehensive report (`GET /v1/reports/comprehensive`) and immutable audit trail (`GET /v1/audit-logs`)

---

## 5. Local Development & Deployment Sequence

### 5.1 Local Development Startup
1. **Infrastructure (PostgreSQL + Redis):**
   ```bash
   docker compose up -d postgres redis
   ```
2. **Database Migration & Synthetic Demo Seed (Dev Only):**
   ```bash
   pnpm --filter @sokoos/database exec prisma migrate deploy
   pnpm --filter @sokoos/api seed
   ```
3. **Start API, Admin Dashboard, and Desktop POS:**
   ```bash
   pnpm dev
   ```
   - **API:** `http://127.0.0.1:3001/v1` (Health: `http://127.0.0.1:3001/health/live` & `http://127.0.0.1:3001/health/ready`)
   - **Admin Dashboard:** `http://127.0.0.1:5175`
   - **POS Terminal:** `http://127.0.0.1:5174`

### 5.2 Production Deployment Readiness Sequence
1. Provision managed PostgreSQL 16 (with daily automated backups + PITR) and Redis 7.
2. Configure production environment variables (never commit `.env`):
   - `NODE_ENV=production`
   - `PRODUCT_EDITION=WINES_SPIRITS`
   - `DATABASE_URL` (TLS-enforced PostgreSQL connection string)
   - `REDIS_URL`
   - `JWT_ACCESS_SECRET` & `JWT_REFRESH_SECRET` (cryptographically random >= 64 chars)
   - `CORS_ORIGINS` (explicit HTTPS origins for Admin and POS)
3. Run `pnpm build` and apply migrations via `pnpm --filter @sokoos/database exec prisma migrate deploy` (never run `prisma db push` or `seed.ts` against production).
4. Verify `/health/live` and `/health/ready` behind TLS-terminating reverse proxy.

### 5.3 Outstanding External Dependencies Before Live Sign-Off
1. **KRA eTIMS OSCU/VSCU Credentials:** Requires client KRA PIN, branch ID (`bhfId`), device serial, and CMC key initialization against KRA sandbox/production endpoints before live fiscalization.
2. **Safaricom Daraja Production Credentials:** Requires live shortcode, consumer key/secret, passkey, and signed callback webhook verification.
3. **Physical Printer UAT:** Verify X-80 (80mm thermal) and A4 print stylesheets on target shop floor hardware.
