# PACKET __SEAT__ — ARCH-FIX(__SLICE__) (architecture rework after ARCH-REV pass __PREV_PASS__) · mission `__MISSION__`

Read FIRST, in full: this packet · then __PACKET_DIR__/COMMON.md · then ONLY the files they name, at the lines they name — plus a named skill's own `references/*.md` when that skill sends you there, each listed in your `SKILLS LOADED` line. The spine (`docs/agent-protocols/…`) is the authority for a DISPUTE, not floor reading — open it only for a section a packet or a conflict names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-architecture` · `superpowers:receiving-code-review` · `superpowers:brainstorming` (the role floor — convergent here: used where a finding opens an alternative) · `superpowers:writing-plans` (the plan is re-issued, not patched by hand) — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: ARCH-FIX(__SLICE__) (rework after ARCH-REV pass __PREV_PASS__) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the verdict __VERDICT__ (in full) and the reviewer's probes __PROBES__ · the findings assigned to this node: __FINDING_IDS__ · your predecessor's handoff and self-report (fresh session only): __PREDECESSOR__ · __MISSION_ROOT__/slices/__SLICE__/PLAN.md as it stands, the frozen SPEC of record __SPEC__, DECISIONS.md, INSTRUCTIONS.md · the V rows and __MISSION_ROOT__/BASELINE.md · the product files the verdict cites, at the lines it cites, read-only, IN THE LANE __LANE__
- output (the ONE artifact this node produces): __MISSION_ROOT__/slices/__SLICE__/PLAN.md revised IN PLACE (a `Revision __PASS__` line under the title naming the pass, the verdict and every cluster/step changed; the plan is not frozen — the SPEC is) and DECISIONS.md appended (never rewritten) — and a READY handoff naming every assigned finding ADDRESSED (the sentence added, quoted, with its new line) or CONTESTED (with a measurement)
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/slices/__SLICE__/PLAN.md · __MISSION_ROOT__/slices/__SLICE__/DECISIONS.md · the ADR this slice already owns (if a finding touches it) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every SPEC version (frozen), every product file, PROGRESS.md, BASELINE.md, the intake record, the V packet, other missions' docs, git; the lane stays byte-clean (cluster commands run from a `.sh` under your scratch dir)
- verification: every assigned finding's failure path re-read against the revised steps · every cluster command RE-RUN at base in the lane after the revision (TDD-created paths omitted and recorded) · the SPEC↔PLAN trace both ways with zero gaps (run the reviewer's trace parser if one is in the probes) · every `path:line` the revision touches re-measured in the LANE · zero banned words · no step added beyond the findings (new scope is a `V-ROW: NEW` block)

## 3. The work
Reproduce first: for each finding, walk the verdict's inputs → outcome against the plan as it stands and say where the plan lets that outcome through. Then close it with the fewest step changes that leave one build true, in RED-before-GREEN order. Fix the CLASS: sweep every requirement the same defect shape touches, record the sweep member-by-member in the handoff. Contest with a measurement, never with an argument. Findings outside your assignment are named, not fixed.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
