#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-automatic-ace-488412-a7}"
INSTANCE_NAME="${INSTANCE_NAME:-weather-starter-vm}"
ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-micro}"
DISK_SIZE_GB="${DISK_SIZE_GB:-30}"
FIREWALL_RULE="${FIREWALL_RULE:-allow-weather-starter-web}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command gcloud

echo "Using project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}" >/dev/null

if gcloud compute instances describe "${INSTANCE_NAME}" \
  --zone "${ZONE}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "VM ${INSTANCE_NAME} already exists in ${ZONE}; skipping creation."
else
  echo "Creating VM ${INSTANCE_NAME} in ${ZONE}..."
  gcloud compute instances create "${INSTANCE_NAME}" \
    --project="${PROJECT_ID}" \
    --zone="${ZONE}" \
    --machine-type="${MACHINE_TYPE}" \
    --network-interface=network-tier=PREMIUM,subnet=default \
    --maintenance-policy=MIGRATE \
    --provisioning-model=STANDARD \
    --create-disk="auto-delete=yes,boot=yes,device-name=${INSTANCE_NAME},image-family=debian-12,image-project=debian-cloud,mode=rw,size=${DISK_SIZE_GB},type=pd-standard" \
    --tags=http-server,https-server
fi

if gcloud compute firewall-rules describe "${FIREWALL_RULE}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Firewall rule ${FIREWALL_RULE} already exists; skipping creation."
else
  echo "Creating firewall rule ${FIREWALL_RULE} (tcp:80,tcp:443)..."
  gcloud compute firewall-rules create "${FIREWALL_RULE}" \
    --project="${PROJECT_ID}" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --target-tags=http-server,https-server
fi

EXTERNAL_IP="$(gcloud compute instances describe "${INSTANCE_NAME}" \
  --zone "${ZONE}" \
  --project "${PROJECT_ID}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

echo "Provisioning complete."
echo "Instance: ${INSTANCE_NAME}"
echo "Zone: ${ZONE}"
echo "External IP: ${EXTERNAL_IP}"
echo
echo "Next step: run scripts/gcp/bootstrap-vm.sh with REPO_URL set."