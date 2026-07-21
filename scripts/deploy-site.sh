#!/usr/bin/env bash
#
# Deploy the landing page and docs to memosprout.com.
#
#   pnpm deploy:site
#
# Builds the static export and rsyncs it to /var/www/memosprout-site.
# Touches nothing else on the server — the memory game (play.memosprout.com)
# and the other apps hosted there are unaffected.
set -euo pipefail

HOST="root@85.190.242.47"
PORT=7822
KEY="${MEMOSPROUT_DEPLOY_KEY:-$HOME/.ssh/id_tubegrasp}"
TARGET="/var/www/memosprout-site"

if [ ! -f "$KEY" ]; then
  echo "SSH key not found at $KEY" >&2
  echo "Set MEMOSPROUT_DEPLOY_KEY to override." >&2
  exit 1
fi

echo "→ Building static export"
pnpm exec next build

if [ ! -f out/index.html ]; then
  echo "Build produced no out/index.html — aborting before touching the server." >&2
  exit 1
fi

echo "→ Uploading to $TARGET"
rsync -az --delete -e "ssh -i $KEY -p $PORT" out/ "$HOST:$TARGET/"

echo "→ Verifying"
for path in / /docs; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://memosprout.com$path" --max-time 15)
  printf "   %-8s %s\n" "$path" "$code"
  [ "$code" = "200" ] || { echo "Unexpected status for $path" >&2; exit 1; }
done

echo "✓ Deployed to https://memosprout.com"
