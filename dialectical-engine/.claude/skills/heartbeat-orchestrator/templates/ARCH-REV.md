# PACKET __SEAT__ — ARCH-REV(__SLICE__) (blind review of the plan, pass __PASS__) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: ARCH-REV(__SLICE__) (blind review of the plan, pass __PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the ARCH packet __PACKET_DIR__/ARCH-__SLICE__.md (review it FIRST) · __MISSION_ROOT__/slices/__SLICE__/PLAN.md · SPEC.md · DECISIONS.md · the freeze commits (COMMON §6 row `freeze commits`; `git diff --stat <previous>..<latest> -- docs/missions/__MISSION__` is exactly what the seat under review changed)
- output (the ONE artifact this node produces): __MISSION_ROOT__/reviews/ARCH-REV-__SLICE__-p__PASS__.md (new) + ONE verdict comment on __TICKET__
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/reviews/ARCH-REV-__SLICE__-p__PASS__.md (new) · a scratch dir under __SCRATCH__ (new) · __REPORTS__/agent-reports/__SEAT__.md (new) · __REPORTS__/probes/__SEAT__/ (new — every probe AND render fixture lives there; a UI lens renders from there, never from the lane)
- forbidden: everything else — in particular PLAN.md, SPEC.md, every product file; you edit nothing under review
- verification: every cluster command re-run by YOU at base from a `.sh` file, inline and scripted, with zero disagreements · your own both-ways trace parser · one step you cannot mark done without a judgement call = a finding

## 3. The work
Find the step a stranger cannot check, the command that condemns correct input, the cluster that cannot go green, the screen the `## Screens` block forgot. Number findings B/N with file:line. Non-blocking findings fold into DECISIONS through the orchestrator; only blocking ones spawn a rework pass. Verdict PASS / REWORK / BLOCKED with the pass number; a REWORK at pass 3 is a V row.

## 4. Handoff
`PASS | REWORK | BLOCKED` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
