---
name: trust-report
description: Compute the session-level Trust Report - oracle-strength matrix, suite-trust metrics, diagnostics, residual. Never a single completeness number.
---

# trust-report (§14 / FR-T10)

Output: `tests/e2e/state/trust-report.md`. Compute everything from the ledgers
(`case-model.json`, `quarantine.json`, `state/gate-reports/`, `canary-report.json`,
`baseline.json`) — deterministic aggregation, no re-running.

## Required sections
1. **Detection band** — a band (e.g. "~90–95% functional-defect detection for covered
   flows"), stated as an estimate with its basis. NEVER "X% complete" or "correct".
2. **Per-flow oracle-strength matrix** — assertion counts at O1/O2/O3/O4/O5 per flow.
   A flow whose only oracles are O5 is labeled "characterized, pending verification".
2b. **Per-flow technique-rubric coverage** — for each flow, the 10 rubric cells (happy,
   boundary, partition, pairwise, metamorphic, invariant, auth-matrix, malformed,
   concurrency, completeness) as filled | waived, reading the rubric matrix from
   `case-model.json`. Every waived cell shows its one-line reason. A completeness cell
   marked `rejected-existential` (failed universal falsifiability) counts as a gap, not
   filled. This matrix is the visible proof that exhaustiveness was pursued, not assumed.
   **For every flow whose `capability-inventory.json` `surfaces` includes `ui`, add the 3
   UI cells (ui-happy, ui-state, ui-consequence-altitude) to this same matrix, filled |
   waived on the same terms.** An empty (neither filled nor waived) UI cell for a
   ui-surfaced flow is a gap to report explicitly by name every session — this is the
   mechanism that catches a flow being correctly tagged `ui` but never actually getting
   `ui-interaction-hunter` run against it.
3. **Suite-trust metrics** — % load-bearing assertions sensitivity-proven; gate pass
   rate (+ hermetic waived count, shown explicitly); flake rate & quarantine census;
   canary catch rate (must be 100% — anything else already blocked the green).
4. **Diagnostics (never headline)** — if coverage/mutation numbers exist, list them
   labeled "gap-finders, not confidence".
5. **Residual** — every known-untested case: empty grid cells with justification,
   O5-pending cases, backend-time cases without TEST_CLOCK, concurrency/scale/real
   third parties. This list is the honesty that makes the green believable.

## Wording rule (NFR-T3)
A green is reported as "passed N sensitivity-proven assertions across oracle levels
O1–O4, residual R" — never as "the system is correct". Keep the report under ~60 lines;
it is read by a human every session.
