#!/bin/zsh
# Temporary public links for testing on a phone (Cloudflare quick tunnels).
# Restarts one tunnel per app, waits until each is registered, then writes the
# links to ~/Desktop/LOIMART links.txt. Quick-tunnel links change on every run
# and expire after a while; run this again when they stop working.
# Needs the dev servers running (pnpm exec turbo dev --env-mode=loose).
set -u
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"
LOGS="${TMPDIR:-/tmp}/loimart-tunnels"
OUT="$HOME/Desktop/LOIMART links.txt"
mkdir -p "$LOGS"
pkill -f "cloudflared tunnel" 2>/dev/null; sleep 2

typeset -A NAMES=(3000 "Shop" 3001 "Seller Centre" 3002 "Admin" 3003 "Banner Studio" 3004 "Payroll")
lines=()
for port in 3000 3001 3002 3003 3004; do
  log="$LOGS/$port.log"
  nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "http://localhost:$port" > "$log" 2>&1 &
  link=""
  for _ in {1..30}; do
    link=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$log" | head -1)
    [[ -n "$link" ]] && grep -q "Registered tunnel connection" "$log" && break
    sleep 2
  done
  lines+=("${NAMES[$port]}: ${link:-FAILED (see $log)}")
done

{
  echo "LOIMART test links — $(date '+%d %b %Y, %I:%M %p')"
  echo "These change every time and expire after a while."
  echo
  printf '%s\n' "${lines[@]}"
  echo
  echo "Logins (password AzadiDemo2026!): demo.customer@ / demo.seller@ / demo.admin@azadimart.test"
} > "$OUT"
cat "$OUT"
