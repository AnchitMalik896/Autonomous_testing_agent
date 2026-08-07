---
name: prd-expand
description: Derive a maximally detailed, provenance-tagged "expanded PRD" from the cumulative sequence of feature PRDs using generic domain reasoning. Emits explicit data constraints, ranked global invariants, crisp logical quantifiers, a roles/permission matrix, a cross-flow shared-state map, and per-flow Given/When/Then acceptance criteria with pre/postconditions — so downstream prd-map/ui-map/hunters and the Coding Agent can build and test reliably. Runs a journey-coherence pass for missing companion flows. Human-gated. Run when a feature PRD is new or its hash changed.
---

# prd-expand (feature PRDs → maximally detailed expanded PRD)

Input: the **sequence of feature PRDs** (`feature1.prd`, `feature2.prd`, … up to the current
one; ask the human for the paths/convention if unknown). Nothing else — **no app code, no
crawl.** Output: a single reviewable doc `docs/expanded-prd.md`.

Runs **before `prd-map`**. Once a human approves it, the entire downstream pipeline
(`prd-map`, `ui-map`, every case-hunter) consumes the expanded PRD instead of the raw PRDs.
This is "use the PRDs to derive a **better, complete, testable** PRD and run the whole flow on
that." The bar: a competent Coding Agent could **build** the product and a tester could
**verify** it from this doc alone, without guessing.

## Prime directive — detail is the product
A terse PRD produces thin coverage. This skill's job is to turn terse wording into a document
where **every behavior is explicit, quantified, and bindable to an oracle.** Prefer over-
specification (tagged + gated) to silence. If you find yourself writing a vague verb
("handles", "manages", "supports"), stop and replace it with a state transition, a quantifier,
or a Given/When/Then. When unsure between two policies, **state a default, tag it `[INFERRED]`,
and gate it** — never leave it implicit.

## Authority model (hard rule)
- **Feature PRDs are additive and cumulative.** The oracle is the **union of all feature
  PRDs**, minus anything a later PRD **explicitly deprecates**. A prior-feature requirement
  stays **binding** unless explicitly deprecated — prior PRDs are NOT "context only".
- **Deprecation must be explicit.** Silence in a later PRD never removes a prior requirement;
  only an explicit deprecation/removal statement does. On a genuine conflict, the **later**
  PRD supersedes the earlier one.
- The expander may add detail beyond literal wording, but every added claim is
  provenance-tagged and gated. Inferences are **explicit and gated**, never silently promoted.
- **Never read app code; never crawl the running app.** Nothing the app *does* may leak into
  what it *should* do (same discipline as `prd-map`).

## Provenance tags (hard rule)
Every non-trivial statement is tagged inline:
- `[PRD §x]` — restates / derives directly from the **current** feature PRD (section ref).
- `[PRIOR fN §x]` — a requirement carried from an earlier feature PRD. **Binding** (unless a
  later PRD explicitly deprecated it) — treated exactly like `[PRD]` downstream, O1-eligible.
- `[INFERRED]` — detail added by generic domain reasoning. Reviewed at the human gate.

Journey-pass / gate section tags:
- `[INFERRED-FLOW]` — a whole drafted flow the PRDs omitted (hard-tier gap), gated.
- `[JOURNEY-GAP]` — a named missing leg with rationale, no drafted behavior (soft-tier).
- `[SCOPE-EXCLUDED §x]` — an obvious leg a PRD explicitly ruled out of bounds (not a defect).

Downstream oracle grading: `[PRD §x]` and `[PRIOR fN §x]` are **O1-eligible**;
`[INFERRED]` / `[INFERRED-FLOW]` / `[JOURNEY-GAP]` are weaker and never treated as PRD-derived
truth until a human approves them. Approval turns an inferred statement, a journey-gap flow, or
a **policy default** into a real requirement (per-assertion oracle strength is still graded
normally).

