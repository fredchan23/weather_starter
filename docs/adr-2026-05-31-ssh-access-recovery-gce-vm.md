# ADR 2026-05-31: SSH Access Recovery for `weather-starter-vm`

## Status

Accepted and implemented.

## Context

On 2026-05-31, SSH access to the GCE instance `weather-starter-vm` in project `automatic-ace-488412-a7` became unavailable.

Observed behavior:

- `gcloud compute ssh weather-starter-vm --zone us-central1-a` failed with non-zero exit status.
- Instance was present and `RUNNING`.
- Firewall had `default-allow-ssh` (`tcp:22` from `0.0.0.0/0`).
- IAM and project metadata checks did not report missing permissions.

This blocked routine operations (bootstrap/redeploy/service debugging) that depend on VM shell access.

## Decision

Use a structured incident flow that separates path-level issues from guest-level SSH service issues, then recover with a temporary startup-script repair.

Chosen recovery sequence:

1. Validate control plane and network path.
2. Reproduce with verbose direct SSH and IAP SSH.
3. Inspect serial console logs to identify guest-side symptoms.
4. Apply temporary startup script to (re)install and enable `openssh-server`.
5. Reset VM so startup script runs.
6. Verify SSH success and `ssh` service active.
7. Remove temporary startup metadata to keep boot path clean.

## Diagnostic Timeline

### 1. Baseline checks

- Confirmed active account/project and SDK health.
- Confirmed instance exists and is `RUNNING` in `us-central1-a`.
- Confirmed SSH ingress rule exists (`default-allow-ssh`).

Conclusion: no obvious project/zone mismatch, no obvious firewall denial.

### 2. Troubleshoot checks

`gcloud compute ssh ... --troubleshoot` reported:

- Connectivity forward path: `REACHABLE`
- Connectivity return path: `REACHABLE`
- User permissions: `0 issue(s)`
- VPC settings: `0 issue(s)`
- VM status/boot checks: `0 issue(s)`

Conclusion: control-plane tests were green, but this does not guarantee healthy `sshd` behavior inside the guest.

### 3. Real SSH client behavior

Direct verbose SSH:

- TCP connect to `34.60.122.241:22` succeeded.
- Failure: `Connection timed out during banner exchange`.

IAP SSH also failed with the same banner-exchange timeout.

Conclusion: issue was not local network path or public-IP routing. The guest was reachable but not providing a valid SSH handshake.

### 4. Guest diagnostics

Serial logs showed normal boot and system activity but inconsistent/absent `ssh.service` readiness signal during the failing window.

After VM reset, symptom changed to `connection refused` on port 22.

Conclusion: guest SSH daemon was not reliably listening/responding.

## Recovery Implementation

Applied temporary instance metadata startup script:

```bash
#!/bin/bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update || true
apt-get install -y openssh-server || true
systemctl unmask ssh || true
systemctl enable ssh || true
systemctl restart ssh || systemctl start ssh || true
```

Actions executed:

1. `gcloud compute instances add-metadata ... --metadata=startup-script=...`
2. `gcloud compute instances reset ...`
3. Verify: `gcloud compute ssh ... --command 'echo SSH_OK && systemctl is-active ssh || true'`
4. Cleanup: `gcloud compute instances remove-metadata ... --keys startup-script`
5. Final verify: `gcloud compute ssh ... --command 'echo SSH_STILL_OK'`

## Outcome

- SSH access restored.
- `systemctl is-active ssh` returned `active`.
- Subsequent SSH command succeeded after cleanup.

## Consequences

Positive:

- Access was restored quickly without VM recreation.
- Existing application state and data were preserved.
- Recovery path is repeatable for similar incidents.

Trade-offs:

- Root trigger of `sshd` degradation was not conclusively proven from available logs.
- Startup-script remediation is pragmatic but should not remain permanently attached for every boot.

## Follow-up Actions

1. Add a lightweight VM health check in ops runbook: verify `sshd` active plus `/health` endpoint.
2. Capture and retain guest journal snapshots around future incidents for stronger root-cause analysis.
3. Consider adding alerting for repeated SSH failures or guest agent anomalies.
4. Optionally snapshot disk now that VM is in recovered state.

## Related Resources

- `docs/compute_engine.md`
- `scripts/gcp/provision-vm.sh`
- `scripts/gcp/bootstrap-vm.sh`
- `scripts/gcp/redeploy-vm.sh`
