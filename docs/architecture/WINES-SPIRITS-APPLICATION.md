# SokoOS Wines & Spirits — Application Architecture

**Product Edition:** `WINES_SPIRITS`  
**Repository:** `ropkipyego/sokoOS-wines-spirits`

---

## 1. System Overview

SokoOS Wines & Spirits is a standalone, commercial Wines & Spirits retail, wholesale, cellar inventory, purchasing, and financial management application.

```
https://wines.yourdomain.com
├── /login             (Single authentication experience)
├── /dashboard         (Owner / Manager trading & cellar overview)
├── /pos               (Integrated offline-first Point of Sale terminal)
├── /sales             (Sales history & receipt reprinting)
├── /returns           (Credit notes, returns & restock)
├── /products          (Bottle, Case & Pack catalogue + CSV import validator)
├── /inventory         (Cellar balances, counts, write-offs & Case -> Bottle conversion)
├── /movements         (Append-only stock movement ledger)
├── /transfers         (Inter-warehouse transfers)
├── /warehouses        (Branch cellars & retail counters)
├── /purchases         (Local Purchase Orders, approval & goods receiving)
├── /suppliers         (Beverage distributors, statements & payment recording)
├── /customers         (Customer profiles, credit limits, repayments & statements)
├── /expenses          (Operating expenses & approval workflow)
├── /reports           (Comprehensive financial, margin, category & payment reports)
├── /analytics         (Period trends & top product velocity)
├── /etims             (KRA eTIMS OSCU/VSCU submission queue & retry console)
├── /users             (Employee invitations & role assignment)
├── /roles             (Granular RBAC permission templates)
├── /branches          (Multi-branch retail/lounge locations)
├── /audit             (Immutable security & operational audit trail)
├── /settings          (Business profile, receipt header/footer, M-Pesa & eTIMS config)
└── /api/v1/*          (Reverse-proxied to NestJS API)
```

---

## 2. Unified Frontend & Role-Based Routing

- **Primary Web Application (`apps/admin-dashboard`):**
  - Hosts both the management back-office and the integrated `/pos` terminal within a single React 19 + TanStack Router + Zustand application.
  - Uses a single authentication store (`src/stores/auth.ts`) and a single API client (`src/api/client.ts`).
  - Automatically routes authenticated users to their primary workspace (`resolveLandingRoute`):
    - `business_owner`, `general_manager`, `branch_manager` → `/dashboard`
    - `cashier`, `sales_attendant` → `/pos`
    - `stock_controller`, `inventory_officer` → `/inventory`
    - `procurement_officer`, `purchasing_officer` → `/purchases`
    - `accountant`, `auditor` → `/reports`
- **Desktop Electron Target (`apps/desktop-pos`):**
  - Retained for dedicated offline desktop/Electron builds (`electron/main.ts`).

---

## 3. Core Domain Workflows

1. **Bottle & Case Packaging (`1 CASE = N BOTTLES`):**
   - Case SKUs link to their corresponding single-bottle SKU via `bottleProductId` and `conversionFactor` (`packSize`).
   - `POST /api/v1/inventory/convert-packaging` atomically deducts cases and increments bottles in one database transaction with paired `PACKAGING_CONVERSION` movements.
2. **Offline-First POS & SyncEnvelope v1:**
   - Offline sales write to `MemoryLocalDb` (`localStorage`-backed outbox) and sync via `POST /api/v1/sync/push` using `SyncEnvelope` v1 (`protocolVersion: 1`).
   - Server-side `SyncChange` deduplicates by `changeId` + SHA-256 `payloadHash`.
3. **Closed-Loop Customer Credit & Supplier Payables:**
   - Credit sales verify `creditLimitMinor` and increment `creditBalanceMinor`.
   - Returns against credit sales automatically reduce `creditBalanceMinor`.
   - Customer credit repayments (`POST /api/v1/customers/:id/payments`) and supplier payments (`POST /api/v1/suppliers/:id/payments`) deterministically reduce outstanding balances and log audit events.
4. **KRA eTIMS Adapter & Queue:**
   - `DefaultEtimsAdapter` (`services/api/src/integrations/etims.adapter.ts`) manages `NOT_CONFIGURED`, `PENDING`, `RETRYING`, `ACCEPTED`, and `FAILED` states without ever blocking POS sales or inventing fake fiscal invoice numbers.
