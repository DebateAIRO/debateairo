# DECISIONS — T1 (append-only)

Format: `YYYY-MM-DD | question | choice | reason | ruled by`

- 2026-08-31 | Does TURN 2 exist in scope? | No — V Done excludes it. | Mission brief / packet. | V
- 2026-08-31 | Gold color usage? | Reserved for reasoning & verdict treatments per design. | TURN 1 closing note. | Requirements (Grok REQ-01) binding design
- 2026-08-31 | Full reviewer line on tree card face? | OPEN QUESTION → ARCH; proposal: full line in T5 Details; compact mark on card if already in app. | Design 1a abbreviated vs landing sample. | Requirements (Grok REQ-01)
- 2026-08-31 | `claims` meta vocabulary? | **CLOSED** — keep product `claims` (V 2026-08-31 app vocab everywhere). | V ruling / T9 mapping. | V
- 2026-08-31 | Pin-bind wording use example file only vs `tests/render/**`? | Amended R9 to explicit `tests/render/**` … ARCH names pins (same class as T5 skeptic fix). | Plan AC3 / class sweep. | Requirements (Grok REQ-01) rework
- 2026-08-31 | SPEC version after pre-handoff amendments? | Bumped to v2 FROZEN (F10). | Spine re-version law. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | “Readable” acceptance oracle? | Replaced with contrast threshold ARCH pins (F7). | Peer finding. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Set-aside toggle without fixture? | Require ≥1 set-aside path fixture (F4e). | Peer finding. | Requirements (Grok REQ-01-R1)
- 2026-08-31 | Mode toggle on debate chrome? | Yes — design shows ☾ on TURN 1a. | Design. | Requirements (Grok REQ-01)
- 2026-08-31 | OPEN QUESTION — full reviewer line on the tree card face? | **CLOSED** — the full `REVIEW AGREED BY:` line lives in the T5 drawer; the tree card carries a compact `data-review="agreed"\|"disputed"\|"absent"` mark and its coloured dot. | Matches design TURN 1a, which abbreviates the card. Confirms Requirements' own proposal; routed as open-questions Q-11. | ARCH-01
- 2026-08-31 | Is `--reasoning` gold in Terracotta? | **NO.** `accentsFor(false).reasoning` = `#3D5A80` (slate blue); only `accentsFor(true).reasoning` = `#C8A055` (gold). | The design's closing note "gold is reserved for reasoning & verdict" describes CHAMBER. A coder reading only that sentence will paint light-mode REASONING chips gold and be wrong. Exact provenance in `architecture/token-inventory.md`. | ARCH-01
- 2026-08-31 | How are stance-coloured connectors made assertable without a browser? | Add `stance` to the `Connector` type in `apps/ui/lib/debatePresentation.ts` and emit `data-connector-stance` on each `<path>` in `svg.canvasLinks`. | `ROLE_PALETTES` already resolves pro/con to `var(--pro-line)`/`var(--con-line)`, so R4 is a token redefinition plus one attribute — not new rendering code. The attribute makes T1-C2-4 checkable in `renderToStaticMarkup`. | ARCH-01
- 2026-08-31 | Double bezel and stance tab markers? | `data-bezel="shell"` (outer) / `="core"` (inner); `data-stance="pro"\|"con"\|"reasoning"\|"root"` on the card root and its top tab; tab radius `var(--r-tab)` = `0 0 5px 5px`. | `0 0 5px 5px` is the design's exact value (15 occurrences in the rendered export). The attribute turns T1-C2-1's "≥1 PRO and ≥1 CON" into a DOM query rather than a text search. ADR-006. | ARCH-01
- 2026-08-31 | Are existing CSS class names renamed during the re-skin? | No — class names and `data-*` attributes are a frozen contract; new ones may be added. | 521 existing `var()` sites re-skin for free once tokens are redefined, and the standing tests assert on those class names. Not renaming is what keeps `ui02d`, `bug02` and `load01` in the KEEP column. ADR-006. | ARCH-01
