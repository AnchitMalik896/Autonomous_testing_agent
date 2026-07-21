# Autonomous Testing Agent — Tester Claude + Coder Claude

A two-process, human-gated testing system. **Tester Claude** (this repo) reads a target
app's PRD, audits what's actually implemented, designs and freezes trustworthy Playwright
tests, runs them, and hands you **one pasteable block** of failures. You paste that block
into **Coder Claude** (a separate `claude` session running *inside* the target app's repo),
which fixes the app. You are the only channel and the only gate — the two agents never talk
to each other directly.

This repo is target-agnostic: it has been run against a couple of different apps so far
(a simple prior target, and the current one, `prd_qofe`, a FastAPI + React financial
reporting system). Pointing it at a new target is a matter of config, not code — see
"Testing a new target" below.

## How it's organized

| Path | What it is |
|---|---|
| `.claude/skills/*/SKILL.md` | Tester Claude's skill chain (see below) — this is the engine |
| `.claude/agents/*.md` | Read-only "case-hunter" subagents that `test-design` fans out to |
| `tests/e2e/` | The Playwright suite: fixtures, harness, state, and frozen specs, per target |
| `docs/` | Target-specific expanded PRDs produced by `prd-expand` |
| `CLAUDE.md` | Points Tester Claude at the *current* target — edit this per target |
| `CONTEXT.md` | Short between-session resume notes (auto-maintained) |

## The skill chain

Ten skills, run mostly by the orchestrator (`test-session`) but each independently
invocable:

1. **`prd-expand`** — turns a target's raw feature PRD(s) into a maximally detailed,
   provenance-tagged expanded PRD (data dict, ranked invariants, roles matrix,
   shared-state map, Given/When/Then ACs). Human-gated; only reruns when a PRD changes.
2. **`prd-map`** — parses the expanded PRD into a structured capability inventory
   (flows, acceptance criteria, oracle sources).
3. **`impl-audit`** — glass-box reads the target's app code (read-only) to produce the
   implementation matrix, `MISSING` entries, and a change-impact set from `git diff`.
4. **`ui-map`** — derives the expected UI inventory per flow from the PRD, with locators
   from a read-only crawl.
5. **`test-design`** — the brain: fills the mandatory case-design rubric per flow by
   fanning out to the case-hunter fleet (`.claude/agents/`), assigns oracle provenance,
   authors fault plans and PRNG variant generators.
6. **`spec-author`** — freezes designed cases into TypeScript Playwright specs under
   `tests/e2e/flows/<flow>/`.
7. **`sensitivity-prove`** — proves every assertion can actually fail, by running a
   planted-fault harness. Vacuous assertions are rejected, never committed.
8. **`determinism-gate`** — a four-phase gate (repeat / shuffle / clock / hermetic)
   before a spec is admitted into the trusted suite (or quarantined).
9. **`suite-run`** — executes the admitted suite, targeted or full, with a canary
   self-test and checkpoint replay.
10. **`triage-handback`** — turns raw results into the one pasteable handback block:
    flake classification, dedup, bisection, `MISSING`/`UNTESTABLE` merge, honesty footer.

Plus **`trust-report`** (session-level trust posture, never a single "% complete" number),
**`test-session`** (orchestrates all of the above into one turn), and **`suite-only`**
(fast path — just re-run the already-admitted suite, skip everything else).

## Testing a new target

1. Point `CLAUDE.md` at the new target: where it lives, how to boot it, its HTTP
   surface(s), and the hard boundary rule (Tester Claude never edits target app code).
2. Get the target's PRD(s) into this repo (or a path Tester Claude can read) and run
   `prd-expand`, then `prd-map`.
3. `cp tests/e2e/.env.example tests/e2e/.env` and fill in `BASE_URL` + `DB_URL_RO`
   (create a **SELECT-only** DB role for the read-only oracle queries — the suite never
   writes to the app's DB directly).
4. Fill in `tests/e2e/fixtures/adapter.ts` — the one app-specific file (how to create a
   session/identity, whatever the target's actual auth model is).
5. `cd tests/e2e && npm install && npx playwright install chromium`
6. Make sure the target's own seed/reset tooling provisions known reference data on boot
   — the suite treats that as its fixed baseline and never mutates it.
7. Make sure the target app itself is up and reachable (you boot it — this agent doesn't).
8. Tell Tester Claude to run — `test-session` will build the capability inventory, run
   `impl-audit`/`ui-map`, and start designing/authoring cases per flow.

## The loop (every cycle, once a target is set up)

```
you:            "run tests"            → Tester Claude (test-session skill)
Tester Claude:  audits diff → designs/authors/gates any new tests → runs suite
                → prints ONE handback block → stops
you:            paste the block into Coder Claude (running inside the target's repo)
Coder Claude:   finds and fixes the causes, commits
you:            back to Tester Claude: "run tests"   (the git diff is its done-signal)
```

## Without any LLM

The committed suite is a plain Playwright project — no agent required to just run it:

```bash
cd tests/e2e && npm test          # identical verdict on any machine, no agent
node harness/handback.mjs         # re-render the last handback block
cat state/trust-report.md         # current trust posture
```

## Ground rules the system enforces

- Tester Claude reads target app code **read-only** and never names app files in a
  handback — only symptom-level behavior.
- A retry-pass is reported **flaky**, never green. Quarantine: 2 flaps in, 5 clean out.
- Environment drift (wrong seed, unreachable app/DB) aborts loudly before any test runs.
- Green is reported with oracle provenance + residual — never as "100% correct".
- Tester Claude never edits the target application's code, under any target. Defects are
  always handed back for a separate Coder Claude to fix.
