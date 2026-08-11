# Case-hunter fleet

Lens-based subagents that `test-design` fans out to (in parallel, one+ per rubric cell) to
fill the mandatory technique rubric. Each is **read-only** and reasons from the PRD +
`domainModel` in `capability-inventory.json` — **never the app source** (`../run1-app/**`),
so it cannot inherit the implementation's blind spots. A hunter *proposes* candidate cases;
`test-design` assigns final oracle provenance, and `sensitivity-prove` + `determinism-gate`
*dispose* (nothing is admitted unproven).

| Agent | Rubric cells |
|---|---|
| `boundary-hunter` | boundary (BVA) · partition |
| `pairwise-hunter` | pairwise (covering array) |
| `quantifier-hunter` | completeness (universal set/count, cross-altitude) |
| `metamorphic-invariant-hunter` | metamorphic · invariant |
| `abuse-authz-hunter` | auth-matrix · malformed/abuse |
| `race-hunter` | concurrency (true simultaneous races) |
| `blindspot-hunter` | cross-cutting: cases the implementer likely missed |
| `edge-case-hunter` | frontier: weird production-realistic edge cases not yet covered |
| `ui-interaction-hunter` | ui-happy · ui-state · ui-consequence-altitude (UI-surface flows; reads `state/ui-surface/<flow>.json`) |

## Shared candidate-case contract (every hunter's output)
Return ONLY a JSON array; each item:
```json
{
  "flow": "cart",
  "cell": "boundary",
  "description": "one line, symptom-level (behavior; no app files/causes)",
  "factors": { "quantity": ["exact-stock","stock+1","0","-1"] },
  "inputs": "concrete or a {seed,generator,count} for deterministic variants",
  "oracle": { "level": "O1|O2|O3|O4|O5",
              "provenance": "PRD §3.2 | DB: SELECT ... FROM ...",
              "assertion": "what must hold, in behavior terms" },
  "faultToPlant": { "kind": "constant|relation|flip|drop-one", "note": "how it should break" }
}
```
Concurrency candidates also carry `interleaving: { shapes: ["S1".."S5"], trials }`
(default `trials: 5`); UI candidates also carry `altitude` +
`consequenceCheck: { ui?, api?, db?, race? }`.

Rules: cite provenance from the PRD or a DB `DB_URL_RO` query — never freeze observed
output as truth (that's O5, allowed but flagged). Prefer the strongest oracle that genuinely
must hold; if unsure a relation holds, mark it O5 rather than assert it.
