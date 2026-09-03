# CODE-T1C2 — card anatomy, stance tab, connectors (ticket t_ff92db49, epoch=23)

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
t_ff92db49, HERMES AUTHORIZED NEXT marker on the ticket — read it back before claiming).
T1-C1 is merged-ready (25155f3a): debate chrome carries the ☾ mount and
`tests/render/t1-canvas.test.tsx` exists with your `card anatomy` describe as an
`it.todo` sentinel. You are row 8 — the wave's largest cluster, still SERIAL (T1-C3 runs
after you; leave its `set-aside and synthesis` sentinel untouched).

## Supersessions in force
- **AF-1 (T1/DECISIONS rows 19-20):** your write surface includes the SIX widened files
  (DebateMap, DebateSplit, DebateThread, DebateOutline, ModelPresentation, lib/scrutiny)
  and you own **30 colour-literal residuals**, re-measured at dispatch: DebateMap 11,
  scrutiny.ts 12, DebateCanvas 2, DebateSplit 2, DebateThread 1, DebateOutline 1,
  ModelPresentation 1. Scoped ADR-001 §(b) oracle over your NINE product files must
  reach **0**. DebateOutline is a flagged orphan (test-referenced only) — re-skin it, do
  NOT delete it.
- **AM5:** PLAN's 4-file verification command is SUPERSEDED by dispatch-order row 8's
  8-file command (§4). Row 8 also makes you the owner of
  `tests/render/ui02e-debate-canvas.test.tsx`'s migration — if your card rewrite breaks
  its assertions, re-anchor them to the new anatomy honestly (never weaken; state every
  change); same for `tests/unit/v2ui-pages.test.ts`.
- **ADR-006 gate note:** the DebatePageClient TS2322 baseline moved to (1490,11) at
  T1-C1 and ADR-006's literal grep pattern still says (1488,11) — the re-anchor is
  ARCH's queued work (t_47057270). Run the gate with the line-agnostic form: filter that
  one diagnostic by file+code, assert its count is exactly 1, TS2882 unchanged,
  residual 0. You do not write DebatePageClient, so the line must NOT move again — if it
  does, stop and report.
- **Sentinel form (PD16):** convert the `card anatomy` sentinel into your real cases
  (delete its `it.todo` when real `it(...)` cases exist). T1-C3's sentinel stays.

## 0. Read order (paths relative to the workspace root, your cwd)
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 8 (writes + verify).
3. `docs/missions/ui-overhaul/slices/T1/SPEC.md` — R2, R3, R4 + §Copy/anatomy.
4. `docs/missions/ui-overhaul/slices/T1/PLAN.md` — the WHOLE T1-C2 section. Its HOW is
   binding mechanism, including: the two nested bezel wrappers
   (`data-bezel="shell"`/`"core"`, `var(--shell)`/`var(--core)`, `var(--r-card)`,
   `var(--shadow-card)`); the 3px stance tab (`var(--r-tab)`,
   `var(--pro-line)`/`var(--con-line)`/`var(--reasoning-line)`); `data-stance` on card
   root AND tab (that attribute makes T1-C2-1 a DOM query, not a text search); the
   `Connector` type gaining `stance: "pro" | "con" | "pov"` and
   `data-connector-stance` on the svg path; the compact review mark
   `data-review="agreed"|"disputed"|"absent"` (the FULL review line is T5's — closes
   Q-11); `Details` accessible name with `▸` as decoration only.
5. **The trap PLAN pre-names, quoted so you cannot miss it:** *"`--reasoning` is NOT
   gold in Terracotta. The design's `accentsFor(false).reasoning` is `#3D5A80`, a slate
   blue; only `accentsFor(true).reasoning` is gold... A coder who reads only that
   sentence will paint light-mode REASONING chips gold and be wrong."* Bind
   `var(--reasoning-line)` / the reasoning tokens — never `var(--gold)` — and the modes
   resolve it. (Context: the gold-reservation sentence describes CHAMBER; a live ARCH
   ticket t_ac92d301 exists because T1-C1 over-bound gold — do not add to it.)
