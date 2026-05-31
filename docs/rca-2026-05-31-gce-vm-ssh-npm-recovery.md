# RCA 2026-05-31: GCE VM SSH Instability and npm Install Failures

## Incident Summary

On 2026-05-31, operations on `weather-starter-vm` (GCE `e2-micro`) were disrupted by two coupled issues:

1. Intermittent SSH failures (`banner exchange timeout` and later `connection refused`).
2. `npm install`/`npm ci` instability, including an `ENOTEMPTY` rename error and perceived hangs.

The service on the VM was eventually restored and verified healthy.

## Impact

- Could not reliably SSH into the VM for deployment and debugging.
- Dependency installation failed and retried with partial state in `node_modules`.
- `weather-starter.service` entered restart loops while build artifacts were missing, increasing CPU churn on a small VM and worsening responsiveness.

## Detection

Primary indicators observed:

- SSH command failures:
  - `Connection timed out during banner exchange`
  - `ssh: connect to host ... port 22: Connection refused`
- npm failure:
  - `ENOTEMPTY: directory not empty, rename '/opt/weather-starter/node_modules/anymatch' -> '/opt/weather-starter/node_modules/.anymatch-...'`
- journal logs for app service:
  - `Error: Cannot find module '/opt/weather-starter/backend/dist/server.js'`
  - repeated systemd restart attempts for `weather-starter.service`.

## Timeline (UTC)

1. SSH degraded despite VM being `RUNNING` and firewall allowing `tcp:22`.
2. `gcloud compute ssh --troubleshoot` reported network/IAM/VPC checks as healthy.
3. Direct and IAP SSH both showed banner timeout, pointing to guest-side `sshd` behavior.
4. Temporary startup script applied to reinstall/enable SSH service; VM reset; SSH restored.
5. During dependency install, npm reported `ENOTEMPTY` on `anymatch` rename in `node_modules`.
6. Corrupted package directories removed and npm cache verified.
7. Deterministic reinstall (`npm ci`) completed successfully.
8. Build succeeded (`npm run build`).
9. Service restarted and reached active state; health endpoint returned healthy.

## Root Cause Analysis

### Primary Root Cause

The VM experienced guest-level instability under constrained resources (`e2-micro`) while app service and package installation tasks overlapped, leading to:

- inconsistent SSH daemon responsiveness,
- interrupted filesystem operations under `node_modules`, causing npm rename collisions (`ENOTEMPTY`),
- and elevated system load from app restart loops.

### Contributing Factors

1. Very small memory footprint for concurrent Node.js workload and package extraction.
2. `weather-starter.service` restart loop when `backend/dist/server.js` was absent, consuming CPU cycles during recovery.
3. Residual partial package state after failed npm operations (`anymatch` directory and temp rename target).
4. Operational race: install/build activity and service start expectations were not strictly serialized.

### Not Determined

A single deterministic low-level trigger for the initial SSH banner timeout was not proven from available logs; evidence supports resource-pressure and guest state degradation rather than network policy misconfiguration.

## What Was Verified as Not Root Cause

- Project/zone mismatch: no.
- Firewall block on SSH: no (`default-allow-ssh` present).
- IAM permission deficiency for SSH troubleshooting path: no.
- Public network path reachability in connectivity tests: reachable.

## Recovery Actions Performed

1. Applied temporary startup script to restore SSH service and stabilize memory pressure (including swap setup).
2. Reset VM to execute startup script.
3. Confirmed SSH access recovered and `ssh` service active.
4. Stopped and reset failed `weather-starter.service` state to remove restart churn during install.
5. Removed problematic package directories:
   - `/opt/weather-starter/node_modules/anymatch`
   - `/opt/weather-starter/node_modules/.anymatch-*`
6. Verified npm cache integrity (`npm cache verify`).
7. Reinstalled dependencies deterministically (`npm ci --no-audit --no-fund --prefer-offline`).
8. Rebuilt application (`npm run build`).
9. Restarted service and validated listener on `127.0.0.1:3000`.
10. Verified health endpoint: `{"status":"healthy"}`.
11. Removed temporary startup metadata after stabilization.

## Final State

- SSH access: working.
- Dependency install: successful.
- App service: active and running.
- Backend health endpoint: healthy.

## Preventive and Corrective Actions

### Immediate Operational Guardrails

1. Keep `weather-starter.service` stopped during dependency install/build operations; start only after successful build.
2. Prefer `npm ci` over `npm install` on deployment hosts to reduce lockfile drift and partial tree mutations.
3. On npm rename/corruption errors, remove only affected package directories and retry before full `node_modules` deletion.

### VM Stability Improvements

1. Maintain swap on low-memory VM and verify at boot.
2. Consider moving from `e2-micro` to a larger machine class if frequent builds occur on-host.
3. Add lightweight runbook checks before deploy:
   - `systemctl is-active ssh`
   - `systemctl is-active weather-starter`
   - `curl http://127.0.0.1:3000/health`

### Service Hardening

1. Prevent aggressive restart loops during known maintenance windows.
2. Add explicit deploy sequence in runbook:
   - stop service -> install deps -> build -> start service -> health check.

## Runbook Snippets

### Clean partial npm package state

```bash
cd /opt/weather-starter
rm -rf node_modules/anymatch node_modules/.anymatch-*
npm cache verify
npm ci --no-audit --no-fund --prefer-offline
```

### Safe deploy order on constrained VM

```bash
sudo systemctl stop weather-starter
cd /opt/weather-starter
npm ci --no-audit --no-fund --prefer-offline
npm run build
sudo systemctl start weather-starter
curl -fsS http://127.0.0.1:3000/health
```

## Related Documents

- `docs/adr-2026-05-31-ssh-access-recovery-gce-vm.md`
- `docs/compute_engine.md`