## Analysis method (how to reach the required detail)
Reason like a specification review panel before writing. For each feature and the product as a
whole, ask and then **encode the answer** into the doc:
1. **Who acts?** Enumerate actors/roles; for each capability state both what they *may* and
   *may not* do (forbidden actions are testable). → §1 roles matrix.
2. **What is the domain?** For every entity/field pin down type, range, enum, nullability,
   uniqueness, default, normalization, and foreign keys. → §2 data dictionary.
3. **What must never break?** Derive system-wide invariants (money conservation, no oversell,
   atomicity, tenant isolation, no-5xx-on-bad-input, idempotency of retried mutations). Rank by
   business blast radius; name the failure each catches and the altitude to check it. → §3.
   Collect **every** failure response into one **canonical error catalog** (HTTP status × body
   code × trigger × flow) so no error path is defined twice or forgotten. → §3.11.
4. **What is universally true over collections?** Turn every list/filter/aggregate into a
   crisp `∀ / ∃ / Σ` statement (completeness + conservation oracles). → §4.
5. **How do flows couple?** Build the flow dependency DAG, a shared-mutable-state reader/writer
   table (where cross-flow bugs live), and **formal state-machine transition tables**
   (state × event × guard → next state, effect) for every stateful entity. → §5. Wherever the
   PRD implies serialization (stock decrement, unique constraints, single-session, cart upsert,
   retried mutations), add a **serialization-points table** (§5.4): contention point × breaking
   interleaving × required outcome under any interleaving × invariant.
6. **What did the PRD leave open?** Surface each underspecified business decision, propose a
   **default**, tag `[INFERRED]`, and gate it. → §6 policy defaults.
7. **What is each flow, exactly?** For every flow write actor/goal, preconditions,
   numbered main-success-sequence, postconditions (success guarantee) + minimal guarantee on
   failure, state machine, **Given/When/Then acceptance criteria with stable IDs**, an
   error/edge table (with named boundaries), request/response data shapes, and — for UI
   surfaces — a UI-element inventory (control, selector/role, states, consequence). For any flow
   with numeric boundaries or aggregates, add a **worked-example table** (Adzic spec-by-example:
   concrete inputs → concrete result) that mechanizes test generation. → §7.
8. **Did I drop anything?** Build a **requirement traceability matrix** mapping every raw-PRD
   acceptance criterion / business rule to the expanded `AC-*`/`INV-*`/`Q*` that covers it —
   the completeness proof. → §9.

You may internally run `sc:business-panel` (business rules, roles, revenue-critical invariants,
underspecified decisions) and `sc:spec-panel` (Wiegers testability, Adzic examples, Cockburn
pre/postconditions, Nygard failure invariants, Crispin quantifiers) to pressure-test the draft.
Use them to find gaps; the **output is still one expanded PRD**, not a review transcript.

### Designed for its consumers (why each section must be complete)
Each section is the raw material for a specific downstream skill/hunter. A thin section starves
its consumer, so completeness here is non-negotiable:
| Expanded-PRD section | Primary consumer(s) | What they extract |
|---|---|---|
| §2 Data Dictionary (ranges, worked examples) | `boundary-hunter`, `pairwise-hunter` | BVA/equivalence partitions, input factors |
| §3 Global Invariants + §3.11 error catalog | `metamorphic-invariant-hunter`, `impl-audit` | conservation/monotonicity oracles, error contracts |
| §4 Crisp Quantifiers | `quantifier-hunter` | universal set/count completeness oracles |
| §5.4 Serialization points | `race-hunter` | true-simultaneous interleavings + the invariant to assert |
| §1.1 Permission matrix (forbidden actions) | `abuse-authz-hunter` | the auth/isolation grid |
| §7 UI-element inventories | `ui-map`, `ui-interaction-hunter` | expected controls, states, consequences |
| whole doc + policy defaults | `prd-map`, `blindspot-hunter` | capability inventory; "still-missing-after-expansion" |
When authoring a section, picture its consumer and give it enough to work mechanically.

