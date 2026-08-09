---
name: suite-run
description: Execute the admitted suite (targeted by change-impact or full), including canary self-test on full runs and checkpoint replay where valid. Produces results.json for triage.
---

# suite-run (execution, §12–§13)

## Choosing scope
- `changeImpact.affectedFlows` non-empty and all its flows have admitted specs →
  **targeted**: `npx playwright test flows/<flow-a> flows/<flow-b>`.
- New PRD, new flows, invalidated checkpoints everywhere, or human asked for full →
  **full**: `npx playwright test`.

## Procedure
1. Confirm `.env` exists; `npm run lint:bans` (a banned pattern anywhere blocks the run).
2. Run the suite (JSON report lands in `results.json` via the config).
   - `EnvironmentDriftError` from global-setup → STOP; the drift message is the turn's
     entire output. Do not interpret test results that don't exist.
3. **Full runs only:** `node harness/canary.mjs` — exit 1 means a known fault escaped:
   the suite itself is broken, the green is BLOCKED, and that fact leads the handback.
4. **Checkpoints:** where `checkpoints/<flow>/<step>/state.hash` exists and the flow is
   not in the invalidated set, downstream specs may start from the checkpoint's
   `setup.ts` (API-speed prefix). On the audit cadence (every 10th run of a flow —
   track `runCount` in the checkpoint dir), re-execute the full UI prefix and compare
   hashes; drift → delete `state.hash` (invalidate) and note it for the honesty footer.
5. Hand `results.json` to triage-handback. Do not classify or summarize results
   yourself — that is triage's job, with its flake and dedup rules.

Never re-run a failing test "to see if it passes" outside the configured retry — the
retry that exists is diagnostic, and a retry-pass will be reported flaky, not green.
