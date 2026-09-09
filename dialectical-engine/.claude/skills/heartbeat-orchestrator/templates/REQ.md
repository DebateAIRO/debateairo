# PACKET __SEAT__ — REQ (requirements) · mission `__MISSION__`

Read FIRST, in full: this packet · then __PACKET_DIR__/COMMON.md · then ONLY the files they name, at the lines they name — plus any file a named skill names as its own reading (a skill's `references/*.md`, the spine), each listed in your `SKILLS LOADED` line.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-requirements` · `superpowers:brainstorming` (before any SPEC line) — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: REQ (requirements) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): the intake record (V's verbatim goal, contradiction check, measured state) · the design of record extracts at __DESIGN_DIR__ (if any) · the product files the intake cites, at the lines it cites, read-only (a requirement is checkable only against the code it constrains) · __ARCH_DOCS__ (docs/architecture files WITH line ranges — never a bare directory)
- output (the ONE artifact this node produces): __MISSION_ROOT__/INSTRUCTIONS.md (new, ≤ 100 lines) and, per slice, __MISSION_ROOT__/slices/<S>/SPEC.md (new, frozen at your READY; first line under the title: `ui: yes|no`), PLAN.md (new, scaffold only), DECISIONS.md (new, append-only), PROGRESS.md (new, empty — the orchestrator's), DONE.md (new, placeholder — UI slices only)
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/INSTRUCTIONS.md (new) · __MISSION_ROOT__/slices/** (new) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every product file, every other mission's docs, git
- verification: `wc -l` on INSTRUCTIONS.md ≤ 100 · every SPEC requirement numbered and mechanically checkable · every acceptance step a numbered human-runnable browser step in BOTH modes on UI slices · zero banned words · SPEC↔PLAN trace skeleton present · contradictions: zero, or routed as V rows through the orchestrator

## 3. The work
One testable vertical slice per SPEC — a beginning and an end V can exercise alone. `ui: yes` when the acceptance runs in a browser (then DONE.md is a placeholder that V fills through the mock gate; you do not define done for a UI slice). Record every alternative you rejected in DECISIONS.md. Clusters are BUILD units (one verification command each); the review unit is the whole slice.

## 4. Handoff
`READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
