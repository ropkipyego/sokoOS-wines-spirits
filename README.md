# SokoOS Wines & Spirits

**Commercial POS, Cellar Inventory, Purchasing & eTIMS Operations for Wines, Spirits & Beverage Retail**

Derived from the SokoOS offline-first commerce platform (`PRODUCT_EDITION=WINES_SPIRITS`).

## Quick start

```bash
pnpm install
cp .env.example .env

# 1. Start (or reuse) local PostgreSQL + Redis containers
docker compose up -d postgres redis

# 2. Build packages, apply migrations to sokoos_wines_spirits DB, and seed demo data
pnpm build
pnpm --filter @sokoos/database exec prisma migrate deploy
pnpm --filter @sokoos/api seed

# 3. Start API (keep this terminal open)
./scripts/start-api-only.sh                  # http://127.0.0.1:3001/v1

# 4. Start Admin + POS frontends (separate terminal)
pnpm dev                                     # Admin :5175 · POS :5174
```

**Demo logins (after seed, tenant slug: `demo`):**
- **Business Owner:** `demo@sokoos.local` / `Demo123!`
- **Cashier (POS-only RBAC):** `cashier@sokoos.local` / `Cashier123!`
- **Stock Controller (Cellar & Inventory RBAC):** `stock@sokoos.local` / `Stock123!`
- **Platform Console:** leave tenant blank · `platform@sokoos.local` / `Platform123!`


Logical service boundaries (auth, sales, returns, inventory, sync, reporting, notifications) live as modules inside `services/api` until extraction is justified.

## Technology Stack (Target)

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Router/Query, Zustand, RHF, Zod, Electron, PWA |
| Backend | NestJS, PostgreSQL, Prisma, Redis, BullMQ, WebSockets |
| Local | SQLite (encrypted) |
| Infra | Docker, GitHub Actions, Object Storage, OpenAPI |

## Demo hosting (Vercel)

One Vercel project, path routing: `/` admin · `/pos` · `/register` · `/v1` API (container).  
Postgres still required for the API. Guide: [`docs/deployment/VERCEL-DEMO.md`](./docs/deployment/VERCEL-DEMO.md)

## Documentation

Start here: [`docs/README.md`](./docs/README.md)

## Development Order

SRS → Architecture → Database → API → UI Design System → Authentication → Tenant → Branch → Permissions → Sync → Inventory → Products → Sales → … → Deployment → Testing → Documentation

Do not implement business modules before the design phases above are complete.

## License

Proprietary — all rights reserved unless otherwise stated.
