# SokoOS Wines & Spirits — Engineering & Development Report

**Repository:** `ropkipyego/sokoOS-wines-spirits`  
**Upstream Platform Baseline:** `ropkipyego/sokoOS` (`3e7fd1df81c5db62f88686e3b7eaaa8d2f06d9d0`)  
**Product Edition:** `WINES_SPIRITS` (**SokoOS Wines & Spirits**)  
**Date Started:** 2026-11-12  

---

## 1. Phase 0 — Technical Audit & Baseline

### 1.1 Repository & Remote State
- When inspected initially, `/home/yobra/Desktop/sokoOS-wines-spirits` was an empty Git repository (`origin -> https://github.com/ropkipyego/sokoOS-wines-spirits.git`) with no commits.
- The verified SokoOS platform baseline (`3e7fd1df81c5db62f88686e3b7eaaa8d2f06d9d0`) was present locally at `/home/yobra/Desktop/sokoOS` (matching `https://github.com/ropkipyego/sokoOS.git` `main`).
- Added `upstream` remote (`https://github.com/ropkipyego/sokoOS.git`) and populated `main` from the verified SokoOS commit history without rewriting or inventing files.

### 1.2 Monorepo & Workspace Structure
- **Package Manager:** `pnpm@10.33.3` with `turbo` (`concurrency: "16"`).
- **Apps:**
  - `apps/admin-dashboard` — Vite + React + TanStack Router (`:5175`) covering tenant operations and `/platform` SaaS control plane.
  - `apps/desktop-pos` — Vite + React + Zustand + Offline `LocalDb` (`SqliteLocalDb` / `MemoryLocalDb`) + `SyncWorker` (`:5174`).
  - `apps/public-web` — Public self-registration & plan showcase (`:5176`).
- **Services:**
  - `services/api` — NestJS 11 modular monolith (`:3001/v1` in dev, `:3000` in Docker) with JWT auth, `PermissionsGuard`, `ThrottlerGuard`, `AuditInterceptor`, Prisma, and optional Redis/BullMQ queues + WebSocket sync fanout.
- **Packages & Plugins:**
  - `packages/database` — Prisma PostgreSQL schema (`schema.prisma`, 1,765 lines) + SQLite local schema.
  - `packages/types` — Zod schemas for products, sales, stock movements, permissions, tenants, and `SyncEnvelopeSchema` (protocol v1).
  - `packages/sync-protocol` — `SyncEnvelope` v1 constants, `ConflictCode`, and `SyncPushAck` types.
  - `packages/shared` — `Result<T, E>`, `AppError`, and `SystemRole` definitions.
  - `packages/ui` — Shared `Button`, `Input`, and design tokens.
  - `packages/utils` — Money formatting/minor-unit math, UUID, and tenant helpers.
  - `packages/plugin-sdk` & `plugins/pharmacy` — Plugin manifest SDK and pharmacy stub.

### 1.3 Existing Capabilities Audit
1. **Authentication & RBAC:**
   - JWT access/refresh tokens (`services/api/src/auth`), device registration (`POST /v1/auth/devices/register`, idempotent), employee invitations (`POST /v1/users/invite` with SHA-256 hashed tokens).
   - Global `JwtAuthGuard` + `PermissionsGuard` enforcing `@RequirePermissions(...)`.
   - Tenant role isolation (`isTenantAssignableRole`) blocks `platform.*` permissions and `platform_*` roles on tenant roles.
   - *Gap for Wines & Spirits:* Needs granular permission aliases and specialized role templates (`Owner`, `General Manager`, `Branch Manager`, `Cashier`, `Sales Attendant`, `Stock Controller`, `Procurement Officer`, `Accountant`, `Auditor / Viewer`) plus `sales.reprint`, `sales.refund`, `inventory.receive`, `inventory.count`, `inventory.writeoff`, `purchases.approve`, `customers.credit`, `etims.view`, `etims.submit`, `etims.retry`, `etims.configure`.
2. **Tenancy, Branches, Warehouses:**
   - Shared-database multi-tenancy (`tenantId` column on all operational models).
   - `Tenant -> Branch -> Warehouse -> Device / User` hierarchy.
   - *Gap:* Need automated HTTP-level cross-tenant denial and branch-restriction tests.
