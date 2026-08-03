# Checkpoints (design §5.4 / FR-T8)

A checkpoint = a deterministic API-level prefix builder + a state contract. NOT a DB
dump (dumps fight the read-only/append-only DB policy).

```
checkpoints/<flow>/<step>/
├── setup.ts       # builds the prefix via app API calls (e.g. signup+login) — fast path
├── queries.sql    # SELECTs defining the observable state a downstream step reads
├── state.hash     # sha256(stableStringify(query rows, volatile fields masked))
└── runcount       # integer; every 10th run triggers the live replay audit
```

Rules:
- **Invalidation**: impl-audit deletes `state.hash` for any flow its change-impact set
  touches (bias to inclusion). No hash ⇒ no replay ⇒ full execution.
- **Audit**: every 10th run, execute the full UI prefix live, hash the same contract,
  diff. Drift ⇒ invalidate + honesty-footer note.
- **Verdict equivalence**: a replayed run that cannot restore the contract falls back
  to full execution automatically — never a verdict from an unproven shortcut.
- Volatile fields (serial ids, timestamps) are masked before hashing; the mask list
  lives at the top of queries.sql as `-- mask: col1, col2`.
