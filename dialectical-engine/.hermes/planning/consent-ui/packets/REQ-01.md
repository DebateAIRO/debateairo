# PACKET REQ-01 — mission compass + S01/S02 requirements (mission `consent-ui`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/consent-ui/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/00-intake-H0.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/V-DECISIONS-PACKET.md`.

## 1. Ticket state
- **board:** `consent-ui` · **ticket:** `t_5916299b` · **seat:** REQ-01 · **role:** requirements (`heartbeat-requirements`) · **model:** claude-opus-5 (Claude Code subagent) · **cwd:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` (the MAIN tree; you make no git writes)
- **session:** record your agent identity in your CLAIM comment · **comment cursor at dispatch:** 0 (read every comment on `t_5916299b` at CLAIM and record the count)
- **review route:** REQ-REV-01 (`t_12513808`, Opus 5, blind — not yours to dispatch) · **rework rounds: max 3**
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/INSTRUCTIONS.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S01/{SPEC.md,PLAN.md,PROGRESS.md,DECISIONS.md}`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/{SPEC.md,PLAN.md,PROGRESS.md,DECISIONS.md}`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/requirements/contested-decisions.md` (Q7) and `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/requirements/REQ-01-handoff.md` (your handoff text)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/agent-reports/REQ-01.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_5916299b` (`--author REQ-01`)
- **forbidden:** everything else. Read-only across the repo; no code, no CSS, no test, no git write. You MAY open `https://localhost:3000/sign-up`, `https://localhost:3000/`, `https://localhost:3000/settings` read-only in the browser tools (GET, no form submission, no sign-in, no typing into fields) to see the live page you are specifying against. Never `hermes kanban boards switch`.

## 2. Upstream artifacts (absolute paths — read what the charge needs, not everything)
1. The intake record (V's verbatim goal; C1–C10 bind you; the V rows' defaults bind you).
2. Design extracts under `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/design/` — quote copy from `design-data.js` and the html files VERBATIM (every visible string, every tag label, every mono detail line); do not paraphrase the design.
3. The product today: `apps/ui/components/SignUpFlow.tsx` (the sign-up card; `adult-affirmed` checkbox at lines 185-188; submit at 190-192; `client.register(...)` at 68-73), `apps/ui/components/AuthShell.tsx`, `apps/ui/app/layout.tsx` (root layout, mode guard), `apps/ui/components/TopBar.tsx` + `apps/ui/components/ModeToggle.tsx` (the mode toggle both surfaces must follow), `apps/ui/app/settings/page.tsx` (where the Privacy re-entry lands — C5), `apps/ui/app/globals.css` lines 5-158 (token contract) and the `.auth*` rules around lines 780-1050 (the auth card vocabulary the checkbox group joins), `packages/contract/src/client.ts:215-220` (registration request — UNCHANGED by this mission).
4. Tests that pin the surfaces you touch: `tests/render/auth-flow-integration.test.tsx` (sign-up render + submit; ticks `adult-affirmed` only), `tests/unit/t9-mode-tokens.test.ts` (token contract + colour-literal gate), `tests/render/t9-landing.test.tsx`, `tests/architecture/auth-front-door-parity.test.ts`, `apps/ui/components/authRoutes.source-test.mjs`. Name, in each SPEC, which of these the slice must update and why (the assertion that encodes the OLD design), so ARCH plans it and no seat is surprised.
5. Format precedents (structure only; do not copy content): `docs/missions/ui-overhaul/INSTRUCTIONS.md` (a passing compass) and `docs/missions/ui-overhaul/slices/T8/SPEC.md` (a passing UI SPEC with V-runnable acceptance).
6. Contracts: `heartbeat-protocol`, `heartbeat-requirements` (your floor: `superpowers:brainstorming` BEFORE SPEC — brainstorm the design-to-product gaps, the state machine, and the storage contract; record the alternatives you rejected in DECISIONS).

## 3. The work — numbered charges
**Q1. `INSTRUCTIONS.md` — the compass, UNDER 100 lines.** What the mission is (≤5 lines) · the two slices, one line each with code · roster and review route (COMMON §0) · "UI element fully done" definition (COMMON §4) · table of contents of POINTERS into real files (design extracts, slice dirs, packets dir, reports dir, product files, tests, spine, skills) · standing laws by name.

