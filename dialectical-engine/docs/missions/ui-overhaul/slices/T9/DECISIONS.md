# DECISIONS — T9 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Does TURN 9 apply to signed-in `/`? | No — anonymous `/` only; signed-in keep library (T3). | V ruling in mission brief / REQ-01 packet. | V
- 2026-08-31 | Are Method / Transcripts / Pricing in scope as pages? | Stub anchors only this mission. | V ruling — pages never designed. | V
- 2026-08-31 | Who fills PLAN clusters for ui-overhaul? | Requirements authors WHAT-proves clusters per REQ-01 packet; Architecture still owns HOW / modules / exact commands. | Packet §3 overrides heartbeat-requirements "ARCH fills PLAN" for this seat; tension recorded for ARCH handoff. | Requirements (Grok REQ-01) following packet
- 2026-08-31 | Design vocab vs app vocab on landing? | **CLOSED — APP VOCABULARY EVERYWHERE.** Full mapping table below. Binding strings on T9 are translated design copy (structure/tone/layout preserved). | V 2026-08-31 rework ruling. | V
- 2026-08-31 | Anonymous `Start a round` vs signed-in-only create? | **CLOSED — CTA → sign-in/sign-up with return path into New debate after auth.** | V 2026-08-31 rework ruling. | V
- 2026-08-31 | `[PLACEHOLDER]` rounds/pricing on landing? | **CLOSED — static placeholder copy this mission** (no live counter, no real prices). | V 2026-08-31 rework ruling. | V
- 2026-08-31 | Mode preference persistence? | Persist Terracotta/Chamber for the browser session when cheap; not a design-mandated floor. Beyond-session = ARCH. Removed “at minimum” from SPEC states. | Design specifies toggle only; durability is a product judgement — F12. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Which design paragraphs become binding copy? | Hero body; after-sample “The debate ends here…”; method intro + arena lines; pricing CTA “Take one debate…” — all vocabulary-translated. Inventory gestures alone are insufficient (F11). | Verbatim-replace mission; coder must not paraphrase marketing. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle on T9 surface? | Required — design shows ☾ glyph on landing chrome. | Design artboard. | Requirements (Grok REQ-01)

## Vocabulary mapping (design → app) — V 2026-08-31

| Design term | App term (binding) | Notes |
|---|---|---|
| round / rounds | debate / debates | CTA, meta, pricing, section titles |
| turn / turns | turn / turns | Exchange stages within a debate (sample Turn 01–04; “four turns per debate”); not a synonym for round |
| joint / joints | claim / claims | “weakest claim”; pressure on the claim |
| bench | the graph / DebateAI framing | Method step-03: no “bench spawns”; T8 uses “Put a claim on the graph.” |
| Start a round | Start a debate | Aligns with library `Start debate →` |
| ONE ROUND, FOUR TURNS | ONE DEBATE, FOUR TURNS | Section label |
| [PLACEHOLDER] rounds argued… | [PLACEHOLDER] debates argued… | Static glyph this mission |
| First [PLACEHOLDER] rounds free… | First [PLACEHOLDER] debates free… | Static glyph this mission |
