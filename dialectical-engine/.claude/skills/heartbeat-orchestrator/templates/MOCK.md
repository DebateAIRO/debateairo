# PACKET __SEAT__ — MOCK(__SLICE__) (the mock UI) · mission `__MISSION__`

Read FIRST, in full: __PACKET_DIR__/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-mock` · `design-taste-frontend` · `design` — then anything else in Superpowers that fits.

## 1. Node
- seat: __SEAT__ · node: MOCK(__SLICE__) (the mock UI) · pass: __PASS__ of 3 · rework rounds: max 3 · model: __MODEL__ · transport: __TRANSPORT__ (resume: __RESUME__)
- ticket: __TICKET__ (slice ticket __SLICE_TICKET__ is V's) · comment cursor at dispatch: __CURSOR__
- cwd for every command: __LANE__ · branch: __BRANCH__ · base: __BASE__
- inputs (read these and nothing else): __MISSION_ROOT__/slices/__SLICE__/SPEC.md · PLAN.md `## Screens` · the design of record extracts at __DESIGN_DIR__ (if any) · __REPO_ROOT__/apps/ui/app/globals.css:__TOKEN_LINES__ (the token blocks) · the components PLAN names under __REPO_ROOT__/apps/ui/components/ · the live app at __APP_URL__ through the harness's own browser pane (screenshots only)
- output (the ONE artifact this node produces): one design canvas (Artifact URL) — one artboard per screen and state, both modes — and __MISSION_ROOT__/slices/__SLICE__/MOCK.md (new): URL, artboard list, provenance table, open questions as smallest yes/no
- self-report: __REPORTS__/agent-reports/__SEAT__.md (new)

## 2. Contract
- allowed (exhaustive): __MISSION_ROOT__/slices/__SLICE__/MOCK.md (new) · __REPORTS__/agent-reports/__SEAT__.md (new)
- forbidden: everything else — in particular every product file (apps/**, packages/**), every SPEC/PLAN, git; you write no code
- verification: every colour, spacing, type and radius value in the canvas traces to a globals.css token or the design of record (the provenance table says which; NEW rows are the only exception) · every screen and state in `## Screens` has an artboard in BOTH modes · zero questions asked in chat

## 3. The work
Design read first (`design-taste-frontend` §0), dials pinned to redesign — preserve. Compose from what exists: real token values, the real components' class vocabulary and geometry, the design of record. Do not invent. Where the plan needs a thing the app lacks, draw it and mark the provenance row NEW. Put every open design question in MOCK.md as a smallest yes/no for V — the canvas is V's to edit, so the questions live beside it, never in chat.

## 4. Handoff
`MOCK READY` on __TICKET__, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
