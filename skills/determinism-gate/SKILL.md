---
name: determinism-gate
description: Run the four-phase determinism gate (repeat/shuffle/clock/hermetic) on sensitivity-proven specs. Admit into the trusted suite or quarantine. Also handles quarantine re-entry counting.
---

# determinism-gate (admission, §9 / FR-T4)

Runner does the mechanics (K=3 repeats, shuffled full-suite order, clock boundaries for
`@time` cases, hermetic container when E2E_HERMETIC=1):

```
cd tests/e2e && node harness/gate.mjs flows/<flow>/<spec>.spec.ts
```

Exit 0 = ADMIT, 1 = QUARANTINE. Report: `state/gate-reports/<spec>.json`.

## Your judgment
- **ADMIT** → set `status: "admitted"` + copy the phase results into the case's
  `determinism` block in `state/case-model.json`.
- **QUARANTINE** → set `status: "quarantined"`, add the case to
  `state/quarantine.json` (`flaps: 1, cleanRuns: 0, needed: 5`). Diagnose which phase
  failed and whether it's a *test* defect (fix via spec-author: unseeded randomness,
  time dependency, cross-test state) or an *app* nondeterminism (that is a FAILING
  symptom — hand it back, report-don't-heal).
- **Race specs (`@determinism:race`)** — these encode their own repeat loop
  (`raceTrials`, default 5) and assert the invariant on every trial. Intermittent failure
  here is **APP nondeterminism = a FAILING symptom → hand back as a failing-defect**, NOT a
  flake to quarantine (the invariant genuinely does not hold under some interleaving). Only
  quarantine a race spec when the *test itself* is nondeterministic (unseeded data,
  cross-test state) — never when the app's invariant is what breaks.
- **Hermetic waived** (no E2E_HERMETIC): acceptable locally; the phase is recorded as
  waived, and the trust-report must show it — never silently treat waived as passed.

## Quarantine re-entry (FR-T7)
A quarantined spec re-enters only after K=5 consecutive clean gate runs:
each subsequent clean `gate.mjs` pass increments `cleanRuns`; any failure resets it to
0. At 5, remove from quarantine and set `status: "admitted"`.

Never commit a spec that has not been admitted. Never loosen a gate phase to make a
spec pass — that is exactly the false green this whole system exists to prevent.
