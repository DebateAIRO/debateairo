# OPEN QUESTIONS — ARCH proposes, V ratifies. One owner each.

Every row carries a **default**: what ships if V does not rule. No row blocks
dispatch — a mission that stalls waiting for a ratification it does not need is
a mission that spent a round on process. Rows marked **BLOCKS** are the
exception and say what they block.

| Q | Question | ARCH proposal (the default that ships) | Owner | Blocks |
|---|---|---|---|---|
| Q-01 | The `/` branch predicate is cookie **presence**, not session validity. A visitor with a stale cookie sees the library shell + the existing "session could not be confirmed" recovery, not the landing. Literal T9 R2 says "a *valid* asker session". | Ship cookie-presence. Validity costs an API round-trip on every anonymous home-page hit, and the stale-cookie path already has a shipped recovery. (ADR-003) | V | no |
| Q-02 | `web/` — a second Next app with its own `page.tsx`, `login`, `settings` — is untouched by this mission, yet the repo-root `build` script is `pnpm --filter dialectical-engine-web build`, i.e. it builds `web`, not the serving `apps/ui`. | Out of contract; do not restyle `web/` here. Route as its own mission. The build-script/serving-tree mismatch predates this mission and is not ARCH's to fix inside it. | V | no |
| Q-03 | **T7/T8 SPEC acceptance names `web-auth-*` render tests as the files to update. Those three files import `web/`, not `apps/ui`.** Updating them would produce a real RED, a real fix in the wrong app, and a green suite over an unchanged product. | Do NOT retarget them; keep them green as guards on the other app. T7/T8's serving-tree pins are `auth-flow-integration.test.tsx` + the new `t7-signin`/`t8-signup` files. The SPEC sentence is frozen and only REQ may re-version it. | REQ, then V | **BLOCKS** T7-C4 and T8-C4 acceptance wording only — the code clusters proceed |
| Q-04 | T4 OQ-1: `Start run →` (design TURN 4) vs `Start debate →` (design TURN 3a library composer) vs `Start a debate` (design TURN 9 landing). | Keep the three per-screen strings exactly as the design draws them. They are three different acts: the landing CTA *enters the product*, the library composer *submits a claim*, the form *starts a run*. Unifying them would flatten a distinction the design makes deliberately, and all three are already binding copy in their SPECs. | V | no |
| Q-05 | T4 OQ-2: show the V2-only options panel with a "not sent" note, or hide it. | Show, per the design artboard and the SPEC's stated preference. Each control carries `data-v2-only="true"`, and the payload assertion (`T4-C3-2`) proves they are not sent. Hiding them would remove the transparency the design is making a point of. | V | no |
| Q-06 | T6 OQ-1: `dezbatere.ro` beside `Dialectical Engine` in the chrome. | Keep it. It is already shipped in `apps/ui/components/TopBar.tsx` (`<span className="brandDomain">dezbatere.ro</span>`) and the design draws it on every artboard. Changing a production host string is a product decision with no design driver. | V | no |
| Q-07 | T8 OQ-2: design shows `Dialectical Engine` on sign-up and `DebateAIRO` in the MFA step-2 copy; the T9 landing wordmark is `DebateAI`. Three product strings. | `Dialectical Engine` on product chrome (matches shipped `TopBar` and `metadata.title`); `DebateAI` on the T9 landing only, where the SPEC binds it as literal copy; **drop `DebateAIRO`** — it appears once, in body copy, and reads as an authoring slip rather than a third brand. | V | no |
| Q-08 | Mono typeface. The design uses `ui-monospace, Menlo, monospace`; the app ships JetBrains Mono via `next/font`. | Keep JetBrains Mono. The design's mono is a system stack, i.e. an absence of a choice, and replacing a loaded webfont with a system stack would change every score readout on every platform differently. | V | no |
| Q-09 | The ARCH-01 packet states `tests/render/**` is "72 tests, 18 files". Measured: **78 tests, 18 files** (`vitest list tests/render/`). | Record 78. Not a defect in anything shipped — a stale constant in the packet. | Orchestrator | no |
| Q-10 | `INSTRUCTIONS.md` §"Design-system facts" lists cream `#E7E2D8` / `#f0eee6` and ink `#111111` as palette. None is a product surface: the first two are the design *document's* own chrome, the third does not occur. The real values are in `token-inventory.md`. | Ship the real artboard palette. `T9-C3-3`'s acceptance already permits `#C15F3C` or `#3F7466` (both real) so nothing is blocked. The compass sentence is requirements-owned and wants a correction. | REQ, then V | no |
| Q-11 | T1 OQ-1: does the tree card face carry the full `REVIEW AGREED/DISPUTED BY:` line, or only the drawer? | Drawer (T5) carries the full line with the reviewer model. The tree card carries a compact `data-review="agreed"\|"disputed"\|"absent"` mark and its coloured dot — matching design TURN 1a, which abbreviates. Requirements proposed the same; ARCH confirms it. | V | no |
| Q-12 | `--gold-text` in Terracotta departs from the design hex (`#A8823E` → `#826530`) because gold-on-shell measures 2.94 : 1 and the design uses gold for the REASONING chip and the VERDICT label — text a reader must read. | Ship the derived value. Four other Terracotta accents move by 0.5–3% and are visually identical; this one is visibly darker and is the mission's one deliberate departure from a design colour. Raw `--gold` is unchanged for fills. (ADR-005) | V | no |

## Not questions — decisions ARCH took under its own authority

Recorded here so a reviewer can see the boundary was drawn on purpose, and
appended to the relevant slice `DECISIONS.md`:

- **T3 OQ-1** (verdict-first vs view toggles) — **not a conflict.** The design's
  own reading order puts the toggles above the verdict block
  (`design-document-text.txt:436-456`). "Verdict-first" means verdict precedes
  the strongest-case pair, exactly as T3 R6 words it. Composition in
  `component-map.md`; nothing is dropped, so no scope change and nothing for V.
- **T3 OQ-3** (`Unlock actions` destination) — returns to the **same public
  debate**, `?next=/public/debate/<ref>`. A non-owner has no owner route to
  reach; sending them to `/debate/<id>` produces a 404 or an authorization
  denial. (ADR-004)
- **T5 OQ-1** (drawer field order) — ship the design's vertical order. No
  accessibility constraint forces otherwise: the drawer is one `role="dialog"`
  with a linear reading order. (`component-map.md`)
- **T7 OQ-2** (fleet route) — `/admin/workers`, which already exists, is already
  reachable by an ordinary asker, and already renders honest unavailable copy.
  Only the sentence changes. No new route, no privileged API. (`component-map.md`)
- **Mode persistence beyond session** — `localStorage`, key `debateai.mode`.
  T9 `DECISIONS.md` delegated "beyond-session = ARCH"; the no-flash head script
  needs a *synchronous* durable read and `localStorage` is the only such store
  in that position. (ADR-002)
- **Contrast threshold** — 4.5 : 1 for text tokens, 3.0 : 1 for meaning-bearing
  non-text marks, over an enumerated four-surface set, worst pair wins.
  (ADR-005)
- **Auth return-path parameter name** — `next`. (ADR-004)
