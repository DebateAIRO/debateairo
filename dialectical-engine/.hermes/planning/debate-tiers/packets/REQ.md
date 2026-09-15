# PACKET REQ — REQ (requirements) · mission `debate-tiers`

Read FIRST, in full: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/debate-tiers/packets/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-requirements` · `superpowers:brainstorming` (before any SPEC line) — then anything else in Superpowers that fits.

## 1. Node
- seat: REQ · node: REQ (requirements) · pass: 1 of 3 · rework rounds: max 3 · model: claude-opus-5 · transport: Agent tool subagent, background (resume: none offered — a rework pass is a fresh session carrying this handoff)
- ticket: t_cb9482de (slice ticket S01 t_11abead2 · S02 t_e4b4ab3a is V's) · comment cursor at dispatch: 0
- cwd for every command: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine (the MAIN tree; you write mission docs only, no git writes) · branch: dev · base: 7f89f7b7
- inputs (read these and nothing else): the intake record (V's verbatim goal, contradiction check, measured state) · the design of record extracts at /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/design/design-document-rendered.html:967-1101 (artboard 4a New debate — no tier artboard exists anywhere; the selector is undesigned and MOCK(S01) designs it) (if any) · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/architecture/ (read-only)
- output (the ONE artifact this node produces): /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/INSTRUCTIONS.md (new, ≤ 100 lines) and, per slice, /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/<S>/SPEC.md (new, frozen at your READY; first line under the title: `ui: yes|no`), PLAN.md (new, scaffold only), DECISIONS.md (new, append-only), PROGRESS.md (new, empty — the orchestrator's), DONE.md (new, placeholder — UI slices only)
- self-report: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/agent-reports/REQ.md (new)

## 2. Contract
- allowed (exhaustive): /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/INSTRUCTIONS.md (new) · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/** (new) · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/agent-reports/REQ.md (new)
- forbidden: everything else — in particular every product file, every other mission's docs, git
- verification: `wc -l` on INSTRUCTIONS.md ≤ 100 · every SPEC requirement numbered and mechanically checkable · every acceptance step a numbered human-runnable browser step in BOTH modes on UI slices · zero banned words · SPEC↔PLAN trace skeleton present · contradictions: zero, or routed as V rows through the orchestrator

## 3. The work
One testable vertical slice per SPEC — a beginning and an end V can exercise alone. `ui: yes` when the acceptance runs in a browser (then DONE.md is a placeholder that V fills through the mock gate; you do not define done for a UI slice). Record every alternative you rejected in DECISIONS.md. Clusters are BUILD units (one verification command each); the review unit is the whole slice.

### Charges for THIS mission (numbered; answer each or write UNVERIFIED)
1. Read, in this order: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/00-intake.md` (V's verbatim goal; the measured state; rows C1–C9 whose defaults BIND you) · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/V-DECISIONS-PACKET.md` (rows V-1…V-9) · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/BASELINE.md`.
2. Two slices, already ticketed: **S01** `ui: yes` — the Free/Premium selector above the question on `/new`, the Free locks (every gauge, both steering textareas, the ⚙ OPTIONS knobs; tree depth pinned at 2; the question stays editable), the Premium unlock, the tier shown with its models, and the ask carrying `plan_tier` (C3–C6, C8, C9 defaults). **S02** `ui: no` — the tier picks the fleet: rosters as configuration (`free` = gpt-5.6-luna + claude-sonnet-5; `premium` = gpt-5.6-sol + claude-opus-5 + grok-4.6) filtered against the discovered-and-healthy panel, the refusal with a typed error naming the missing model (C1 default), the panel size = the roster size (C7), the run recording its tier (C9). Do not merge or split the slices without a `V-ROW:` line in DECISIONS.md saying why.
3. Per slice: SPEC.md numbered requirements + a numbered acceptance section V runs in the real dev stack in BOTH modes (S01 on `/new`; S02 by starting one debate per tier and seeing the tier's models argue — and the refusal when a member is unavailable). PLAN.md scaffold only. PROGRESS.md empty. DECISIONS.md with every alternative you rejected. S01 gets `DONE.md` as a PLACEHOLDER (header + the screen/state list the SPEC implies) — V defines done at the mock gate; you do not.
4. Name every existing test the slices must keep green or update (intake lists six) and the contract/API lines they touch; the `.strict()` ask schema means `plan_tier` is a contract change — say which slice owns `packages/contract/src/index.ts`.
5. A contested choice outside rows V-1…V-9 is written as a `V-ROW:` line in DECISIONS.md with your recommended default; it goes to V through the orchestrator — never to V directly.
6. NEVER read `.local/**` (provider config with authorization headers) — the fleet facts you need are in the intake and COMMON §6.

## 4. Handoff
`READY` on t_cb9482de, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
