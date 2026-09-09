# PACKET __SEAT__ — BUILD(__SLICE__-__CLUSTER__) (coding) · mission `__MISSION__`

Read FIRST, in full: this packet · then __PACKET_DIR__/COMMON.md · then ONLY the files they name, at the lines they name — plus any file a named skill names as its own reading (a skill's `references/*.md`, the spine), each listed in your `SKILLS LOADED` line.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-worker` · `superpowers:test-driven-development` · `superpowers:verification-before-completion` · `superpowers:systematic-debugging` (on any bug) — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: BUILD(__SLICE__-__CLUSTER__) (coding) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): __MISSION_ROOT__/INSTRUCTIONS.md · PLAN.md steps __STEP_IDS__ only (__MISSION_ROOT__/slices/__SLICE__/PLAN.md:__STEP_LINES__) · the cluster's command and file surface (PLAN.md:__CLUSTER_LINES__) · DECISIONS.md · the acceptance oracle: __ORACLE__ (DONE.md on a UI slice, the SPEC acceptance otherwise) · tooling-traps headings: __TRAP_HEADINGS__
- output (the ONE artifact this node produces): code + tests on branch __BRANCH__ inside __LANE__, committed on green, and the READY handoff carrying the three-run table
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __ALLOWED_FILES__ · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every other file in the lane, every other cluster's surface, the main tree
- verification: the cluster command `__CLUSTER_COMMAND__` run THREE times, worst run is the verdict · every run from a `.sh` that writes the full output to a scratch log FIRST (`> <log> 2>&1`) and prints only `rc`, the failing case names and the `Test Files` / `Tests` lines — verbatim frames are pasted from that log, never re-run to be captured; the full log stays addressable until REV consumes the handoff · gates the PLAN names for this cluster · `git status --porcelain` clean of everything outside `allowed` · the runner's printed marker (`CLUSTER_GREEN` / `CLUSTER_RED` / `BROKEN`) is the verdict — a runner's own `rc` is not a signal · `pnpm typecheck` gains no diagnostic in any path of `allowed` (its rc is inherited)

## 3. The work
RED first, on every step. Refutation duty (`heartbeat-worker` §2): property → mutant → RED → revert → GREEN → neighbouring mutant not caught; print `git status --porcelain` after every restore. Measure before you speculate. No review waits on this cluster: hand off on green and stop — the slice is reviewed once as a whole at `REV(__SLICE__)`. Out-of-contract findings are named with file:line, never fixed here.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
