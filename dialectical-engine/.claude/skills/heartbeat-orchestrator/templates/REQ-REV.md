# PACKET __SEAT__ — REQ-REV (blind review of the requirements, pass __PASS__) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: REQ-REV (blind review of the requirements, pass __PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the REQ packet __PACKET_DIR__/REQ.md (review it FIRST) · __MISSION_ROOT__/INSTRUCTIONS.md · every __MISSION_ROOT__/slices/<S>/SPEC.md and PLAN.md scaffold · the intake record
- output (the ONE artifact this node produces): __MISSION_ROOT__/reviews/REQ-REV-p__PASS__.md (new) + ONE verdict comment on __TICKET__
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/reviews/REQ-REV-p__PASS__.md (new) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every SPEC, PLAN, product file; you edit nothing under review
- verification: each SPEC acceptance step executed as a stranger would (UNVERIFIED where the stack is not served) · each requirement tested for a second reading · `ui:` flags checked against the acceptance surface · your own contradiction sweep

## 3. The work
Refute, do not read: try to find one requirement two seats would build differently, one acceptance step nobody can run, one slice that is not vertical. Number findings B1…/N1… with file:line and the concrete failure. Non-blocking findings are folded by the orchestrator into DECISIONS/ticket comments — only blocking findings spawn a rework pass, so tier honestly. Verdict: PASS / REWORK / BLOCKED, pass number named; a REWORK at pass 3 is a V row.

## 4. Handoff
`PASS | REWORK | BLOCKED` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
