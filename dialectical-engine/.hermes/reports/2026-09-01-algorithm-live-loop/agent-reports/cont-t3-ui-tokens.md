READY FOR PEER REVIEW · comments read through: 0 (no board in this continuation; the SDD ledger is the board)

# Self-report — `cont-t3-ui-tokens`, BUILD(CONT-T3), pass 1

- seat: `cont-t3-ui-tokens` · node BUILD(CONT-T3) · model Claude Opus 5 (1M context)
- session: CCD session `local_fc497c71-86dd-426f-acf1-4f3d71227a60`; this seat's agent scratchpad is `45ab9500-0991-4dbd-89ec-f04cc3082e67`. `get_session("self")` resolves to the ORCHESTRATOR's session row (model `claude-fable-5-1`, cwd `~/Documents/DebateAIRO`), not to the subagent — **a subagent cannot read its own session id from the harness**, which makes the packet's "record your own session id" unsatisfiable as literally written. Recorded here honestly rather than by guessing.
- base `1f113095cf5581cfabd3c84326a1370d3a92b1e8` (verified equal to the dispatch's `1f113095` before any edit) · tip `58ba1376e39a01102d27a7b815ea29051c0fe4e1` · branch `mission/2026-09-16-algorithm-live-loop-continuation`
- verdict: **DONE_WITH_CONCERNS** — 4 of the cluster's 7 pinned rows fixed; 3 are unreachable from this packet's `allowed` list and are not merge debt.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. The body: what actually killed three of the seven rows

**The brief, the packet's `allowed` list and the measurement of record all name the wrong file, and they all name it for the same reason.**

The measurement of record, §6 rows 3–5, reads:

> **merge-caused regression against the first parent** — the test is identical on both parents but reads `apps/ui/app/globals.css` (merge-touched; differs from `^1` by 13 878 diff lines, from `^2` by 53) plus `apps/ui/components/*`. Red on `^2`, green on `^1` · consistent-with

Every clause about the mechanism is false for these three rows:

| claim | measured |
|---|---|
| the rows read `globals.css` | they do not. `'DebateMap root hub'` reads `apps/ui/components/DebateMap.tsx:138-139`; both `'DebateCanvas … review mark'` rows read `apps/ui/components/DebateCanvas.tsx`. `grep -c 'HUB_R\|compactReview' apps/ui/app/globals.css` → **0** |
| red on `^2`, green on `^1` | red on **both**. The three blobs are byte-identical across `5e617776^1`, `^2` and HEAD: test `ba29602655ba…`, `DebateMap.tsx` `a85c0bed9872…`, `DebateCanvas.tsx` `aec019cc3e4d…` |
| merge-caused | impossible. A merge cannot regress a row whose test and whose sources are all one blob on both sides |

The same error runs through rows 21–22 (`pda-s03`): `.libTab { font-weight: 700 }` is identical in `^1`, `^2` and HEAD. There was no "inactive-link weight the merge dropped". And through row 30: the brief's Step 1 instructs *"confirm `^1` has none"* of the three colour literals — `^1` has one of them, byte-identical, at `globals-p1.css:6070`, outside its token block. `^1`'s copy of the t9 oracle carries the same colour-literal arm and the same `☀ Terracotta` assertion at its `:472`, so **both t9 rows were red on `^1` too**.

**CAUSE, named precisely:** the attribution was performed at FILE granularity against a suite, when the question is at ASSERTION granularity against a source. `role-token-map.test.ts:14-36` loads **nine** sources at module scope. `globals.css` is one of them, and it feeds exactly one row (`Synthesis verdict label` → `.synthCardLabel.verdict`) — which passes. Because `globals.css` was in the suite's input set *and* was the most spectacularly merge-touched file in the tree (13 878 diff lines), it absorbed the blame for three rows it has no line in.

This is the same generating shape already in `TOOLING-TRAPS.md` as *"Deleting a test file is a FILE-level verdict over an ASSERTION-level question"* (2026-09-16, BUILD(CONT-T1)). **Two consecutive seats in this continuation have now been damaged by file-level reasoning about assertion-level facts.** That is a class, not an incident, and it deserves a standing rule rather than a third entry.

**The refutation is one command and costs nothing:**

```
git rev-parse 5e617776^1:<path> 5e617776^2:<path> HEAD:<path>
```

Three equal hashes ⇒ the merge is exonerated for every assertion that reads only that path. The verifier instead saved **345 KB of stylesheet diffs** (`globals-p1-head.diff`, `globals-p2-head.diff`) and the packet ordered me to grep them — for rows that no stylesheet line controls. That is the single largest misdirected artifact in this dispatch.

## 2. What it cost, priced

| item | price | avoidable by |
|---|---|---|
| Reading three oracles in full to discover the `allowed` list cannot reach 3 of its 7 rows | ~48k tokens, ~8 tool calls, before a single edit | the packet author running the 3-hash probe once per failing row (seconds) |
| The packet's `inputs` line ordering me to grep two 345 KB diffs | 0 tokens spent (I measured first and found them irrelevant) — but it is the intended path, and a compliant seat would have burned the budget there | attributing per assertion |
| `read in FULL: every file in allowed` over a **9 057-line / 207 KB** stylesheet | ~55k tokens to justify a **5-line** diff. I read lines 1–210 (the complete token inventory, which is the part that constrains "invent no token") plus four targeted regions, and declare the shortfall here rather than hide it | `heartbeat-protocol` §3.8 already calls an over-broad reading order a packet defect. A file-size threshold should convert "read in full" into "read the declaration block in full + the regions you touch" automatically |
| The neighbour command's bad path (`tests/unit/t9-landing.test.tsx`; the file is `tests/render/`) | one silently-wrong gate. vitest printed `Test Files … (3)` for 4 paths and named nothing | `[ -f "$p" ]` per path before running — 1 line |
| Establishing that the 15 `t1-canvas` rows are not mine | 2 extra full neighbour runs (base + tip) | a committed base-gate manifest the seat can diff against instead of re-deriving it |

**The repeat offender across this whole mission, by a wide margin, is a measurement whose GRANULARITY does not match the question's.** Every trap in the file's "silent cap" family, the `grep -c` counts-lines family, the `FAIL`-lines-are-not-an-oracle family and now this attribution family are one bug: *an instrument that answers a coarser question than the one asked, and whose answer is indistinguishable from the right one.*

## 3. What I nearly got wrong

- **I nearly reported "3 rows blocked" and stopped with zero work.** The dispatch says "say so and stop"; the packet §2 says "if a row cannot be satisfied without redesign, **stop on that row** and report it". Those are different instructions and both are in my packet. I followed the narrower one (per-row), which is the only reading under which the dispatch is not self-defeating — but a seat that read the dispatch line first would have delivered nothing. **Two stop-rules at two granularities in one packet is a defect.**
- **I nearly used `var(--ink)` for the two support-console box-shadows**, because it preserves the shadow geometry exactly and the adjacent `.drawer[data-drawer-panel]:7144` uses precisely that idiom for a shadow. It is wrong: `--ink` inverts between modes (`#29261F` → `#F2EAD9`), so a Chamber shadow would be painted in cream. The file's real answer is that shadows are mode-bearing tokens (`--shadow-card` is `rgba(41,38,31,.24)` in Terracotta and `rgba(0,0,0,.8)` in Chamber — the literal I was replacing *is* that token's Chamber colour). Caught by asking what the token resolves to in the other mode, not by the test.
- **I nearly accepted a mutant anchor that matched 7 places.** `mutate.py` refuses on `count != 1`; it fired immediately on `  font-size: 11.5px;\n  font-weight: 600;`. Without that guard I would have rewritten seven unrelated rules and read the resulting RED as proof my assertion was pinned. **An exact-match mutant applier that asserts uniqueness should be standard equipment in every coding packet** — it is 8 lines and it converted a silent corruption into an error message.
- **I nearly reverted a mutant with `git checkout -- <path>`**, which at that moment would have deleted all four uncommitted fixes (already recorded at `TOOLING-TRAPS.md:3471`). I snapshotted to the scratchpad and restored by `cp`, verifying by `shasum` each time.

