# Self-report — ARCH-FIX-PES-S03-p4 (ARCH-FIX(S03) pass 4, ticket t_26ccd655; V-11 → R3.4, V-14 → R3.4b)

Seat: the ARCH-PES-S03 subagent adbd71f6a2f5bad4c, resumed for a fourth node (claude-opus-5-5).
CLAIM 13:26:12 EEST, filed before READY.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## What the node produced

- `slices/S03/PLAN.md`, 809 → 1103 lines:
  - Revision 4 at `:3`.
  - New cluster S03-C3 at `:704-946`, with 7 steps and 3 RED cases given as code.
  - The §3 row at `:957`.
  - Trace and §3/§4/§5 edits.
- `slices/S03/DECISIONS.md`, 184 → 209 lines. The first 184 lines are byte-identical (`cmp`).
- Probes under `probes/ARCH-FIX-PES-S03-p4/`:
  - `gate.mjs`: 63 expectations, `GATE_OK`. The SELFTEST fails as planted.
  - `trace.sh`: `TRACE_OK`. It fails on 3 mutant plans.
  - `citations.mjs`: 37 of 37 hold. The +3-line shift fails 36.
  - Cluster scripts, and `verify-all.sh` plus its log.

## Case file

### 1. The cause of this node: a V-ROW asked about one member of a three-member class

At p3 I raised the V-ROW about R3.4's sentence alone. The sweep I recorded then (DECISIONS, Revision
3, the order-claim class row) named C2-7's sentence, but I did not grep the README for the CODE. The
same claim, "hosted refuses with `COST_ENVELOPES_NOT_SEALED`", sat in two more places: §11's table row
and §10's bullet. REQ-FIX p4 found them and asked V a second question (V-14).

- **Price:** one extra V question, one REQ-FIX node (p5, about 15 min plus a skill reload), one extra
  SPEC version, and this node waiting on it.
- **Cause:** my class sweep was by PLAN text (order words near codes), not by the defect's token in the
  artifact the plan edits.
- **Upgrade:** when a V-ROW names a claim about a code, the seat attaches `grep -n <CODE>` over every file
  the slice writes, and the question covers every hit. One grep, run at p3, would have saved one V
  round trip and one node.

### 2. Near-misses

- **The failure message I wrote first was wrong.** C3-1's done-when named `R3.4 first part, EXACT` as
  the failing message at START. At START the NEGATIVE assertion fails first, because the overruled
  sentence is live. The gate caught this before handoff, because it checks the first failing message
  per state and not just FAIL/PASS. Without that check, a BUILD seat would have hit a stated RED frame
  that does not match, and burned a question.
- **My claim that a mutant was undetected was false.** My first "Does NOT catch" for C3-3 said a
  second mention inside the note escapes the test. It does not: that makes 3 lines, and the count
  fails. The real gap is a second mention on the SAME line. I caught it by re-deriving the arithmetic
  before writing the gate, and the gate's `M_swap` and `M_thirdMention` mutants now pin both halves.
- **One case would have broken the step rule.** One case for R3.4b is the obvious shape. It cannot go
  green until the bullet is done, so the row step would have had no criterion true at its own
  boundary. Splitting it into two cases gives the measured ladder `28/1 → … → 31/0`.
- **Editing C2-2's case looked like the fewest changes.** It keeps the pair at `28:0`, which equals
  C2's GREEN pair at START, so C3's command could never be RED. The pair is the discriminator; the
  cases must be ADDED.
- **The reviewer's trace parser passes and is blind.** It prints zero gaps on Revision 4, but it reads
  `SPEC.md` and `C[12]` only. Quoting its pass would have "verified" a trace it never saw. The adapted
  parser fails on the Revision 3 plan (R3.4b has no step), which is the finding's own detector.

### 3. Dead ends (do not re-derive)

