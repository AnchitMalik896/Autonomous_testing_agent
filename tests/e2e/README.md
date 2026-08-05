# E2E Suite — Trustworthy Autonomous Testing

The frozen artifact of the Tester-Claude system (`ultra_updated.md` requirements,
`ultra_design.md` architecture). Runs to an identical verdict with plain
`npx playwright test` — **no LLM, no agent at runtime**.

## Wiring to an app (one-time, human-owned — design §10)

1. **DB role**: create a SELECT-only role and put its URL in `.env` (`DB_URL_RO`).
2. **Seed**: your app's own seed script/migrations provision reference data when the
   environment comes up. The suite never seeds (read-only credential).
3. `cp .env.example .env` and fill in `BASE_URL`, `DB_URL_RO`.
4. `npm install && npx playwright install chromium`
5. First Tester Claude session: `prd-map` registers the seed fingerprint;
   `spec-author` fills `fixtures/adapter.ts` (the only app-specific file).
6. *(Recommended)* backend `TEST_CLOCK` env support for time-boundary cases.

## Runbook (human)

| You want | Do |
|---|---|
| a full testing turn | tell Tester Claude: **"run tests"** (invokes `test-session`) |
| just re-run the frozen suite | `cd tests/e2e && npm test` |
| the handback block again | `node harness/handback.mjs --turn N` or `cat state/last-handback.md` |
| gate one spec | `node harness/gate.mjs flows/<flow>/<spec>.spec.ts` |
| verify the suite has teeth | `node harness/canary.mjs` |
| current trust posture | `cat state/trust-report.md` |

## Layout

- `flows/` — per-flow specs (UI + API + DB altitudes). `_reference/` is the template, never run.
- `fixtures/` — db (read-only oracle), users (3-tier), prng (frozen seeds), manifest, adapter (app seam).
- `harness/` — design-time tooling: gate, sensitivity, canary, handback, lint-bans. Not on the verdict path.
- `state/` — Tester Claude's ledgers (case model, baseline, quarantine, reports). Versioned.
- `checkpoints/`, `canaries/`, `contracts/` — see their READMEs.

## Invariants this suite enforces on itself

- Suite DB access is SELECT-only; all state is created through the real app.
- A retry-pass is reported `flaky`, never `pass`.
- `waitForTimeout`/`sleep`/XPath/structural CSS are lint-rejected.
- Environment drift (wrong seed, unreachable app/DB/fakes) aborts the run loudly
  before any test executes.
