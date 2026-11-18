# @sokoos/api

NestJS modular monolith for SokoOS cloud REST (`/v1`) + sync.

## Run

```bash
# from repo root
pnpm install
pnpm --filter @sokoos/database build
pnpm --filter @sokoos/api typecheck
pnpm --filter @sokoos/api test

# with Postgres up (see docker-compose / .env)
pnpm --filter @sokoos/database db:push
pnpm --filter @sokoos/api seed
pnpm --filter @sokoos/api start:dev
```

Docker (from monorepo root):

```bash
docker build -t sokoos-api .
# or: docker compose --profile api up -d --build api
```

- Health: `GET /health/live`, `GET /health/ready` (`postgres` required, `redis` optional)
- API: `http://localhost:3000/v1/...`
- WebSocket: namespace `/sync` (JWT in `auth.token`, event `sync.available`)
- Production tenant: `jaywines` (JAYWINES). Login resolves this store automatically when possible.
- Do not seed demo credentials in production. Use `pnpm db:bootstrap` for a clean owner account.
- Catalogue imports: `POST /products/import/preview` performs a read-only SKU/barcode reconciliation. `POST /products/import/validate` is also read-only; `POST /products/import` stays a dry run unless the caller explicitly sends `dryRun: false` and `approved: true`. Commits reject rows with missing tax mappings or unmapped suppliers, include archived SKUs in duplicate checks, and create new products only. Bulk import never updates existing product prices or sets image URLs; use the existing product editor/media upload flow for those changes.
- OpenAPI: `openapi/openapi.yaml`
- Modules include Auth, Catalog, Inventory, Sales, **Returns**, Sync, Purchases, Expenses, Reports, Notifications
- Optional Redis/BullMQ: set `REDIS_URL` for `notifications` + `sync-fanout` workers; API starts without Redis
