# SokoOS Wines & Spirits — Complete System Integration & Functional Audit

**Repository:** `ropkipyego/sokoOS-wines-spirits`  
**Branch:** `main`  
**Baseline Commit Inspected:** `42fc468`  
**Audit Date:** 2026-11-13  

---

## 1. Executive Summary

`ropkipyego/sokoOS-wines-spirits` has a strong backend domain foundation (NestJS 11 + Prisma PostgreSQL + Redis/BullMQ + SyncEnvelope v1) and a specialized Wines & Spirits product catalogue/inventory layer. However, because it was forked from the multi-tenant SokoOS SaaS platform, it currently suffers from three structural split-brain issues that prevent it from acting as **ONE cohesive standalone Wines & Spirits business application**:

1. **Leftover SaaS Platform Control Plane:** Platform tenant administration (`/platform/*`), SaaS subscription billing, public self-registration (`apps/public-web`), custom domain verification, platform support queues, and `platform@sokoos.local` login flows are still mounted in the API, router, sidebar, and seed scripts.
2. **Split Frontend Applications & Dual Authentication:** `apps/admin-dashboard` (`:5175`) and `apps/desktop-pos` (`:5174`) are separate Vite SPAs with separate Zustand auth stores (`sokoos.admin.*` vs `sokoos.pos.*`), duplicated API clients, and separate login screens. Navigating from Admin to POS opens an external tab and requires signing in a second time.
3. **Incomplete Closed-Loop Financial Workflows:** While sales, LPOs, returns, and customer/supplier statements exist, several financial loops need tightening:
   - Credit sales do not automatically increment stored `creditBalanceMinor` on the customer record, nor is there a dedicated customer credit repayment endpoint (`POST /customers/:id/payments`) or supplier payment endpoint (`POST /suppliers/:id/payments`) to reduce balances deterministically.
   - Returns against credit sales do not automatically adjust customer credit balances.
   - `/analytics` route is currently named `/intelligence` and lacks margin, category, and cashier breakdowns.

---

## 2. Feature-by-Feature Classification

Classification legend:
1. **Implemented and verified** — Complete, database-backed, and covered by automated tests.
2. **Implemented but not fully verified** — Present in code, needs additional integration/workflow test coverage.
3. **Partially implemented** — Core exists, but missing part of the closed-loop workflow or unified UI.
4. **Missing** — Not yet implemented.
5. **Broken** — Present but fails or behaves inconsistently.
6. **Unnecessary for this product** — Leftover SaaS platform-management surface to be removed.

