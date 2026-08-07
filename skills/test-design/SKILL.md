---
name: test-design
description: The engine's brain - fill the mandatory case grid for an implemented flow, assign oracle provenance per assertion, choose metamorphic relations, author fault plans and PRNG variant generators. Output goes to the Case Model.
---

# test-design (the brain, design time only)

Input: one implemented flow + its capability-inventory entries. Output: cases appended
to `tests/e2e/state/case-model.json` (schema: ultra_design.md §3.3) + a fault plan in
`tests/e2e/state/fault-plans/<flow>.json`.

## The mandatory technique rubric (completeness is forced, not remembered)
Every flow fills ONE cell per technique below. Each cell is **Filled** (≥1 case) or
**Waived** (one-line justification in `residual`) — never blank. Record the rubric as a
matrix in `case-model.json` per flow: `{ cell, status: filled|waived, caseIds[], reason? }`.

1. **happy** — nominal success path.
2. **boundary (BVA)** — on/off points of every quantitative field (exact, +1, 0, −1, max, non-numeric).
3. **partition** — one representative per equivalence class of each input.
4. **pairwise** — covering array over the flow's factors (enumerate the factors explicitly).
5. **metamorphic** — ≥1 metamorphic relation (e.g. add(2)+add(3) ≡ add(5)).
6. **invariant** — ≥1 global property (conservation, monotonicity, total==Σ lines, no-negative-stock).
7. **auth-matrix** — every endpoint × {no session, expired, **other-user's** session}.
8. **malformed / abuse** — missing / wrong-type / extra / oversized payloads; crash-class (O3: no 5xx/blank/dead spinner/console error).
9. **concurrency** — for EVERY PRD-implied serialization point, ≥1 *true simultaneous*
   race AND ≥2 distinct **interleaving shapes** (S1–S5, see `race-hunter`). A
   **sequential-only** case does NOT fill this cell — record `status: under-covered` and
   queue the missing simultaneous variant. **Suspicious-pass escalation:** when an
   edge-cell *sequential* guard is admitted green (e.g. `checkout.double-submit`), confirm
   the matching simultaneous variant exists here; if absent → flag under-covered (a green
   easy case is evidence the hard case is worth writing, not that it is covered).
   **Mid-flight mutation (S5):** every read-then-write endpoint gets a case that races a
   state change into its TOCTOU window (e.g. stock hits 0 at the click instant).
10. **completeness / quantifier** — universal set/count oracle for any list/filter/search output (see below).

### Completeness oracles are UNIVERSAL, not existential
Any endpoint returning a collection gets a **set-equality** oracle: the returned set
deep-equals the DB-derived qualifying set (same members, same count, same key-field values).
Never sample ("one present, one absent") — that passes a drop-one/dup bug. Where a flow has
both API and UI, run the count/set oracle at **both** altitudes and require
UI count == API count == DB count (cross-altitude triangulation). These oracles are only
non-vacuous once sensitivity-prove verifies universal falsifiability (drop-one fault).

### UI-interaction cells (only when capability-inventory `surfaces` includes `ui`)
For flows with a UI surface, fill these additional cells, fed by `ui-interaction-hunter`
reading `state/ui-surface/<flow>.json` (from the `ui-map` skill):
- **ui-happy** — each PRD-defined control's nominal interaction reaches its expected
  consequence.
- **ui-state** — the disabled / empty / loading / error states the PRD specifies.
- **ui-consequence-altitude** — every UI action asserts its consequence at the **strongest
  applicable altitude** (api/db/race); UI-only is allowed ONLY when nothing deeper is
  observable.
Record a per-flow **altitude budget** ledger `{ uiOnly, api, db, race }` in the rubric
matrix. A UI action with an observable backend consequence left `uiOnly` is an
under-coverage flag (surfaced in trust-report, not a hard block). A control the crawl found
but the PRD never mentions is NOT a case here — ui-map routes it to `pending-entries.json`
labeled "Human intervention might be needed".

## Oracle assignment (per load-bearing assertion, FR-T1)
Prefer the strongest level that genuinely applies:
- **O1**: expected value derivable from PRD/schema — compute it from the source, cite it.
- **O2**: pick relations agentically (settled ex-OQ-T1): round-trip, inverse,
  conservation, idempotency, order-independence, cross-surface, authz-symmetry.
  Scope every conservation relation to the test's own Tier-3 user.
  **If you are not certain the relation must hold, do not assert it** — file the case
  as `unverified-O5` instead. Never freeze "what I saw" as truth (O5 never passes).
- **O3/O4** for invariants and surface agreement.
A test's trust level = its weakest load-bearing oracle.

## Variants (the hands)
For boundary/adversarial cells, define a generator + frozen seed
(`variants: { seed, generator, count }`). spec-author materializes it with
`variantTable()` — same seed ⇒ same inputs, every run, every machine.

## Fault plan (feeds sensitivity-prove, ex-OQ-T2 taxonomy)
One planted fault per load-bearing assertion:
O1 → wrong constant (off-by-one / wrong enum). O2 → break the relation delta (+2 for +1).
O4 → flip one side. **Completeness/∀ → drop-one**: the fault removes a randomly chosen
qualifying element (or injects an extra) from the expected set — NOT a co-authored constant;
the assertion must go red for ANY dropped element (universal falsifiability, coordinate with
sensitivity-prove). Each entry: `{ id, spec, grep, find, replace, case, assertion, kind }`
where `find` is a unique string in the future spec (coordinate with spec-author) and `kind`
is one of `constant|relation|flip|drop-one`.

Time-relevant cases: tag `@time` and set the manifest clock; if the behavior depends on
*backend* time and the app has no TEST_CLOCK support, the case goes to residual (honest
limit) — do not fake it.

## Fan-out to case-hunter subagents (fill the rubric in parallel)
Do not fill the rubric single-handed — a generalist regresses to the happy path. For each
implemented flow, spawn the lens-based case-hunters (`.claude/agents/*-hunter.md`) via the
Agent tool, in parallel, each owning its cells:

- `boundary-hunter` → boundary · partition
- `pairwise-hunter` → pairwise (covering array + factor list)
- `quantifier-hunter` → completeness (universal set/count, cross-altitude)
- `metamorphic-invariant-hunter` → metamorphic · invariant
- `abuse-authz-hunter` → auth-matrix · malformed/abuse
- `race-hunter` → concurrency
- `blindspot-hunter` → cases the implementer likely missed (reasons from PRD only)
- `edge-case-hunter` → weird production-realistic edge cases on the uncovered frontier
  (reads the coverage ledgers + residual to target only genuine gaps)
- `ui-interaction-hunter` → ui-happy · ui-state · ui-consequence-altitude (only for flows
  with a UI surface; reads `state/ui-surface/<flow>.json`, delegates any serialization-point
  UI action — e.g. double-click Place Order — to race-hunter's S-shapes)

Give each hunter: the flow's capability-inventory entries + `domainModel` (from prd-map),
NOT app code. Collect candidates, **dedup by (cell, oracle assertion)**, then YOU (the
brain) assign final oracle provenance, author the fault plan (incl. drop-one for
completeness), and hand to spec-author. Every candidate still passes sensitivity-prove and
determinism-gate before admission — a hunter proposes, the gates dispose.

### Candidate-case contract (hunter → test-design)
Each hunter returns a JSON array; each item:
`{ flow, cell, description, factors?, inputs, oracle: { level, provenance, assertion },
faultToPlant: { kind, note }, interleaving?: { shapes: ["S1".."S5"], trials },
consequenceCheck?: { ui?, api?, db?, race? } }`. `interleaving` is required for concurrency
cells (default `trials: 5`); `consequenceCheck` + an `altitude` accompany UI cells.
`provenance` cites an expanded-PRD ref **with its tag** (`[PRD §x]` and `[PRIOR fN §x]` =
O1-eligible; `[INFERRED]`/`[INFERRED-FLOW]`/`[JOURNEY-GAP]` = weaker, not O1) or a DB
cross-surface query; `assertion` is symptom-level (behavior, no app files). Vague or observation-frozen
candidates (O5) are allowed but flagged — the brain decides admit/residual.