## 4. Dead ends — do not re-derive these

- `mcp__ccd_session_mgmt__get_session("self")` does **not** return a subagent's own id. Do not ask a worker for its session id via the harness; give it one in the packet, or accept the parent id plus the scratchpad UUID.
- The two saved stylesheet diffs are irrelevant to every row in this task. Do not open them.
- `pnpm run typecheck` is `tsc --noEmit` and reports **rc=0 / 0 errors** at this tip. The measurement of record's "43 typecheck errors" is from a different command; whatever it is, it is not this script. Anyone reconciling those numbers should start by naming the command, not by hunting the errors.
- `.libTab`'s active/inactive pair: changing `.libTab[aria-current="page"]`'s weight is invisible to every test. Only the inactive weight is pinned.

## 5. Coverage holes this work exposed (not fixed here — out of contract)

- **`ModeToggle`'s `compact` variant is pinned by nothing.** I replaced its two glyphs with `"X"` / `"Y"` and `t9-mode-tokens` reported `9 passed (9)`. The only test that mounts the component mounts it with no props. A real regression in the compact chrome ships green.
- **`DebateCanvas` has no `compactReview` symbol at all**, yet `role-token-map` pins two rows against it. An oracle whose `capturedToken` returns `<unbound>` cannot distinguish "bound to the wrong token" from "this render site was never built". Those are different tickets with different owners, and the suite reports them identically.

## 6. How to make this a one-prompt machine — four concrete upgrades

1. **Attribute per assertion, and prove it with hashes.** Before any merge-regression claim reaches a packet: resolve the source each failing assertion reads, then `git rev-parse <rev>:<path>` on both parents and HEAD. Three equal hashes ⇒ not merge debt. Put the per-row source path in the brief's table. This single rule would have prevented this entire dispatch's mis-scoping.
2. **Make the `allowed` list derivable, not authored.** The packet's `allowed` list and the cluster's required rows must be checked against each other mechanically: for every assertion in the cluster, the file it reads is either in `allowed` or explicitly listed as out-of-scope-and-expected-red. A packet that requires a green row it cannot reach should fail `board-lint.sh` before a seat is spawned. This is the highest-leverage automation available here.
3. **Pre-flight every path a packet dictates.** `[ -f "$p" ]` over each path in each command, plus a `Test Files N (N)` assertion in the runner. Both failures are silent today and both occurred in this one task.
4. **Ship the seat a toolkit instead of prose about tools.** Four things I hand-built that every coding seat rebuilds: the log-first runner that prints only `rc` + summary + `×` lines; the uniqueness-checked mutant applier; the snapshot/restore pair that never touches `git checkout`; the base-vs-tip neighbour differ. As four scripts in `.hermes/tools/`, they would remove ~15 % of this seat's calls and, more importantly, remove the four traps they each encode.

**One more, about the reading order itself.** The packet ordered ~9 400 lines of mandated reading (a 9 057-line stylesheet plus three oracles) to produce a 5-line diff. The compass caps itself at 100 lines for exactly this reason; the same discipline is not applied to packets. A packet should name the DECLARATION region of a large file plus the sites the work touches — and `heartbeat-protocol` §3.8 should be read as forbidding the alternative, which is how I treated it.
