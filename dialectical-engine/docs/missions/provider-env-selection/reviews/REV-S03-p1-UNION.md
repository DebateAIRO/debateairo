# REV(S03) pass 1 — UNION of the lenses (orchestrator, 2026-09-25 14:35 EEST)

| lens | ticket | verdict | findings |
|---|---|---|---|
| correctness-tests | t_69b33cb0 | **REWORK** | B1 · N1–N4 |
| security-data-safety | t_3169a5fe | PASS | N1–N3 |

**UNION: REWORK** (PASS only when every lens passed).

## Findings of the pass, deduplicated by CLASS

- **F1 (B — correctness B1 = security N3, one class): the table pin does not pin the table.** `tests/unit/v9-provider-credential-files.test.ts:437` stays 31/31 (and the baseline 31/31) when a refusal-table ROW is deleted while its code survives elsewhere in §11 (price rows `deploy/vps/README.md:779`, `:780`, `:781` — the guard sentence at `:786` still names the three price codes), and when a run-time spend code (`DAILY_COST_ENVELOPE_REACHED`, which V-8 keeps OUT of the table) is inserted. R3.3 requires those rows; V-8 forbids that insertion. Class: an assertion that a code occurs somewhere in §11 standing in for "the table holds exactly these rows". Measured: correctness lens mutants (rows :779/:780/:781 GREEN; row :784 RED), security lens mutant A/B + DAILY insert. → **FIX(S03) p1**.
- N (orchestrator's, fixed): package `handoffs/` empty at dispatch (both lenses) — assemble-gate.zsh fixed and S03-p1 rebuilt at 14:28.
- N (packet history): BUILD-S03-C1/C2 packets cited the frozen SPEC.md and pre-revision PLAN §3 lines; C1/C2 handoffs name README lines that later clusters moved. No re-dispatch; recorded.
- N (REV packet): charge 2 omitted the C3 packet (correctness N3) → gen-rev-packet.py lists every BUILD packet of the slice from now on.
