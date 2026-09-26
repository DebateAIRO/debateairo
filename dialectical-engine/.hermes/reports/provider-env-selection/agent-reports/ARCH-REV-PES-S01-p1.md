# ARCH-REV-PES-S01-p1 self-report

Question, verbatim: treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Cause

The expensive misses on this seat were path collisions, not the plan. Two files are both named heartbeat-protocol. The session skill index opens `.grok/skills/heartbeat-protocol/SKILL.md` (spine v3, a different handoff). COMMON and the packet mean `.claude/skills/heartbeat-protocol/SKILL.md` (v4, the eight-line handoff). A grok seat that trusts the index writes the wrong handoff and the orchestrator spends a pass proving the line. I read the v3 file, then the v4 file, and the handoff uses v4.

The second collision is labels. The plan says "V8" for the V8 engine's `JSON.parse` text (`PLAN.md:329`, `DECISIONS.md:182`). Verification item V8 and row V-8 are different things. I did not file it: the expected string is quoted in the case. The next reader will still burn a lookup.

## Price

| what | wall-clock | if it had gone the other way |
|---|---|---|
| Reading the v3 protocol before the v4 one | ~5 min | a handoff the orchestrator rejects, one more seat launch |
| Four cluster commands, parallel | ~3 min (`09:51:43`–`09:54:51`) | sequential was ~6 min on the author's timestamps; a false RED from parallel interference would have been a re-run, not a rework |
| p1 + p2 + p8 + typecheck, after the clusters | ~4 min | skipping them and trusting `base-all-clusters.out` is how a review passes a plan whose EXACT receipt is wrong. p8 alone is the twelve lines |
| False REWORK on H2 vs `node:crypto` | 0 (caught from p6's walker) | an ARCH-FIX pass. The author's ARCH seat ran `08:44`–`09:39` |
| N1, the signature-only packet range | 0 product change | filing it as blocking spends that same hour to add twenty lines the seat already read |

N2 and N3 are annotation. Folding them into a comment is a few lines for BUILD. A rework node for them is a full architecture pass to change no behaviour. p1 already shows the named codes are the ones that throw.

## What I nearly got wrong

The clean-env check saved a false blocking finding. With `NO_COLOR=1` and `FORCE_COLOR=1` (this harness), `pnpm audit:text-bytes` prints a Node warning before `$ tsx …`, so V10's "the log's first line is the echo" looks false. Unset, stderr is exactly that echo and nothing else. The plan is about the shell V types in, not the review harness.

H2 looked like a command that condemns correct input: the library imports `node:crypto`, and "every module path begins `apps/` or `packages/`" fails if leaves are paths. p6 returns `None` for those specifiers and never records them. The plan calls them leaves. Filing REWORK there would have been the wrong verdict.

The census looked like it would reject I10's `REGISTER_VERSION: "5"`. `register-support-publication.test.ts:573-576` applies that regex only under `apps|packages|acceptance`, not `tests/`. The integration test may contain the literal. The acceptance files must not.

## Dead ends

- Do not treat `.grok/skills/heartbeat-protocol/SKILL.md` as the v4 contract. The eight lines are in `.claude/skills/heartbeat-protocol/SKILL.md` §5.
- `auditSourceRules` (`tools/orphan-audit/src/index.ts:661-665`) walks `packages`, `apps` and `tools` only. `process.env` and a `tests/` import inside `acceptance/` do not trip `scaffold.test.ts:68`. They do trip it inside `apps/`.
- `git grep` without `--untracked` misses a file that is not committed. H3 passes `--untracked` because BUILD runs before the commit. V8 does not, because REV runs at `HEAD`. Both are right at their time. Re-checking V8 in a dirty lane is a false failure.
- Embedded Postgres on this lane prints `[S00 DB] Testcontainers DEFERRED…` to stdout (`testDatabase.ts:103`). p8 with the plan's silencing is twelve lines and empty stderr. Without the silencing, §5 step 3 fails. That is already F3 in the plan; re-deriving it from the source is wasted.

## Where this packet was unclear

`ARCH-REV-S01-p1.md` §2 says the cluster commands are re-run "inline and scripted, with zero disagreements". Charge 3 says re-run them from a `.sh` via `run-suites.sh`. I ran the `.sh` files and compared their arguments to `PLAN.md:111-114` and to the author's `base-C*.sh`. I did not also type each command a second time at the prompt. If "inline" means that second launch, it is not in the evidence. One `.sh` whose arguments are the plan's base column is the run that can disagree with the recorded marker.

The input list says re-run the author's probes, and charge 3 names only the cluster commands. p1, p2 and p8 are where the EXACT strings live. A seat that stops at charge 3 never executes the receipt. Put "re-run `p1-shipped-chain.sh`, `p2-scratch-db.sh`, `p8-acceptance-dry-run.sh` into your own probe dir; do not write the author's dir" in the charge list.

The packet says comments read through: 1 inside the CLAIM sentence. That was true at dispatch. The verdict cursor is whatever is on the ticket after CLAIM. Those are different numbers. Say so in the packet, or the next seat copies `1` into the verdict.

## Upgrades, by tokens saved

1. One absolute path for the v4 protocol in the packet's skill line, and a line that the `.grok/skills/heartbeat-protocol` file is not it. Saves a wrong handoff, which is a whole seat.
2. Charge list: re-run p1, p2, p8, typecheck, and the four base `.sh` files, each with the output directory. Saves the seat reconstructing which probe is load-bearing. p8 is under a minute and is the acceptance.
3. In `PLAN.md:90`, write the step ids. A both-ways parser then matches the "gaps: 0" sentence without a human reading G9 back to S01-14.
4. On a rejection case, require the prior-guard sentence in the same line as the code, the way G6 and G8 already do. The class in N3 is then a grep (`guards before` absent on a line that names a refusal code), not a reread of g1–g11.
