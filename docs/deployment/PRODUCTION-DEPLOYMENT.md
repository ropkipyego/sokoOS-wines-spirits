# SokoOS Wines & Spirits — Production Deployment Guide

## 1. Target Topology

```
                        HTTPS (443)
                   wines.yourdomain.com
                             │
              ┌──────────────┴──────────────┐
              │                             │
        /* (SPA Routes)               /api/v1/*
              ▼                             ▼
     Vercel Frontend CDN         Dedicated Backend Host
   (apps/admin-dashboard)         (Nginx / Caddy TLS)
                                            │
                                            ▼
                                  NestJS API (:3001)
                                     ├── PostgreSQL 16 (127.0.0.1:5432, private)
                                     └── Redis 7 (127.0.0.1:6379, private)
```

- **Frontend:** Hosted on Vercel (or static CDN) from `apps/admin-dashboard`.
- **Backend API, PostgreSQL & Redis:** Hosted on a dedicated Linux server / VPS or private container network.
- **Security:** PostgreSQL (`5432`) and Redis (`6379`) bind strictly to `127.0.0.1` or a private VPC interface and are **never** exposed to the public internet.

---

## 2. Backend Server Setup

### 2.1 Environment Configuration (`/etc/sokoos-wines/.env`)
```ini
NODE_ENV=production
PRODUCT_EDITION=WINES_SPIRITS
API_HOST=127.0.0.1
API_PORT=3001
API_PUBLIC_URL=https://wines.yourdomain.com
CORS_ORIGINS=https://wines.yourdomain.com

DATABASE_URL=postgresql://sokoos_prod:<STRONG_DB_PASSWORD>@127.0.0.1:5432/sokoos_wines_spirits?schema=public
REDIS_URL=redis://127.0.0.1:6379

JWT_ACCESS_SECRET=<GENERATE_64_CHAR_RANDOM_HEX>
JWT_REFRESH_SECRET=<GENERATE_64_CHAR_RANDOM_HEX>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
```

> **Note:** In `NODE_ENV=production`, the API refuses to boot if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` are shorter than 32 characters or contain default placeholder text.

### 2.2 Build & Database Migration Sequence
```bash
pnpm install --frozen-lockfile
pnpm build

# Inspect migration status before applying
pnpm --filter @sokoos/database exec prisma migrate status

# Apply production migrations (NEVER run prisma db push or seed in production)
pnpm --filter @sokoos/database exec prisma migrate deploy
```

### 2.3 Reverse Proxy (Nginx Example)
When the backend is hosted at `api-origin.yourdomain.com` (or behind the same reverse proxy as the frontend):
```nginx
server {
    listen 443 ssl http2;
    server_name api-origin.yourdomain.com;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:3001/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health/ {
        proxy_pass http://127.0.0.1:3001/health/;
    }
}
```

### 2.4 Health Verification
```bash
curl -fsS https://wines.yourdomain.com/api/health/live
curl -fsS https://wines.yourdomain.com/api/health/ready
```
