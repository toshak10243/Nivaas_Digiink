# Nivaas: builder ka poora sales + service system

Builder → sales team / brokers → customer → after-sales service. Ek hi app me. **LeadSathi** (AI lead agent) alag product hai aur webhook se isse judta hai.

```
Meta ad → builder ka common WhatsApp (LeadSathi AI baat karta hai)
        → lead qualified / site visit fix → Nivaas me auto-assign → sales agent ya broker
        → agent apne WhatsApp number se baat karta hai (busy ho to AI twin reply karta hai)
        → inventory se 1-click flat link (photos, video, carpet/super area, price, EMI)
        → booking → customer login + payment schedule + broker commission / sales incentive
        → customer portal: ticket (photo ke saath) → maintenance team + sales agent, 24h SLA
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
├── server/          Node 20 + Express + PostgreSQL (API, WhatsApp webhook, AI twin, jobs)
│   ├── db/schema.sql      saari tables
│   ├── db/seed.js         sample builder (Shree Ganesh Developers, 2 projects, 52 flats)
│   └── uploads/sample/    sample photos, floor plans, walkthrough video
├── client/          React 18 (Vite): dashboard + public flat page /s/<token>
├── shared/          sample data (demo aur seed dono use karte hain)
├── deploy/          nginx.conf, PM2 config, backup script
├── Dockerfile
└── docker-compose.yml
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
npm run dev                   # API → http://localhost:4100

# naya terminal
cd nivaas/client
npm install
npm run dev                   # app → http://localhost:5180
```

Bina database ke sirf demo dekhna ho: `cd client && npm install && npm run dev:demo`.

**Sample logins** (seed ke baad):

| Role | Email | Password |
|---|---|---|
| Admin | admin@sgdevelopers.in | nivaas123 |
| Sales | rohit@sgdevelopers.in / neha@… / arjun@… | nivaas123 |
| Broker | rajesh@sharmarealty.in | nivaas123 |
| Maintenance | ajay@sgdevelopers.in | nivaas123 |
| Customer | ramesh.gupta@gmail.com | home1234 |

Apna real data: seed mat chalaiye. Login page par **"First time? Set up your company"** se apni company + admin banaiye.

---

## 2. VPS par live karna (Ubuntu 22/24, 2 GB RAM kaafi hai)

### Option A — Docker (aasaan)

```bash
# 1) VPS par
sudo apt update && sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx
sudo mkdir -p /opt && cd /opt
# nivaas folder upload karein (scp / git clone)
cd /opt/nivaas

# 2) settings
cp server/.env.example .env
nano .env
#   PUBLIC_URL=https://nivaas.aapkadomain.com
#   JWT_SECRET=<lamba random: openssl rand -hex 32>
#   DB_PASSWORD=<strong password>          ← ye line add karein
#   ANTHROPIC_API_KEY=...  META_APP_SECRET=...  META_VERIFY_TOKEN=...

# 3) start
docker compose up -d --build
docker compose exec app node db/seed.js     # sirf agar sample data chahiye
docker compose logs -f app                  # "Nivaas on :4100" dikhna chahiye
```

### Option B — bina Docker (Node + PostgreSQL + PM2)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx certbot python3-certbot-nginx
sudo npm i -g pm2
sudo -u postgres psql -c "CREATE USER nivaas WITH PASSWORD 'strongpass';" -c "CREATE DATABASE nivaas OWNER nivaas;"

cd /opt/nivaas/client && npm install && npm run build      # client/dist bana — server khud serve karega
cd /opt/nivaas/server && npm install --omit=dev
cp .env.example .env && nano .env                          # DATABASE_URL=postgres://nivaas:strongpass@localhost:5432/nivaas
npm run db:init
pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

### Domain + HTTPS (dono options me)

1. Domain ke DNS me **A record**: `nivaas` → VPS ka IP.
2. ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/nivaas
   sudo nano /etc/nginx/sites-available/nivaas          # server_name badlein
   sudo ln -s /etc/nginx/sites-available/nivaas /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d nivaas.aapkadomain.com
   ```
3. Browser me `https://nivaas.aapkadomain.com` → login.
4. Backup: `crontab -e` → `0 3 * * * /opt/nivaas/deploy/backup.sh` (Docker setup ke liye).

