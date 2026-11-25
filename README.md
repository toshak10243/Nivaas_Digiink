# Nivaas Real Estate CRM

Nivaas is a real estate CRM for builders and sales teams. It connects projects, inventory, leads, site visits, bookings, buyer handover, and after-sales service in one application. AI and WhatsApp features are optional integrations that require provider credentials.

## Features

- **Projects and inventory:** Manage projects, towers, unit types, availability, pricing, cost sheets, photos, videos, and floor plans.
- **Lead management:** Track lead sources, owners, stages, follow-ups, customer preferences, and broker referrals. Supports saved views and bulk actions.
- **Site visits:** Schedule, confirm, reschedule, and record visit outcomes.
- **Sales and bookings:** Share project or unit pages, create bookings, track payment milestones, manage registry checklists, and calculate commissions or incentives.
- **Buyer and service portals:** Give customers access to booking information, project updates, and after-sales tickets with attachments.
- **Team and reporting:** Manage roles, assignment, payroll, commissions, and operational dashboards.
- **AI and messaging:** Optional Gemini AI assistance, WhatsApp Cloud API messaging, and LeadSathi webhook integration.
- **Tenant support:** Tenant resolution and subscription controls for multi-company deployments.

## Roles

| Role | Main access |
| --- | --- |
| Builder admin | Company settings, projects, inventory, team, all leads and sales records, integrations, and reports |
| Sales agent | Assigned leads, visits, inventory, bookings, chats, and personal earnings |
| Broker | Broker-owned leads, inventory, sharing, and commission records; customer phone numbers are masked |
| Maintenance | After-sales tickets, assignments, comments, and ticket status |
| Customer | Own booking, payments, project updates, and service tickets |
| Platform super admin | Tenant and subscription administration on SaaS deployments |

## Technology

- Client: React 18 and Vite
- API: Node.js 20+, Express, and PostgreSQL
- Authentication: JWT access and refresh tokens
- Files: Local upload storage with private-file access for protected attachments

## Requirements

- Node.js 20 or newer and npm
- PostgreSQL 14 or newer
- PostgreSQL credentials with permission to create the application schema

## Run locally

The client and API run in separate terminals. The client dev server uses `http://localhost:5180` and proxies API requests to `http://localhost:4100`.

### 1. Configure the API

From the repository root, in PowerShell:

```powershell
cd server
Copy-Item .env.example .env
notepad .env
```

Set `DATABASE_URL` to your local PostgreSQL database. Set a unique `JWT_SECRET` for non-demo use. AI, email, and WhatsApp credentials can be added when those integrations are configured; they are not required for basic CRM use.

Create the schema, optionally load sample data, then start the API:

```powershell
npm ci
npm run db:init
npm run db:seed
npm run dev
```

`db:seed` loads the sample company and users. Run it only in a development database and only once. `npm run db:seed -- --reset` deletes all tenant data in the selected database before seeding; use it only when you intend to reset that database.

### 2. Start the client

In a second terminal:

```powershell
cd client
npm ci
npm run dev
```

Open `http://localhost:5180`.

### Demo without a database

For an in-memory UI demo, run this instead of the API and database setup:

```powershell
cd client
npm ci
npm run dev:demo
```

Demo mode uses sample data in the browser. Changes are not stored in PostgreSQL.

### Development sample accounts

