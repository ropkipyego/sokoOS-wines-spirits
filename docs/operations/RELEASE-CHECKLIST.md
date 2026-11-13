# SokoOS Wines & Spirits — Production Release Checklist

## 1. Build & Automated Verification
- [ ] `pnpm build` succeeds across all 10 workspace packages with zero errors.
- [ ] `pnpm typecheck` succeeds with zero TypeScript errors.
- [ ] `pnpm test` passes all unit, RBAC, tenant-isolation, offline-sync, eTIMS, and E2E tests.
- [ ] Production frontend bundle (`apps/admin-dashboard/dist`) contains no dev quick-login credentials (`import.meta.env.DEV` is `false`).

## 2. Security & Environment
- [ ] `NODE_ENV=production` is set on the API server.
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are unique, cryptographically random strings (`>= 64` characters).
- [ ] `CORS_ORIGINS` lists only the exact production HTTPS domain (`https://wines.yourdomain.com`).
- [ ] PostgreSQL (`5432`) and Redis (`6379`) are bound to `127.0.0.1` / private network only.
- [ ] Demo seed script (`pnpm --filter @sokoos/api seed`) has **not** been executed against the production database.

## 3. Database & Backup
- [ ] Pre-release `pg_dump` backup completed and checksum-verified (`docs/operations/BACKUP-AND-RESTORE.md`).
- [ ] `pnpm --filter @sokoos/database exec prisma migrate deploy` completed cleanly.

## 4. Operational Smoke Tests
- [ ] `/api/health/live` and `/api/health/ready` return HTTP `200`.
- [ ] Login at `/login` redirects `Cashier` to `/pos`, `Stock Controller` to `/inventory`, `Accountant` to `/reports`, and `Owner` to `/dashboard`.
- [ ] POS barcode scan, cash change math, receipt print preview (`X-80` and `A4`), and stock deduction verified.
- [ ] Offline sale queued and synced idempotently on reconnect.
