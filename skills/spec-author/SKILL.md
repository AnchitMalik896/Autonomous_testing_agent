---
name: spec-author
description: Freeze designed cases into TypeScript Playwright specs under tests/e2e/flows/<flow>/, following the reference shape, the locator ladder, and the manifest format. Queues UNTESTABLE entries for unlocatable elements.
---

# spec-author (the freeze)

Input: admitted Case Model entries for one flow. Output: `tests/e2e/flows/<flow>/`
containing `<flow>.spec.ts` (UI), `<flow>.api.spec.ts` (API), optional `<flow>.data.ts`
(variant tables), and `<flow>.manifest.json`. Template: `flows/_reference/login.spec.ts`.

## Authoring rules
- Import from `../../fixtures/test`. Tags in titles carry provenance:
  `@flow:<flow> @case:<case-id> @oracle:<level>` (+ `@time`, `@determinism:race`,
  `@shape:<S1..S5>` where relevant).
- Tier-3 user for anything mutating; `authedTest` (Tier 2) for authenticated
  non-mutating flows; the login flow itself NEVER uses a session shortcut (DB-5).
- DB assertions via the `db` fixture, always scoped to the test's own user's rows.
- Variants via `variantTable(seed, count, gen)` with the Case Model's frozen seed.
- Synchronization on visible state only — `waitForTimeout`/`sleep` will fail lint:bans.
- First wiring of a new app: fill `fixtures/adapter.ts` (signup/login endpoints) from
  impl-audit evidence. This is the ONLY app-specific file you edit.

## Locator ladder (RS-8 — strict order, no exceptions)
1. `getByRole(role, { name })`  2. `getByLabel` / `getByPlaceholder` / `getByText`
3. `getByTestId('<flow>-<element>')`
Structural CSS/XPath is inadmissible. If no L1–L3 locator uniquely matches an element
(or a locator is ambiguous under strict mode):
- queue an UNTESTABLE entry in `state/pending-entries.json`:
  `{ flow, element: "<behavior-terms name>", expected: "reachable by role+name",
     actual: "<no accessible role|ambiguous match>", fix: "give it role+name; else add data-testid=\"<flow>-<element>\"" }`
- AND commit the spec written against the **proposed** locator, failing — the fix is
  proven by that test going green, not by opinion.

## Concurrency (race) authoring
For a `@determinism:race` case, materialize the candidate's `interleaving`:
- Build the shape's contexts — e.g. **S3**: one login, capture `storageState`, spin two
  `request.newContext({ storageState })`, fire the conflicting op with `Promise.all`.
- Wrap the race in a `raceTrials` loop (from the case, default 5) and assert the
  **invariant** (exactly one 201; DB row count == 1; stock ≥ 0) on **every** trial — a
  single trial can miss a rare interleaving.
- Assert the invariant, never a fixed winner (the winner is nondeterministic).

## UI spec shape
For UI-cell cases (`ui-happy` / `ui-state` / `ui-consequence-altitude`), author:
`navigate(page) → assert page state → act on control (locator ladder) → assert the
consequence at the STRONGEST applicable altitude` (api response / db state / race invariant;
UI-only assertion is a last resort). A serialization-point UI action (e.g. double-click
Place Order) uses the race pattern above. A control ui-map flagged as unexpected
(crawl-only, not in the PRD) is NOT authored — it is already in `pending-entries.json`
labeled "Human intervention might be needed"; leave it for the handback.

## After authoring
Run `npm run lint:bans` and `npm run typecheck` — both must pass before the spec goes
to sensitivity-prove. Compute `specHash` (sha256 of spec files) into the manifest.

## Batching across multiple flows (hard rule)
When a pass covers more than one flow (e.g. a multi-flow UI-testing sweep), **author every
flow's spec first** — write the file, lint:bans, typecheck, update the manifest — for ALL
flows in scope before executing any of them live. Do NOT interleave "author flow A → run
flow A live → author flow B → run flow B live"; that serializes wall-clock time and cache
misses for no benefit, since lint/typecheck already catch the cheap mistakes per-file.
Once every flow in the batch is authored and typechecks clean, run the whole batch **once**
in a single `npx playwright test <file1> <file2> ...` (or the full suite, if that's the
scope) — either the agent or the human may trigger that one run. Live execution is what
surfaces real locator/timing bugs; batching it to the end means paying for that feedback
loop once per session, not once per flow.
