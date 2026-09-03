# CODE-T1C1 — T1 wave opener: debate chrome, view toggles, ☾ mount (ticket t_dd2f3ce0, epoch=21)

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
t_dd2f3ce0, HERMES AUTHORIZED NEXT marker on the ticket — read it back before claiming).
The T9 slice is closed (landing + route split + return path live on dev). T1 is the debate
view; you are row 7, the first of four SERIAL clusters (T1-C2/C3 share your test file and
run after you — leave their describe blocks empty).

## Supersessions in force
- **AF-1 (T1/DECISIONS rows 19-20):** your write surface INCLUDES `GuideModal.tsx`, and
  you own 12 colour-literal residuals — 6 in `DebatePageClient.tsx` (lines ~1863-1892),
  6 in `GuideModal.tsx` (lines 6-26), all `oklch(...)` — measured again at dispatch,
  counts unchanged from the AF-1 table. Your acceptance includes the ADR-001 §(b) scoped
  oracle reaching **0** over both files.
- **AM5:** PLAN's 5-file verification command is SUPERSEDED by dispatch-order row 7's
  8-file command (quoted in §4).
- **ADR-006 baseline-transition clause (NEW, this packet):** `DebatePageClient.tsx`
  carries baselined error `(1488,11) TS2322` (AnswerExport union; owned by the PDA lane,
  ticket t_d9066400 — a DIFFERENT mission). You must NOT fix, silence, or re-type it.
  Your edits will likely SHIFT its line. Gate procedure: run ADR-006's fail-loud
  canonical gate; if it fails solely because that diagnostic moved, re-run with a
  line-agnostic filter for exactly that one diagnostic (same file, same TS2322) AND
  assert its occurrence count is exactly 1; report `old (1488,11) -> new (L,C)` in your
  handoff. The ADR-006 baseline-table re-anchor is ARCH's afterwards, not yours.

## 0. Read order (paths relative to the workspace root, your cwd)
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 7 (writes + the
   8-file verify) and line ~170's pol01 absence-pin row (storage stays in ModeToggle).
3. `docs/missions/ui-overhaul/slices/T1/SPEC.md` — R1, R7, §Copy/anatomy, §States.
4. `docs/missions/ui-overhaul/slices/T1/PLAN.md` — the T1-C1 section, cells AND the
   whole HOW (the mount-placement rationale is binding).
5. `docs/missions/ui-overhaul/slices/T1/DECISIONS.md` — rows 19-20 (AF-1).
6. `docs/missions/ui-overhaul/architecture/ADR-002-mode-mechanism.md` (your mount is the
   SECOND and LAST in the mission; JSX import law), `ADR-001-token-surface.md` §(b) (the
   scoped oracle command + pattern), `ADR-006-ui-test-contract.md` (fail-loud gate, two
   named baselines, dataset.mode-not-computed-color guidance).
7. `.hermes/TOOLING-TRAPS.md` (rg absent in your sandbox — use grep -E; zsh `path` var).

Skills floor: heartbeat-protocol (repo spine counts — read the SPINE doc), heartbeat-worker,
superpowers: test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. Open every board write with `SKILLS LOADED: <list>`. Post a CLAIM
comment with your session id before coding.

## 1. The charge (cells verbatim from frozen PLAN; RED first on each)
- **T1-C1-1 (R1):** labels `Thread`, `Split`, `Tree`, `Map` present on the owner debate
  canvas.
- **T1-C1-2 (R1):** activating each control moves the EXISTING `aria-pressed` marker
  across the four buttons (that attribute IS the measurable marker — no new attribute).
