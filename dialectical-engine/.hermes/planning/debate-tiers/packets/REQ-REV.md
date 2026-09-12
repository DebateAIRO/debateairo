# PACKET REQ-REV — REQ-REV (blind review of the requirements, pass 1) · mission `debate-tiers`

Read FIRST, in full: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/debate-tiers/packets/COMMON.md · then this packet · then ONLY the files it names, at the lines it names.
Skills (Skill tool, in order): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion` — then anything else in Superpowers that fits.

## 1. Node
- seat: REQ-REV · node: REQ-REV (blind review of the requirements, pass 1) · pass: 1 of 3 · rework rounds: max 3 · model: claude-opus-5 · transport: Agent tool subagent, background, blind (no contact with the REQ seat) (resume: none offered — a second pass, if any, is a fresh session)
- ticket: t_e95f08a5 (slice ticket S01 t_11abead2 · S02 t_e4b4ab3a is V's) · comment cursor at dispatch: 0
- cwd for every command: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine (the MAIN tree, read-only; you write only your verdict file) · branch: dev · base: 7f89f7b7
- inputs (read these, plus the product files the SPECs cite at the lines they cite, read-only — a requirement is checkable only against the code it constrains): the REQ packet /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/debate-tiers/packets/REQ.md (review it FIRST) · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/INSTRUCTIONS.md · every /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/<S>/SPEC.md and PLAN.md scaffold · the intake record
- output (the ONE artifact this node produces): /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/reviews/REQ-REV-p1.md (new) + ONE verdict comment on t_e95f08a5
- self-report: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/agent-reports/REQ-REV.md (new)

## 2. Contract
- allowed (exhaustive): /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/reviews/REQ-REV-p1.md (new) · /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/debate-tiers/agent-reports/REQ-REV.md (new)
- forbidden: everything else — in particular every SPEC, PLAN, product file; you edit nothing under review
- verification: each SPEC acceptance step executed as a stranger would (UNVERIFIED where the stack is not served) · each requirement tested for a second reading · `ui:` flags checked against the acceptance surface · your own contradiction sweep

## 3. The work
Refute, do not read: try to find one requirement two seats would build differently, one acceptance step nobody can run, one slice that is not vertical. Number findings B1…/N1… with file:line and the concrete failure. Non-blocking findings are folded by the orchestrator into DECISIONS/ticket comments — only blocking findings spawn a rework pass, so tier honestly. Verdict: PASS / REWORK / BLOCKED, pass number named; a REWORK at pass 3 is a V row.

### Charges for THIS mission (numbered; answer each or write UNVERIFIED)
1. Packet review FIRST: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/debate-tiers/packets/REQ.md` — every constant against its source, the `allowed` list against what REQ actually wrote, the charges against what a stranger could execute. A packet defect is a finding against the orchestrator.
2. Read the intake `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/00-intake.md` (rows C1–C9) and `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/V-DECISIONS-PACKET.md` (V-1…V-9): a SPEC line that contradicts a binding default without a `V-ROW:` in DECISIONS.md is a finding.
3. Both SPECs: every requirement numbered and mechanically checkable; the acceptance sections are numbered browser steps V can run in BOTH modes (S01 on `/new`; S02 by starting one debate per tier, plus the refusal when a fleet member is unavailable — intake C1). Run the S01 steps against the MAIN tree as a stranger would (`https://localhost:3000` is running; do not sign in, do not create accounts — mark those steps UNVERIFIED) and say which steps a stranger cannot follow.
4. The Free locks (every gauge, both steering textareas, the ⚙ OPTIONS knobs, depth pinned at 2, question editable — V-3/V-4) and the Premium unlock are specified per control, not in prose; the tier rosters are configuration; the refusal names the missing model; `plan_tier` ownership of `packages/contract/src/index.ts` is stated.
5. `ui:` flags: S01 `yes`, S02 `no` — check them against the rule (a slice that adds or changes a visible surface). `DONE.md` for S01 is a placeholder, not a definition — REQ must not have defined done.
6. Every test the intake lists is named by a slice with its expected delta against `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/BASELINE.md` (three suites are RED at base).
7. Banned words in any criterion: improve, better, robust, handle, appropriate. Contradictions between the two SPECs (shared interface sentences must be byte-identical).
Verdict file: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/reviews/REQ-REV-p1.md` (new). Tier honestly — only a BLOCKING finding spawns a rework pass; N-findings are folded by the orchestrator.

## 4. Handoff
`PASS | REWORK | BLOCKED` on t_e95f08a5, OPENING with `SKILLS LOADED: <list>`, then the eight-line shape (`heartbeat-protocol` §5). File the self-report FIRST; the question it answers, verbatim from V:
> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.
Then stop: no push, no merge, no Done, no board mutation beyond your own comments, nothing opened on V's desktop.