## Journey-coherence pass (find missing companion flows)
After enumerating the described flows, reason about the product as one **end-to-end journey**,
not flow-by-flow, to catch flows that *should exist but are absent* (dead-ends, orphaned
states, missing prerequisites/successors).

1. **Checklist sweep.** Match the journey against canonical patterns and flag any missing leg:
   - **auth:** signup ↔ login ↔ logout ↔ password-reset ↔ session-expiry
   - **commerce:** browse → **view-cart** → checkout → order-confirmation → order-history
   - **CRUD:** create ↔ read ↔ list ↔ update ↔ delete
   - **content:** empty-state ↔ populated ↔ error ↔ loading
2. **First-principles sweep.** For gaps the templates miss: *every action that mutates state
   needs a way to observe that state; every entering transition needs an exit; every
   prerequisite must be reachable in the UI, not just via API.*
3. **Tier by necessity:**
   - **Hard** (flow is unusable or unverifiable without it — login⇒signup-UI,
     add-to-cart⇒view-cart) → emit a full `[INFERRED-FLOW]` draft (actor/goal, preconditions,
     main sequence, and Given/When/Then). **Borderline defaults to hard.**
   - **Soft** (nice-to-have; core still works — logout, order-history) → emit a one-line
     `[JOURNEY-GAP]` flag only.
4. **Respect explicit scope.** A PRD's explicit "out of bounds" → `[SCOPE-EXCLUDED]`, not a gap.
5. **Cumulative reasoning.** A capability in an earlier feature PRD lacking a UI leg now (e.g.
   signup API in `feature1`, no signup page) is a **live gap to fill**, not a deprecation —
   unless a later PRD explicitly deprecated it.

## Output doc shape (`docs/expanded-prd.md`)
Front matter:
```yaml
---
status: draft            # human flips to "approved" after review
schemaVersion: 2         # data dict + ranked invariants + quantifiers + roles + G/W/T
prdHash: <sha256 of the concatenated feature PRD bytes, in order>
featurePrds: [<feature1 path>, <feature2 path>, ...]
currentPrd: <path of the newest feature PRD>
generatedAt: <iso8601>
---
```
Then, in this order (every line provenance-tagged):
1. **Provenance legend + reviewer instruction** (what to confirm before `approved`).
2. **§1 Actors & Roles** — actor table + an allowed(✅)/forbidden(⛔) permission matrix.
   Forbidden rows are testable authz/integrity requirements.
3. **§2 Data Dictionary (the Domain)** — one table per entity with type, range/enum,
   nullability, uniqueness, default, normalization, FK; plus a derived/computed-values table.
4. **§3 Global Invariants (the Crash Catchers)** — numbered `INV-n`, **ranked by business blast
   radius**, each with the failure it catches and the check altitude (DB/API/UI). Include a
   **§3.11 canonical error catalog** (every failure response in one table).
5. **§4 Crisp Logical Quantifiers** — numbered `Qn`, each a `∀ / ∃ / Σ` statement over a
   collection (completeness + conservation oracles).
6. **§5 Cross-Flow Dependency & Shared-State Map** — the flow-dependency DAG + a shared mutable
   state reader/writer table naming the coupling risk (and the INV/Q it threatens) + **§5.3
   formal state-machine transition tables** (state × event × guard → next state, effect) +
   **§5.4 serialization-points table** (concurrency contract feeding race-hunter).
7. **§6 Business Policy Decisions** — each underspecified decision with a proposed default,
   tagged `[INFERRED]`, gated. Numbered `Pn` and referenced from the flows that rely on them.
8. **§7 Flow specifications** — one block per flow with **all** of: actor & goal · preconditions
   · numbered main success sequence · postconditions (success guarantee) + minimal guarantee ·
   state machine · **Given/When/Then acceptance criteria (stable IDs, e.g. `AC-O3`)** ·
   error & edge table (name the boundary values) · **worked-example table** where numeric ·
   data shapes (request/response contracts) · UI-element inventory for UI surfaces ·
   "invariants touched" back-references to `INV-*`/`Q*`.
