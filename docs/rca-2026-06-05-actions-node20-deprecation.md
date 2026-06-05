# AAR 2026-06-05: GitHub Actions Node.js 20 Deprecation Warning on Deploy

## Incident Summary

A push to `main` triggered the `Deploy to GCP VM` workflow and surfaced a deprecation warning from the GitHub Actions runner. The `actions/checkout@v4` step ran on Node.js 20, which GitHub is retiring from hosted runners. The deploy completed successfully — this was a warning, not a hard failure — but it signals an imminent breaking change that required immediate remediation.

## Impact

- **Service impact:** None. The deploy step (`ssh` + `deploy-remote.sh`) is pure Bash and unaffected by the Node.js version of the checkout action. The VM received and applied the deployment normally.
- **CI pipeline health:** Yellow — the deprecation annotation appears on every run and will become a hard failure after June 16, 2026 (11 days from this incident).

## Detection

The GitHub Actions runner emitted the following annotation on the `Check out repository` step:

```
Node.js 20 actions are deprecated. The following actions are running on
Node.js 20 and may not work as expected: actions/checkout@v4. Actions will
be forced to run with Node.js 24 by default starting June 16th, 2026.
Node.js 20 will be removed from the runner on September 16th, 2026.
```

Source: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/

## Root Cause

`actions/checkout@v4` ships a Node.js 20 runner binary. GitHub is enforcing a version migration for all Actions:

| Date | Change |
|---|---|
| June 16, 2026 | Node.js 24 becomes the default runtime for all Actions |
| September 16, 2026 | Node.js 20 runner removed entirely — `@v4` would fail hard |

The workflow was last updated before this deprecation cycle began, so no version bump had been applied.

## Timeline (UTC, 2026-06-05)

1. Push `8e65d65` to `main` triggers `Deploy to GCP VM`.
2. Runner emits Node.js 20 deprecation annotation on `actions/checkout@v4`.
3. Deploy step completes successfully — no service disruption.
4. Deprecation acknowledged; fix applied to `.github/workflows/deploy-vm.yml`.

## Fix Applied

Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` to the `actions/checkout@v4` step. This is the opt-in mechanism documented by the GitHub Actions team to run the action under Node.js 24 immediately, without waiting for the June 16th forced migration.

```yaml
- name: Check out repository
  uses: actions/checkout@v4
  env:
    FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'
```

This silences the deprecation warning and ensures the step runs on Node.js 24 ahead of the forced cutover.

## Long-Term Remediation

`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is a bridge measure. The permanent fix is to pin `actions/checkout` to a version that ships a native Node.js 24 binary. Once a `@v5` (or a `@v4.x` patch) with Node.js 24 support is available and stable, update the workflow to remove the env var and pin to that version. Track at: https://github.com/actions/checkout/releases

## Lessons Learned

- **GitHub Actions version pins need a periodic refresh cadence.** A `@v4` pin that was correct in 2024 became a deprecation warning in 2026 with no local code change required to trigger it.
- **Deprecation warnings ≠ failures — but they have deadlines.** The 9-month runway (Sep 2025 → Sep 2026) is generous, but the June 16th "forced to Node.js 24" midpoint is a real breakage risk for workflows that don't set the opt-in flag.
- **The deploy step itself (SSH Bash) is runtime-agnostic.** Only the checkout action was affected. If the checkout step had failed hard, the deploy would have been blocked entirely despite the Bash deploy script being unrelated to Node.js.

## References

- `.github/workflows/deploy-vm.yml` — fix applied
- [GitHub blog: deprecation of Node.js 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