- **T1-C1-3 (R7):** mode toggle present on debate chrome; toggling flips the
  Terracotta/Chamber marker — read `document.documentElement.dataset.mode`, NOT
  `getComputedStyle(...).backgroundColor` (var()-valued properties compute transparent in
  this repo's jsdom).
- **Mount contract (PLAN HOW, binding):** `<ModeToggle />` inside
  `<div className="debateTopControlRow">` as a SIBLING of the `{hasTree ? … : null}`
  conditional, never inside it — the toggle must exist on a debate still generating.
  Your test set includes one NO-TREE render asserting the toggle is present (PLAN's own
  named failure mode; the tree-ful cases alone cannot catch the inside-the-conditional
  mutant).
- **AF-1 re-skin:** replace all 12 `oklch(...)` literals across your two product files
  with the wave-0 tokens (semantically nearest token; zero new tokens; ADR-001). Scoped
  oracle over BOTH files must be 0 (from 12 at dispatch).
- **Re-anchors:** `tests/unit/pda-s02-affordance-drift.test.ts` slices
  `DebatePageClient.tsx` with `between(startAnchor, endAnchor)` — if your edits move its
  anchors, re-anchor honestly (never weaken the sliced assertions); state every change.
  `tests/unit/v2ui-pages.test.ts` wiring guards likewise. If nothing breaks, state that.
- **t1-canvas.test.tsx (CREATE):** three describes — `chrome and views` (yours),
  `card anatomy` (empty placeholder, T1-C2's), `set-aside and synthesis` (empty
  placeholder, T1-C3's) — so the serial clusters never edit the same hunk.

## 2. Refutation duty (each reproduced then reverted; SHA-256 pairs; apply-patch only)
1. ☾ mount REMOVED → T1-C1-3 RED.
2. ☾ mount MOVED INSIDE the `hasTree` conditional → the NO-TREE case RED (this is the
   mutant the mount contract exists for).
3. View switching broken (e.g. `aria-pressed` frozen to `Thread`) → T1-C1-2 RED.
4. One view label renamed (`Map` → `Atlas`) → T1-C1-1 RED.
5. One `oklch(` literal reintroduced in GuideModal → scoped oracle ≠ 0.
6. `localStorage.setItem` inlined at your mount site → `pol01-policy` RED (the absence
   pin at its line ~92 — prove it fires, then remove the mutant).
7. One NEIGHBOR control (benign: reorder two non-toggle children of the control row) →
   GREEN.

## 3. TDD
RED first on every cell; paste the RED runs. JSX law for any new TSX. The mount adds NO
client code beyond `<ModeToggle />` itself (all storage stays inside ModeToggle.tsx).

## 4. Acceptance at handoff (worst of three on vitest)
1. Row-7 verify command verbatim, 3x:
   `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts`
   (Orchestrator pre-verified the seven standing files at 7 passed / 77 tests at dispatch.)
2. ADR-006 fail-loud canonical gate from the workspace root, WITH the baseline-transition
   clause from §Supersessions (report old->new coordinates if the TS2322 moved; its count
   stays exactly 1).
3. ADR-001 §(b) scoped oracle over `DebatePageClient.tsx` + `GuideModal.tsx`: **0** (from
   12). Paste the command output.
4. `pnpm exec vitest run tests/render` green. 5. Root `pnpm run typecheck`: the two known
   baselines only (TS2322 possibly at a shifted line, TS2882 unchanged).
6. Mutant table per §2 with SHA-256 restore pairs. 7. Scope proof via your apply-patch
   ledger (NO git commands — the ledger + SHA pairs ARE the evidence).

## 5. File contract (writes — exactly these)
`apps/ui/app/debate/[id]/DebatePageClient.tsx` · `apps/ui/components/GuideModal.tsx` ·
`tests/render/t1-canvas.test.tsx` (create) · `tests/unit/pda-s02-affordance-drift.test.ts`
(re-anchor only) · `tests/unit/v2ui-pages.test.ts` (re-anchor only) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T1C1-codex.md` (self-report before FULLY
DONE) · board comments on t_dd2f3ce0. NO git commands.
Pre-existing-dirt manifest (generated at dispatch; NOT yours):
`web/app/public/debate/[id]/page.tsx` (V's — NEVER touch) · untracked
`docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` · untracked
`ui_designs/DebateAI Design Document.html`. No parallel lanes — the tree is yours alone.

## 6. Handoff
Final board comment on t_dd2f3ce0 (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + §4 outputs (including the oracle 12→0 and any baseline shift) +
mutant table + `SKILLS LOADED:` + `comments read through:`. Rework rounds: max 3, same
session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state needs
no message. Termination requires the spine's goal-specific FULLY DONE condition.
