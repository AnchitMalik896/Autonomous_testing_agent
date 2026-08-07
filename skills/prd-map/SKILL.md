---
name: prd-map
description: Parse the product PRD into a structured capability inventory (flows, acceptance criteria, O1 oracle sources). Run when the PRD is new or its hash changed.
---

# prd-map

Input: the **expanded PRD** (`docs/expanded-prd.md`, produced by `prd-expand`) — but only
when its front-matter `status: approved`. If it is missing or still `status: draft`, fall
back to the raw PRD file (ask the human for its path if unknown) and record
`"pendingExpandGate": true` in the inventory so the handback surfaces the ungated state.
Output: `tests/e2e/state/capability-inventory.json` (schema: ultra_design.md §3.1).

Treat the input document as the PRD everywhere below. The expanded PRD tags every statement
`[PRD §x]` / `[PRIOR fN §x]` / `[INFERRED]`, plus journey-gap sections `[INFERRED-FLOW]` /
`[JOURNEY-GAP]`. When deriving `oracleSources`, both `[PRD §x]` and `[PRIOR fN §x]` are
O1-eligible (prior-feature requirements are binding, part of the cumulative spec);
`[INFERRED]` / `[INFERRED-FLOW]` / `[JOURNEY-GAP]` criteria carry `"inferred": true` and get
no O1 oracle source (they fall to O2/O3 or the residual list). Approved `[INFERRED-FLOW]`
sections are inventoried as real flows (MISSING-eligible); ignore any `[SCOPE-EXCLUDED]` leg.

## Procedure
1. Hash the input document (sha256 of file bytes) → `prdHash`.
2. Extract every user-facing **flow** (login, add-to-cart, checkout, …). A flow is a
   behavior a user completes, not a code module.
3. Under each flow, list every **acceptance criterion** with:
   - `id` (stable, e.g. `AC-3.2.1`), `source` (PRD section), `text` (one sentence),
   - `oracleSources`: where an O1 expected value can be *derived* from — PRD tables,
     OpenAPI/GraphQL schema paths, typed contracts. Empty list = O1 unavailable; the
     case will need O2/O3 or fall to O5 unverified.
4. Record `roles` mentioned per flow (feeds the authz grid row in test-design),
   `surfaces` (ui/api/db) the PRD implies, and — for `ui` surfaces — a `uiControls` hint
   list (PRD-named buttons / forms / inputs) that seeds the `ui-map` skill. This is only a
   hint from PRD wording; `ui-map` does the full derivation and locator reconciliation.
4b. **Domain model (feeds boundary/invariant/completeness cells).** Emit a top-level
   `domainModel` in the inventory:
   - `entities`: each with `fields` (name, type, and range/enum/nullability where the PRD
     or schema states it — e.g. `quantity: int ≥ 1`, `stock_quantity: int ≥ 0`).
   - `quantifiers`: universal statements the PRD makes about collections, phrased as
     set relations — e.g. "GET /api/products returns EXACTLY the products with
     stock_quantity > 0". These become completeness oracles.
   - `invariants`: cross-entity properties that must always hold — e.g. "Σ stock
     decrements == Σ ordered quantities", "stock_quantity never < 0",
     "order.total_cents == Σ(line.qty × product.price_cents)".
   Every quantifier/invariant carries a `source` (PRD section). These are the raw material
   test-design's quantifier/boundary/invariant hunters turn into universal oracles.
5. **Completeness rule (blocking):** every acceptance criterion in the PRD must appear
   in the inventory. If a criterion is untestable-as-written (vague, unmeasurable),
   include it with `"untestable_as_written": true` and note why — it goes to the
   residual list, never silently dropped.
6. First session only: propose seed-fingerprint queries (a few SELECTs over reference
   data the PRD implies — catalog, roles) and write `state/fingerprint.json` with their
   current hashes once the human confirms the environment is correctly seeded
   (run each query via DB_URL_RO, hash with sha256(stableStringify(rows))).

Do not design tests here. Do not read app code here (that is impl-audit's job).
