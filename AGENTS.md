# AGENTS.md

## Cursor Cloud specific instructions

### Overview

KC Jewellers / Jewelry Estimation Software — a Node.js (Express) monolith with PostgreSQL, serving a vanilla HTML/CSS/JS frontend via `express.static('public')`. See `README.md` and `DEPLOYMENT.md` for general docs.

### Required Services

| Service | How to start |
|---------|-------------|
| **PostgreSQL 16** | `sudo pg_ctlcluster 16 main start` |
| **Node.js dev server** | See "Running the dev server" below |

### Running the dev server

The environment has pre-injected secrets (`DATABASE_URL`, `DB_USER`, etc.) that conflict with local PostgreSQL. You **must** override them:

```bash
source ~/.nvm/nvm.sh && nvm use 18
unset DATABASE_URL
export DB_HOST=localhost DB_PORT=5432 DB_NAME=jewelry_db DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD
export NODE_ENV=development SESSION_SECRET=$SESSION_SECRET
npm run dev
```

Set `DB_USER`, `DB_PASSWORD`, and `SESSION_SECRET` to your local PostgreSQL credentials and a dev session secret respectively.

The `NODE_ENV=development` flag enables a Google OAuth bypass at `/auth/google` that auto-creates a local admin user (`jaigaurav56789@gmail.com`, role `super_admin`), so no Google OAuth credentials are needed in dev.

### Database

- PostgreSQL local credentials: use the `DB_USER` and `DB_PASSWORD` you configured during setup, database `jewelry_db`.
- The server auto-initializes the full schema on startup via `config/database.js` → `initDatabase()` / `initSchema()`.
- The `live_rates` table is NOT created by `initSchema()` — it lives in migration `004_ecommerce_sip.sql`. If you get `relation "live_rates" does not exist` errors, create it manually:
  ```sql
  PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h 127.0.0.1 -d jewelry_db -c "
  CREATE TABLE IF NOT EXISTS live_rates (
      metal_type VARCHAR(20) PRIMARY KEY,
      buy_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      sell_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
      admin_margin NUMERIC(12,2) DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );"
  ```
- The SQL migrations (`npm run migrate`) assume a pre-existing schema layout that conflicts with `initSchema()`. Running migrations on a fresh DB will fail on `001_enterprise_upgrade.sql` because the `styles` table is created by `initSchema()` with a different column set.

### Gotchas

- `dotenv` v17 does **not** override pre-existing environment variables. If injected secrets exist (check `CLOUD_AGENT_INJECTED_SECRET_NAMES`), you must `unset DATABASE_URL` and re-export `DB_*` vars before starting the server.
- There are no HTML files in the repo — the `public/` directory only contains JS files. The frontend HTML is not tracked in git. The backend API still functions fully without it.
- `npm run dev` uses `nodemon` for hot-reload.
- No linter or automated test suite is configured in `package.json`.
