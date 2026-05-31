#!/usr/bin/env bash
set -euo pipefail

cd /opt/weather-starter
git clean -fd
git fetch origin main
git reset --hard origin/main
npm ci
npm run build
sudo systemctl restart weather-starter

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
    echo "Health check passed on attempt ${attempt}"
    exit 0
  fi
  sleep 1
done

echo 'Health check failed after 20s'
sudo systemctl status weather-starter --no-pager -l || true
sudo journalctl -u weather-starter -n 120 --no-pager || true
exit 1