#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-automatic-ace-488412-a7}"
INSTANCE_NAME="${INSTANCE_NAME:-weather-starter-vm}"
ZONE="${ZONE:-us-central1-a}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/weather-starter}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud

REMOTE_CMD="
set -euo pipefail
cd '${APP_DIR}'
git fetch origin
git checkout '${BRANCH}'
git pull --ff-only origin '${BRANCH}'
npm install
npm run build
sudo systemctl restart weather-starter
sudo systemctl status weather-starter --no-pager
"

echo "Redeploying ${INSTANCE_NAME} from branch ${BRANCH}..."
gcloud compute ssh "${INSTANCE_NAME}" \
  --project "${PROJECT_ID}" \
  --zone "${ZONE}" \
  --command "${REMOTE_CMD}"

EXTERNAL_IP="$(gcloud compute instances describe "${INSTANCE_NAME}" \
  --zone "${ZONE}" \
  --project "${PROJECT_ID}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo
echo "Redeploy complete. Verify:"
echo "  curl http://${EXTERNAL_IP}/health"