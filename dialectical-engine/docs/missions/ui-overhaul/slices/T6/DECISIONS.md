# DECISIONS — T6 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Immediate account wipe vs seven-day schedule? | Seven-day schedule with typed `DELETE MY ACCOUNT` per design. | TURN 6 artboard. | Requirements (Grok REQ-01) binding design
- 2026-08-31 | `dezbatere.ro` in chrome? | OPEN QUESTION → ARCH proposes, V ratifies host string. | May be locale/product host; do not invent multi-tenant host matrix. F9. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Which design paragraphs are binding copy vs summary? | Identity HttpOnly/MFA model line; sensitive-action step-up line; legacy-claim “not saved” paragraph; seven-day delete paragraphs; typed `DELETE MY ACCOUNT` — all binding. Other chrome is inventory. | F13 judgement. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle required on settings? | Yes — Terracotta↔Chamber on T6 chrome even if design ☾ is sparse; mission-wide mode language. | F13 / design-system facts. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Vocabulary on settings? | App vocabulary (V 2026-08-31); no design `rounds`/`joints`. | V ruling. | V
- 2026-08-31 | OPEN QUESTION — `dezbatere.ro` in chrome? | **ARCH proposes: KEEP.** It already ships in `apps/ui/components/TopBar.tsx` (`<span className="brandDomain">`) and the design draws it on every artboard. Routed as open-questions Q-06. | Changing a production host string is a product decision with no design driver. | ARCH-01 (V ratifies)
- 2026-08-31 | Does T6 mount its own mode toggle? | No — `/settings` renders inside the layout, so `TopBar`'s toggle (T3-C1) is already present. | Two mount points cover all eight slices. ADR-002. | ARCH-01
- 2026-08-31 | Current-vs-other session distinction? | `aria-current="true"` plus a text label, never colour alone. | The distinction has to survive Chamber and a colour-blind reader; a colour-only state fails both. | ARCH-01
- 2026-08-31 | Which files carry T6's pin migration? | `tests/render/s5-session-controls.test.tsx` (RETARGET), plus KEEP guards `s9-legacy-claim-controls`, `s10-erasure-ui`, `s10-erasure-ui-render`, `s9-dev-token-retirement-contract`. | `s5-session-controls` and `s9-legacy-claim-controls` reference BOTH `apps/ui` and `web/`; only their `apps/ui` assertions move. `s9-dev-token-retirement-contract` reads `settings/page.tsx` as source, so it is in every T6 command. | ARCH-01
- 2026-08-31 | Do the existing security strings change? | No — `Active sessions`, `Current session`, `Fresh authentication complete` are kept verbatim; design columns are added around them. | They are pinned by a standing test and T6's NON-goals put the security model out of contract. | ARCH-01

---
**Tally (2026-08-31, ARCH-01 AM1):** 10 rows — 5 pre-ARCH (REQ-01) + 5 appended by ARCH-01 at handoff; 0 at AM1.