After running `npm run db:seed`, these development-only accounts are available:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@sgdevelopers.in` | `nivaas123` |
| Sales | `rohit@sgdevelopers.in` | `nivaas123` |
| Broker | `rajesh@sharmarealty.in` | `nivaas123` |
| Maintenance | `ajay@sgdevelopers.in` | `nivaas123` |
| Customer | `ramesh.gupta@gmail.com` | `home1234` |

Never use sample accounts or passwords in a live environment. To set up a new company, use **First time? Set up your company** on the login page instead of loading sample data.

## Environment configuration

The complete variable list and defaults are documented in [`server/.env.example`](server/.env.example). Common settings include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL for the tenant/application database |
| `PORT` | API port; defaults to `4100` |
| `PUBLIC_URL` | Public base URL used in links and webhook setup |
| `BASE_DOMAIN` | Base hostname used to build and resolve tenant subdomains |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `UPLOAD_DIR` | Upload storage directory |
| `GEMINI_API_KEY` | Optional Gemini AI integration |
| `WHATSAPP_WEBHOOK_ENABLED` | Enable Meta inbound webhooks; defaults to `false` |
| `META_APP_SECRET` and `META_VERIFY_TOKEN` | Required with strong values when WhatsApp webhooks are enabled |
| `WA_INTRO_TEMPLATE` and `WA_TEMPLATE_LANG` | Approved WhatsApp introduction template settings |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Optional email delivery settings |

Use strong unique secrets in deployed environments. Do not commit `.env` files or provider credentials.

## Database and tenant initialization

`npm run db:init` creates or updates the application schema. The API also applies migrations during startup.

For a multi-tenant SaaS installation, `npm run db:init:master` initializes the separate control-plane database used for tenants, subscriptions, and platform settings. On first setup, set `SUPERADMIN_INITIAL_NAME`, `SUPERADMIN_INITIAL_EMAIL`, and a unique `SUPERADMIN_INITIAL_PASSWORD` of at least 16 characters. Remove the password variable after initialization. Re-running initialization also replaces the legacy `admin@nivaas.space` bootstrap account if present.

Subscription payment destinations are managed in the platform admin settings. They remain hidden and payment-proof submission stays disabled until an administrator enters and explicitly verifies valid UPI and bank details. No sample bank or UPI values are used as fallbacks.

## Verification

From `server/`:

```powershell
npm test
npm run check:syntax
npm run test:fast
npm run verify:local
```

- `npm test` runs unit tests without a database.
- `npm run check:syntax` parses server JavaScript and client JavaScript/JSX.
- `npm run test:fast` builds the client and runs syntax and unit checks.
- `npm run verify:local` runs all checks and the API integration suite. It creates a uniquely named temporary database on local PostgreSQL using `server/.env` `DATABASE_URL`, then removes it. The local database account needs permission to create and drop databases.

For CI or a separately provisioned PostgreSQL test database, set `TEST_DATABASE_URL` to a dedicated database name ending in `_test`, `_testing`, or `_integration`, then run:

```powershell
$env:TEST_DATABASE_URL = 'postgres://user:password@localhost:5432/nivaas_test'
npm run verify
```

The integration suite creates and drops a temporary schema inside that test database. It does not clear or seed the database's `public` schema.

## Production deployment

A Docker Compose deployment is provided in `docker-compose.yml`:

1. Copy `server/.env.example` to the repository root as `.env` and configure production values.
2. Set `DB_PASSWORD`, a unique `JWT_SECRET`, an HTTPS `PUBLIC_URL`, and the required Meta secrets if WhatsApp webhooks will be used.
3. Run the deployment preflight before starting services:

   ```bash
   node deploy/preflight.mjs
   ```

   It checks production secrets, HTTPS/domain settings, optional WhatsApp webhook credentials, and Docker Compose configuration without printing secret values.
4. Start the application with:

   ```bash
   docker compose up -d --build
   docker compose logs -f app
   ```

The API serves the built client when `client/dist` exists. The Vite development server is not needed in production. Configure a reverse proxy and HTTPS for public access; keep PostgreSQL and the API port private to the application host/network.

### Backups and recovery

Run `deploy/backup.sh` daily from the repository directory. It backs up PostgreSQL and uploaded files, verifies both archives, writes a SHA-256 manifest, and prevents overlapping runs. Set `BACKUP_DIR` to choose the backup directory and `BACKUP_RETENTION_DAYS` to change the default 14-day retention. Store a second copy off the application host; local backups alone do not protect against host or disk loss. Before restoring, copy both archives and the matching `.sha256` manifest into `BACKUP_DIR`, then run `bash deploy/restore.sh YYYY-MM-DD`. The restore script checks available checksums and archive paths before asking for confirmation because restore replaces production data.

## Health endpoints

- `GET /health/live` checks whether the API process is responding.
- `GET /health/ready` checks API and PostgreSQL readiness.
- `GET /health` redirects to `/health/ready`.

After deployment, run `bash deploy/smoke-check.sh https://your-public-hostname` from a host with `curl` and Node.js installed. It checks the public TLS connection, API liveness, and database readiness without requiring login credentials.

## Repository layout

```text
client/       React application and Vite configuration
server/       Express API, database schema/migrations, and tests
shared/       Shared sample and seed data
deploy/       Reverse proxy, process manager, backup, and restore files
```
