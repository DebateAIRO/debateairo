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
- 2026-08-31 | ERRATUM — V-manual step 3 “(when tree exists)” skippable? | Struck; rewritten as required fixture with strongest pro/con cases (N2 micro-round 2). Not a scope re-open. | Round-2 review N2. | Requirements (Grok REQ-01-R2)
- 2026-08-31 | OPEN QUESTION 1 — verdict-first vs view toggles: is there a conflict? | **CLOSED — no conflict.** The design's own reading order (`design-document-text.txt:436-456`) puts Thread/Split/Tree/Map ABOVE the verdict block and the strongest-case pair BELOW it. "Verdict-first" = verdict precedes the strongest cases, exactly as R6 words it. | Composition: existing `publicHeader` slot carries LockBanner → VerdictBlock → StrongestCases → existing `publicationDetails`; `debateMain` (the views) is untouched, so R5 holds. No scope change, nothing dropped. | ARCH-01
- 2026-08-31 | OPEN QUESTION 3 — `Unlock actions` destination? | **CLOSED** — `/login?next=%2Fpublic%2Fdebate%2F<public_ref>`, back to the same public debate. | A non-owner has no owner route to reach; `/debate/<id>` would 404 or be denied. `safeReturnPath`'s public-debate shape rule exists for this href. ADR-004. | ARCH-01
- 2026-08-31 | May the library tab selectors become buttons or client state? | No. They stay native `<a href="/?tab=…">` with `tabIndex` 0, `aria-current="page"`, and no `role="tab"`/`aria-selected`/`role="tablist"`. | `tests/unit/pda-s03-keyboard-accessibility.test.ts` asserts every one of those deliberately, from a prior mission. T3 changes label case and the count chip only. | ARCH-01
- 2026-08-31 | Do the existing `publicationDetails` contents survive 3b? | Yes — pseudonym, badges, residual objections and reversal point are kept and moved below the strongest-case pair. | The design gives them no position; dropping them removes their only public home. | ARCH-01
- 2026-08-31 | Library row card language? | `data-bezel="shell"` / `="core"` on the row wrapper and body, sharing the T1 card vocabulary. | Shared token+attribute vocabulary is what stops library rows and canvas cards drifting visually without coupling their components. | ARCH-01

---
**Tally (2026-08-31, ARCH-01 AM1):** 14 rows — 9 pre-ARCH (REQ-01) + 5 appended by ARCH-01 at handoff; 0 at AM1.