**Update karna:** naya code upload → Docker: `docker compose up -d --build` · PM2: `cd client && npm run build && pm2 restart nivaas`. Tables apne aap update hoti hain (`db:init` dobara chalana safe hai).

---

## 3. WhatsApp connect karna (Meta Cloud API)

Ek WhatsApp Business Account (WABA) me **kai numbers** ho sakte hain: builder ka main number + har sales agent ka number.

1. developers.facebook.com → App banayein (type *Business*) → **WhatsApp** product add karein.
2. Har number add + verify karein → har number ka **Phone number ID** aur ek **permanent access token** (System User) note karein.
3. App → WhatsApp → Configuration → **Webhook**
   - Callback URL: `https://nivaas.aapkadomain.com/webhooks/whatsapp`
   - Verify token: `.env` wala `META_VERIFY_TOKEN`
   - Subscribe: `messages`
4. `.env` me `META_APP_SECRET` (App → Settings → Basic) daalein, restart.
5. Nivaas → **Settings → Integrations → WhatsApp numbers**: main number (kisi user ke bina) + har agent ka number uske naam se, Phone number ID + token ke saath.
6. **Template** (WhatsApp Manager → Message templates), name `agent_intro_hi`, language Hindi, category Utility:
   > Namaste {{1}} 🙏 Main {{2}}, {{3}} se. Aapki enquiry mujhe mili hai, site visit aur saari details main aapko yahin dunga. Kya abhi baat kar sakte hain?

   Lead assign hote hi agent ke number se yahi jaata hai (Meta rule: pehla message template hona chahiye; customer reply kare to 24 ghante normal chat).

**AI twin:** har agent **Chats** page par *Off / Cover for me / Always* chun sakta hai. *Cover for me*: agent "Away" ho, ya set kiye minutes me reply na kare, to AI uske number se reply karta hai — live inventory, price, visit booking ke saath. `ANTHROPIC_API_KEY` zaroori hai.

> Note: agar koi number pehle se normal WhatsApp Business app me chal raha hai, Meta ka **coexistence** onboarding use karein taaki phone par bhi chats dikhti rahein.

---

## 4. LeadSathi ko jodna

1. Nivaas → **Settings → Integrations → LeadSathi** → webhook URL copy karein
   (`https://nivaas.aapkadomain.com/bridge/leadsathi/<org-id>?secret=<secret>`).
2. LeadSathi → **Settings → Business**: industry **Real estate** chunein (AI ab BHK, budget, area, purpose, timeline, site visit poochega).
3. LeadSathi → **Settings → Integrations → Webhook URL** me wahi URL paste karein → Save.

Ab LeadSathi ko builder ke common number par lead aati hai → AI qualify karta hai → **hot lead / site visit** hote hi Nivaas me lead ban kar routing rules ke hisaab se sales agent ya broker ko assign ho jaati hai (least loaded / round robin, availability ke hisaab se; agent ne 15 min me reply nahi kiya to auto-reassign, max 2 baar).

---

## 5. Settings jo builder badal sakta hai

- **Routing:** kab assign ho (new / qualified / visit), strategy, brokers ko bhi lead mile ya nahi, first response time, sirf available agents.
- **Holds:** flat hold kitne ghante (default 48) — expire hone par auto release.
- **EMI:** interest rate, tenure, down payment % (share page ka calculator).
- **Service:** ticket SLA (24h, urgent 6h), sales agent ko bhi alert.
- **Team:** har broker ka commission (% ya flat ₹), sales salary + incentive; booking par commission entry apne aap banti hai → admin approve → paid.

---

## 6. Kya live test hua, kya nahi

- ✅ API ke 60 checks (har role, inventory hold, lead protection, auto-assign, share link → enquiry, booking → customer login, payments, payroll, tickets with photos, LeadSathi bridge, WhatsApp webhook → lead routing) — production mode me pass.
- ⚠️ Real WhatsApp message bhejna aur AI twin ka Claude call aapki Meta / Anthropic keys ke bina live test nahi ho sakta. Keys daalne ke baad ek test number se check kar lein.

Troubleshooting: `docker compose logs -f app` / `pm2 logs nivaas`. Webhook verify fail → `META_VERIFY_TOKEN` match karein aur HTTPS chalu hai check karein.
