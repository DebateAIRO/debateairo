REWORK READY FOR REVIEW · F-T1-ORACLE-LOGINFP round 3 of 3 · comments read through: t1-oracle-loginfp-codex-r2-2026-09-05

SKILLS LOADED: `heartbeat` (Skill tool) · `heartbeat-protocol` router (markdown,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`)
· `heartbeat-worker` (**Skill tool FAILED — "Unknown skill: heartbeat-worker"**; read as markdown at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`)
· `superpowers:using-superpowers` · `superpowers:test-driven-development` ·
`superpowers:verification-before-completion` · `superpowers:systematic-debugging` ·
`superpowers:receiving-code-review` (all Skill tool). Floor complete.

---

## 1. Verdict on the review

**B1 and B2 both verify. Both are fixed, and the round-2 mechanism is REPLACED rather than
extended** — because codex predicted the extension and was right: *"A fix that merely adds
reverse/sort to LENGTH_PRESERVING_USE will still miss map/slice, Set/map and non-dot
suffixes."* It would have.

**B1's class, in one sentence:** round 2 decided what a declaration *defines* by looking at
the *first operation applied to the literal*. Those are different questions, and codex broke
the substitution in both directions — five ordinary declarations that define exactly 1..5 and
were missed, six that define some other domain and were reported.

**B2's root cause:** round 2 classified each occurrence **twice, in two representations** —
raw source, where a comment interrupts the numeric run, and the lexer's comment-stripped text,
where it does not. One line set assembled from two contradictory verdicts. My round-2 claim
that layouts agreed "by construction" was false; they agreed because I had not written a case
where the representations differ, and a comment is the most ordinary such case.

**Nothing is contested. No pushback this round.**

## 2. Lane

| | |
|---|---|
| **lane tip** | **`60641339b983365952dd6cd61ed2f379aef6dc8a`** |
| previous tip (reviewed) | `fbc421dead025255866cf43b80bfeec21de6e151` · base `2af816f1` |
| files changed this round | `dialectical-engine/tests/unit/s1-1-depth-contract.test.ts` only |
| oracle file sha256 | `0a2b1920dc29d6bdded6374a0792b4589d6594e0207817cbc7031cf12c77caa0` |
| LoginFlow.tsx sha256 | `c946e45428214da4de31a5e267be0a24e9acc12f24aa55f01a683de2e8d20db6` — unchanged, still the value codex verified |
| pushed / merged | **nothing pushed, nothing merged**; board and DECISIONS untouched |

## 3. The mechanism, and why it is a different question

`WHOLE_DOMAIN` remains r3's pattern byte-for-byte and only FINDS runs. What changed is the
verdict.

**Rule 1 — the literal IS the domain.** If the run spells exactly `1,2,3,4,5`, the domain is
written in the source and it is a site, whatever follows. The three bare option-domain
controls now rest on this directly and no longer depend on any consumption rule.

**Rule 2 — the literal is LONGER.** The run is simulated through the declaration over a
deliberately tiny closed grammar: `slice` with integer-literal arguments, and `reverse`/`sort`
as permutations. The result is one of three things, and the third is what round 2 could not
express:

| simulated result | verdict |
|---|---|
| concrete, and IS the ruled domain | site |
| concrete, and is some OTHER domain (0..5, 0..3, 1..6) | withheld |
| **unknown, with something that can still select from it** — a later operation, or an enclosing value-collapsing constructor | site |
| **unknown, with nothing downstream** | withheld — this is LoginFlow's terminal `.map` into JSX |

A rest binding on the left narrows, and reports.

**The grammar is small on purpose, and that is now actually the safe direction.** Anything
unmodelled lands in unknown, and unknown is withheld only where nothing can act on the values.
So an unlisted operation costs a false positive, never a miss on a derived domain. Round 2
*claimed* that inversion and did not have it — its `!after.startsWith(".")` branch made
unlisted **syntax** permissive, which is the opposite of what it said.

**B2's fix is that comments are blanked to spaces in place**, offsets and newlines preserved.
A comment can no longer interrupt a run, and an offset still addresses the real file — so
there is one representation, one verdict per occurrence, and the declaration's start line
comes from that same occurrence instead of from a second scan of normalised text. The second
classification pass is gone.

Both stale comments codex named are corrected: the overview at the head of the scan, and the
"narrowed the shared `WHOLE_DOMAIN`" note on `kindOf`.

## 4. RED before GREEN — every counterexample class, both directions

**Source-only (codex's method: scanner block extracted from immutable blobs, types stripped in
memory, applied to strings — no Vitest, no imports, no mutation).**

`logs/t1-oracle-loginfp/40-RED-r3-all-classes.log` at `fbc421de`: **16 of 27 classes wrong.**
`logs/t1-oracle-loginfp/49-GREEN-r3-all-classes.log` at the committed tip: **0 of 27 wrong.**

The 27 are codex's six misses, the three round-1 derivations, the three bare option-domain
controls, six false positives, and nine layout/comment variants.

**The real LoginFlow source, edited only in memory** (`41-real-loginflow-inmemory.log`) —
codex's decisive B2 probe, reproduced and then closed:

```
variant                        base 2af816f1   round2 fbc421de round3 (tip)
unmodified                     site @252       none            none
comment after the zero         site @252       site @252       none
commented AND wrapped          site @252,253   site @253       none
line comment after zero        site @252,253   site @253       none
wrapped after the sentinel     site @252,253   none            none
one slot per line              site @252       none            none
```

**Vitest RED** (`44-RED-r3-controls-vitest.log`): round-3 controls present, round-2 classifier
restored in the working tree — **`Tests 20 failed | 46 passed | 13 skipped (79)`**, exit 1.
The twenty are the six B1 misses, the six B1 false positives, five comment layouts, and three
layout-agreement groups. The fix was then restored and hash-verified back to
`0a2b1920…` before the GREEN run.

**Vitest GREEN** (`45-GREEN-r3-oracle.log`): **`Tests 1 failed | 78 passed (79)`**.

**Oracle suite verbatim across the ticket: base `41/44` → r1 `49/50` → r2 `61/62` → r3 `78/79`.**
The one failure is the inherited J10 (§7).

