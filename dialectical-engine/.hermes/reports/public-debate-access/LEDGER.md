# LEDGER — mission `public-debate-access`

**Status: FLOOR, not a complete accounting.** Two receipts are known missing (below). Written
by the Router at seat exit, per the spine's "receipts are cheapest the moment a seat reports".
Should have been opened at the FIRST seat exit and was not — that lapse is itself recorded.

Last updated 2026-08-29, after the ARCH scope-boundary round and with three seats in flight.

## Seat receipts

| seat | model | rounds | self-report | tokens | basis |
|------|-------|--------|-------------|--------|-------|
| REQ-01 requirements | Grok 4.5 | 1 + 1 rework | `REQ-01-grok.md`, `REQ-01-handoff.md` | not recovered | — |
| REV-00 intake review | Grok 4.5 | 1 | `REV-00-grok.md` | not recovered | — |
| REV-01 SPEC review | Claude | 1 + 1 confirm | `REV-01-claude.md` | not recovered | — |
| REV-02 plan review | Grok 4.5 | 1 + 2 confirm | `REV-02-grok.md` | not recovered | — |
| REV-03 acceptance-repair review | Grok 4.5 | 1 | `REV-03-grok.md` (300 lines, collected from the lens) | not recovered | — |
| REV-04 blind code review | Grok 4.5 | in flight | **owed** | — | — |
| ARCH-01 architecture | Claude | 1 + 8 rework | `ARCH-01-claude.md` **complete through round 8** | not recovered | — |
| S01-CODE | Codex 0.146.0 | 5 blocks + 1 rename; **0 rework rounds consumed** | `S01-CODE-codex.md` | **1,270,756** | codex session footer, cumulative over the whole session |
| S03-CODE | Codex 0.146.0 | 1, then blocked (ticket in triage) | `S03-CODE-codex.md` | **392,775** | codex session footer, cumulative over the session — supersedes the earlier 135,493 reading, NOT additive to it |
| S03-CODE-R2 | Codex 0.146.0 | resume; **READY FOR PEER REVIEW** on `t_23b9245c`; 0 rework rounds consumed | `S03-CODE-codex.md` | **506,819** | codex session footer, cumulative over the session — supersedes 392,775, NOT additive |
| ARCH-01 S02-C5 round | Claude | 1 (Row 6 standing consequence, post-thread defect) | appended to `ARCH-01-claude.md` | **not recovered** | the `claude` CLI printed no usage footer on this run — stated, not estimated |
| S02-CODE | Codex 0.146.0 | 1 block (correct, 0 rework rounds consumed) | **owed** | **171,040** | codex session footer at the block |
| S02-CODE-R2 | Codex 0.146.0 | resume, in flight | **owed** | — | — |
| REV-05 blind code review of S03 | Grok 4.5 | 1 → **REWORK** (2 blocking, 1 non-blocking, 1 against the Router) | `REV-05-grok.md` (182 lines, **collected to the main tree**) | **not recovered** | the grok CLI printed no usage footer on this run — stated, not estimated |
| S03-CODE rework r1 (B1) | Codex 0.146.0 | 1 of 3 → **REWORK READY FOR REVIEW**; reproduce-first honoured | `S03-CODE-codex.md` | **814,455** | codex session footer, cumulative — supersedes 506,819, NOT additive |
| ARCH-01 REV-05 round (B2+N1) | Claude | 1 of 3 → **REWORK READY FOR REVIEW**; both findings ruled | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S03-CODE B2+N1 implementation | Codex 0.146.0 | **REWORK READY FOR REVIEW** on `t_57891ca5`; NOT charged to the rework cap (Router's parallel-dispatch error) | `S03-CODE-codex.md` | **1,051,080** | codex session footer, cumulative — supersedes 814,455, NOT additive |
| ARCH-01 class-fix round | Claude | 1 → **REWORK READY FOR REVIEW**; root cause named, 2 further sites found by extraction+execution | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S02-CODE recovery | Codex 0.146.0 | session **WEDGED** 24 min at 0% CPU; killed by PID and resumed conversationally; work intact (16 files) | — | — | — |
| REV-05 re-review r2 | Grok 4.5 | 2 of 3 → **REWORK**; B1/B2/N1 re-verified CLOSED by its own mutants; found **B3 blocking, opened by the fix**, plus N2/N3 | `REV-05-grok.md` (updated in lens) | **not recovered** | no usage footer from the grok CLI |
| S03-CODE rework r2 (B3+N2) | Codex 0.146.0 | 2 of 3 → **REWORK READY FOR REVIEW**; honest blacklist with its gap documented | `S03-CODE-codex.md` | **1,224,804** | codex session footer, cumulative — supersedes 1,051,080, NOT additive |
| S02-CODE C3-2 + 3rd block | Codex 0.146.0 | **CODEX BLOCKED** on `t_5d2a4e79`; all 6 clusters pass 3 runs; still **0 rework rounds consumed** | **owed** | **787,597** | codex session footer, cumulative |
| ARCH-01 bundle round | Claude | 4 of 4 ruled → **REWORK READY FOR REVIEW**; surface widened narrowly, class ruling given, 2 worker corrections ratified | addendum in `ARCH-01-claude.md` | **not recovered** | no usage footer from the `claude` CLI |
| S02-CODE final (S02-C1-6) | Codex 0.146.0 | **READY FOR PEER REVIEW** on `t_83443bb1`; **0 rework rounds across 3 correct blocks** | `S02-CODE-codex.md` | **881,005** cumulative / **376,783** this goal (~23m39s) | codex session footer — this seat reported BOTH a cumulative and a per-goal figure, the only one to do so |
| REV-06 blind code review of S02 | Grok 4.5 | in flight; lens sanitized by CLASS at creation | — | — | — |
| REV-05 re-review r3 (final) | Grok 4.5 | 3 of 3 → **PASS**; all 5 findings closed by its own mutants; 2 non-blocking residuals routed to ARCH | `REV-05-grok.md` (collected) | **not recovered** | no usage footer from the grok CLI |

**Reading the Codex numbers correctly:** one session id spans every resume, so the footer is a
RUNNING TOTAL, not a per-round cost. S01-CODE's session went 101,044 → 459,658 → 980,443 →
1,270,756. Do not add these together; the last one is the seat's whole cost.

## What I could not measure, stated rather than estimated

- **Per-agent tokens for every Claude and Grok seat.** These seats run under `-p`, whose log
  captures only the final handoff, so no session footer reaches the log. The spine names
  `hermes insights` and grok's `updates.jsonl` as the other capture points; neither was
  wired up at launch on this mission. That is a Router omission at intake, not an absence of
  data — it is likely still recoverable from the session stores, and it should be captured
  before closure rather than reconstructed.
- Codex totals above are cumulative per session, not per round; rounds inside one session
  cannot be separated from the footer alone.

## Receipts owed

1. ~~ARCH-01 rounds 6, 7 and 8.~~ **COLLECTED 2026-08-29 17:57** — addendum appended (not
   rewritten) to `ARCH-01-claude.md`, 34,829 → 53,726 bytes. Carries the seat's own unsoftened
   admission that round 3's non-blocking fix INTRODUCED variant 5, a third Router-brief
   inaccuracy the Router had not noticed (three contorted titles reported, four existed), the
   still-unverified S03/S04 mutual-exclusion direction, and a named dead end.
2. **REV-04.** In flight; its self-report must be collected from
   `.worktrees/rev-04/dialectical-engine/` BEFORE that worktree is removed.

**Discharged since this file was opened:** S01-CODE's self-report is collected (13,052 bytes)
and REV-03's was rescued from its lens (300 lines) before any cleanup.

## Blindness compromise on REV-05 round 2 — disclosed, not papered over

**What happened.** The N0 fix applied to REV-05's round-2 lens deleted only ONE named file, the
author's `S03-CODE-codex.md`. **Eleven** tracked agent-reports are committed at `4138f72`, so the
other ten — including `ARCH-01-claude.md` (Architecture's full reasoning), `REV-02/03/04-grok.md`
(prior reviewers' findings) and `S01-CODE-codex.md` — remained readable for roughly the **first
four minutes** of the round-2 re-review before the Router noticed and removed them.

**Why it matters.** Round 2 asks the lens to judge whether B1/B2/N1 are genuinely closed. Reading
Architecture's justification for the B2 ruling would tell it what answer was intended, which is
precisely the independence a blind lens exists to provide.

**Status: UNKNOWN, and it must stay unknown until asked.** The Router cannot tell from outside
whether those files were read. **Ask the lens directly** whether it opened any file under `agent-reports/`, and record the answer.
**RESOLVED — the lens was asked directly and answered NO:** it did not open any `agent-reports/` body
during round 2; it listed filenames, existence-tested the author report's absence, and wrote its own.
**Round 2's verdict is NOT compromised.** The window was real, the exposure was not.

**Prior status at round 2's close:** it volunteered that the author's self-report was *existence-tested absent*, which confirms the Router's fix landed — but it said nothing about the other ten files, which is the open
question. The Router chose NOT to spend a seat call asking in isolation; the question is folded into the
round-3 resume. Until answered, round 2's verdict carries this caveat. If it did, round 2's verdict is weaker evidence and
should be treated as such rather than as a clean second opinion.

**Root cause, and it is the same one twice.** The original N0 was "not copying a file does not
withhold it, because it was committed." The repeat is the narrower version: *fixing one instance of
a leak is not fixing the leak.* The remedy is to sanitize the lens by CLASS at creation —
`rm -f <lens>/.hermes/reports/<mission>/agent-reports/*.md` — and verify by existence, which is now
what `rev-06` does.

## Blind-lens receipt hazard (standing)

Review seats run in isolated worktrees. `REV-03`'s packet requires its self-report be written
to `.worktrees/rev-03/dialectical-engine/.hermes/reports/public-debate-access/agent-reports/`
— **inside the lens**. Janitor cleanup of a worktree destroys it. Two self-reports were already
stranded this way earlier in the mission and had to be rescued. Collect from the lens BEFORE
removing `rev-03`.

## Observed compliance — SKILLS LOADED gate (spine item 15)

Measured from logs, not assumed. The gate is visibly working on the Codex seats, which declare
8 skills at handoff: `heartbeat-protocol`, `heartbeat-worker`, `superpowers:using-superpowers`,
`superpowers:test-driven-development`, `superpowers:verification-before-completion`,
`superpowers:executing-plans`, `superpowers:using-git-worktrees`,
`superpowers:systematic-debugging`.

Declarations found in `S01-CODE-codex.log`, `S01-CODE-resume-codex.log`, `S03-CODE-codex.log`.
The Claude and Grok seats post their declaration to the BOARD rather than to the log, so log
absence is not evidence of non-compliance for those — verify at the ticket, and remember the
standing rule: a skill PATH proves nothing, only the skill BODY reaching the seat does.

## Seat exit — ARCH-01-strictfix (2026-08-30 02:13, ticket `t_cc34ba78`)

**Charge:** rule on the refutation of ARCH's own blast-radius-zero claim for the `.strict()` change.
Not charged to any rework cap — this was a Router-raised refutation of a closed step, not seat rework.

**Delivered.** `REWORK READY FOR REVIEW`. Reproduced the `TS2353` itself before ruling (§2.5 honoured
by the seat that had to be corrected). Marked the wrong S01-C1-6 bullet **REFUTED in place rather
than silently rewriting it**. Split the claim into two measured numbers — runtime blast radius still
zero, compile-time blast radius exactly one. Applied the S02-C1-6 precedent (narrow surface widening
over freezing correct product code) and explained the mechanism difference: no cross-slice grant is
needed because S01 already owns the file. Specified the fix as a cast to `Node["stranger_restatement"]`.
Stated plainly that none of this was a defect in the coding seat's work. Balance 21/21, no product,
test, or worktree writes.

**The lesson it recorded against itself, and it is the valuable part:** the blast-radius sweep asked
*"does anything PARSE an extra key at runtime"* and never asked *"does anything CONSTRUCT one."* A
zod schema drives both a validator and a `z.infer` type; `.strict()` narrows both; only one consumer
of that dual effect was checked. This is **"checking half a loop is not checking the loop" one
abstraction level up** — the same seat's own earlier lesson, recurring in a new dimension. A
blast-radius method that examines only runtime will miss this class every time.

**Router verification before acting on the ruling** (not review — a factual check, since acting on a
wrong ruling costs a seat cycle): the harness at `tests/unit/s8-publication.test.ts:265` calls the
real `application.publish`, which maps every node through `redactNodeForPublic`
(`apps/api/src/publications.ts:244`) **before** `PublicDebateSchema.parse` (line 229), and re-parses
after decrypt at line 280. The extra keys are stripped by the redactor and never reach the strict
parse. **The test passing today is itself the proof that the redactor strips them.** So the runtime
is genuinely unaffected, and `.strict()` is strictly better: a redactor regression now throws at the
schema boundary instead of passing the key through. Ruling confirmed sound; fix dispatched.

**One trap the Router measured and handed to the fix seat:** TypeScript reports only the FIRST excess
property in an object literal. `secret_extra` (line 126) is reported; `owner_note` (line 127) is also
excess and currently hidden behind it. A fix addressing only the reported error is not finished — and
the *lazy* fix, deleting both keys, would make `tsc` pass while destroying the only property the test
exists to prove. Forbidden explicitly in the packet.

## Seat exit — S01-STRICT-fix (2026-08-30 02:20, ticket `t_cc34ba78`, rework round 1/3)

**Delivered.** `REWORK READY FOR REVIEW`. Reproduced the exact `TS2353` before editing, as instructed.
Applied precisely the ruled fix: imported `Node`, cast the whole `stranger_restatement` literal to
`Node["stranger_restatement"]`. **Preserved `secret_extra`, `owner_note`, and every assertion
unchanged** — it did not take the fast route of deleting the keys, which is the fix that would have
made `tsc` pass while destroying the only property the test exists to prove. Three runs: `tsc` exit 0,
31/31, leak guards passing on every run. No product-code change.

**Router verification, re-derived rather than inherited.** Diff is 2 insertions / 2 deletions across
one file. Leak markers still present (5 occurrences). `tsc --noEmit` exit 0. Anchored idiom on
`tests/unit/s8-publication.test.ts`: vitest exit 0, `Tests 25 passed (25)`, guard exit 0, **zero
skipped**. And the check that a green suite does not supply — confirmed by name that the specific
tests execute: *"publishes the tree without leaking owner-only fields"*, *"projects
stranger_restatement to its public check_status only"*, *"nulls disagreement instead of publishing its
open record"*, plus four `provenance_ref` redaction tests. All ✓.

## Seat exit — S04-CODE (2026-08-30 02:25, tickets `t_76050188`, `t_5d00506b`)

**Delivered.** `READY FOR PEER REVIEW`. New `tests/unit/pda-s04-node-carrier-audit.test.ts` (142
lines). Corrected S04's stale checklist items 3/3b in place under Row 7, evidence filed on the ticket.
C1 2/2, C2 5/5, C3 4/4, combined 11/11, three runs each; typecheck exit 0. **Ran refutation mutants
and reported that neighbouring non-catches behaved correctly** — it tested that its own tests
discriminate, unprompted.

**Independent corroboration, which is the point of not telling it what the Router had found:** it
reached the same conclusion about the live-evidence gap on its own — *"the only live publication lacks
`tree_included`, so the anonymous argument-tree path still lacks live product-truth evidence."*

**It also corrected the Router.** The Router had read S04's checklist items 3/3b **while this seat was
concurrently fixing their staleness**, and wrote an alarm into the QA packet and ticket `t_3e217eab`
claiming `maker_lineage.provider_ref` might be an account-scoped API key. It is not. `S01/PLAN.md`'s
S01-C2-0B field table already classified it **COPIED (VERIFIED)** with a producer trace to a static
per-deployment provider-slot id — literal values read: `"development:codex-cli"`,
`"development:claude-cli"` — and classified `abstention.register_row_key` / `register_version` /
`register_source_ref` **COPIED (VERIFIED)** as policy-register citations, structurally identical to
already-public `BandCeilingSchema` fields. Both rows say "no longer open" in as many words. QA-01.md
and the ticket are corrected; the correction is disclosed in both rather than quietly swapped.

**The lesson, and it is a new one: reading a document that is actively being repaired and treating its
text as current state.** The staleness was not hidden — a ticket existed for it, a seat was dispatched
against it, and the Router dispatched that seat. Knowing a document is stale is not the same as
remembering it while reading.

## Router hazard, self-disclosed — mutating a running seat's worktree

To test whether the `.strict()` change would break S04's new test, the Router applied `sed` directly to
`packages/contract/src/index.ts` **inside `.worktrees/s04-code` while the S04 seat was actively
running in it**, then restored it seconds later. The file was one S04 does not write, and S04's output
shows no sign of disturbance — but this could have corrupted a live seat's work or its verification
runs, and "it happened to be fine" is not a defence. **The correct move, used for the runtime half of
the same check, was to copy S04's test file into the idle `s01-strict` worktree and run it there.**
Recorded so the next Router does the second thing first.

## Seat exit — S04-CODE rework 1 (2026-08-30 09:05, `t_76050188` / REV-08 B1,B2,N1,N2)

**Delivered.** `REWORK READY FOR REVIEW`, round 1 of 3. Reproduced B1 before touching anything, as
instructed. **Replaced the vacuous fixture test outright** rather than patching it: the new
`S04-C1-2` imports `PostgresPublicationApplication` and publishes through the real product path,
smuggling all ten forbidden key names plus distinct marker values into a node's open `disagreement`
record, then asserting none survive. Narrowed the `S04-C1-2` PLAN claim to describe what the test
actually exercises. Corrected both stale citations. 11/11 combined, three runs, typecheck 0.

**The part that shows the seat understood the finding rather than just clearing it:** it re-ran the
lens's *value-carrier* mutant (`provider_ref: "owner:..."`), confirmed it **still leaves the test
GREEN**, and reported that as an acknowledged bound on the claim instead of hiding it or pretending
the new test closes it. A seat clearing a blocking finding had every incentive to stay quiet about a
neighbouring hole; it did the opposite.

**Router verification, re-derived not inherited.** Confirmed the import reaches the real product
(`apps/api/src/publications.js`, `application.publish` at line 213). Anchored idiom: vitest exit 0,
`Tests 2 passed (2)`, guard 0, zero skipped, both tests confirmed executing **by name**. Then the
decisive check the whole finding turns on — **applied the mutant myself**: `publications.ts:56`
`disagreement: null` → `disagreement: node.disagreement` gave `Tests 1 failed | 1 passed`, exit 1;
restored gave `2 passed`; worktree left clean. **The repaired test genuinely discriminates.**
Citations re-resolved by reading: `publications.ts:399-400` is the real `catch { return null; }`, and
`contract/index.ts:424` is `export const NodeSchema = z.object({`.

## Closed alongside — `t_ddee6473`, and why it matters more than its size

A one-comment fix, filed 2026-08-29, with Architecture having already authored the exact replacement
text. It was **routed to a coding seat that never picked it up**, and it sat open for a day looking
identical to work in progress. Found during the board reconciliation, applied verbatim, verified
(3/3, tsc 0, `exposes` count 0), committed as `a322803`.

**This is the small, concrete instance of the failure the whole reconciliation exposed:** the mission
had a standing rule that *"routed elsewhere in a packet is not a route"*, recorded after an earlier
loss — and then lost a finding to exactly that, in the same mission, while the rule was in force.
Writing a remedy down and naming its owner is not the same as the remedy happening. Nothing checked.

## Seat exit — REV-08 re-review (2026-08-30 09:12, `t_fec6b69a`) — PASS

Returned to the **same session** via `grok --continue` (grok keys sessions by working directory), per
the same-terminal rework law. It opened by stating it would not take the author's account on trust,
and did not.

**All four findings CLOSED, each re-probed rather than accepted.** It confirmed the publish path
genuinely reaches `redactNodeForPublic` before encrypt, then ran the author's own RED mutant **plus
two the author never mentioned** — a skip-redact mutant and a partial bag `{panel:"kept"}` — both
RED. Three runs, both tests executing, no skips. On N1 it re-ran the value-carrier probe itself,
confirmed `provider_ref: "owner:…"` still survives, and accepted the *acknowledgement* as adequate
because it appears in both the test comment and the PLAN's Failure-it-MISSES — it checked the
acknowledgement's placement, not just its existence.

**And then it kept going.** Having cleared the blocking finding it was sent to re-check, it went
looking for a mutant that would leave the repaired test **green** — and found one. The test plants
forbidden keys only into `nodes[0]`, so a partial regression that redacts the first node and misses
the rest is invisible to it. Confirmed by planting the same payload on `nodes[1]` in a scratch copy
under that mutant, which went RED. Filed as `t_b29234fe`; rework round 2 dispatched.

**This is the behaviour that catches the family.** Stopping at the red mutant the author supplied
would have ended in a clean PASS with a real hole intact. The finding only exists because the lens
asked the harder question — *what mutant leaves this green?* — after it had already earned the right
to stop.

## Router hazard, self-disclosed — I destroyed a lens receipt with my own sanitizer

Refreshing the `rev-08` lens for re-review, I ran `rm -rf .../agent-reports` to keep it blind. That
directory contained **the lens's own first-pass self-report**. The lens hit the deletion mid-run —
its log reads *"Report file was wiped by sanitization; rewriting it"* — and reconstructed it.

**The ledger already carried a standing warning about exactly this** ("Blind-lens receipt hazard":
review self-reports live inside the lens, janitor cleanup destroys them, two were stranded earlier in
this mission and had to be rescued). I wrote that warning and then walked into it.

Recovered by luck, not design: the substance survived in the log, and the lens rebuilt the artifact
unprompted. **The rule is now mechanical, not advisory: rescue receipts BEFORE sanitizing, never
after.** All 18 self-reports are now held in the main tree rather than in worktrees that any cleanup
can delete.

## Merge precondition for S04 — recorded BEFORE the merge, not discovered after

S04's seat has worked the whole time in a worktree based at `f8b9d5f`. Since then `dev` gained
`f59618a`, which changes `packages/contract/src/index.ts` — the file S04's test imports `NodeSchema`
and `type Node` from, and whose `PublicDebateSchema` its product-path test publishes through.

**S04's test was written and verified against the NON-strict contract.** Its three-run GREEN proves
nothing about the tree it will actually land in. This is the mission's own recorded law —
*disjoint WRITE surfaces do not imply independent EFFECTS; ask which standing tests READ the files
each slice WRITES* — and S04 reads exactly the file the strict change wrote.

**Precondition, to be satisfied in the MAIN tree before any S04 commit:**
1. `pnpm run generate:contract`, then `npx tsc --noEmit` exit 0.
2. `tests/unit/pda-s04-node-carrier-audit.test.ts` green under the anchored idiom, both tests
   confirmed executing **by name**, zero skipped.
3. The discrimination re-proved *against the strict contract*: mutate `publications.ts:56` to
   `disagreement: node.disagreement` and confirm RED; restore and confirm GREEN. A test that passes
   in the worktree and stops discriminating in the merged tree is the same defect wearing a
   different hat.
4. Architecture suite compared against the known baseline of 7 failed / 263 passed — identical
   failures, not merely an identical count.

An earlier merge in this mission was saved from destroying reviewed work only by a manual diff run
seconds beforehand. This note exists so the check is a precondition rather than luck.

## Seat exit — S01-SPLIT round 1 (2026-08-30 09:56) — BLOCKED, correctly, on a Router defect

Ran two minutes and returned `CODEX BLOCKED: required upstream artifact missing`. `S01-C1-7` was
absent from its worktree because Architecture's 280-line design sat **uncommitted in the main tree**
while the Router moved the seat's worktree to `e879f87`, a commit predating the edit.

**The seat's closing line is the valuable part:** *"I will not reconstruct Architecture's
specification from the dispatch summary."* The packet did summarise the design accurately enough that
a more accommodating seat could have built from it — and produced something plausible, unreviewable
against the real spec, and subtly different from what was actually ruled. That failure would have
been silent. This one cost two minutes and named its own cause.

**Fixed structurally, not by copying a file at the seat:** Architecture's design committed as
`7bfe662`, worktree moved to that commit, spec confirmed byte-identical between worktree and main
before re-dispatch. The seat now obtains its specification by checkout.

**Recurrence of SYNC-01's class** (`t_d40a86f1`), whose recommendations — sync-time snapshots and a
pre-merge diff gate — were recorded and never built. Different instance, same cause: **a worktree's
planning documents and the main tree's are related by nothing.** Recorded in TOOLING-TRAPS.md.

## Seat exit — S01-SPLIT round 2 (2026-08-30 10:11) — implemented, and it corrected the Router twice

Delivered the split `NodeSchema.omit({disagreement:true}).extend({disagreement:z.null()})` exactly as
S01-C1-7 specified. Reproduced the hole before editing —
`{"accepted":true,"preserved_disagreement":{"internal_note":"LEAK-ME"}}` — then TDD RED, then GREEN.
The required mutant (rewiring public nodes back to `NodeSchema`) turned it RED. A **product** mutant
copying `node.disagreement` through failed at **compile time** with `TS2322`, which is a stronger
guarantee than the runtime rejection that was asked for. 34/34 across three runs, `tsc` exit 0.

**It reported three corrections to its own packet rather than quietly conforming:**

1. **17 runtime parser sites, not the 15 Architecture stated** — all traced, all safe.
2. **The "13 compile-time sites" figure was not reproducible** as a consistent file count. It said so
   instead of manufacturing agreement.
3. **The architecture baseline the Router gave it — 7 failed / 263 passed — was wrong.** It measured
   6 failed / 264 passed, three runs each side, same five failing files.

**That third correction was the valuable one, and it exposed a defect in the Router's method rather
than in anyone's code.** Both numbers were correct: the Router measured in the main tree, which
contains `.worktrees/`; the seat measured inside a worktree, which contains no nested worktrees. The
standing test `s9-dev-token-retirement-contract.test.ts` walks into `.worktrees/` — **a directory
`git check-ignore` confirms is ignored** — so its offender count is a function of how many worktrees
happen to exist. This mission created and destroyed a dozen.

The Router's merge gate compared main-tree runs to main-tree runs, so its conclusions held by
internal consistency. But the gate's wording — *"identical failing files, not merely an identical
count"* — sounded rigorous while **anchoring on a number nobody had checked was stable.** Filed as
`t_5fef39e6`; recorded in TOOLING-TRAPS.md as "the baseline that moves when you look at it."

**A seat disagreeing with the Router was the only thing that surfaced it.** Had it deferred to the
number it was given, the defect would still be invisible.

## Seat exit — REV-09 (2026-08-30 10:22) — PASS on the split

Verified by running: the boundary **rejects** with `invalid_type expected null` rather than silently
dropping; anonymous `readPublicDebate` fails closed on parse errors; reverting the split turns the new
test red; `.catch(null)` and preprocess-to-null mutants also turn it red; the owner path still admits
disagreement objects and S04's audit still strips them; 21 files touch the symbols, root `tsc` clean,
`PublicNode → Node` assignability holds.

**N1, and the distinction is worth keeping: the test is NARROW, not VACUOUS.** Those are different
defects and only the second was ruled out. The lens planted a mutant that keeps the test green while
still admitting `{ secret_panel_note: "STILL-LEAKS" }` — the rejection arm pins one fixture while the
title claims a universal property. **Third instance this mission of the same shape** (REV-08's N4 on
`nodes[0]`, the original B1 vacuity, now this), found by three different probes. Dispatched rather
than deferred, because this mission has already lost one "non-blocking, fix later" item for a day.

**N2 corroborates Architecture rather than contradicting it.** The lens enumerated the five sibling
redactions still enforced only in product code — and named **exactly the set** Architecture had
already listed when ruling the split narrow, with no sight of that ruling. The residual is bounded and
honestly accounted, not an oversight. Routed to V as `t_dbddfc61`.

## Seat exit — S03-TABCSS round 2 (2026-08-30 10:32, `t_880241fd`)

**Round 1 was killed by the Router after 41 seconds**, having written nothing: a `git checkout` had
printed `Aborting` and left the worktree at a commit from hours earlier with 89 staged files, and the
Router dispatched against it without reading the output. Before resetting, the Router checked whether
those staged files held anything unmerged — `git diff --name-only <commit>` returned **zero** — so the
reset was provably safe rather than hopefully safe. Recorded in TOOLING-TRAPS.md.

**Round 2 delivered, and improved on the brief.** The packet suggested keying the styling off the
`.tabActive` class; the seat keyed it off `[aria-current="page"]` instead — the state already in the
markup. That is better than what was specified: **the visual state and the accessibility state are now
one source of truth and cannot drift apart.** Styling follows the app's own
`.segment button[aria-pressed="true"]` precedent, distinguishing the selected tab by background,
foreground colour **and** shadow, so it does not fail WCAG 1.4.1 as a colour-only cue.

Proved by **computed style**, not source text — `getComputedStyle` on both tabs, asserting they differ
per channel. TDD RED 2 failed / 3 passed, GREEN 5/5, three runs. Router re-derived it: removing the
active rule gives 2 failed / 3 passed, restoring gives 5/5.

## Seat exit — S01-N1 (2026-08-30 10:33, `t_65236b16`)

Reproduced the finding before fixing it: the pre-existing test stayed GREEN while a selective mutant
still leaked `{"secret_panel_note":"STILL-LEAKS"}`. The rejection arm now covers four shapes and that
mutant is RED with `unrelated key: expected true to be false`. Split-reversion, `.catch(null)` and
preprocess-to-null mutants all still RED. 34/34, three runs, `tsc` 0.

**The judgement call worth keeping:** it wrote an assertion pinning zod's internal `invalid_union`
error type, found that it failed *before reaching the leak*, and **removed it** — so the test
discriminates behaviour rather than schema spelling. A test that asserts how a library phrases its
error is coupled to the library, not to the property; it would have gone red on a zod upgrade that
changed nothing about safety.

## Router defect — a vacuous mutant check, caught by its own missing evidence

Verifying the merged split, the Router ran `sed -i '' '56s/disagreement: null,/.../'` to plant a
product mutant, and `tsc` reported **no error**. The apparent conclusion — that the compile-time guard
did not work — was wrong. The merge had shifted `disagreement: null` from line 56 to **57**, so `sed`
matched nothing and **no mutant was ever applied.** The check proved nothing and would have read as a
clean pass had the expected error not been conspicuously absent.

This is **variant 6 of the mission's own catalogue — an acceptance pinned to an absolute line number,
silent when the line moves** — committed by the Router while verifying a fix for the same family of
defect. Re-run keyed on a unique pattern with an assertion that exactly one match exists, it produced
`TS2322: Type 'Record<string, unknown> | null' is not assignable to type 'null'`.

**What saved it was expecting a specific outcome.** A check that only asked "did anything go wrong"
would have passed. One that asked "does the error I predict actually appear" failed loudly.

## Dev stack down — cause not established, disclosed rather than assumed

Both `:3000` and `:8790` closed. Alive and serving at 09:42; QA-01 ran its full anonymous probe suite
against it 09:43–09:53; found dead at 10:33.

**The Router cannot prove it did not cause this.** At ~10:16 it killed a misdispatched seat with
`pkill -f 'launch-S03-TABCSS.sh'`, `pkill -f 'codex.*s03-code'`, and two PIDs by number — none of
which should match a Next.js dev process, and the PIDs were 41-second-old codex children. It also ran
`pnpm install` in three worktrees, which touches the shared pnpm store. **No dev-stack logs exist on
disk**, so there is no positive evidence in either direction.

V ruled: **V restarts it; the Router stays off it.** Row 8 made that server V's, and "I probably
didn't break it" is not a basis for starting a TLS-and-database stack the Router did not set up.

## SKILLS LOADED compliance — measured, closing `t_79d8e6d0`

Three separate lenses (REV-06, REV-08, REV-09) reported the author's `SKILLS LOADED` declaration as
**unverifiable**, each for the same structural reason: blinding a lens deletes the author's
self-report, so the lens cannot check the very thing it is asked to check. That is a real property of
the method, and no lens can resolve it. **The Router can**, from the logs and the board — so it did.

**Method:** every seat log ≥400 bytes, plus the board comments for seats whose CLI posts to the ticket
rather than to stdout.

**Result over 74 substantive seat logs: 52 declared in the log, 22 did not.** Of those 22:

- **16 are ARCH (Claude) seats that declared on the BOARD instead.** Verified, not assumed —
  `t_f864a84b` carries 9 `SKILLS LOADED` occurrences, including timestamped declarations at 12:58,
  13:16, 13:42, 14:23, 15:00 on 2026-08-29. The ledger's earlier claim that Claude seats post to the
  board was correct and is now evidenced rather than asserted.
- **6 predate the gate entirely** — `REQ-01`, `REQ-01-rework1`, `REV-00`, `REV-01`, `REV-01-confirm`,
  `ARCH-01`, all launched between 10:53 and 11:52 on 2026-08-29, before any packet carried the
  requirement (the first observed declaration anywhere is 12:58).

**Zero genuine violations.** The gate held everywhere it was in force.

## Router defect, found while doing that measurement — version skew, against my own §5

The spine commit introducing the gate, `28f7bc2`, landed at **20:49** on 2026-08-29. Seats were being
dispatched with the requirement, and complying with it, from **12:58** — roughly **eight hours
earlier**.

My own orchestrator contract §5 says: *"Fail closed on skew: if the rule set you are dispatching is
newer than the installed skill or the repo spine, the dispatch does not go out — amend the spine
first, in the same commit. A seat charged with a rule it cannot discover from the repo is your
defect."*

For eight hours I charged seats with a rule that existed only in my packets. Every seat complied, so
nothing broke — but compliance was luck, not discoverability: a seat that had gone looking for the
rule in the repo would not have found it, and would have been right to say so. **The rule worked
because seats obey packets, which is precisely the reliance §5 exists to forbid.**

Worth pairing with the standing lesson already recorded here — *gates work, reminders do not*. This
one was a gate in the packet and a reminder in the repo, and the gap between the two was invisible
until someone counted.
