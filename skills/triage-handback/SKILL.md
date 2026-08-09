---
name: triage-handback
description: Turn raw suite results into THE one pasteable handback block - flake classification, dedup, bisection, MISSING/UNTESTABLE merge, honesty footer. Printing the block ends the turn.
---

# triage-handback (§6–§7)

Formatter does the mechanics (flake≠green, flap counting, dedup by error signature,
baseline bisection, pending-entry merge, footer, baseline/quarantine updates):

```
cd tests/e2e && node harness/handback.mjs --turn <n>
```

## Your judgment before printing
Review `state/last-handback.md` and improve ONLY these, without breaking format:
1. **Symptom quality**: each FAILING entry's "Tested/Expected/Actual" must be readable
   by someone who has never seen the suite. Rewrite raw assertion text into behavior
   terms. NEVER add file paths, stack frames, or cause guesses (FR-U8) — if the error
   text contains app file paths, strip them.
2. **Dedup quality**: the signature-based grouping is mechanical; merge groups that are
   obviously the same root symptom (e.g. every cart case failing with the same 500).
   State "N further case(s) collapsed" honestly.
3. **Expected vs actual**: fill the Expected line from the case's oracle (what the PRD
   says / what relation broke), not "assertion failed".

## Environment / reproducibility entries (ENV — structured, usually Coder-owned)
Some blockers are not app-behavior failures AND not ops mistakes a human fixes by starting
a service — they are **reproducibility defects that need a code/schema change**: finite seed
state that never resets, no `TEST_CLOCK`, non-deterministic ordering, a missing test hook.
These MUST reach the Coding Agent as a structured item, never buried in prose.

Emit an `### ENVIRONMENT (N)` section **above** `FAILING` (it can invalidate the run). Each entry:
- **Symptom** — the observable drift, in behavior terms (e.g. "product stock is never
  restored between runs; after repeated checkout runs every product reaches stock 0").
- **Impact** — which flows/cases become non-reproducible or falsely red because of it.
- **Requirement** — the capability the app/environment must provide, stated as a contract
  ("expose a reset that restores the fingerprinted seed baseline before each suite run"),
  NOT an app-file or cause attribution — the Coder still does attribution.
- **Owner** — `Coder` (needs code/schema: a reset endpoint/script/migration/test hook) or
  `Human` (pure ops: start the service, supply creds).

Record each ENV entry in `state/pending-entries.json` (type `env`, with `owner`) so it
survives to the next session and the formatter can re-merge it; render it in the block.
When an ENV blocker **invalidated** results, the green is **BLOCKED** — say so, and do NOT
list the consequent failures (e.g. stock-exhaustion reds) as app defects: they are symptoms
of the ENV blocker and are deduped under it.

## Unexpected UI surface (Human intervention)
Controls the crawl found that the PRD never mentions arrive from `ui-map` in
`state/pending-entries.json` (type `unexpected-surface`). Merge them into a
`### HUMAN INTERVENTION MIGHT BE NEEDED (N)` section, one line each: the control (behavior
terms) + "present in app, absent from PRD — confirm intent". These are neither pass nor
defect — nothing is assumed correct or incorrect; a human/PRD decides.

Then print the final block as your message — the whole block, nothing else around it.

## Hard rules
- A `@determinism:race` case that fails on *some* trials is a **failing-defect
  (data-integrity)**, never a flake — the invariant does not hold under some interleaving.
- ONE block per turn, all entry types together (HB-1). No drip-feeding.
- A retry-pass is `flaky` and never appears as green anywhere (FR-T7).
- The footer is one line and always present (HB-4).
- An **ENV blocker that invalidated the run blocks the green** (like an escaped canary);
  consequent failures are deduped under it, never relabeled as app defects.
- After printing: **STOP. The turn is over.** The human carries the block to Coder.