- The reviewer's `rev3-check.mjs` re-run shows 3 PROBLEMs, none a plan defect. Two come from the lane
  having moved to `ec66d5e7c`: C1 is built, so its "base" README passes C1-1. The third is the
  reviewer's own note on `:112`. A reviewer probe that reads the LANE as "base" goes stale the moment
  a cluster lands.
- `tests/unit/v30-support-provider.test.ts:550-555` reads §11 too. It holds none of C3's regions'
  codes, and the gate ran it on the final state (7/0 regressions). It does not need to join the C3
  command.
- C1's command is RED at `ec66d5e7c` (`28/0`, expect `24/0`). That is expected: a cluster command is
  pinned to its own boundary. Re-running an old cluster's command after later clusters land produces
  a "RED" that is not a defect.

### 4. Where the packet was unclear

- **Charge 3 against the V packet.** Charge 3 says "Do NOT rewrite C1/C2's blocks". The V packet's V-11
  effect column says "ARCH-FIX S03 p4 (C2-7 + a fix cluster on top of C2)". I added one pointer line
  under C2-7 and rewrote nothing, and I declared it in Revision 4 and DECISIONS. A packet line saying
  "a pointer line is allowed" would remove the doubt.
- **"pass: 4 of 3".** The line reads as a cap breach. The same defect was reported by REQ-FIX p5 (D3).
- **Charge 4, "re-run every cluster command AS IT NOW STANDS … at base".** C1 and C2 are built, so
  "base" is ambiguous: the intake base `776359c3`, or the lane HEAD. I ran at lane HEAD `ec66d5e7c`,
  as the dispatch named, and recorded C1's expected RED. It would be clearer to say "at the lane HEAD;
  old clusters' commands are informational".
- **Inputs.** They list INSTRUCTIONS.md, baselines.tsv and the intake §5b. Only INSTRUCTIONS mattered
  here. Naming them "if a pair moves" would save reads.

### 5. What repeatedly cost tokens

- **Re-deriving the README's current shape after each landed cluster.** About 6 tool calls: sed over
  §10/§11 and grep for the codes. A per-lane `readme-map.txt` (heading lines, table spans, code-mention
  lines), regenerated by the orchestrator at every cluster commit, would turn this into one read.
- **Writing a new vitest shim per pass.** `gate.mjs` is the third variant (p2 simulate, p3 gate, p4
  gate). A shared `probe-shim.ts`, holding it/describe/expect with `toEqual`, `toHaveLength` and
  `not.toContain`, plus the README-path mapper, would save about 3k tokens per ARCH-FIX pass and
  remove shim bugs as a risk.
- **Line numbers in prose.** Most citation work exists because steps cite `path:line`. C3 cites lines as
  "at `ec66d5e7c`" provenance only, and every criterion is a string anchor. Keep that rule.

## Upgrades, ranked by tokens saved

1. **Grep the defect's token before raising a V-ROW** (§1). This saves a whole REQ-FIX node and one V
   question, roughly 60–100k tokens across seats.
2. **Check the first-failing MESSAGE per state in the gate** (§2). It is cheap, and it converts a stated
   RED frame into a measured one. Make it the gate template's default.
3. **A shared probe shim plus an orchestrator-generated README map per lane** (§5). About 5–8k tokens
   per ARCH-FIX pass.
4. **Version reviewer probes by lane state.** A probe that reads the lane records the HEAD it expects,
   and refuses to run elsewhere, so a later re-run cannot be misread (§3).
5. **In packets, name the allowed shape for touching a built cluster's block** (§4).

## UNVERIFIED

- The C3 cases have not been run under real vitest. They ran under the Node 26 type-stripping shim on
  simulated README states. The lane is read-only, so the BUILD seat's C3-1 frame is the first real run.
- `pnpm typecheck` was not run for C3's added test code. The code uses only `readFile`, which the file
  already imports. Its types (`string[]` from `matchAll`) mirror C2-3's.
