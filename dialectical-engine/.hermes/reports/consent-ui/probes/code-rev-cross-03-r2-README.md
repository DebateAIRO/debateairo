# CODE-REV-CROSS-03 r2 — promoted probe kit (blind re-review of `4cc0f4b6`, verdict PASS)

Every file takes its lane from `LANE` (env) or `$1` (argv) — no hard-coded `.worktrees/` path
(COMMON §10.35). Verified to run FROM THIS DIRECTORY with zero edits.

| file | MODELS | DOES NOT MODEL |
|---|---|---|
| `…-tab-discrimination.probe.test.tsx` | whether a `Tab` assertion can DISCRIMINATE the containment tiebreak for two surfaces SHARING one container node. Walks every starting position (each control, a control outside the surface, no focus) forwards and backwards and prints the landing element. | the NESTED pair, where the candidate lists differ and `Tab` genuinely does discriminate (control T2 covers that shape only as a control); a real browser's sequential focus navigation (jsdom has none). |
| `…-probe-runner.config.ts` | running a probe that lives outside the lane, against the lane's real modules. **Takes BOTH `LANE` and `PROBE` from the environment**, so it needs no editing to reuse — unlike its five per-seat predecessors. | the lane's `test` options beyond `fileParallelism` and the reporter. |
| `…-mut.py` | `cp`-snapshot → anchor-unique assert → plant → **assert the plant LANDED** → run → `cp`-restore → assert the restore landed → classify BROKEN/CAUGHT/SURVIVED. | whether the plant changed the RUNTIME. It proves BYTES changed, not behaviour — my own M5 was a no-op that printed `SURVIVED` (TRAPS `:1682`, `:1520`). Read the planted region before believing a survivor. |
| `…-gates.sh` | `CMD-C6`, `CMD-C7`, the t9 delta by NAME, `run()`/`run_c9`, the consent SET, the semantics+cross-slice pair, the three source-text guard suites, root typecheck and the `apps/ui` arm — every command transcribed VERBATIM from the PLANs' fenced blocks. Lane from `$1`. | anything about the merge arms it reports (`t_4f97ca86`); it reports them, it does not judge them. |

## How to run

```sh
LANE=/abs/lane PROBE=code-rev-cross-03-r1-reflexive-contains.probe.test.tsx \
  pnpm exec vitest run --config <this dir>/code-rev-cross-03-r2-probe-runner.config.ts
/bin/bash <this dir>/code-rev-cross-03-r2-gates.sh /abs/lane
LANE=/abs/lane python3 <this dir>/code-rev-cross-03-r2-mut.py <snapdir> <id> <file> '<old>' '<new>' <cmd...>
```

## The figures this kit produced at `4cc0f4b6` (three runs each, identical)

* the r1 probe, byte-untouched: `6 passed (6)`; with the identity term removed `2 failed | 4 passed (6)`
* the Tab transcripts (`…-tab-transcript-head.txt` vs `…-tab-transcript-mutant.txt`): **`diff` EMPTY** —
  no `Tab` assertion on a shared-container pair can discriminate the tiebreak
* base-RED replay (`…-base-red-replay.log`): both new cases RED against `4ef2f7d3`'s helper
* gates (`…-gates-bash-run1.log`, md5 of all three runs `8a3cb6fc98ae5fa71b52e71732ebf847`):
  SET `197/17`, `run_c9` vitest half `114/10`, pair `35/2`, guards `32/3`, `CMD-C7` `76/6`,
  `CMD-C6` `14/1`, t9 `2 failed | 7 passed (9)` with one hit at `globals.css:6116`,
  root typecheck 0 outside the pin, `apps/ui` tsc exit 0
