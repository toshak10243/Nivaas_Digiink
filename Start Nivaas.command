#!/bin/bash
# Nivaas ko ek double-click me chalata hai. Band karne ke liye is window me Ctrl + C.
cd "$(dirname "$0")"
ROOT="$(pwd)"
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
lsof -ti tcp:4100 -ti tcp:5180 2>/dev/null | xargs kill 2>/dev/null   # purana chal raha ho to band
echo ""
echo "  ===== NIVAAS ====="
echo ""
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js nahi mila. nodejs.org se LTS install karein, phir ye file dobara double-click karein."
  open "https://nodejs.org/en/download"; read -p "  Enter dabayein..."; exit 1
fi
echo "  Node $(node -v) mila."

cd "$ROOT/server"
[ -f .env ] || cp .env.example .env
echo "  Server packages check ho rahe hain..."
npm install --no-audit --no-fund --loglevel=error || { read -p "  npm install fail hua. Enter..."; exit 1; }

URL="$(node db/find-db.js)"
TRY=0
while [ -z "$URL" ] && [ $TRY -lt 3 ]; do
  TRY=$((TRY+1))
  echo ""
  echo "  Aapke Mac ka PostgreSQL password chahiye (PostgreSQL 18 install karte waqt 'postgres' user ka jo password rakha tha)."
  echo "  Type karte waqt kuch dikhega nahi, ye normal hai. Bina password ke DEMO chalana ho to bas Enter dabayein."
  read -s -p "  Password: " PGPW; echo ""
  [ -z "$PGPW" ] && break
  URL="$(PG_TRY_PASSWORD="$PGPW" node db/find-db.js)"
  [ -z "$URL" ] && echo "  ✗ Ye password sahi nahi laga."
done
if [ -n "$URL" ]; then
  MODE=full
  # .env me sahi database aur local URL likh do
  grep -v '^DATABASE_URL=\|^PUBLIC_URL=' .env > .env.tmp
  { echo "DATABASE_URL=$URL"; echo "PUBLIC_URL=http://localhost:5180"; cat .env.tmp; } > .env; rm .env.tmp
  echo "  ✓ Database mil gaya → poora system chalega."
  node db/init.js || { read -p "  Tables nahi ban payi. Enter..."; exit 1; }
  if [ ! -f .seeded ]; then node db/seed.js && touch .seeded; fi
  node src/index.js > "$ROOT/server.log" 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
else
  MODE=demo
  echo "  ! PostgreSQL me login nahi ho paya → DEMO mode chalega (sample data, bina database)."
  echo "    Asli database ke liye: postgresapp.com se Postgres.app install karke 'Initialize' dabayein, phir ye file dobara chalayein."
fi

cd "$ROOT/client"
echo "  App packages install ho rahe hain (pehli baar 1-2 min)..."
npm install --no-audit --no-fund --loglevel=error || { read -p "  npm install fail hua. Enter..."; exit 1; }
( sleep 5; open "http://localhost:5180" ) &
echo ""
echo "  ✓ Browser me khul raha hai: http://localhost:5180"
[ "$MODE" = full ] && echo "    Login: admin@sgdevelopers.in / nivaas123   (customer: ramesh.gupta@gmail.com / home1234)"
[ "$MODE" = demo ] && echo "    Login page par koi bhi role card dabayein."
echo "  Band karna ho to is window me Ctrl + C."
echo ""
if [ "$MODE" = full ]; then npx vite --port 5180 --strictPort; else npx vite --mode demo --port 5180 --strictPort; fi
