# SokoOS Wines & Spirits — Database Backup & Restore Procedure

## 1. Backup Policy

- **Pre-Migration Snapshot:** Always take a full logical backup (`pg_dump -Fc`) immediately before running `prisma migrate deploy`.
- **Scheduled Backups:** Run automated daily backups retained for 30 days, plus hourly WAL archiving where supported.

## 2. Creating a Backup

```bash
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="sokoos_wines_spirits_${TIMESTAMP}.dump"

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --dbname="$DATABASE_URL" \
  --file="/var/backups/sokoos/${BACKUP_FILE}"

sha256sum "/var/backups/sokoos/${BACKUP_FILE}" > "/var/backups/sokoos/${BACKUP_FILE}.sha256"
```

## 3. Verifying & Restoring a Backup

Always test restores against a disposable staging database first:

```bash
# Verify archive integrity
pg_restore --list "/var/backups/sokoos/${BACKUP_FILE}" > /dev/null

# Restore into target database
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname="$TARGET_DATABASE_URL" \
  "/var/backups/sokoos/${BACKUP_FILE}"
```

## 4. Rollback Procedure After a Failed Release

1. Stop the API service (`systemctl stop sokoos-api` or container stop).
2. Restore the pre-migration dump into PostgreSQL using `pg_restore`.
3. Redeploy the previous known-good API container/commit.
4. Verify `/api/health/ready` returns `{"status":"ok","postgres":true}`.
