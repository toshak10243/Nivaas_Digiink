# Nivaas: builder ka poora sales + service system

Builder â†’ sales team / brokers â†’ customer â†’ after-sales service. Ek hi app me. **LeadSathi** (AI lead agent) alag product hai aur webhook se isse judta hai.

```
Meta ad â†’ builder ka common WhatsApp (LeadSathi AI baat karta hai)
        â†’ lead qualified / site visit fix â†’ Nivaas me auto-assign â†’ sales agent ya broker
        â†’ agent apne WhatsApp number se baat karta hai (busy ho to AI twin reply karta hai)
        â†’ inventory se 1-click flat link (photos, video, carpet/super area, price, EMI)
        â†’ booking â†’ customer login + payment schedule + broker commission / sales incentive
        â†’ customer portal: ticket (photo ke saath) â†’ maintenance team + sales agent, 24h SLA
```

| Role | Kya kar sakta hai |
|---|---|
| **Admin (builder)** | Projects, towers, flats, photos/videos, rates; team banana (sales, broker, maintenance); commission %, salary, incentive; saari leads, bookings, payments, payroll, tickets; routing rules; WhatsApp numbers; LeadSathi connection |
| **Sales agent** | Live inventory (kaunsa flat available/hold/sold, kisne becha), apni leads, site visits, share link, hold/booking, apni WhatsApp chats + AI twin, apni earnings |
| **Broker** | Live inventory, apni leads (doosre broker ki lead nahi dikhti, duplicate phone blocked), share link with own name, commission ledger |
| **Maintenance** | Assigned tickets, photos, comments, status, SLA timer |
| **Customer** | Apna flat, payment schedule, project updates, service ticket raise (photo upload), rating |

```
nivaas/
â”œâ”€â”€ server/          Node 20 + Express + PostgreSQL (API, WhatsApp webhook, AI twin, jobs)
â”‚   â”œâ”€â”€ db/schema.sql      saari tables
â”‚   â”œâ”€â”€ db/seed.js         sample builder (Shree Ganesh Developers, 2 projects, 52 flats)
â”‚   â””â”€â”€ uploads/sample/    sample photos, floor plans, walkthrough video
â”œâ”€â”€ client/          React 18 (Vite): dashboard + public flat page /s/<token>
â”œâ”€â”€ shared/          sample data (demo aur seed dono use karte hain)
â”œâ”€â”€ deploy/          nginx.conf, PM2 config, backup script
â”œâ”€â”€ Dockerfile
â””â”€â”€ docker-compose.yml
```

---

## 1. Mac / laptop par chalana

```bash
# PostgreSQL 14+ chahiye (Postgres.app ya: brew install postgresql@16 && brew services start postgresql@16)
createdb nivaas

cd nivaas/server
cp .env.example .env          # DATABASE_URL=postgres://<aapka-mac-user>@localhost:5432/nivaas
npm install
npm run db:init               # tables
npm run db:seed               # sample builder + logins
npm run dev                   # API â†’ http://localhost:4100

# naya terminal
cd nivaas/client
npm install
npm run dev                   # app â†’ http://localhost:5180
```

Bina database ke sirf demo dekhna ho: `cd client && npm install && npm run dev:demo`.

**Sample logins** (seed ke baad):

| Role | Email | Password |
|---|---|---|
| Admin | admin@sgdevelopers.in | nivaas123 |
| Sales | rohit@sgdevelopers.in / neha@â€¦ / arjun@â€¦ | nivaas123 |
| Broker | rajesh@sharmarealty.in | nivaas123 |
| Maintenance | ajay@sgdevelopers.in | nivaas123 |
| Customer | ramesh.gupta@gmail.com | home1234 |

Apna real data: seed mat chalaiye. Login page par **"First time? Set up your company"** se apni company + admin banaiye.

---

## 2. VPS par live karna (Ubuntu 22/24, 2 GB RAM kaafi hai)

### Option A â€” Docker (aasaan)