9. **§8 Journey gaps** — `[INFERRED-FLOW]` drafts (with G/W/T) + `[JOURNEY-GAP]` flags +
   `[SCOPE-EXCLUDED]` list.
10. **§9 Requirement traceability matrix** — every raw-PRD criterion → the expanded
    `AC-*`/`INV-*`/`Q*` covering it (completeness proof; no raw requirement dropped).
11. **§10 Open items for the reviewer** — everything gated (policy defaults, hard gaps, contracts).

## Procedure
1. Resolve the feature-PRD sequence; hash the concatenated bytes (in order) → `prdHash`. If an
   approved `docs/expanded-prd.md` already exists with the same `prdHash`, stop.
2. Read every feature PRD in full, honoring explicit deprecations from later PRDs.
3. Run the **Analysis method** (§ above): actors, data dictionary, invariants, quantifiers,
   dependency/shared-state map, policy defaults.
4. Enumerate every user-facing **flow** across the union (same notion of "flow" as `prd-map`).
   No PRD flow may be dropped. For each, write the full §7 block.
5. **Run the journey-coherence pass**; append §8.
6. **Completeness (blocking):** every acceptance criterion across all non-deprecated feature
   PRDs must appear (as an `AC-*` line). An untestable-as-written criterion is included and
   marked, never dropped. Every quantitative constraint in the raw text must appear in §2/§4.
7. **Self-audit before writing (blocking checklist):** the doc must contain a non-empty §1
   permission matrix (allowed **and** forbidden actions), §2 data dictionary for every entity,
   ≥1 ranked `INV-*`, a §3.11 error catalog covering every failure response, ≥1 `Q*` per
   list/filter/aggregate endpoint, a §5 shared-state table, §5.3 transition tables for every
   stateful entity, a §5.4 serialization-points table wherever the PRD implies serialization,
   ≥1 `AC-*` in Given/When/Then per flow, explicit pre/postconditions per flow,
   worked-example tables for numeric flows, and a §9 traceability row for every raw-PRD
   criterion. If any is missing, keep expanding — do not ship a thin doc.
8. Write `docs/expanded-prd.md` with `status: draft`.
9. **Re-expansion:** if a prior approved doc exists at a different `prdHash`, diff against it;
   carry forward human-approved `[INFERRED]`/`[INFERRED-FLOW]`/policy-default statements
   unchanged, flag only new or changed statements for re-review (so human edits are not
   clobbered).

## Human gate (blocking)
- The doc ships as `status: draft`. Downstream skills MUST refuse to consume it until a human
  reviews the inferred statements, journey gaps, **and policy defaults**, then flips
  `status: approved`.
- On approval, `[INFERRED-FLOW]` drafts, `[JOURNEY-GAP]` flags, and `[INFERRED]` policy defaults
  the human keeps become **real requirements** (inventoried by `prd-map`, MISSING-eligible for
  the tester, owed by the Coding Agent). Deleted ones simply vanish.
- `prd-map` reads `docs/expanded-prd.md` **only when `status: approved`**; otherwise it falls
  back to the raw feature PRDs and notes the pending gate.
- The human manually copies the approved doc into `../run1-app/` for the Coding Agent — the
  skill never writes across the boundary.

## Boundaries
- Write only inside this project (`docs/expanded-prd.md`). Never write under `../run1-app/`.
- Never read app code; never crawl the app; never design test cases here (leave adversarial
  edge enumeration to `blindspot-hunter` over this doc — the expander lays the complete
  structural foundation; the hunters attack what remains).
- Do not invent obligations silently: unattributed "shoulds" are forbidden — everything is
  tagged, and journey-gap flows / policy defaults only become obligations after human approval.
