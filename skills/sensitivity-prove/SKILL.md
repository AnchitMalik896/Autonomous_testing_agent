---
name: sensitivity-prove
description: Prove every load-bearing assertion can fail by running the planted-fault harness against the flow's fault plan. Vacuous assertions are rejected, never committed.
---

# sensitivity-prove (test the test)

Input: `tests/e2e/state/fault-plans/<flow>.json` (authored by test-design, `find`
strings verified against the actual specs). Runner does the mechanics:

```
cd tests/e2e && node harness/sensitivity.mjs state/fault-plans/<flow>.json
```

The harness mutates a COPY of each spec (`*.sp-<id>.spec.ts`, auto-cleaned), runs just
the targeted test, and requires red. It writes proofs into the Case Model.

## Your judgment (the harness can't do this part)
- Before running: check each fault is *load-bearing* — it must falsify the assertion's
  meaning, not just break syntax. `toBe(1)`→`toBe(2)` is load-bearing;
  `toBe(1)`→`toBe(1 )` is noise.
- **Universal falsifiability (completeness/∀ oracles).** For any set/count/collection
  oracle the fault MUST be a `drop-one` (remove a randomly chosen qualifying element) or
  `add-one` (inject an extra) — never a co-authored constant. An assertion that survives
  drop-one is **existential, not universal**: it samples ("one present, one absent") and
  passes a real drop/dup bug. Mark it `rejected-existential` and send it back to
  test-design to rewrite as set-equality. A completeness oracle is only `proven` when
  drop-one AND add-one both go red.
- After running:
  - `proven` → nothing to do; proof is in the Case Model.
  - `VACUOUS` → the assertion cannot fail. **Reject the assertion** (the harness marks
    the case `rejected-vacuous`): rewrite it in test-design terms or drop the case to
    residual. Never weaken the fault to force a pass.
  - `find-string matched Nx` → make the fault's `find` unique (coordinate with the spec
    text) and re-run.

Exit 1 from the harness = at least one vacuous/errored fault. The flow may NOT proceed
to determinism-gate until every load-bearing assertion is `proven` (FR-T3).
