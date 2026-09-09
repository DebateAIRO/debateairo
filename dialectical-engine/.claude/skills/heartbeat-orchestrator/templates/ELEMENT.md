# PACKET __SEAT__ — ELEMENT(__SLICE__) (finished-element review, roster-named seat) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` (read as markdown if you are not a Claude seat) — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: ELEMENT(__SLICE__) (finished-element review, roster-named seat) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the slice at PASS: head __SLICE_HEAD__ in __LANE__ (read-only) · the acceptance oracle __ORACLE__ · the union verdict of the last REV pass · the dev-stack recipe in the review package __REPORTS__/review-packages/__SLICE__-p__PASS__/
- output (the ONE artifact this node produces): __MISSION_ROOT__/reviews/ELEMENT-__SLICE__.md (new) + ONE verdict comment on __TICKET__
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/reviews/ELEMENT-__SLICE__.md (new) · probes under __SCRATCH__ (new) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular the slice's files, git writes
- verification: the element exercised end to end against the oracle by your own means; every step you cannot exercise listed under UNVERIFIED for V's test point — never assumed

## 3. The work
You are fired once, when the element is truly done — never on a partial slice. Judge the finished element as V will: every acceptance step, both modes, the failure paths. Findings B/N with file:line. Verdict PASS / REWORK / BLOCKED; a REWORK here is a FIX node and a scoped REV pass, counted against the slice's cap.

## 4. Handoff
`PASS | REWORK | BLOCKED` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
