# PACKET __SEAT__ — FIX(__SLICE__) (rework after REV pass __PASS__) · mission `__MISSION__`

Read FIRST, in full: this packet · then __PACKET_DIR__/COMMON.md · then ONLY the files they name, at the lines they name — plus a named skill's own `references/*.md` when that skill sends you there, each listed in your `SKILLS LOADED` line. The spine (`docs/agent-protocols/…`) is the authority for a DISPUTE, not floor reading — open it only for a section a packet or a conflict names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `superpowers:receiving-code-review` · `superpowers:test-driven-development` · `superpowers:verification-before-completion` · `superpowers:systematic-debugging` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: FIX(__SLICE__) (rework after REV pass __PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the unioned verdict __MISSION_ROOT__/reviews/REV-__SLICE__-p__PASS__-UNION.md · the findings assigned to this node: __FINDING_IDS__ · the reviewers' probes under __REPORTS__/probes/ · the acceptance oracle __ORACLE__ · your predecessor's handoff and self-report (fresh session only): __PREDECESSOR__
- output (the ONE artifact this node produces): code on __BRANCH__ inside __LANE__, committed, and a READY handoff naming every assigned finding ADDRESSED (with RED→GREEN evidence) or CONTESTED (with a measurement)
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __ALLOWED_FILES__ · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every file outside the findings' surfaces, the main tree
- verification: for each finding: the reviewer's probe reproduced RED against the pre-fix head, then GREEN · the affected clusters' commands THREE times, worst run wins · the previous pass's surviving mutants re-run · every run from a `.sh` that writes the full output to a scratch log FIRST (`> <log> 2>&1`) and prints only `rc`, the failing case names and the `Test Files` / `Tests` lines — verbatim frames are pasted from that log, never re-run to be captured; the full log stays addressable until REV consumes the handoff · the runner's printed marker (`CLUSTER_GREEN` / `CLUSTER_RED` / `BROKEN`) is the verdict — a runner's own `rc` is not a signal · `pnpm typecheck` gains no diagnostic in any path of `allowed` (its rc is inherited) · one log per run, named by step and attempt, never overwritten · `run_suites` IS `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh` called from the lane as `LOG=<abs log path> zsh /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-orchestrator/scripts/run-suites.sh <suite>:<passed>:<failed> …` — one file per run; a packet points at it by absolute path and never restates its body

## 3. The work
Reproduce first — the reviewer's probe, RED, against current code, before any edit. Fix the CLASS: name it, sweep every member, record the sweep member-by-member in the handoff. A mutant is a TEMPORARY, reverted change to a product file made to prove an assertion bites — it is never committed and never counts against `allowed`: the exhaustive write list bounds what you COMMIT, and `git status --porcelain` after every restore proves the mutant is gone. Contest with a measurement, never with an argument. Findings outside your assignment are named, not fixed.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
