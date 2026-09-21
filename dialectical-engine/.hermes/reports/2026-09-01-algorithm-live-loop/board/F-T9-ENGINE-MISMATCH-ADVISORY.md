# [unassigned] F-T9-ENGINE-MISMATCH-ADVISORY · the gate runner does not enforce the declared `engines.node`

```yaml
state:
  ticket: F-T9-ENGINE-MISMATCH-ADVISORY
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-7**. This is the highest-value
tooling ticket of the continuation, because of what followed from it.

Every gate log of this continuation carries
`[WARN] Unsupported engine: wanted 22.23.1 (current v26.5.0)` — **advisory only**. The repository
declares `"node": "22.23.1"` (`dialectical-engine/package.json:8`); this host runs v26.5.0
(measured this pass).

**What followed from that warning being advisory:** **100** `localStorage` rows in `tests/render` are red
solely because Node 26's web-storage global shadows jsdom's (entailed by Task 9's probe), **and a shim
un-masked 4 REAL reds in `t1-canvas` that the defect had been hiding**. So one unenforced engine line
produced 100 false reds and concealed 4 true ones — and every human reading that gate had to be told,
each time, which 100 to ignore.

**Charge:** make the gate REFUSE on an engine mismatch, or stamp `ENGINE MISMATCH` on every count it
emits so no four-count can be quoted without it. **Operator-owed and separate:** a real Node 22.23.1 run,
which should clear ~100 rows and reveal ~4. STRENGTH: entailed.
