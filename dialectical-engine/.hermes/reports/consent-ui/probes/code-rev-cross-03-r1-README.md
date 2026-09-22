# CODE-REV-CROSS-03 r1 — probe kit

MODELS: the V-20 (b′) Esc-stack tiebreak in `apps/ui/components/consent/modalSemantics.ts` —
which registered surface `topmostSurface()` returns for unrelated / nested / SHARED containers,
and the same question for the `Tab` trap that reads the same entry.
DOES NOT MODEL: anything in a real browser; `role`/`aria-*` markup; focus RETURN on unmount
(that is CROSS-01's probe); any surface outside the two consent consumers.

## Files

| file | what it is |
|---|---|
| `…-reflexive-contains.probe.test.tsx` | the six-case probe. P1/P2/P5/P6 are controls that must stay GREEN. **P3 and P4 assert the RULE and are RED against `4ef2f7d3`** — that RED is the finding (B1), so re-running against a fix must turn them GREEN (the inverse of TRAPS `:2600`'s defect-asserting probe). Registration order is asserted, never assumed. |
| `…-probe-runner.config.ts` | scratchpad-owned vitest `--config` (COMMON §10.46). Mirrors the lane's `vitest.config.ts` alias array with `import.meta.dirname` → `$LANE`, per TRAPS `:2440`. |
| `…-mutants.py` | the mutant battery. Anchor uniqueness asserted, landing asserted, `cp`-snapshot restore verified, BROKEN/CAUGHT/SURVIVED classification. `R1-STRICT-DESCENDANT` is the **remedy**, not a defect. |
| `…-gates.sh` | `CMD-C6`, `CMD-C7`, `run_c9`, the consent SET, the three guard suites, the `apps/ui` tsc arm — transcribed verbatim from the PLANs' fenced blocks. |
| `…-mutants.log`, `…-gates-bash-run1.log` | raw captures at `4ef2f7d3`. Runs 2 and 3 were byte-identical to run 1. |
| `…-MEASURED-FIRST.md` | the independent measurement, written before the author's claims were opened (§10.52). |

## Running it

```
cp <this dir>/code-rev-cross-03-r1-probe-runner.config.ts <your scratch>/probe-runner.config.ts
mkdir -p <your scratch>/probes
cp <this dir>/code-rev-cross-03-r1-reflexive-contains.probe.test.tsx <your scratch>/probes/   # byte-untouched
cd <lane> && LANE=$PWD pnpm exec vitest run --config <your scratch>/probe-runner.config.ts
python3 <this dir>/code-rev-cross-03-r1-mutants.py <absolute lane path>
/bin/bash <this dir>/code-rev-cross-03-r1-gates.sh <absolute lane path>
```

Every file takes the lane from `LANE` or `argv` (COMMON §10.35); none contains a `.worktrees/` path.
The re-reviewer copies only the runner and leaves the probe byte-untouched.
