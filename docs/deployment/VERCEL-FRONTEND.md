# SokoOS Wines & Spirits — Vercel Frontend Deployment

## 1. Overview

`vercel.json` at the repository root is configured to build and serve the unified Wines & Spirits React application (`apps/admin-dashboard`), which includes both the management console (`/dashboard`, `/inventory`, `/purchases`, `/reports`, `/etims`, etc.) and the integrated Point of Sale terminal (`/pos`).

## 2. Root `vercel.json` Configuration

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "corepack enable && PRISMA_SKIP_POSTINSTALL_GENERATE=1 pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @sokoos/types build && pnpm --filter @sokoos/ui build && pnpm --filter @sokoos/admin-dashboard build",
  "outputDirectory": "apps/admin-dashboard/dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

## 3. Single-Origin API Proxy (`/api/v1/*`)

To achieve a single public origin (`https://wines.yourdomain.com`) with zero cross-origin cookie/CORS friction:

1. Point your backend server to an internal/origin hostname (e.g. `https://backend-origin.yourdomain.com`).
2. Add a `/api/:path*` rewrite rule in `vercel.json` before the SPA catch-all:
   ```json
   "rewrites": [
     {
       "source": "/api/:path*",
       "destination": "https://backend-origin.yourdomain.com/api/:path*"
     },
     {
       "source": "/(.*)",
       "destination": "/index.html"
     }
   ]
   ```
3. In production builds (`import.meta.env.PROD`), `apps/admin-dashboard/src/api/client.ts` automatically sends all API requests to relative `/api/v1/*`.
4. Never place private secrets (`DATABASE_URL`, `JWT_ACCESS_SECRET`, KRA eTIMS keys, or Daraja passkeys) in `VITE_*` environment variables.
