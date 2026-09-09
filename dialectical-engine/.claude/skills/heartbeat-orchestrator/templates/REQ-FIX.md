# PACKET __SEAT__ — REQ-FIX (requirements rework after REQ-REV pass __PREV_PASS__) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-requirements` · `superpowers:receiving-code-review` · `superpowers:brainstorming` (only where a finding opens a new alternative) — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: REQ-FIX (rework after REQ-REV pass __PREV_PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the verdict __VERDICT__ (in full) · the findings assigned to this node: __FINDING_IDS__ · your predecessor's handoff and self-report (fresh session only): __PREDECESSOR__ · the SPECs, PLAN scaffolds, DECISIONS and INSTRUCTIONS under __MISSION_ROOT__ as they stand · the intake record, V rows and __MISSION_ROOT__/BASELINE.md · the product files the verdict cites, at the lines it cites, read-only
- output (the ONE artifact this node produces): per affected slice, __MISSION_ROOT__/slices/<S>/SPEC-v__PASS__.md (new — a COMPLETE spec superseding the previous version, which stays byte-identical; line 3 = the `ui:` line, line 4 = the supersession line naming the pass, the verdict and every requirement changed), the amended __MISSION_ROOT__/INSTRUCTIONS.md, PLAN.md scaffold corrected, DECISIONS.md appended (never rewritten) — and a READY handoff naming every assigned finding ADDRESSED (the sentence added, quoted, with its new line) or CONTESTED (with a measurement)
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/INSTRUCTIONS.md · __MISSION_ROOT__/slices/<S>/ for each affected slice (PROGRESS.md excepted — the orchestrator's) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every product file, PROGRESS.md, BASELINE.md, the intake record, the V packet, other missions' docs, git · every earlier SPEC version (frozen — byte-identical at your READY)
- verification: every assigned finding's failure path re-read against the amended requirement · `wc -l` on INSTRUCTIONS.md ≤ 100 · every `path:line` that points INTO a SPEC (DECISIONS, INSTRUCTIONS, PLAN) re-pointed at the new version and re-verified — lines shift · zero banned words · no requirement added beyond the findings (new scope is a `V-ROW:` line)

## 3. The work
Reproduce first: for each finding, walk the verdict's inputs → outcome against the SPEC as it stands and say where the SPEC lets that outcome through. Then close it with the fewest sentences that leave one build true. Fix the CLASS: sweep every requirement the same defect shape touches, record the sweep member-by-member in the handoff. Contest with a measurement, never with an argument. Findings outside your assignment are named, not fixed.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
