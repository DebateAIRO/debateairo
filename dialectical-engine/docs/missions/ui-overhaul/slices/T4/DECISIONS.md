# DECISIONS — T4 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Send V2 option panel fields on V3 create? | No — design states no V3 slot; R4 binds not-sent. | TURN 4 options copy. | Requirements (Grok REQ-01)
- 2026-08-31 | Show V2 options or hide? | Prefer show with not-sent note (design); OPEN if V wants hide. | Design artboard includes them. | Requirements (Grok REQ-01) — preference, ARCH may confirm
- 2026-08-31 | `Start run` vs `Start debate` labeling? | OPEN QUESTION → ARCH proposes, V ratifies (F9). | Cross-turn inconsistency in design. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Pin-bind wording use example file only vs `tests/render/**`? | Amended R7 to explicit `tests/render/**` … ARCH names pins (same class as T5 skeptic fix). | Plan AC3 / class sweep. | Requirements (Grok REQ-01) rework
- 2026-08-31 | Anonymous create NON-goal vs T9 OQ2? | Aligned with closed CTA→auth→New debate (F8). | V 2026-08-31. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | SPEC version? | Bumped to v2 (F10). | Spine re-version. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle on new-debate? | Yes — mission-wide mode language. | F13. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | OPEN QUESTION — `Start run` vs `Start debate` vs `Start a debate`? | **ARCH proposes: keep all three per-screen strings as the design draws them.** Routed to V as open-questions Q-04; three strings is what ships absent a V ruling. | They are three different acts: the landing CTA enters the product, the library composer submits a claim, the form starts a run. All three are already binding copy in their own SPEC. | ARCH-01 (V ratifies)
- 2026-08-31 | OPEN QUESTION — show or hide the V2-only options panel? | **ARCH proposes: SHOW, with the not-sent note**, per the design artboard and the SPEC's stated preference. Routed as Q-05. | Hiding them removes exactly the transparency the design is making a point of. The `data-v2-only` payload assertion proves they are not sent. | ARCH-01 (V ratifies)
- 2026-08-31 | How is "V2 options not sent" made un-gameable? | Every V2 control carries `data-v2-only="true"`; T4-C3-2 collects those field names, sets non-default values, submits, and asserts the V3 payload key set contains none of them. | A test that asserts only the not-sent SENTENCE is green while the values ship. The attribute is the machine-readable list so it cannot drift from the prose. | ARCH-01
- 2026-08-31 | Is `class="optionsToggle"` renamed? | No — frozen. `tests/render/ux01-new-debate-form.test.tsx` pins it together with `aria-expanded`. | Class names are a frozen contract for the whole mission. ADR-006. | ARCH-01
- 2026-08-31 | Which files carry T4's pin migration? | `tests/render/ux01-new-debate-form.test.tsx` and `tests/unit/v2ui-pages.test.ts` (618 lines of page-SOURCE wiring guards over `new/page.tsx`). | `v2ui-pages` is outside `tests/render/**` but reads the file T4 writes, so it is named under R7's "ARCH names pins" delegation and carried in every T4 command. | ARCH-01
