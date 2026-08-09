---
name: impl-audit
description: Match the capability inventory against the app code (read-only) to produce the implementation matrix, MISSING entries, and the change-impact set from git diff. Runs every turn (cheap path) or fully after prd-map.
---

# impl-audit

Glass-box reading, black-box reporting (FR-U8): you MAY read app source and git history
here; the `evidence` you record is Tester-internal and must NEVER surface in a handback.

Output: `tests/e2e/state/implementation-matrix.json` (schema: ultra_design.md §3.2)
+ MISSING entries queued into `tests/e2e/state/pending-entries.json`.

## Full audit (only when the PRD is new/changed — FR-U9 cadence)
1. For each flow in the capability inventory, look for real surfaces: routes/controllers,
   pages/components, schema tables. Record what you found as `evidence`.
2. **Binary status — no "partial".** If *any* meaningful surface of the flow exists,
   status = `implemented` (its gaps will fail tests; the failures carry the signal).
   Only a flow with *no* surface is `missing`.
3. For each `missing` flow, queue a MISSING entry:
   `{ "flow": "...", "criterion": "AC-x", "expected": "<capability in PRD terms>" }`
   — behavior words only, no file names.
4. **Reconcile `surfaces` against what you actually found (hard rule).**
   `capability-inventory.json`'s `surfaces` field is set by `prd-map` from PRD text alone
   — PRD text reliably describes backend behavior but routinely omits mentioning that a
   frontend page exists for a flow. If step 1 finds a real page/component bound to a flow
   whose `surfaces` doesn't list `ui` (or a schema table it doesn't list `db`, etc.), **patch
   `capability-inventory.json`'s `surfaces` array for that flow to include it** before
   writing the implementation matrix. This is a factual correction (glass-box evidence),
   not a test-design decision — `test-design`'s UI rubric cells are hard-gated on this
   field, so a missed correction here silently and permanently skips UI testing for that
   flow. Note the correction in `evidence` so it's visible why the tag changed.

## Cheap path (every other turn)
1. `git diff --stat <implementation-matrix.commit>..HEAD` (app repo, read-only).
2. Map changed paths to flows (via the evidence recorded at the last full audit) →
   `changeImpact.affectedFlows`. **Bias to inclusion**: if a change can't be proven
   irrelevant to a flow, include the flow.
3. Invalidate checkpoints of affected flows (delete their `state.hash` files under
   `tests/e2e/checkpoints/<flow>/`).
4. Update `commit` to current HEAD.

Never modify app code. Never report "partially implemented" — it is not a status.