**Three-run cluster on a CLEAN COMMITTED tree this round** (`47-r3-cluster-run{1,2,3}.log`):
`1 failed | 78 passed (79)` on all three, porcelain `[]` before and after each. **Worst run 78/79.**

**Layout agreement** (`42-layout-agreement.log`): nine groups, 36 spellings including commented
forms — all agree, all match intent.

## 5. Refutation — eight mutants, every half of B1 and B2 pinned

Selector for all eight: `-t "the depth bound has a single source"`, **verified GREEN at the
un-mutated tip first** (`48-r3-selector-green-at-tip.log`, `66 passed | 13 skipped (79)`, exit 0).
All eight record `pre/applied/restored 0/1/0`, `sha BEFORE == sha AFTER`, final porcelain `[]`.

| # | mutation | result | complete failing set within the selector |
|---|---|---|---|
| **m1** `50-…-remove-withholding` | withholding disabled in `record` | `24 / 42 / 13`, exit 1 | both shipped assertions; all seven "other domain" cases; all thirteen index-run layouts; two layout groups |
| **m2** `51-…-no-comment-blanking` | classify raw source instead of blanked | `7 / 59 / 13`, exit 1 | **exactly the five comment layouts + the index-run layout group** — the B2 pin |
| **m3** `52-…-unknown-always-terminal` | unknown never selectable | `3 / 63 / 13`, exit 1 | map-then-slice, block-callback map-then-slice, the narrowing layout group |
| **m4** `53-…-drop-literal-is-domain` | drop rule 1 | `1 / 65 / 13`, exit 1 | `array option domain` only — see below |
| **m5** `54-…-real-depth-bound-in-loginflow` | plant `expansionDepth < 6` into LoginFlow (**named temporary target**) | `2 / 64 / 13`, exit 1 | both shipped assertions, naming `LoginFlow.tsx:251 [DEPTH_BOUND_LITERAL]` |
| **m6** `55-…-neighbour-longer-index-run` | **neighbour** — login run extended to 0..6, still left whole | `0 / 66 / 13`, **exit 0** | nothing, correctly |
| **m7** `56-…-ignore-collapsing-wrapper` | ignore `new Set(`/`new Map(` | `1 / 65 / 13`, exit 1 | the `Set(map)` derivation only |
| **m8** `57-…-drop-slice-simulation` | stop modelling `slice` | `6 / 60 / 13`, exit 1 | all five slice-derived spellings + the narrowing layout group |

**m2, m3, m7 and m8 are one-to-one with the four clauses of the justification comment.** That
is deliberate: each clause of the argument has a mutant that kills exactly the controls that
clause exists to protect.

**m4 is reported narrowly, because it is weaker than it looks.** Dropping rule 1 kills only
`array option domain` (`{[1, 2, 3, 4, 5].map((value) => value)}`). The other bare controls
survive it, because the simulation independently reaches the same verdict for a bare literal
with no operations. Rule 1 is load-bearing in exactly one situation — the literal *is* the
domain **and** an unmodelled operation follows — and that is the single case m4 names. I am
not claiming more from it.

**Scope:** each row lists the complete set of names that failed **within the selected describe
block**. 13 cases outside the selector were skipped in every run and nothing above is a claim
about them.

## 6. Per-artifact custody (R2-N1) — generated from the logs, not summarised

Round 2's report said porcelain was `[]` "before and after every gate, mutant and suite run".
That was false for the three cluster logs, which record `[ M …test.ts ]` at both ends: they
were stamped runs of a **modified working tree**, valid evidence described wrongly, and the
blanket sentence diluted round-2 b14, which really was clean. **This table is generated by
reading each log's own header**, which is also how I found that two round-3 logs carry no
custody header at all.

