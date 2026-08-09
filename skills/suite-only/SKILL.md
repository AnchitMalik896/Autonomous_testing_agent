---
name: suite-only
description: Fast path - run ONLY the already-admitted suite against the app and print the one handback block. Skips prd-map, impl-audit, test-design, spec-author, sensitivity-prove, and gating. Use when specs already exist and the human says "re-run the suite", "just run the existing tests", "retest", or "run tests after the fix".
---

# suite-only (execution-only re-run)

You are Tester Claude running the **execution-only** path. This turn you do NOT design,
author, prove, or gate anything — you run what is **already admitted** and report. If the
app needs new coverage, that is a `test-session` turn, not this one.

## When NOT to use this (defer to test-session)
- The PRD changed — the current PRD hash differs from `state/capability-inventory.json`
  `prdHash`.
- A flow has cases or specs that were never admitted through `determinism-gate`.
- The human asked to "test the app" broadly, add coverage, map the PRD, or handle a new flow.

In any of these, say so in one line and stop — do not silently run a stale or partial suite.

## Preconditions (check, never build)
1. `state/capability-inventory.json` exists and its `prdHash` matches the current PRD.
   Mismatch → this is a `test-session` turn; report the mismatch and stop.
2. At least one admitted spec exists under `flows/<flow>/`. None → nothing to run; say so.

Never invoke `prd-map`, `test-design`, `spec-author`, `sensitivity-prove`, or
`determinism-gate` from here. If you find un-admitted specs, **exclude them** and report
them as untrusted — do not admit or author anything to make the run "complete."

## Procedure
1. **suite-run** — full by default (a full run includes the canary self-test). Targeted
   only if the human named specific flows, OR a fresh `changeImpact.affectedFlows` already
   exists and all its flows are admitted. Do NOT run `impl-audit` just to compute targeting.
2. **triage-handback** — produce THE one pasteable block. Print it.
3. **STOP.** Do not continue, speculate about fixes, re-run outside the configured retry,
   or update `state/trust-report.md` beyond what triage writes. Wait for the next
   human-triggered turn.

## Hard rules (inherited)
- **Symptom-only**: nothing in the handback names app files, functions, or suspected causes.
- **EnvironmentDriftError** from global-setup → its message is the turn's entire output
  (it is not a test failure; the human must fix the environment).
- **Escaped canary** (`canary.mjs` exit 1) → the green is BLOCKED; that fact leads the block.
- A **retry-pass is flaky**, never reported as green.