```bash
# 1) VPS par
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo mkdir -p /opt && cd /opt
# nivaas folder upload karein (scp / git clone)
cd /opt/nivaas

# 2) settings
cp server/.env.example .env
nano .env
chmod 600 .env
#   PUBLIC_URL=https://nivaas.aapkadomain.com
#   JWT_SECRET=<lamba random: openssl rand -hex 32>
#   META_APP_SECRET=<Meta App Secret from App Settings -> Basic>
#   META_VERIFY_TOKEN=<random: openssl rand -hex 16>
#   DB_PASSWORD=<openssl rand -hex 24 ka output; Docker Compose ke liye zaroori>
#   GEMINI_API_KEY=...  META_APP_SECRET=...  META_VERIFY_TOKEN=...

# 3) start
docker compose up -d --build
docker compose logs -f app                  # "Nivaas on :4100" dikhna chahiye
```

Sample data sirf development ya staging par load karein; production image demo seeding ko rokta hai.

### Option B â€” bina Docker (Node + PostgreSQL + PM2)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx certbot python3-certbot-nginx
sudo npm i -g pm2
sudo -u postgres psql -c "CREATE USER nivaas WITH PASSWORD 'strongpass';" -c "CREATE DATABASE nivaas OWNER nivaas;"

cd /opt/nivaas/client && npm ci && npm run build      # client/dist bana â€” server khud serve karega
cd /opt/nivaas/server && npm ci --omit=dev
cp .env.example .env && nano .env                          # DATABASE_URL=postgres://nivaas:strongpass@localhost:5432/nivaas
npm run db:init
pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

### Domain + HTTPS (dono options me)

1. Domain ke DNS me **A record**: `nivaas` â†’ VPS ka IP.
2. ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/nivaas
   sudo nano /etc/nginx/sites-available/nivaas          # server_name badlein
   sudo ln -s /etc/nginx/sites-available/nivaas /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d nivaas.aapkadomain.com
   ```
3. Browser me `https://nivaas.aapkadomain.com` â†’ login.
4. Daily DB + uploaded files backup: `crontab -e` me `0 3 * * * bash /opt/nivaas/deploy/backup.sh` (Docker setup ke liye). Backups `/opt/backups` me 14 din rakhe jaate hain; `.env` ko alag se securely save karein.
5. Restore paired files from a chosen date with `bash deploy/restore.sh YYYY-MM-DD`. It checks both archives, stops the app, and requires typing `RESTORE` before replacing the database and uploads.

**Update karna:** naya code upload â†’ Docker: `docker compose up -d --build` Â· PM2: `cd client && npm run build && pm2 restart nivaas`. Tables apne aap update hoti hain (`db:init` dobara chalana safe hai).

---

## 3. WhatsApp connect karna (Meta Cloud API)

Ek WhatsApp Business Account (WABA) me **kai numbers** ho sakte hain: builder ka main number + har sales agent ka number.

1. developers.facebook.com â†’ App banayein (type *Business*) â†’ **WhatsApp** product add karein.
2. Har number add + verify karein â†’ har number ka **Phone number ID** aur ek **permanent access token** (System User) note karein.
3. App â†’ WhatsApp â†’ Configuration â†’ **Webhook**
   - Callback URL: `https://nivaas.aapkadomain.com/webhooks/whatsapp`
   - Verify token: `.env` wala `META_VERIFY_TOKEN`
   - Subscribe: `messages`
4. `.env` me `META_APP_SECRET` (App â†’ Settings â†’ Basic) daalein, restart.
5. Nivaas â†’ **Settings â†’ Integrations â†’ WhatsApp numbers**: main number (kisi user ke bina) + har agent ka number uske naam se, Phone number ID + token ke saath.
6. **Template** (WhatsApp Manager â†’ Message templates), name `agent_intro_hi`, language Hindi, category Utility:
   > Namaste {{1}} ðŸ™ Main {{2}}, {{3}} se. Aapki enquiry mujhe mili hai, site visit aur saari details main aapko yahin dunga. Kya abhi baat kar sakte hain?

   Lead assign hote hi agent ke number se yahi jaata hai (Meta rule: pehla message template hona chahiye; customer reply kare to 24 ghante normal chat).

