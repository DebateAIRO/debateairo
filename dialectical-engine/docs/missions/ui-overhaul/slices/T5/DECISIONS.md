# DECISIONS — T5 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | New scoring APIs for drawer? | No — presentation overhaul of existing contract. | UI overhaul bounds; T5 intent. | Requirements (Grok REQ-01)
- 2026-08-31 | publicMode mutate in drawer? | No — locked/absent; aligns T3 R7. | Shipped publicMode + design locks. | Requirements (Grok REQ-01)
- 2026-08-31 | Drawer field order vs design? | OPEN QUESTION → ARCH records chosen order. | Possible a11y/layout constraint. | Requirements (Grok REQ-01)
- 2026-08-31 | Completeness gap: TURN 5 `REVIEW AGREED BY:` omitted from SPEC? | Amended SPEC/PLAN same day before peer PASS: inventory T5-S5, binding copy, R3, V-manual steps, PLAN T5-C1-3/4. Not a scope expansion — design artboard already bound it (design-document-text.txt:302–304). | Skeptic criterion 2. | Requirements (Grok REQ-01) rework
- 2026-08-31 | Completeness gap: T5 R8 lacked explicit `tests/render/**` bind? | Amended to R9 with same `tests/render/**` … move to NEW UI (ARCH names pins) wording as sibling slices. | Skeptic criterion 3. | Requirements (Grok REQ-01) rework
- 2026-08-31 | SPEC version after pre-handoff amendments? | Bumped to v2 FROZEN (F10). | Spine re-version. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Vocab joint vs claim in drawer? | **CLOSED** — claim/node (V 2026-08-31). | V ruling. | V
- 2026-08-31 | “Readable” / “if available” acceptance? | Contrast threshold ARCH pins; no-cross-review step requires fixture (F4g/F7). | Peer findings. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle on drawer? | Yes — participates in Terracotta↔Chamber. | Design + F13. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | OPEN QUESTION — drawer field order vs design? | **CLOSED** — ship the design's vertical order: header → claim body → way of knowing → review verdict → scores → replay → restatement → defeaters → judge disagreement → condition marks → actions → generation history. | No accessibility constraint forces otherwise: the drawer is a single `role="dialog"` with a linear reading order, and the design's order is already most-important-first. | ARCH-01
- 2026-08-31 | Is a new API needed for the T5 review verdict line? | No. `NodeDetailDrawer.tsx` already renders `<li data-node-review={v3.review?.outcome ?? "absent"}>` for the second-maker review. | The slice is a retitle + reorder + re-skin; the datum and the typed-absence marker already ship. `"absent"` IS R3's typed absence. | ARCH-01
- 2026-08-31 | How is "no fabricated review line" made un-gameable? | Assert BOTH `data-node-review="absent"` AND the two binding labels being absent. | Two independent signals, so a coder cannot satisfy the step by deleting the attribute. | ARCH-01
- 2026-08-31 | Does the drawer mount its own mode toggle? | No — it renders inside the debate document, so T1-C1's chrome toggle already switches it. A second toggle is a finding. | Two toggles on one document can disagree. R8 is satisfied by the drawer's tokens responding, which is what T5-C2-4 measures. ADR-002. | ARCH-01
- 2026-08-31 | Which colour tokens for agree/dispute in the drawer? | `var(--agree-text)` / `var(--dispute-text)`, the text-role tokens, not the raw accents. | The design's raw `agree` `#3E7A4E` measures 4.25:1 on `shell`, below the 4.5 text floor. ADR-005. | ARCH-01
