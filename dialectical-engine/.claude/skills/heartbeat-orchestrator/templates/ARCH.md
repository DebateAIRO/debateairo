# PACKET __SEAT__ — ARCH(__SLICE__) (architecture) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-architecture` · `superpowers:brainstorming` · `superpowers:writing-plans` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: ARCH(__SLICE__) (architecture) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): __MISSION_ROOT__/INSTRUCTIONS.md · __MISSION_ROOT__/slices/__SLICE__/SPEC.md (frozen; never edit) · DECISIONS.md · __REPO_ROOT__/docs/architecture/01-decisions/ · the tooling-traps index · the code surface the SPEC names (read-only)
- output (the ONE artifact this node produces): __MISSION_ROOT__/slices/__SLICE__/PLAN.md filled (steps, clusters with ONE command each, the slice verification list, boundaries, DDD impact; UI slices: the `## Screens` block the mock seat consumes) + DECISIONS.md lines (append-only)
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/slices/__SLICE__/PLAN.md · __MISSION_ROOT__/slices/__SLICE__/DECISIONS.md · __REPO_ROOT__/docs/architecture/01-decisions/ADR-__ADR_NUMBER__-*.md (new, only if a decision outlives the mission) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular SPEC.md, every product file, git
- verification: every cluster command RUN at base from a `.sh` file and its verdict recorded (RED for TDD-red is expected; BROKEN is a defect) · the SPEC↔PLAN trace both ways with zero gaps · every step passes the stranger test · zero banned words

## 3. The work
Brainstorm the direction, then plan. Steps are finite, categoric, quantifiable — as many as the slice has, no cap. Clusters are BUILD units; they are not reviewed one by one — write the slice-level verification list `REV(__SLICE__)` will run. Refute your own plan: per step, the failure its criterion catches and one it does not; per cluster, the mutant class its command detects. Contested product questions go up as V rows with your recommendation, never decided here.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
