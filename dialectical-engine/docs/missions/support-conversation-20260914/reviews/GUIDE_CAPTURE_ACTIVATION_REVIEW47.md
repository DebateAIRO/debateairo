# GUIDE_CAPTURE_ACTIVATION_REVIEW47 — compact activation ordering review

- Ticket: `t_d30fe353`
- Product revision: `0d34f82f4a2188d0ce1db04655b693798ffd2169`
- Reviewer session: `01a09ef7-e096-7c31-9b35-806840028cf0`
- Date: `2026-09-21`
- Verdict: `PASS_FINAL_CAPTURE_ACTIVATION_BINDING`

## Bounded disposition

The LIVE35 compact activation failure is resolved. The actual capture imports and invokes `runGuideCaptureOpenMode`; it does not duplicate the tested behavior. For compact mode with the corrected ordering, the helper records and completes cookie settling before `activateCompact()`. Locale selection follows readiness without repeating consent settling. Full mode and the preserved legacy control retain the established post-readiness settlement path. Existing observation, hydration, pointer activation, readiness, language selection, stage recording, checkpointing, private-control checks, Help navigation and screenshot behavior remain connected through the actual capture callbacks.

The compiled-UI evidence is discriminating:

- `legacy-visible-cookie` begins collapsed with consent visible and reproduces `GUIDE_HARNESS_COMPACT_STATE_TRANSITION_ABSENT` without reaching ready.
- `corrected-visible-cookie` records cookie settling before locale selection and ends expanded with panel, compact root and composer visible and consent hidden.
- `corrected-already-settled` begins with consent `HIDDEN` in the final evidence and also ends ready. The earlier artifact that recorded this state as visible remains preserved as superseded prequalification evidence.

All dynamic, private and external routes were intercepted before navigation. Only same-origin public GET/HEAD assets were forwarded. The evidence records auth interceptions 4; Support, status, private/other API and external interceptions 0; forwarded dynamic requests 0; actual Support requests 0. This is compiled-UI control evidence, not a live Support/model sample.

## Final binding

The actual capture and helper are in the exact 32-file closure, SHA-256 `5265e5736d158b3b0d5e98928264b047a8baef0273d794a61fb309a9fc7f88b4`. All seven argv select contract SHA-256 `980b9fdd62e85c2c6b731a78825f5d82373f773e2357027768c40f224cbd0acf`; operator SHA-256 is `b8d98de4ffe1b1966577f1d75933206603788c50f5f9077c2217f911fc72a092`. Fresh operational/composed paths are LIVE36, actual paths are GUIDE25, and unused owner paths remain LIVE21/LIVE25. All 115 future paths are unique and absent; LIVE35 and GUIDE24 evidence stays immutable.

REVIEW46 phase imports and every unrelated ancestor UI writer/lifecycle, completion, producer/composer, schedule, budget, screenshot, private parser, runtime/process/schema, privacy and product disposition remain PASS on unchanged bytes.

This is a static final-binding verdict. It does not claim actual remaining21 execution, all31 quality, fresh owner availability, Forgot resolution, CP1 acceptance, or CP2 readiness.