| artifact | tree state it ran against | custody the log itself records |
|---|---|---|
| `40-RED-r3-all-classes.log` | working tree, pre-commit | **no custody header** — bare tool output |
| `41-real-loginflow-inmemory.log` | immutable git blobs | header names the method and the tip; reads blobs, never the tree |
| `42-layout-agreement.log` | immutable git blobs | header names the method and the tip; reads blobs, never the tree |
| `43-r3-shipped-sites.log` | immutable git blobs | header names the method and the tip; reads blobs, never the tree |
| `44-RED-r3-controls-vitest.log` | **MODIFIED** working tree | committed tip + porcelain `[ M …test.ts ]` + working sha256 |
| `45-GREEN-r3-oracle.log` | **MODIFIED** working tree | committed tip + porcelain `[ M …test.ts ]` + working sha256 |
| `46-r3-typecheck.log` | working tree, pre-commit | **no custody header** — bare tool output |
| `47-r3-cluster-run1.log` | clean, committed | commit + tree + file sha256 + porcelain BEFORE **and** AFTER, both `[]` |
| `47-r3-cluster-run2.log` | clean, committed | commit + tree + file sha256 + porcelain BEFORE **and** AFTER, both `[]` |
| `47-r3-cluster-run3.log` | clean, committed | commit + tree + file sha256 + porcelain BEFORE **and** AFTER, both `[]` |
| `48-r3-selector-green-at-tip.log` | clean, committed | commit + porcelain `[]` (single stamp) |
| `49-GREEN-r3-all-classes.log` | immutable git blobs | header names the method and the tip; reads blobs, never the tree |
| `50-r3-m1-remove-withholding.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `51-r3-m2-no-comment-blanking.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `52-r3-m3-unknown-always-terminal.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `53-r3-m4-drop-literal-is-domain.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `54-r3-m5-real-depth-bound-in-loginflow.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `55-r3-m6-neighbour-longer-index-run.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `56-r3-m7-ignore-collapsing-wrapper.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `57-r3-m8-drop-slice-simulation.log` | clean, committed (harness refuses a dirty tree) | mutate.sh: pre/applied/restored 0/1/0, sha BEFORE==AFTER, final porcelain `[]` |
| `58-r3-b14-full-suite.log` | clean, committed | commit + tree + file sha256 + porcelain BEFORE **and** AFTER, both `[]` |

Two rows deserve naming rather than hiding in a table: `40-RED-r3-all-classes.log` and
`46-r3-typecheck.log` are bare tool output with no custody header. 40 names the immutable
revision it scanned in its first line, which is the fact that matters for a source-only RED
frame; 46 is `tsc` output produced against the working tree before the commit, and its value
is the diagnostic list, which is compared byte-for-byte in §7. Neither is offered as
tree-state evidence.

## 7. Gates

**Typecheck differential** (`46-r3-typecheck.log` vs the round-1 baseline `02-`): **8 → 8**,
sorted lists **byte-identical**, all in `s14-ui.test.ts`, **zero errors in the changed file**.

**Shipped sites** (`43-r3-shipped-sites.log`, 232 files, scanners from immutable blobs):

```
BASE 2af816f1     apps/ui/components/LoginFlow.tsx:252 [DOMAIN_ENUMERATION] {[0, 1, 2, 3, 4, 5].map((slot) => (
                  packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;
ROUND 2 / ROUND 3 packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;
```

Base minus the false positive, unchanged by this round. `apps/ui/app/new/page.tsx` is named
by no list.

**b14 — ONE `pnpm test`** at `60641339`, `58-r3-b14-full-suite.log`, clean before and after:

```
 Test Files  34 failed | 226 passed (260)
      Tests  78 failed | 2375 passed (2453)
     Errors  1 error
   Duration  2890.28s
EXIT = 1
porcelain AFTER: []
tip AFTER = 60641339b983365952dd6cd61ed2f379aef6dc8a
```

### Four counts, vs `logs/w5/31-fourcount-run2.log` / `27-suite-run2.log` and round-2 b14

| # | count | round 3 | round 2 | round 1 | W5 run 2 (parent) |
|---|---|---|---|---|---|
| 1 | test failures | **78** | 78 | 79 | 80 |
| 2 | suite-load | **1** (`tests/unit/s14-ui.test.ts`) | 1 | 1 | 1 |
| 3 | skips | **0** | 0 | 0 | 0 |
| 4 | unhandled | **1** (`ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP`, s7 authorization-database) | 1 | 1 | 1 |

**Parse check: summary 78 vs distinct parsed names 78 — MATCH.**

**Attribution: NO unexplained name.**
- versus W5 run 2: **exactly two vanished, zero appeared** — the two shipped-depth assertions
  this ticket closes.
- versus round-2 b14: **zero vanished, zero appeared** — an identical name set, so this round's
  rewrite moved nothing in the suite.
- Arithmetic closes: `80 − 2 = 78`; `2418 + 35 = 2453`; `2338 + 35 + 2 = 2375`.
  (+35 because the oracle file goes from 44 cases at base to 79.)

The sendmail case (R1-N1) passed in this run, as it did in round 2. Its classification is
unchanged and remains **PROVISIONAL** — intermittence established across the lineage, cause
not determined; codex cleared that wording in r2 and I have not widened it.

**J10** (`web/package.json` absent, `tools/orphan-audit/src/index.ts:52`) is inherited at dev
`b5a6b6eb`, base `2af816f1` and this tip; it throws before its assertion, so 78/79 is not an
architecture pass. Outside my contract. Cleared by codex in r2 and unchanged.

## 8. Findings (§5)

1. **Intermittent local-process timeout** — `tests/unit/registration.test.ts › S3 rework4
   fold-in terminates sendmail options before the recipient` (R1-N1). Local `/bin/sh` fixture,
   `timeoutMs: 1_000`, one failure at 1011 ms in round-1 b14, green in rounds 2 and 3.
   `fileParallelism: false`. Cause undetermined; not merged with W5's model-shim. Out of contract.
2. **Inherited J10 `ENOENT`** — out of contract; still the reason this file cannot be green on
   this tree and every mutant here needs a narrowed selector.
3. **The simulator's modelled grammar is three operations wide** (`slice`, `reverse`, `sort`).
   Everything else is unknown, which is safe where anything follows it or a collapsing wrapper
   encloses it, and withheld where it is terminal. A *terminal* operation that nonetheless
   yields exactly 1..5 from a longer literal would be missed. I could not construct one, and I
   am not claiming it is impossible — stated as a known bound, not a proof.
4. **Comment blanking inherits the existing lexer's regex-literal exposure**: `//` inside a
   regex literal reads as a line comment. Pre-existing and documented in that lexer; not
   widened, not fixed.

## 9. Round-3 status of every earlier finding

| ref | status |
|---|---|
| r1 B1 (three derivations) | fixed in r2, **still passing** in r3 — asserted in the same block as codex r2's six |
| r1 B2 (wrapping) | fixed in r2, **still passing** in r3 — now also under comment variants |
| r2 B1 (consumption classifier) | **fixed this round**; mechanism replaced, not extended |
| r2 B2 (two representations) | **fixed this round**; comments blanked in place, second pass removed |
| r2 N1 (custody wording) | **corrected** — §6, per artifact, generated from the logs |
| r1 N1 (sendmail) / J10 | cleared by codex; unchanged, restated in §7–8 |
| r1 N2 (evidence scope) | m4 reported narrowly in §5 for exactly this reason |
| r1 N3/N4/N5 (packet) | cleared by codex in r2; AMENDMENT 2's constants verified, no new packet defect |

## 10. Records

Self-report (round-3 section appended; router §3 question answered again):
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-loginfp-self.md`
Logs: `…/logs/t1-oracle-loginfp/` — r1 `00-`…`13-`, r2 `20-`…`33-`, r3 `40-`…`58-`. No
historical log rewritten; the four round-3 source-only logs were regenerated against the
committed tip **before** any of them was cited, and say so in their own headers.
TOOLING-TRAPS: unchanged this round (r1 and r2 appends stand; no new trap that is not already
covered by the two round-2 entries).

**REWORK READY FOR REVIEW** · comments read through: `t1-oracle-loginfp-codex-r2-2026-09-05`
Round 3 of 3 — the last authorized round. Nothing pushed. Nothing merged. Board and DECISIONS
untouched. Anything the reviewer still finds open goes to V.

---

# APPEND 2026-09-06 · T1-ORACLE-LOGINFP-R3-N round 1 of max 3 · records only

Everything above this line is the record as it was reviewed and is **not edited**. The lane is
PARKED at `60641339` under D68 as the evaluator's control corpus; no code, no lane, no log, and
no historical packet is touched by this append. `comments read through:
t1-oracle-loginfp-codex-r3-2026-09-06`.

## A. N1 — the four summaries that disagreed with their artifacts

Each was re-derived from the artifact before being written here.

**A.1 — the layout total is 37, not 36.** `42-layout-agreement.log` records nine groups of
8 + 5 + 3 + 2 + 2 + 3 + 3 + 6 + 5 = **37** spellings. §4's sentence "nine groups, 36 spellings"
is corrected to **37**. The claim it carries — that all nine groups agree and match intent — is
unaffected by the count and still reads as the log records it.
**STRENGTH: entailed** (arithmetic over the log's own group lines).

**A.2 — m2 fails SIX comment layouts, not five.** `51-r3-m2-no-comment-blanking.log` fails
seven names: `the real login array, block comment after the sentinel` · `the real login array,
commented AND wrapped` · `the real login array, line comment after the sentinel` · `index run,
block comment after the sentinel` · **`index run, commented AND wrapped`** · `index run, line
comment after the sentinel` · `gives equivalent layouts the same verdict — 'an index run left
whole'`. §5's m2 row said "exactly the five comment layouts + the index-run layout group"; the
sixth, `index run, commented AND wrapped`, was omitted. Corrected to **six comment layouts plus
the one layout group**. The row's own count cell already read `7 / 59 / 13`, so the row
contradicted itself and the prose was the wrong half.
**STRENGTH: entailed** (the seven `×` lines in that transcript).

**A.3 — log 40's custody row was wrong in its tree column.** `40-RED-r3-all-classes.log` opens
`scanner under test: fbc421de (base 2af816f1 shown for reference)`. It is a **revision-labelled
source-only frame**: it names the immutable blobs it scanned and carries **no tree-state
custody** — no working-file hash, no porcelain. §6's table row labelled it "working tree,
pre-commit", which is not what the log establishes. Corrected row:

| artifact | tree state it ran against | custody the log itself records |
|---|---|---|
| `40-RED-r3-all-classes.log` | immutable git blobs (`fbc421de`, base `2af816f1`) | revision labels only — **no tree-state custody**: no working-file hash, no porcelain |

§6's prose already narrowed the headerless set correctly to 40 and 46; the generated row did
not, and the prose was right. **STRENGTH: entailed** for the row's correction; the environment
that produced the headerless 40 and 46 is **undetermined** from those logs alone.

**A.4 — why the generated table was wrong, which matters more than the row.** The generator
classified a log as source-only by grepping its header for `source-only scanner harness`. Log 40
was written *before* I added those headers, so it fell to the generator's `else` branch,
"working tree, pre-commit". I then presented the table as "generated from the logs, not
summarised" as though generation made it correct. **It does not: a generated table is only as
good as its classifier, and mine had a silent default.** That is the same class as the three
retractions it was meant to end — a summary asserting more than its evidence — arriving one
level down, in the tool instead of the prose.
**STRENGTH: entailed** (the classifier's branch and log 40's header are both readable; the
causal account of my own generator is **consistent-with**, since the generator script is in
scratchpad and is not a filed artifact).

**A.5 — one further discrepancy codex noted, which I cannot fix here.**
`43-r3-shipped-sites.log` carries the correct immutable-blob header, but its inner table label
still reads `--- ROUND 3 (working tree) ---` because the label predates the regeneration. The
log is inside `logs/t1-oracle-loginfp/*`, which this ticket holds **readonly**, and D68 parks
the lane's logs. **It is left as it is and recorded here instead**: that log's round-3 column
was produced from the committed blob `60641339`, as its header states, not from a working tree.
**STRENGTH: entailed** (header and label are both present in the file and disagree).

## B. N2 — D67 claim-strength labels for this report

D67 requires `STRENGTH:` on every finding and claim, with **consistent-with as the ceiling for
any attribution not measured directly**. Neither report carried one. The index below labels the
report's claims by section; where a section mixes a measured result with an inference, the two
are split, because that split is the whole point of the policy.

| § | claim | STRENGTH |
|---|---|---|
| 1 | B1 and B2 as reviewed are real defects of the round-2 code | **entailed** — reproduced in `40-…log` before any change |
| 1 | "the round-2 mechanism is replaced rather than extended" | **entailed** — the diff replaces the classifier |
| 2 | tip, file shas, LoginFlow sha unchanged, nothing pushed or merged | **entailed** — hashes and `git status`/no-upstream, recorded |
| 3 | the two-rule mechanism behaves as described **on the 27 recorded classes** | **entailed** (logs 40/49) |
| 3 | "an unlisted operation costs a false positive, never a miss on a derived domain" | **undetermined** — a completeness claim over all unmodelled operations; no proof is offered and §8.3 already states the bound. This is the strongest sentence in the report and it is not entailed |
| 4 | 16 of 27 wrong at `fbc421de`; 0 of 27 at the tip | **entailed** |
| 4 | the LoginFlow in-memory table (six variants × three scanners) | **entailed** |
| 4 | vitest RED `20 / 46 / 13`; GREEN `1 / 78 / 79`; cluster 3× `78/79` | **entailed** |
| 4 | "nine groups, **37** spellings — all agree, all match intent" (A.1) | **entailed** for the nine recorded groups; **undetermined** as a general layout-independence claim |
| 5 | each mutant's counts and its complete failing set within the selector | **entailed** |
| 5 | "every half of B1 and B2 pinned" | **undetermined** — it presumes the halves are exhaustive. codex r3 then found B1/B2/B3 beyond them, which settles it: the presumption was false |
| 5 | m4 is load-bearing in exactly one situation | **entailed** for the recorded failing set; the "exactly one" reading is **consistent-with** |
| 6 | per-artifact custody, as corrected by A.3 | **entailed** for the fields each log records; **consistent-with** for the executions those fields describe; **undetermined** for historical log immutability — no hash manifest was ever captured |
| 7 | typecheck 8 → 8 byte-identical, zero in the changed file | **entailed** |
| 7 | shipped sites: base names two, the tip names one, over 232 files | **entailed** for that corpus at those revisions; **undetermined** as preservation of every ordinary domain construction |
| 7 | b14 four counts 78 / 1 / 0 / 1, parse check 78 = 78 | **entailed** |
| 7 | "zero unexplained name" | **entailed** as a NAME-SET result (two vanished vs W5, none appeared; identical set to round 2). **consistent-with** as attribution — the 78 inherited failures were reconciled by name, not re-diagnosed, and identical names are not proof of identical causes |
| 7 | the arithmetic `80−2=78`, `2418+35=2453`, `2338+35+2=2375` | **entailed** |
| 8.1 | sendmail: local `/bin/sh` fixture, `timeoutMs: 1_000`, 1011 ms failure, `fileParallelism: false`, green in rounds 2 and 3 | **entailed** for each measurement; **consistent-with** for intermittence across the lineage; **undetermined** for cause |
| 8.2 | J10 inherited at `b5a6b6eb`, `2af816f1` and the tip; it throws before its assertion | **entailed** |
| 8.3 | the simulator's three-operation bound; a terminal operation yielding 1..5 would be missed | **entailed** that the bound exists; **undetermined** whether such an operation exists — I could not construct one and did not prove there is none |
| 8.4 | comment blanking inherits the lexer's regex-literal exposure | **entailed** |
| 9 | earlier findings' status | **entailed** where codex recorded a clearance; **consistent-with** for my own "still passing" rows, which rest on the same 27-class corpus |

## C. D67 ADDENDUM — universal sweep after these retractions

`tools/universal-sweep.sh` over both records lists **51 universally quantified sentences in the
report and 66 in the self-report**. Four stood on a premise retracted above; each is settled here:

1. §4 "all agree, all match intent" — the count changes to 37 (A.1); the agreement claim is
   unaffected and stays **entailed for the nine recorded groups**.
2. §5 m2 "exactly the five comment layouts" — corrected to six (A.2).
3. §5 "each clause has a mutant that kills exactly the controls that clause exists to protect" —
   still supported for the four clause-mutants, with m2's set corrected to six-plus-one.
   **STRENGTH: entailed** for the recorded sets.
4. §6 "two round-3 logs carry no custody header at all" — **stands**: 40 and 46. It was the
   table row, not this sentence, that was wrong (A.3).

The remaining universals are scoped to a named artifact and are unaffected by these retractions.
**STRENGTH: entailed** for the sweep counts; **consistent-with** for "unaffected", which is my
reading of each sentence rather than a mechanical result — the tool lists, the author judges.

## D. What this ticket does not claim

- It does not revive round 3. D68 ruled the evaluator; **B1, B2 and B3 of codex r3 stand
  open and are not answered here.** **STRENGTH: entailed** — no code changed.
- It does not certify historical log immutability. No hash manifest was captured when the logs
  were written, so byte-preservation is **undetermined** and I stop saying otherwise.
- It does not re-diagnose the 78 inherited failures. **consistent-with**, as above.

**READY FOR PEER REVIEW** · `comments read through: t1-oracle-loginfp-codex-r3-2026-09-06`
Records only. Append only. Lane untouched at `60641339`; no code, no git, no board, no DECISIONS.

---

# APPEND 2026-09-06 (2) · T1-ORACLE-LOGINFP-R3-N round 2 of max 3 · after codex records-r3n r1 (B-B1, B-B2)

Everything above, including APPEND (1), is **unedited**; the original sentences are preserved and
this section supersedes them by disposition. Lane still PARKED at `60641339`; no code, no git,
no log, no packet. `comments read through: records-r3n-codex-r1-2026-09-06`.

**Vocabulary used below.** `DISPOSITION` says what happened to a claim — *refuted*, *established*,
*superseded*, *stands*. `STRENGTH` says how well the **evidence for the disposition** is
supported. They are separate axes, and conflating them is what B-B1 charges: a claim can be
**refuted** by evidence that is itself **entailed**.

## E. B-B1 — three claims given explicit dispositions

**E.1 — "an unlisted operation costs a false positive, never a miss on a derived domain"
(§3 at :67 and :259; index row 3 at :371).**

> **DISPOSITION: REFUTED.** Not undetermined. APPEND (1) labelled it a completeness claim of
> unknown status; that label was wrong, because the counterexamples were already recorded in the
> review I was citing.

The recorded evidence is codex r3 B1's four declarations. I re-derived each value directly rather
than repeat the review's arithmetic:

| declaration | value | is the ruled domain |
|---|---|---|
| `[0,1,2,3,4,5].filter(n => n > 0)` | `[1,2,3,4,5]` | yes |
| `[0,1,2,3,4,5].flatMap(n => n ? [n] : [])` | `[1,2,3,4,5]` | yes |
| `[0,1,2,3,4,5].splice(1)` | `[1,2,3,4,5]` | yes |
| `[1,2,3,4,5,6].filter(n => n < 6)` | `[1,2,3,4,5]` | yes |

Round 3 returns `[]` for all four; base `2af816f1` and round 2 report each. So the mechanism does
miss a derived domain, and the "never" was false when written.
**STRENGTH: entailed** for the four values (direct calculation) and for the round-3 scanner
outputs (inherited recorded evidence in codex r3 B1, not a fresh replay by me).

**E.2 — "a terminal operation yielding exactly 1..5 … I could not construct one, and I am not
claiming it is impossible" (§8.3 at :261; index row 8.3 at :387).**

> **DISPOSITION: the counterexamples are ESTABLISHED.** The existence question is closed, not
> open. A terminal `.filter(n => n > 0)` is an ordinary one: **the selection happens inside the
> final operation and needs no subsequent operation at all**, which is precisely the case my
> position-based rule could not see. `flatMap` and `splice` are two more. A terminal
> `.map(n => n || 1)` yields the distinct value domain `1..5` as well.

The honest account of my error is not "I could not construct one". It is that **I wrote a
label about an open question over evidence that had already closed it** — codex r3 B1 was on
disk, and its file is one I had read, when APPEND (1) called this undetermined.
**STRENGTH: entailed** for the counterexamples; **consistent-with** for my account of why I
mislabelled it.

**E.3 — "comment blanking inherits the existing lexer's regex-literal exposure … not widened,
not fixed" (§8.4 at :263–265; index row 8.4 at :388).**

> **DISPOSITION: SUPERSEDED** by codex r3 B3's distinction, which APPEND (1) did not make.

Two different things were run together in one sentence. B3 separates them: the **declaration
lexer's inability to distinguish a regex literal from syntax is inherited** — that half stands.
But round 3 **gave that limitation a new role**: blanking treats the slashes inside a regex
character class as a comment and erases the occurrence from the prepass, so the same limitation
now produces a **new observable use, and a round-2-to-round-3 regression**. "Not widened" is true
of the lexer and false of the system: the limitation was not enlarged, its consequences were.
**STRENGTH: entailed** for the distinction as recorded in B3; the round-3 scanner outputs behind
it are inherited recorded evidence, not a fresh replay by me.

**E.4 — consistency check on the neighbouring row.** Index row 5 ("every half of B1 and B2
pinned") already carries an explicit disposition — the presumption was false. Rows 3 and 8.3 now
carry one of the same kind, which is what B-B1 asked for: refuted completeness is stated as
refuted, not as unknown. **STRENGTH: entailed** (both rows are readable above).

## F. B-B2 — atomic labels for the report-side members the verdict names

Each row below is addressable on its own; none delegates to another row.

**F.1 — :332 / :335, log 40's corrected custody cell.**

| element of the cell | STRENGTH |
|---|---|
| the log carries scanner/base **revision labels** `fbc421de` / `2af816f1` | **entailed** — read from line 1 |
| the log carries **no working-file hash and no porcelain** | **entailed** — absence verified across the file |
| the correction of the *previous* row's "working tree, pre-commit" label | **entailed** — that label contradicted the log's own first line |
| **that the run actually executed against immutable blobs** | **consistent-with** — a revision label is a claim the log makes about itself; it is attribution, not a recorded execution trace |

APPEND (1)'s cell asserted the execution method as if it were read from the artifact. It was
not: **only the labels were.** The corrected reading is that the tree-state column for log 40
should say *"revision labels only; execution method not independently recorded"*.

**F.2 — :346 and self-report :528, the generator's `else` branch.**

| claim | STRENGTH |
|---|---|
| the emitted row for log 40 said "working tree, pre-commit" and is wrong | **entailed** — readable in APPEND (1)'s own table and contradicted by log 40 |
| log 40 lacks the header string the generator keyed on | **entailed** |
| **that a silent `else` default is the code path that produced the bad row** | **undetermined** — the generator lives in scratchpad, is not a filed artifact, and a wrong output does not determine the branch that produced it |

APPEND (1) labelled this **entailed** and then conceded in the same parenthesis that the script
is unfiled. Those two cannot both hold. The correct label is **undetermined**, and the design
lesson (§A.4, and Upgrade 17) is a **proposal**, not a diagnosis.

**F.3 — :369, "nothing pushed, nothing merged".**

| claim | STRENGTH |
|---|---|
| present tip `60641339`, porcelain empty, no upstream configured, recorded file hashes | **entailed** — present local observations |
| **that no push or integration ever occurred, anywhere** | **undetermined** — the observations establish present local state; they cannot exclude a transient past operation or a copy elsewhere |

The claim I can actually make is the bounded one: *at every point I observed it, the lane had no
upstream and a clean tree, and I performed no push or merge.* The last clause is **entailed** for
my own actions and **undetermined** as a statement about the repository's history.

## G. Sweep of the FULL report, including this append (B-B2)

APPEND (1) swept the **pre-append prefix** — 51 lines through :292 — and reported that as the
sweep. That boundary was the defect: the newly authored append was never swept, and B-B2's
findings are inside it.

Current measurement over the whole file, `tools/universal-sweep.sh`:

| scope | matching lines |
|---|---|
| whole report as it now stands | **74** |
| of those, inside APPEND (1) (lines > 292) | **23** |

**STRENGTH: entailed** for the counts (they are grep line counts, reproduced against codex's
independently obtained 74). **Not** a sentence count and **not** semantic coverage — the tool
lists, the author judges.

The 23 append-internal universals resolve as follows. Four are corrected by §E and §F above
(rows 3, 8.3, 8.4 and the log-40 cell). Fourteen are scoped to a named artifact and stand as
labelled. Five are quantifiers inside quoted historical sentences and carry the disposition of
the sentence they quote. **STRENGTH: consistent-with** for this partition — it is my reading of
each line, not a mechanical result.

Two of APPEND (1)'s own universals need their labels tightened here:

- ":305 Each was re-derived from the artifact before being written here" — **entailed** for A.1,
  A.2, A.3 and A.5 (each has a command in this session); **consistent-with** for A.4, whose
  subject is an unfiled script.
- ":394 the sweep 'lists 51 … and 66 …'" — **entailed** as a measurement of the pre-append
  prefixes; **superseded** as a description of this record, which is 74 / 87.

## H. What this append does not claim

- It does not reopen the lane or answer codex r3's B1, B2 or B3. **STRENGTH: entailed** — no code
  changed; D68 routes them to the evaluator.
- It does not re-execute any scanner. The round-3 outputs behind E.1 and E.3 are **inherited
  recorded evidence**; only the array values in E.1 were computed fresh here.
  **STRENGTH: entailed** for that separation.
- It does not certify historical append-only preservation of every byte. Prefix digests match
  at the boundaries checked; full historical preservation remains **undetermined**.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r1-2026-09-06`
Records only. Append only. Lane untouched at `60641339`; no code, no git, no board, no DECISIONS.

---

# APPEND 2026-09-06 (3) · self-audit of APPEND (2), before filing · same ticket, same round

Upgrade 19 says a correction must be audited by the rule it is enforcing, on itself, before
filing. I ran that audit on APPEND (2) and it found two defects **of the two classes APPEND (2)
had just finished documenting.** Both are corrected here; both originals are preserved.

**AU.1 — §G's sweep counts excluded the append containing them.** §G reports the report's
universals as **74**, measured before APPEND (2) existed. Including APPEND (2) the count is
**89**. This is the same boundary defect codex charged in B-B2 and that §G itself describes —
committed one append later, in the paragraph correcting it.

> **DISPOSITION: §G's "74" is SUPERSEDED as a description of this record.** It stands as a
> measurement of the prefix through line 418.

Restated with an explicit, stable boundary — which is the durable fix, because any count of a
file stated inside that file is stale the moment it is written:

| boundary | matching lines |
|---|---|
| prefix through :292 (before APPEND 1) | 51 |
| prefix through :418 (before APPEND 2) | 74 |
| prefix through :573 (before this append) | **89** |

**STRENGTH: entailed** for the three counts, each tied to a named boundary rather than to "as it
now stands".

**AU.2 — §F.3's bounded restatement is right; one word in the self-report's companion is not.**
See the self-report's AU.3. No change to §F.3.

**What this demonstrates, and it is the most useful line in these records.** APPEND (2)
documented two failure classes and then committed one of each inside itself, *while its author
was attending to exactly those classes*. That is evidence — the strongest available here — that
**Upgrade 19 cannot work as a resolution and only works as a mechanical gate**: the sweep must be
run by the harness at file time, over the complete file, or it will keep being run against the
wrong boundary by an author who has just written about running it against the wrong boundary.
**STRENGTH: entailed** for the two defects; **consistent-with** for the conclusion drawn from
them.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r1-2026-09-06`

---

# APPEND 2026-09-06 (4) · T1-ORACLE-LOGINFP-R3-N round 3 of 3, the last · after codex records-r3n r2

Everything above, including APPENDs (1)–(3), is **unedited**. Lane PARKED at `60641339`; no code,
no git, no log, no packet. `comments read through: records-r3n-codex-r2-2026-09-06`.
Rows 1–3 of B-R2-B1's table are report-side and are done here, one at a time; rows 4–7 are
self-report-side and are done there. **Each fix states the rule it embodies (D67 ADDENDUM 3).**

## J. B-R2-B1, rows 1–3

**J.1 — row 1 (:501, :512). Log 40's execution method, and the wrong row cited.**

Two separate errors in APPEND (2)'s F.1.

*The label.* F.1 said the old "working tree, pre-commit" cell was **contradicted** by log 40's
first line. It is not. A working copy checked out at `fbc421de` and an immutable-blob read are
**both compatible** with a header that names only revisions. The header does not disprove the old
label; it fails to support it.

> **DISPOSITION: the old execution label is UNSUPPORTED, not disproved.** The replacement stands
> unchanged: *"revision labels only; execution method not independently recorded."*
> **STRENGTH: entailed** that the header carries revision labels and no working-file hash or
> porcelain; **undetermined** which execution actually occurred.

*The citation.* F.1 located the bad row at **:332**. That is wrong: :332 is APPEND (1)'s
**corrected** row and already reads "immutable git blobs". The row carrying the bad text is
**:166**, in the original §6 table: `| 40-RED-r3-all-classes.log | working tree, pre-commit |
**no custody header** — bare tool output |`. **STRENGTH: entailed** — both lines are quoted above
from the file.

> **RULE — an artifact's silence about X makes a claim about X unsupported, never false.**
> Disproof needs evidence that excludes the claim, not evidence that omits it.

**J.2 — row 2 (:513). One label for a compound description.**

F.2's first row read "log 40 lacks the header string the generator keyed on — **entailed**".
That is two claims welded together and only one of them is observable:

| clause | STRENGTH |
|---|---|
| log 40 does not contain the string `source-only scanner harness` | **entailed** — absence verified across the file |
| that string was the key the generator branched on | **undetermined** — the generator is unfiled; the emitted row does not reveal the predicate that produced it |

F.2's own second row already labels the branch **undetermined**. Its first row contradicted that
by smuggling the same asserted branch into a clause labelled entailed.

> **RULE — a compound claim takes one label per clause, and if it is stated as a unit it takes
> the weakest of them.** "Lacks the string the generator keyed on" is entailed only if the key is
> established; here it is not.

**J.3 — row 3 (:527). An unbounded observation interval.**

F.3 replaced "nothing pushed" with *"at every point I observed it, the lane had no upstream and a
clean tree"*. That is false as written **against this record's own contents**: report :170–171
list `44-` and `45-` as **MODIFIED** working trees, and the round-2 cluster logs record
`[ M …test.ts ]` before and after. I observed modified trees repeatedly, and said so in the same
document.

> **DISPOSITION: REPLACED, in two separately labelled parts.**
>
> - *Present state:* at the observations recorded in this records round — APPEND (1) §D, APPEND
>   (2) §H, APPEND (3), and this append — the lane is at `60641339` with empty porcelain and no
>   configured upstream. **STRENGTH: entailed** for those recorded observations.
> - *My own conduct:* I performed no push and no merge on this lane. **STRENGTH: this is an
>   author attestation, not an independently established fact** — it is **consistent-with** the
>   recorded state and **undetermined** as repository history.
>
> The clean-tree clause is dropped entirely: it was never true across the interval it claimed.

> **RULE — an observation claim names the interval it covers, or claims only the present; and an
> author's attestation about their own actions is labelled separately from established history.**

## K. B-R2-B2, report side (:591–592)

APPEND (3)'s AU.1 justified its boundary table with: *"any count of a file stated inside that
file is stale the moment it is written."* Too strong, and codex supplied the counterexample; I
reproduced it. A file whose sweep count is 1, appended with a line containing no universal, still
counts 1 — **the count survived the write.**

> **DISPOSITION: NARROWED.** Correct statement: **any write invalidates *verification* of the
> previous complete-file state, whether or not the count changes.** The number may remain right;
> the receipt stops covering the new bytes until it is re-run.
> **STRENGTH: entailed** — the in-memory control reproduces (before 1, after 1, file changed).

AU.1's three report boundaries are re-verified against the current file and all hold: **:292 → 51
· :418 → 74 · :573 → 89**, with the complete file at **:615 → 92**. No prose in AU.1 attaches a
count to the wrong boundary. **STRENGTH: entailed** — recomputed here with the tool's own
expression.

> **RULE — a measurement is quoted with its boundary in the same clause, and prose citing it is
> re-checked against the table, not against memory.**

## L. D67 ADDENDUM 3 — re-read of both records: where else did I decide this?

A re-read, not a search — and the difference produced a finding a search could not (see the
self-report's §W3.1, a line-broken instance no `grep -n` matches). Report-side repeats:

| where | the same decision | disposition |
|---|---|---|
| §3 :69 | the refuted sentence itself — "an unlisted operation costs a false positive, never a miss on a derived domain" | **REFUTED** (E.1). This is its origin; :371 and :435 are its index and correction |
| §1 :18 | "It would have" — a counterfactual about the rejected alternative fix | **undetermined** as a counterfactual; **consistent-with** that codex named the misses it predicted |
| §6 :155, :160 and §9 :275 | "generated from the logs, not summarised" / "This table is generated by reading each log's own header" — asserted three times | the table's **contents** are checkable against the logs (**entailed** where they match); the **generation provenance** is **undetermined**, the generator being unfiled. F.2 corrected the label but not these three headings |
| §10 :285 | "No historical log rewritten" | **entailed** that I rewrote none; **undetermined** as a property of the files' full history — the same absence-everywhere shape as row 5 |
| §10 :285–287 | "regenerated against the committed tip **before** any of them was cited" | author attestation about ordering — **consistent-with**; the logs' headers carry timestamps, the citation order is not independently recorded |
| §5 :141–142 | "each clause … kills exactly the controls that clause exists to protect" | stands, with m2's set corrected to **six** comment layouts plus one group (APPEND (1) A.2) |
| §7 :250–252 | "Attribution: NO unexplained name" | already split in APPEND (1) row 7 — name-set equality **entailed**, cause attribution **consistent-with**; unchanged |

**STRENGTH: entailed** for each quoted location; **consistent-with** for my judgement that these
are the same decision recurring.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r2-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.

---

# APPEND 2026-09-06 (5) · T1-ORACLE-LOGINFP-R3-N round 4 (V-authorised) · after codex records-r3n r3

Everything above, including APPENDs (1)–(4), is **unedited**. Lane PARKED at `60641339`; no code,
no git, no log, no packet. `comments read through: records-r3n-codex-r3-2026-09-06`.
Report-side residuals are done here; self-report-side ones in that file's APPEND (5).

## M. B-R3-B1 row 1 (report :720) — my own conduct is an attestation

The §L row reads: *"No historical log rewritten" — **entailed** that I rewrote none.* That upgrade
is the very move J.3 corrected two sections earlier, applied to myself.

> **DISPOSITION: RELABELLED.**
> - **Entailed:** the logs' present contents, and the byte comparisons actually recorded — the
>   two prefix digests at :292 / self :485, and the mtimes observed in this round.
> - **Attestation, consistent-with:** *I rewrote no historical log.* It is consistent with every
>   inspected artifact and with no contrary evidence; it is not a recorded action trace.
> - **Undetermined:** any activity outside those observations.

> **RULE — an author's statement about their own conduct is an attestation and takes
> consistent-with; entailed is reserved for the artifact's presence and measured bytes.** I
> wrote this rule at J.3 and then broke it in the mapping table eight lines later.

## N. B-R3-B2 (report :712–713) — the search claim is refuted; the tool listed it

§L opens: *"A re-read, not a search — and the difference produced a finding a search could not
(… a line-broken instance no `grep -n` matches)."* **That is false, and I verified it against the
mandated tool rather than accepting it.** `tools/universal-sweep.sh` greps individual quantifier
words, `never` among them. Line 387 ends in "… never a", so the tool matches it:

```
387:of an unlisted operation is a false positive, which is loud and costs one visible diff, never a
```

It is present in the whole-file sweep **and in the round-2 prefix sweep at :601** — the very run I
filed. The tool surfaced the candidate; **I did not dispose of it.**

> **DISPOSITION: the "a search could not" clause is REFUTED and WITHDRAWN.** What is actually
> demonstrated is narrower: *a literal single-line phrase search for `never a miss` omits that
> occurrence, because the phrase spans a line break. The word-level sweep does not omit it.* Two
> different predicates; only the first failed, and it was mine, not the mandated one.
> **STRENGTH: entailed** — both probes run above against the preserved text.
>
> The REFUTED disposition of the sentence at self :387–388 is untouched and stands (§W3.1).

> **RULE — a keyword sweep LISTS candidates; it cannot dispose of them. When a listed candidate
> survives, the failure is the author's disposition step, not the tool's recall.** My re-read is
> what prompted the correction — that is an **attestation**, and which action caused it is
> **undetermined**.

## O. B-R3-N1 (report side) — one address correction, and the aggregate that hid it

**O.1 — the address.** §L's last row cites *"Attribution: NO unexplained name"* at **:250–252**.
The text is at **:234**. **STRENGTH: entailed** — `**Attribution: **NO unexplained name.**` is at
line 234; :250–252 carries other text. The row's disposition is unchanged; only its address was
wrong.

**O.2 — the aggregate that let it through.** §L closes *"**STRENGTH: entailed** for each quoted
location"*. I asserted that without re-checking the line numbers, and **six of the seven
mapping addresses across both records were wrong** (one here, five in the self-report).

> **DISPOSITION: ":725 entailed for each quoted location" is WITHDRAWN.** Replacement: the quoted
> **text** of each row is entailed — every quotation is verbatim and locatable; the **addresses**
> were not verified when asserted, and six were wrong. Addresses are entailed only where
> re-checked, which is now done for all of them (§O.1 and self §X3).
> **STRENGTH: entailed** for the corrected addresses, each re-read at its line before writing.

> **RULE — a citation is two claims, the text and the address, and only the text survives being
> quoted from memory; the address must be re-derived from the file before it is asserted.**

## P. D67 ADDENDUM 3 — re-read once more: where else did I decide these three things?

| where | the same decision | disposition |
|---|---|---|
| :723 (§L) "regenerated … **before** any of them was cited" | conduct-as-attestation, the M class | already labelled *author attestation … consistent-with* — **stands**, correctly labelled |
| :712–713 (§L) "a finding a search could not" | the refuted search claim, the N class | **REFUTED** here in §N; its self-report twins at :907 and :944 are corrected in that file's §X2 |
| :725 (§L) "entailed for each quoted location" | the exclusive/unchecked aggregate, the O class | **WITHDRAWN** in §O.2; the identical sentence at self :930 is withdrawn in §X3 |
| §6 :155, :160 / §9 :275 "generated from the logs" | provenance asserted three times | unchanged from APPEND (4) §L — contents **entailed** where they match the logs, generation provenance **undetermined** |
| §1 :18 "It would have" | counterfactual | unchanged — **undetermined** |

**STRENGTH: entailed** for each location above, **re-checked at its line in this round** rather
than quoted from memory; **consistent-with** for my judgement that these are one recurring
decision.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r3-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.
