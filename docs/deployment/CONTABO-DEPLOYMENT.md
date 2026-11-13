# SokoOS Wines & Spirits — Contabo (AfyaSasa Server) Deployment Guide (Empty Database)

This guide deploys **SokoOS Wines & Spirits** onto your Contabo server alongside AfyaSasa **without any port collisions** and **with a completely clean database (0 demo products, 0 demo sales)**.

---

## 1. Port Isolation Map (Safe Coexistence with AfyaSasa)

| Service | AfyaSasa Ports | SokoOS Wines & Spirits (`docker-compose.contabo.yml`) |
|---|---|---|
| **PostgreSQL** | `5433` | `127.0.0.1:5435 -> 5432` (`sokoos-wines-postgres`) |
| **Redis** | `6380` | `127.0.0.1:6381 -> 6379` (`sokoos-wines-redis`) |
| **Backend API** | `3000` | `127.0.0.1:3001 -> 3001` (`sokoos-wines-api`) |
| **Frontend SPA** | `5173` / `8080` | Served by Nginx from `/var/www/sokoos-wines` (or Vercel) |

---

## 2. Step-by-Step Contabo Server Setup

### Step 1 — Clone Repository on Contabo
```bash
sudo mkdir -p /opt/sokoos-wines-spirits
sudo chown -R $USER:$USER /opt/sokoos-wines-spirits
git clone https://github.com/ropkipyego/sokoOS-wines-spirits.git /opt/sokoos-wines-spirits
cd /opt/sokoos-wines-spirits
```

### Step 2 — Create Production `.env`
```bash
cat <<EOF > .env
NODE_ENV=production
PRODUCT_EDITION=WINES_SPIRITS
API_PORT=3001
API_PUBLIC_URL=https://wines.yourdomain.com
CORS_ORIGINS=https://wines.yourdomain.com

POSTGRES_USER=sokoos_wines
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=sokoos_wines_spirits
POSTGRES_PORT=5435
REDIS_PORT=6381

JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
EOF
chmod 600 .env
```

### Step 3 — Start Isolated Containers (Postgres, Redis & API)
```bash
docker compose -f docker-compose.contabo.yml up -d --build
```

### Step 4 — Apply Schema Migrations & Bootstrap Clean Store (NO Demo Data)
Run the migration and clean production bootstrap inside the running API container (or from the host). This creates **only** the permissions, roles, units (`Bottle`, `Case`, `Can`, `Pack`), categories, main branch/warehouse, and your initial Owner login—**zero fake products or sales**:

```bash
# 1. Apply Prisma database schema migrations
docker exec -it sokoos-wines-api sh -c "cd /app/packages/database && npx prisma migrate deploy"

# 2. Bootstrap clean store with your real Owner credentials (0 demo products, 0 demo sales)
docker exec -it \
  -e BOOTSTRAP_BUSINESS_NAME="Your Wines & Spirits Name" \
  -e BOOTSTRAP_TENANT_SLUG="main" \
  -e BOOTSTRAP_OWNER_NAME="Store Owner" \
  -e BOOTSTRAP_OWNER_EMAIL="owner@yourdomain.com" \
  -e BOOTSTRAP_OWNER_PASSWORD="YourStrongPassword123!" \
  -e BOOTSTRAP_BRANCH_NAME="Main Branch" \
  -e BOOTSTRAP_BRANCH_CODE="MAIN" \
  -e BOOTSTRAP_WAREHOUSE_NAME="Main Cellar" \
  sokoos-wines-api sh -c "cd /app && pnpm --filter @sokoos/api bootstrap:prod"
```

> **Note:** On the Login screen, enter Store Code `main` (or whatever `BOOTSTRAP_TENANT_SLUG` you chose) and your `BOOTSTRAP_OWNER_EMAIL` + `BOOTSTRAP_OWNER_PASSWORD`.

---

## 3. Serving the Unified Frontend on Contabo via Nginx

Build the unified frontend (`apps/admin-dashboard/dist`, which includes both `/dashboard` and `/pos`):

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
sudo mkdir -p /var/www/sokoos-wines
sudo cp -r apps/admin-dashboard/dist/* /var/www/sokoos-wines/
```

Create `/etc/nginx/sites-available/sokoos-wines.conf`:
```nginx
server {
    listen 80;
    server_name wines.yourdomain.com;

    root /var/www/sokoos-wines;
    index index.html;

    # Reverse-proxy API requests to sokoos-wines-api on 127.0.0.1:3001
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:3001/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health/ {
        proxy_pass http://127.0.0.1:3001/health/;
    }

    # SPA fallback for /login, /dashboard, /pos, /inventory, /purchases, /reports, /etims
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable the site and issue an SSL certificate with Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/sokoos-wines.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d wines.yourdomain.com
```