**Q2. `slices/S01/SPEC.md` — Cookie consent: banner (10a) + preferences card (10b) + persistence + Settings re-entry. FROZEN at creation.** Requirements `S01-R01…` — each: the statement · its source (design artboard/extract line, V's sentence, or intake row) · a mechanical verification hook (what a test or V step observes). Decide and PIN, with the exact value, at least:
- the storage contract: `localStorage` key (`debateai.` prefix), JSON shape with a schema version, the three categories (essential always true; `quality` / `analytics` booleans), a decided-at timestamp, and what EACH control stores: `Accept all`, `Essential only` (on the bar AND on the card), `Save choices`, and re-saving from Settings;
- "first visit" and re-ask semantics (no stored decision under the current schema version → show; a stored decision of an older version → decide: re-ask or migrate); what clearing site data does;
- mount and layering: root layout, every route, server renders nothing, the decision is read after mount (no flash for returning visitors, no hydration mismatch); stacking order against the top bar, the debate canvas dock and drawers (name the z-index token or number and where it sits relative to existing `--z-*` tokens);
- geometry from 10a (bottom-anchored, 22px inset, bezel shell→core, gold tab, copy block + three buttons) and the narrow-viewport behaviour the design does not show (pick a breakpoint; below it the buttons stack under the copy) — quantify every number;
- the 10b card: how it opens (replacing the bar, centred on the same scrim used by 10c, or growing in place — decide one), width 520, the three categories VERBATIM from `cookieCats` (name, tag, description, mono detail line), toggle semantics (Essential locked ON with `not-allowed` cursor and `aria-disabled`; defaults: Model quality telemetry ON, Product analytics OFF — as the design's `mkCat` args), `Essential only` and `Save choices` outcomes, `Privacy notice` → opens the 10c modal in READ-ONLY mode (no checkbox side effect; the S02 component; name the interface you require of it: a prop-driven `<PrivacyPolicyModal open onClose onAcknowledge? mode="read" | "consent">` or equivalent — S02's SPEC must match this contract sentence for sentence);
- the Settings → Privacy re-entry (intake C5 / row V-4 default): a panel in `apps/ui/app/settings/page.tsx` with one button `Cookie preferences` that reopens 10b pre-filled from storage; state whether Settings is auth-gated today and what an anonymous visitor sees;
- honesty rule (intake C10): nothing loads or unloads on the choice today; the SPEC says so in one sentence and forbids fake gating;
- copy VERBATIM (every string incl. eyebrows, tags, detail lines, button labels), token mapping per COMMON §7 (list every token each element uses; new tokens named with both-mode values), accessibility (bar: `role="region"` + `aria-label`, focus order, no focus trap; card: `role="dialog"`, `aria-modal`, initial focus, Esc semantics — decide whether Esc dismisses without a choice; the bar is never dismissable without a choice unless you rule otherwise, and say why), keyboard operability of the toggles, contrast on both modes;
- both modes (the mode toggle flips it live);
- **V acceptance** — numbered browser steps at `https://localhost:3000` with the expected observation per step: fresh profile / cleared storage → bar; `Accept all` → stored shape; reload → no bar; clear → bar; `Choose what to store` → card with defaults; toggles; `Save choices`; `Essential only` from both places; Settings → Privacy → `Cookie preferences` pre-filled; mode toggle on both surfaces; narrow viewport; keyboard-only path; `Privacy notice` opens the policy read-only and closes without touching stored choices;
- out of scope · parallel-safety with S02 (file surface — new files under `apps/ui/components/consent/` and `apps/ui/lib/`, `globals.css` appended in ONE delimited block `/* === consent-ui S01 === */` at the file's end, `layout.tsx` one mount line, `settings/page.tsx` one panel; the ONLY shared files with S02 are `globals.css` (separate delimited blocks) and the S02-owned modal component S01 consumes without editing).

**Q3. `slices/S02/SPEC.md` — Sign-up privacy gate: checkbox group (8a) + privacy-policy modal (10c) + both-boxes gating. FROZEN at creation.** Requirements `S02-R01…`, same discipline. Decide and PIN at least:
- the checkbox group per 8a: bordered shell box, two rows, 17px check squares, wording VERBATIM ("I am 18 or over." — intake C7 / row V-6; "I agree to the Privacy Policy, including that my debates may be published publicly." with "Privacy Policy" as the link — C1); input names (`adult-affirmed` KEPT, the new one named — e.g. `privacy-accepted`), both keep `required`;
- click semantics (C3): unchecked privacy box or the link → open 10c, box stays unchecked; `I have read it` → checked + modal closes + focus returns to the box; `×` / Esc / backdrop → unchecked; a checked box → unchecks directly; the 18+ box is a plain toggle;
- the modal 10c: overlay (new scrim token), bezel modal (inset 40/34 at the 760×660 artboard — state the responsive rule: max-width 680, max-height 92vh, or your numbers), header eyebrow/title/lede VERBATIM, `×`, the 8 jump pills from `policyJump` with the section each scrolls to (write the mapping table: the pills and the 11 sections do not share names — decide it and record it in DECISIONS), the 11 sections with their bullet lists VERBATIM from `policySections` (section accent colours per `s.c` → tokens), the end marker line, the footer contact line; `Download PDF` NOT rendered (C4 / row V-3 default);
- the scroll-to-end rule (C2 / row V-2 default): the mechanical criterion (the end-marker element has entered the scroll viewport, OR `scrollTop + clientHeight >= scrollHeight - 8` — pick one, state how a jsdom test and a real browser each observe it), the button's disabled text/tooltip if any, and that a policy short enough to need no scrolling enables the button immediately;
- accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, initial focus, Esc, return focus, the disabled button's `aria-disabled`, scroll container keyboard-reachable;
- gating: `Create account` disabled until BOTH boxes are checked (in addition to `busy || sent`), AND the submit handler refuses to call `client.register` when either is unchecked (defence in depth; the `required` attributes stay); the request to `/v1/auth/register` keeps its exact shape (`adult_affirmed` only — no new field; C6 / row V-5);
- tests to update: `tests/render/auth-flow-integration.test.tsx` ticks `adult-affirmed` only before submit (lines ~324, 448, 466) — the slice must tick both and must ADD a pin that submit with only one box checked never calls `register`; name any other assertion that encodes the old label;
- copy VERBATIM, token mapping, both modes, **V acceptance** (numbered browser steps on `https://localhost:3000/sign-up`: fill valid fields, both boxes unchecked → button disabled; tick 18+ only → still disabled; click privacy box → modal, box unchecked; close with × → unchecked, button disabled; reopen, scroll to end → `I have read it` enables → click → box checked → button enabled; untick 18+ → disabled; jump pills; Esc; keyboard-only path; mode toggle inside the open modal);
- out of scope (no backend field, no PDF, no policy versioning UI) · parallel-safety with S01 (S02 owns `SignUpFlow.tsx`, `apps/ui/components/consent/PrivacyPolicyModal.tsx` (or the name you fix), `apps/ui/lib/privacyPolicy.ts` (the policy content as data), its own `globals.css` block `/* === consent-ui S02 === */`, its tests).

**Q4. `PLAN.md` scaffold, both slices** — exact skeleton in §4; the SPEC-trace table lists EVERY `Sxx-Rnn` with an empty step column; cluster table headers; the quantifiability law verbatim; a line "steps and clusters: `heartbeat-architecture` seat".

**Q5. `PROGRESS.md` skeleton, both slices** — headings only (`## Done`, `## Next`, `## Tried and failed`, `## Worked`) + "orchestrator is the sole writer".

**Q6. `DECISIONS.md`, both slices** — seeded with every intake disposition (C1–C10) and V-row default that binds the slice, one line each in the COMMON §4 format with `who ruled = orchestrator (intake) / V (when V rules)`, then every decision YOU made (key names, criteria, breakpoints, mappings, rejected alternatives) with `who ruled = REQ-01`.

**Q7. Contested decisions** — anything you could not settle from the design, V's words, the intake rows or the product, as a table (id, plain-words question, options, your pick, confidence, strongest counter) in `requirements/contested-decisions.md`. Take your pick as the SPEC default; do not ask V; the orchestrator routes rows.

**Q8. Contradiction check on your own output** — S01's required modal interface vs S02's modal SPEC must agree verbatim; every SPEC requirement has ≥1 trace row; no banned word in any criterion; every number is a number.

## 4. Output skeletons (exact headings)
`INSTRUCTIONS.md`: `# consent-ui — mission compass` · `**What:**` · `**Done (V):**` · `## Slices` (table Code · Name · "fully done" definition) · `## Roster and review route` · `## Table of contents (pointers only)` (table Pointer · Path) · `## Standing laws (by name)` · `## Order of work (dependency hint only)`.

`SPEC.md`:
```
# Sxx — <name> · SPEC v1 (FROZEN 2026-09-06 by REQ-01)
## Purpose (≤5 lines)
## Design of record (artboards, extract paths, the sentences that bind)
## Requirements (Sxx-R01 …: statement · source · verification hook)
## States and transitions (table)
## Storage / data contract
## Copy — verbatim
## Token mapping (element → tokens; new tokens with both-mode values)
## Accessibility and keyboard
## V acceptance (numbered browser steps · expected observation · mode)
## Tests to update and why
## Out of scope
## Parallel-safety (file surface; single-writer rule)
## Traceability (R-id → PLAN steps: filled by ARCH)
```
`PLAN.md`: `# Sxx — PLAN v0 (scaffold REQ-01; steps by heartbeat-architecture)` · `## Quantifiability law` · `## SPEC trace (R-id · step ids · cluster)` · `## Steps` · `## Clusters (id · steps · ONE verification command · file surface · mutant class)` · `## Boundaries (allowed / forbidden)` · `## Refutation table (step · failure caught · failure NOT caught)`.
`DECISIONS.md`: `# Sxx — DECISIONS (append-only)` then lines `- 2026-09-06 · <question> · <choice> · <reason> · <who ruled>`.

## 5. Handoff
Write `requirements/REQ-01-handoff.md` and post `READY FOR PEER REVIEW` on `t_5916299b` (`--author REQ-01`), OPENING with `SKILLS LOADED: <list>`, then: `INSTRUCTIONS.md` line count (≤100) · the slice table with requirement counts · the SPEC↔PLAN-scaffold trace row counts (equal per slice) · the S01↔S02 modal interface sentence (quoted from both SPECs) · contested decisions count · contradictions found (target zero, both sides quoted) · packet defects in THIS packet · `comments read through: <n>`. Self-report first (COMMON §5). Then stop — no further work, no unasked files.

## 6. Stop conditions
COMMON §6. `BLOCKED` only if a charge is unanswerable from the artifacts named here; a missing fact is `UNVERIFIED`, not a block. If the design extract and the live product disagree on something outside this mission's surface, record it as a finding with `path:line`, do not resolve it.
