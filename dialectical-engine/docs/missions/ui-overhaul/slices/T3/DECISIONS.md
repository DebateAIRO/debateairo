# DECISIONS — T3 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Spec TURN 3b against parallel page or shared workspace? | Against shipped shared workspace + `publicMode` (3705955, 362c469); 3b is layout/lock requirements on that path. | Packet §2 + §4 known tension — do not contradict shipped reality. | Requirements (Grok REQ-01)
- 2026-08-31 | May this slice drop tree/views on public? | No — R5 forbids regressing to answer-only. | Prior public-debate-access Done + publicMode. | Requirements (Grok REQ-01)
- 2026-08-31 | Verdict-first vs view toggles conflict? | OPEN QUESTION → ARCH composition; not silently dropped. | Packet §4. | Requirements (Grok REQ-01)
- 2026-08-31 | Library term `debates` vs landing `rounds`? | **CLOSED** — `debates` everywhere (V 2026-08-31). | V ruling / T9 mapping. | V
- 2026-08-31 | Anonymous create NON-goal vs T9 OQ2(c)? | Aligned NON-goal with closed CTA→auth→New debate (F8); no silent option-(c) close while question open. | V 2026-08-31 + F8. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Missing design controls `4 TOTAL`, `Details ▾`, `Read ▾`? | Added to inventory/copy/R3/R6/acceptance (F11). | Design TURN 3. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | SPEC version? | Bumped to v2 (F10 class). | Spine re-version. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle on library/public? | Yes — design shows ☾. | Design. | Requirements (Grok REQ-01)