**AI twin:** har agent **Chats** page par *Off / Cover for me / Always* chun sakta hai. *Cover for me*: agent "Away" ho, ya set kiye minutes me reply na kare, to AI uske number se reply karta hai â€” live inventory, price, visit booking ke saath. `GEMINI_API_KEY` zaroori hai.

> Note: agar koi number pehle se normal WhatsApp Business app me chal raha hai, Meta ka **coexistence** onboarding use karein taaki phone par bhi chats dikhti rahein.

---

## 4. LeadSathi ko jodna

1. Nivaas â†’ **Settings â†’ Integrations â†’ LeadSathi** â†’ webhook URL copy karein
   (`https://nivaas.aapkadomain.com/bridge/leadsathi/<org-id>?secret=<secret>`).
2. LeadSathi â†’ **Settings â†’ Business**: industry **Real estate** chunein (AI ab BHK, budget, area, purpose, timeline, site visit poochega).
3. LeadSathi â†’ **Settings â†’ Integrations â†’ Webhook URL** me wahi URL paste karein â†’ Save.

Ab LeadSathi ko builder ke common number par lead aati hai â†’ AI qualify karta hai â†’ **hot lead / site visit** hote hi Nivaas me lead ban kar routing rules ke hisaab se sales agent ya broker ko assign ho jaati hai (least loaded / round robin, availability ke hisaab se; agent ne 15 min me reply nahi kiya to auto-reassign, max 2 baar).

---

## 5. Settings jo builder badal sakta hai

- **Routing:** kab assign ho (new / qualified / visit), strategy, brokers ko bhi lead mile ya nahi, first response time, sirf available agents.
- **Holds:** flat hold kitne ghante (default 48) â€” expire hone par auto release.
- **EMI:** interest rate, tenure, down payment % (share page ka calculator).
- **Service:** ticket SLA (24h, urgent 6h), sales agent ko bhi alert.
- **Team:** har broker ka commission (% ya flat â‚¹), sales salary + incentive; booking par commission entry apne aap banti hai â†’ admin approve â†’ paid.

---

## Health checks and operations

- `GET /health/live` confirms the Node process is responding; it does not depend on PostgreSQL.
- `GET /health/ready` checks PostgreSQL and returns HTTP 503 while the database is unavailable. `GET /health` redirects to this readiness check.
- Server errors include a request ID in the response and `X-Request-Id` header. In production, internal error details are written to server logs and a generic message is returned to the caller.
- SIGINT and SIGTERM stop background jobs, drain the HTTP server, and close the PostgreSQL pool. Periodic jobs skip a tick if the prior run is still active.

## Automated checks

From `server/`:

```bash
npm test                 # unit checks; no database required
npm run check:syntax     # parse server JavaScript and client JavaScript / JSX
TEST_DATABASE_URL=postgres://nivaas:password@localhost:5432/nivaas_test npm run test:integration
```

Integration checks require a dedicated PostgreSQL database and a role that can create and drop schemas. The suite creates a uniquely named temporary schema, starts the API against it, exercises role access, lead privacy, competing bookings, payment limits, customer tickets, public share links, upload rejection, and integration failure handling, then drops its schema and temporary uploads. It does not seed or clear the database's `public` schema.

## 6. Kya live test hua, kya nahi

- Run `npm test` and `npm run test:integration` from `server/` to check core rules and API flows.
- Gemini API connectivity is verified with a synthetic prompt. Real WhatsApp messaging still requires valid Meta app credentials, phone-number IDs, access tokens, and an approved intro template; the sample seed uses placeholder WhatsApp credentials.

Troubleshooting: `docker compose logs -f app` / `pm2 logs nivaas`. Webhook verify fail â†’ `META_VERIFY_TOKEN` match karein aur HTTPS chalu hai check karein.
