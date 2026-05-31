#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-automatic-ace-488412-a7}"
INSTANCE_NAME="${INSTANCE_NAME:-weather-starter-vm}"
ZONE="${ZONE:-us-central1-a}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/weather-starter}"
DATA_DIR="${DATA_DIR:-/var/lib/weather-starter}"
PORT="${PORT:-3000}"
HOST="${HOST:-127.0.0.1}"
DOMAIN="${DOMAIN:-}"

if [[ -z "${REPO_URL:-}" ]]; then
  echo "REPO_URL is required, for example:"
  echo "REPO_URL='https://github.com/you/weather_starter.git' bash scripts/gcp/bootstrap-vm.sh"
  exit 1
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud

echo "Checking VM ${INSTANCE_NAME} in ${ZONE}..."
gcloud compute instances describe "${INSTANCE_NAME}" \
  --zone "${ZONE}" \
  --project "${PROJECT_ID}" >/dev/null

REMOTE_CMD="
set -euo pipefail

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git caddy

if ! command -v node >/dev/null 2>&1 || [[ \"\$(node -v 2>/dev/null || true)\" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo mkdir -p '${APP_DIR}' '${DATA_DIR}'
sudo chown -R \"\$USER\":\"\$USER\" '${APP_DIR}' '${DATA_DIR}'

if [[ -d '${APP_DIR}/.git' ]]; then
  git -C '${APP_DIR}' remote set-url origin '${REPO_URL}'
  git -C '${APP_DIR}' fetch origin
  git -C '${APP_DIR}' checkout '${BRANCH}'
  git -C '${APP_DIR}' pull --ff-only origin '${BRANCH}'
else
  rm -rf '${APP_DIR}'
  git clone --branch '${BRANCH}' '${REPO_URL}' '${APP_DIR}'
fi

cd '${APP_DIR}'
npm install
npm run build

tmp_service=\"\$(mktemp)\"
sed \"s/DEPLOY_USER/\$USER/\" ops/systemd/weather-starter.service.example > \"\$tmp_service\"
sed -i \"s|Environment=PORT=3000|Environment=PORT=${PORT}|\" \"\$tmp_service\"
sed -i \"s|Environment=HOST=127.0.0.1|Environment=HOST=${HOST}|\" \"\$tmp_service\"
sed -i \"s|Environment=DATABASE_PATH=/var/lib/weather-starter/weather.db|Environment=DATABASE_PATH=${DATA_DIR}/weather.db|\" \"\$tmp_service\"
sudo cp \"\$tmp_service\" /etc/systemd/system/weather-starter.service
rm -f \"\$tmp_service\"

tmp_caddy=\"\$(mktemp)\"
if [[ -n '${DOMAIN}' ]]; then
  cat > \"\$tmp_caddy\" <<EOF
${DOMAIN} {
  encode gzip zstd
  reverse_proxy 127.0.0.1:${PORT}
}

:80 {
  encode gzip zstd
  reverse_proxy 127.0.0.1:${PORT}
}
EOF
else
  cat > \"\$tmp_caddy\" <<EOF
:80 {
  encode gzip zstd
  reverse_proxy 127.0.0.1:${PORT}
}
EOF
fi
sudo cp \"\$tmp_caddy\" /etc/caddy/Caddyfile
rm -f \"\$tmp_caddy\"

sudo systemctl daemon-reload
sudo systemctl enable --now weather-starter
sudo systemctl enable --now caddy
sudo systemctl reload caddy

echo
echo 'Bootstrap complete.'
echo 'Health check:'
curl -fsS \"http://127.0.0.1:${PORT}/health\" || true
"

echo "Bootstrapping instance ${INSTANCE_NAME}..."
gcloud compute ssh "${INSTANCE_NAME}" \
  --project "${PROJECT_ID}" \
  --zone "${ZONE}" \
  --command "${REMOTE_CMD}"

EXTERNAL_IP="$(gcloud compute instances describe "${INSTANCE_NAME}" \
  --zone "${ZONE}" \
  --project "${PROJECT_ID}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo
echo "Done. Try:"
echo "  curl http://${EXTERNAL_IP}/health"