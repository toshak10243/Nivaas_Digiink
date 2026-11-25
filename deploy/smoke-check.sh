#!/usr/bin/env bash
# Check the public Nivaas API after deployment: bash deploy/smoke-check.sh https://crm.example.com
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash deploy/smoke-check.sh https://your-public-hostname" >&2
  exit 2
fi

BASE_URL=${1%/}
if [[ ! "$BASE_URL" =~ ^https://[^/]+$ ]]; then
  echo "The public URL must use HTTPS and contain only a hostname (no path)." >&2
  exit 2
fi

check_endpoint() {
  local endpoint=$1
  local expected=$2
  local body

  if ! body=$(curl --fail --silent --show-error --max-time 15 "$BASE_URL$endpoint"); then
    echo "Health check failed: $endpoint did not return a successful HTTPS response." >&2
    return 1
  fi

  if ! printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => raw += chunk);
    process.stdin.on("end", () => {
      try {
        const body = JSON.parse(raw);
        const expected = process.argv[1];
        const ok = body.ok === true && (expected !== "ready" || body.database === "ready");
        if (!ok) process.exitCode = 1;
      } catch {
        process.exitCode = 1;
      }
    });
  ' "$expected"; then
    echo "Health check failed: $endpoint returned an unexpected response." >&2
    return 1
  fi

  echo "OK $endpoint"
}

check_endpoint /health/live live
check_endpoint /health/ready ready
echo "Nivaas is live and the database is ready at $BASE_URL."