6. `docs/missions/ui-overhaul/slices/T1/DECISIONS.md` rows 19-20; `ADR-002` (JSX law; NO
   new ModeToggle mounts — the three existing mounts are the mission's full set);
   `ADR-001` §(b); `ADR-006`; `ADR-005` (contrast floors, referenced by the tab/bezel
   tokens). 7. `.hermes/TOOLING-TRAPS.md` (rg absent — grep -E; tee-/dev/stderr; zsh
   `path`).

Skills floor: heartbeat-protocol (the repo SPINE doc satisfies it), heartbeat-worker,
superpowers: test-driven-development, verification-before-completion,
systematic-debugging, receiving-code-review. `SKILLS LOADED:` opens every board write.
CLAIM comment with session id before coding.

## 1. The charge (cells verbatim from frozen PLAN; RED first on each)
- **T1-C2-1 (R2):** bezel marker AND stance-tab class/token present on ≥1 PRO and ≥1 CON
  card — via `[data-stance="pro"]`/`[data-stance="con"]` DOM queries.
- **T1-C2-2 (R3):** `BASE`, `FINAL`, and the `Details` control on a card.
- **T1-C2-3 (R3):** `↻ Regenerate` present on the OWNER canvas card.
- **T1-C2-4 (R4):** PRO vs CON connector `data-connector-stance` values resolve to
  DIFFERENT `--*-line` tokens — checkable in `renderToStaticMarkup` output.
- Your test cases live INSIDE the `card anatomy` describe of `t1-canvas.test.tsx` —
  the `chrome and views` (T1-C1's) and `set-aside and synthesis` (T1-C3's) blocks are
  NOT yours.
- **AF-1 re-skin:** all 30 literals → semantically-nearest wave-0 tokens; zero new
  tokens; scoped oracle 0. scrutiny.ts's 12 form a tier colour MAP (`ROLE_PALETTES`
  shape) — map tiers to token vars, preserving the tier distinctions.

## 2. Refutation duty (each reproduced then reverted; SHA-256 pairs; apply-patch only)
1. One bezel wrapper FLATTENED (shell+core merged) → T1-C2-1 RED.
2. `data-stance` dropped from the card root → T1-C2-1 RED.
3. `BASE`/`FINAL` removed → T1-C2-2 RED.
4. `↻ Regenerate` hidden on owner → T1-C2-3 RED.
5. `data-connector-stance` emitted as a constant (`"pro"` for all) → T1-C2-4 RED.
6. One literal reintroduced in scrutiny.ts → scoped oracle ≠ 0.
7. One NEIGHBOR control (benign: reorder two non-anatomy props) → GREEN.

## 3. TDD
RED first per cell; paste RED runs. JSX law for new TSX. No storage code anywhere
(pol01 + auth-front-door-parity absences are standing).

## 4. Acceptance at handoff (worst of three on vitest)
1. Row-8 verify command verbatim, 3x:
   `pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/render/t1-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/unit/pda-s02-affordance-drift.test.ts tests/unit/pol01-policy.test.ts tests/unit/v2ui-pages.test.ts`
   (Pre-verified at dispatch: 8 files / 81 passed / 2 todo.)
2. ADR-006 fail-loud gate, line-agnostic form (TS2322 count exactly 1 — its line must
   still be 1490 since you do not write that file; TS2882 unchanged; residual 0).
3. ADR-001 §(b) scoped oracle over your NINE product files: **0** (from 30). Paste output.
4. `pnpm exec vitest run tests/render` green. 5. Root `pnpm run typecheck` exit 0.
6. Mutant table per §2 with SHA-256 pairs. 7. Scope proof via apply-patch ledger (NO git
   commands — the ledger + SHA pairs ARE the evidence).

## 5. File contract (writes — exactly these)
`apps/ui/components/DebateCanvas.tsx` · `DebateTree.tsx` · `DebateMap.tsx` ·
`DebateSplit.tsx` · `DebateThread.tsx` · `DebateOutline.tsx` · `ModelPresentation.tsx` ·
`apps/ui/lib/debatePresentation.ts` · `apps/ui/lib/scrutiny.ts` ·
`tests/render/t1-canvas.test.tsx` (card-anatomy block only) ·
`tests/render/ui02e-debate-canvas.test.tsx` (migration re-anchor) ·
`tests/unit/v2ui-pages.test.ts` (re-anchor only) ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T1C2-codex.md` (self-report before FULLY
DONE) · board comments on t_ff92db49. NO git commands.
Pre-existing-dirt manifest (generated at dispatch; NOT yours): product-side —
`web/app/public/debate/[id]/page.tsx` (V's — NEVER touch), untracked
`docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` + `ui_designs/DebateAI
Design Document.html`; PLUS the `.hermes/` subtree as a declared-dirty CLASS (tracked
orchestrator artifacts + untracked planning/logs — none of it yours except your own
report file). No parallel lanes — the tree is yours alone.

## 6. Handoff
Final board comment on t_ff92db49 (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + §4 outputs (including oracle 30→0) + mutant table +
`SKILLS LOADED:` + `comments read through:`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