| Area / Feature | Status | Findings & Required Action |
|---|---|---|
| **Unified Single Application (`/login`, `/dashboard`, `/pos`, etc.)** | **3. Partially implemented** | Currently split across `apps/admin-dashboard` and `apps/desktop-pos`. Must unify into a single application with one login, shared auth/session, role-based landing redirect (`Cashier` -> `/pos`, `Stock Controller` -> `/inventory`, `Accountant` -> `/reports`, `Owner/Manager` -> `/dashboard`), and in-app `/pos` route while preserving offline `LocalDb` + `SyncWorker` and Electron compatibility. |
| **Authentication & Session Handling** | **3. Partially implemented** | Backend JWT + refresh rotation works (`POST /auth/login`, `/auth/refresh`, `/auth/me`). Frontend has two separate session stores and shows hardcoded demo quick-fill buttons in all environments (must be gated to dev-only and removed from production builds). |
| **RBAC & Fine-Grained Permissions** | **1. Implemented and verified** | 99 permission keys + `PERMISSION_EQUIVALENTS` + 9 Wines & Spirits role templates (`BusinessOwner`, `GeneralManager`, `BranchManager`, `Cashier`, `SalesAttendant`, `StockController`, `ProcurementOfficer`, `Accountant`, `Auditor`). Needs branch-level access enforcement when a user is bound to a specific `branchId`. |
| **Products & Packaging (Bottle / Case / Pack)** | **1. Implemented and verified** | Supports SKU, barcode, brand, category, unit, volume (`750ml`), ABV, pack size, case quantity, retail/wholesale/cost prices, and linked bottle SKU (`1 CASE = N BOTTLES`). |
| **Inventory & Case-to-Bottle Conversion** | **1. Implemented and verified** | Append-only `StockMovement` + `StockBalance` projection. Supports opening stock, adjustments, physical count reconciliation, write-offs (`DAMAGE`, `EXPIRED`, `WRITE_OFF`), transfers, and atomic `POST /inventory/convert-packaging`. |
| **POS Terminal & Checkout** | **1. Implemented and verified** | Barcode wedge scanner, instant search, category chips, retail/wholesale price toggle, held sales (`F4`), cash tendered/change math, M-Pesa/card/bank/credit, split payment, and returns/refunds. Needs integration as native `/pos` route inside the unified app. |
| **Offline-First Outbox & SyncEnvelope v1** | **1. Implemented and verified** | `MemoryLocalDb` (with `localStorage` persistence) + `SyncWorker` + `SyncEnvelope` v1 (`POST /sync/push`) with SHA-256 `payloadHash` idempotency. Must be embedded directly into the unified app's `/pos` route. |
| **Purchasing (LPO -> Receive -> Stock -> Balance)** | **3. Partially implemented** | Draft LPO -> Approve/Issue -> Partial/Full Receive -> Stock increase works and prevents over-receiving. Needs explicit supplier payment recording (`POST /suppliers/:id/payments`) to reduce outstanding supplier balance deterministically. |
| **Customers & Credit Management** | **3. Partially implemented** | Customer profiles, credit limits, and statements exist. Needs: (a) credit limit enforcement + balance increment on credit sale, (b) credit balance reduction on return/refund, and (c) customer credit repayment endpoint (`POST /customers/:id/payments`) + UI. |
| **Returns & Refunds** | **2. Implemented, needs credit loop** | Enforces remaining returnable quantity, creates compensating `+qty` stock movements, and logs audit events. Needs to reduce customer credit balance when returning a credit sale. |
| **Expenses** | **1. Implemented and verified** | Expense recording, approval (`expenses.approve`), category breakdown, and inclusion in net profit reports without affecting stock or gross sales. |
| **Financial Reports & Business Analytics** | **3. Partially implemented** | `GET /reports/comprehensive` and `GET /reports/dashboard` compute real DB figures. Needs route alias `/analytics` (replacing `/intelligence`) and clear presentation of Gross Sales, Discounts, Returns, Net Sales, COGS, Gross Profit, Expenses, Net Profit, Stock Valuation, and Outstanding Credit. |
| **KRA eTIMS Integration** | **1. Implemented and verified** | `DefaultEtimsAdapter` + persistent submission queue (`NOT_CONFIGURED`, `PENDING`, `RETRYING`, `ACCEPTED`, `FAILED`), idempotent retry, and truthful receipt disclaimers. |
| **Receipt & Invoice Printing** | **1. Implemented and verified** | Supports `80mm` thermal (X-80), `58mm` thermal, and `A4` tax/commercial invoice + LPO print layouts. |
| **Single-Origin `/api/v1/*` Routing & Vercel Config** | **3. Partially implemented** | API currently uses global prefix `/v1` and `vercel.json` attempts multi-service container routing. Must support `/api/v1/*` (and `/v1/*` for backward compatibility) in NestJS and configure `vercel.json` for a clean single-origin frontend with `/api/v1/*` proxy rewrite. |
| **SaaS Platform Console (`/platform/*`, `PlatformModule`, `LifecycleModule`, `DomainsModule`, `public-web`)** | **6. Unnecessary for this product** | Leftover multi-tenant SaaS control plane. Must be removed from frontend routes, sidebar, login screen, backend modules, seed scripts, and docs, and platform-only endpoints must not be exposed. |

---

## 3. Duplicated Functionality & Inconsistencies Identified

1. **Duplicate Frontend Auth & API Clients:**
   - `apps/admin-dashboard/src/api/client.ts` and `apps/desktop-pos/src/api/client.ts` duplicate fetch logic.
   - `apps/admin-dashboard/src/stores/auth.ts` and `apps/desktop-pos/src/stores/session.ts` maintain separate tokens and user state.
2. **Inconsistent API Base Path:**
   - Production single-origin architecture expects `/api/v1/*` on the public domain (`https://wines.yourdomain.com/api/v1/*`), while local scripts and existing tests also call `/v1/*`.
   - **Solution:** Configure the API and frontend client so `/api/v1/*` is the primary production path while preserving `/v1/*` compatibility on the backend.
3. **Leftover Unused Demo Store:**
   - `apps/admin-dashboard/src/stores/demoData.ts` is an unused static file that should be deleted so zero mock data exists in the frontend bundle.

---

## 4. Security Gaps Identified

1. **Platform-User Login & Platform Endpoints:** `AuthService.login` still allows `tenantId: null` platform logins (`platform@sokoos.local`), and `PlatformController` / `LifecycleController` / `DomainsController` expose SaaS control-plane endpoints.
2. **Branch Isolation Enforcement:** Users assigned to a specific `branchId` in `UserRole` should be restricted from mutating or reading another branch's operational sales/stock unless they hold a tenant-wide role (`branchId: null`).
3. **Production Demo Quick-Fill Credentials:** `LoginPage.tsx` and `PosApp.tsx` render one-click demo password buttons unconditionally. These must be gated behind `import.meta.env.DEV` so production builds never display demo credentials.
4. **Production JWT Secret Guard:** `AuthService` falls back to `"change-me-refresh-secret-min-32-chars"` if env vars are unset. In `NODE_ENV=production`, the API must fail fast on startup if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are missing or weak.