3. **Products & Wines/Spirits Inventory:**
   - `Product` model supports `sku`, `barcode`, `categoryId`, `brandId`, `unitId`, `priceMinor`, `costMinor`, `taxRateBps`, `minStockQty`, `imageUrl`, and `extensions` (JSON).
   - `StockMovement` + `StockBalance` use append-only movement projection inside DB transactions (`applyMovementInTx`) with negative-stock blocking (`negativeStockPolicy: "block"`).
   - *Gap for Wines & Spirits:*
     - Deliberate Wines & Spirits attributes and packaging model (`size`/`volumeMl`, `abv`, `packSize`, `caseQuantity`, `wholesalePriceMinor`, `supplierId`, `parentProductId`/`caseProductId` conversion `1 CASE = N BOTTLES`).
     - Auditable case-breaking / packaging conversion (`CASE -> BOTTLES`) and explicit stock movement reasons (`PURCHASE_RECEIPT`, `SALE`, `RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`, `WRITE_OFF`, `DAMAGE`, `EXPIRED`, `COUNT_RECONCILIATION`, `OPENING_STOCK`) recording `beforeQuantity` and `afterQuantity`.
     - CSV import validation preview showing valid rows, invalid rows, duplicate rows, errors, and warnings before committing.
4. **POS:**
   - Supports barcode wedge scanner, search, category chips, cart, cash/M-Pesa/card/bank/credit, split payment, offline fallback, and thermal/A4 print layout.
   - *Gap for Wines & Spirits:*
     - Currently shows restaurant dine-in/table selection when `restaurantEnabled` is set.
     - Needs suspended/held sales, line/cart discounts gated by `sales.discount`, in-POS returns/refunds gated by `sales.refund` / `returns.create`, bottle/case quick selection or wholesale tier, receipt reprint gated by `sales.reprint`, and richer X-80 / A4 receipt data (tax breakdown, discount, cashier, customer, truthful eTIMS block).
5. **Offline Outbox & Sync:**
   - `SyncEnvelope` v1 implemented in `apps/desktop-pos/src/sync/buildEnvelope.ts` and `services/api/src/sync/sync.service.ts`.
   - `SyncChange` table deduplicates by `changeId` with SHA-256 `payloadHash` comparison (`accept_new` | `replay` | `hash_mismatch`).
   - *Gap:* Pass customer, discount, and payment details through offline sale creation and verify full offline -> sync -> ack -> duplicate replay flow with automated tests.
6. **eTIMS / KRA Integration:**
   - `IntegrationsService` has a basic stub (`POST /v1/integrations/etims/sales/:saleId/submit`) and `Sale.fiscalStatus`.
   - *Gap:* Needs a dedicated eTIMS adapter/service boundary and persistent submission tracking (`ACCEPTED`, `PENDING`, `FAILED`, `RETRYING`, `NOT_CONFIGURED`) with request/response metadata, retry/idempotency, automatic queueing on sale completion when configured, RBAC-protected endpoints (`etims.view`, `etims.submit`, `etims.retry`, `etims.configure`), and an Admin eTIMS queue & reconciliation page.
7. **Admin Surface & Industry Isolation:**
   - Admin sidebar currently exposes `/restaurant`, `/kitchen`, `/hotel`, `/industry` (Pharmacy batches, Prescriptions, Service jobs).
   - *Gap:* Introduce strongly typed `PRODUCT_EDITION = "WINES_SPIRITS"` module entitlement configuration to hide/disable irrelevant industry surfaces (hotel, folios, KDS, pharmacy, clinical, service jobs) while keeping reusable core infrastructure intact.

### 1.4 Baseline Build & Test Verification
- `pnpm build`: **12/12 packages built successfully** (including Prisma Client generation, API NestJS build, Admin Vite build, POS Vite build).
- `pnpm typecheck`: **12/12 packages passed `tsc --noEmit`**.
- `pnpm test`: **All tests passing** (`@sokoos/api`: 16 test files / 69 tests; `@sokoos/desktop-pos`: 3 tests; `@sokoos/admin-dashboard`: 1 test; `@sokoos/plugin-pharmacy`: 3 tests).
- Local infrastructure check:
  - `sokoos-postgres` (PostgreSQL 16) running and healthy on `127.0.0.1:5432`.
  - `sokoos-redis` (Redis 7) running and healthy on `127.0.0.1:6379`.
  - To strictly protect existing local databases, SokoOS Wines & Spirits uses a dedicated isolated PostgreSQL database (`sokoos_wines_spirits`) on the local Postgres instance for migrations, seeding, and integration testing.
