---
name: ui-map
description: Derive the expected UI inventory per flow from the PRD (the "button document"). PRD is authoritative; a read-only crawl supplies locators only. Unexpected crawl-only controls are routed to human intervention. Feeds ui-interaction-hunter.
---

# ui-map (PRD → expected UI inventory)

Input: `capability-inventory.json` (a flow's `surfaces` + `uiControls` hint + `domainModel`)
and the **expanded PRD** (`docs/expanded-prd.md`, produced by `prd-expand`, `status: approved`)
— this is the only spec document ui-map reads; it never reads the raw PRD directly.
Optionally the running app, **read-only**, for locators only. Output:
`tests/e2e/state/ui-surface/<flow>.json`.

Runs after impl-audit, before test-design's UI cells, for flows whose `surfaces` include
`ui`. Run only when the PRD or the flow's UI surface changed.

## Authority model (hard rule)
- The **expanded PRD defines** what controls should exist and how they must behave — it is
  the oracle. Its provenance tags carry through: a control derived from a `[PRD §x]`
  statement is a hard requirement; one derived from an `[INFERRED]`/`[HIST]` statement is
  weaker — mark such controls `"inferred": true` so downstream oracle grading knows.
- The app **may be crawled** (Playwright, read-only) to discover locators and understand the
  live surface. It must **never** supply a "should" — crawling records existence + locator
  only, never correctness.
- **On any expanded-PRD ↔ app conflict, the expanded PRD wins.**

## Output schema — per control
```json
{
  "id": "checkout-place-order",
  "flow": "checkout",
  "role": "button",
  "name": "Place Order",
  "locatorLadderHint": "getByRole('button', { name: 'Place Order' })",
  "prdRefs": ["AC-4.1.2"],
  "expectedBehaviors": [
    { "trigger": "click",
      "consequence": "one order is created for the current cart",
      "altitude": "db",
      "oracleHint": "SELECT count(*) FROM orders WHERE user_id = $me == 1" }
  ],
  "source": "prd" 
}
```
`source`: `prd` (PRD-defined) or `crawl-confirmed` (PRD-defined, locator confirmed live).

## Reconciliation (expanded PRD wins)
- **Crawl-only control** (in app, not in expanded PRD) → do NOT invent expectations. Write a
  `pending-entries.json` entry `{ type: "unexpected-surface", flow, control: "<behavior
  name>", note: "present in app, absent from expanded PRD — confirm intent" }`. triage-handback
  renders these under "HUMAN INTERVENTION MIGHT BE NEEDED".
- **Expanded-PRD control absent from the app crawl** → a MISSING entry (the app owes a control
  the expanded PRD requires); it reaches the handback like any MISSING.

## Boundaries
- Never write outside `tests/e2e/`. Never edit app code.
- Do not design test cases here — that is `ui-interaction-hunter` + `test-design`.
- Locators are hints only; `spec-author` binds them via the strict locator ladder and
  queues UNTESTABLE for anything not reachable by role+name / label / testid.
