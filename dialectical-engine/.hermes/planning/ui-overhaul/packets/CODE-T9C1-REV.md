# CODE-T9C1-REV — blind review of Wave 1 cluster T9-C1 (frozen target: commit 3aefb2d)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_4487f9b1**. The codex worker shipped the anonymous/signed-in route split, the
landing skeleton, the anonymous mode-control mount, and the pda-s03 pin migration. Judge the
COMMIT, not the story. Verdict: `PASS — T9-C1 MERGED-READY` or `REWORK — <blocking list>`
(rework budget 3, same worker session).

## 0. Read order
1. This packet.
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` §9/§11 + v3.3.0 amendments, then
   `.claude/skills/heartbeat-protocol/SKILL.md` and `.claude/skills/heartbeat-reviewer/SKILL.md`.
   (The full spine is 2,006 lines; the sections named here are the load-bearing ones for a
   review seat — read them, skim the rest.)
3. The worker's handoff on t_4487f9b1 (00:07) — its claims are your hypothesis list.
4. The contract stack at 071e2ea: `docs/missions/ui-overhaul/architecture/dispatch-order.md`
   row 2 + the CH1 addendum + the T9-C1 stub rule; `slices/T9/SPEC.md` R1/R2/R3;
   `slices/T9/PLAN.md` T9-C1 section; `ADR-003` (split mechanism), `ADR-002` (ModeToggle +
   JSX import law + THREE-mount enumeration), `ADR-001` (colour law + AM3 range-pair
   oracle), `ADR-006` (canonical compile gate FROM REPO ROOT — the repo has two TypeScript
   compilers; run gates from the repo root, 7.0.2).
5. The diff: `git show --stat 3aefb2d` then `git diff 3aefb2d^..3aefb2d`.
Open every board write with `SKILLS LOADED: <list>`.

## 1. What to verify (probe, not re-read; worst run of 3 is the verdict)
- Acceptance: run the five-file cluster command 3x (expect 59/59): `pnpm exec vitest run
  tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts
  tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts
  tests/unit/v2ui-pages.test.ts`
- RED reproduction: roll the product files back to 3aefb2d^ (keep the tests), run the
  cluster command, and confirm the worker's claimed RED (5 failed / 54 passed) reproduces.
  Restore byte-exactly.
- Re-run the worker's strongest mutants YOUR way (build them yourself from the handoff's
  descriptions, do not copy): section-order MOVE, early-return MOVE below the library work,
  ModeToggle REMOVE, session predicate reversed. Each must be RED. Then devise at least TWO
  mutants of your OWN — at least one POSITIONAL/STRUCTURAL (this mission's reviews killed
  three green structural mutants in Wave 0; the placement law came from that) and at least
  one against the pda-s03 MIGRATION specifically (e.g. does anything pin that the four
  migrated cases still render the SIGNED-IN surface — would a mock regression to anonymous
  pass silently?).
- Migration fidelity: `git diff 3aefb2d^..3aefb2d -- tests/unit/pda-s03-keyboard-accessibility.test.ts`
  — verify the four library assertions are byte-preserved (mock change only) and the fifth
  is re-pointed within AM5's bounded pins (absence of library nav/hint, exact hero, keyboard
  reachability). 5 cases before and after.
- Contract conformance: LandingPage is a server component (no "use client"); stubs are empty
  per the stub rule EXCEPT the hero headline; LandingChrome contains `<ModeToggle />` and no
  storage logic; page.tsx gained ONE early return and lost NO JSX (s8 constraint — run its
  test); no AuthGate import; every new TSX annotating JSX.Element imports the type; zero
  colour literals (run the AM3 range-pair oracle over the 8 product files).
- Gates: ADR-006 canonical gate from repo root (0-new over the two named baselines);
  `pnpm exec vitest run tests/render` (expect 19 files / 83 tests); root typecheck 0.
- Tree discipline: `git show --stat 3aefb2d` = exactly 9 files (page.tsx + 6 landing TSX +
  2 test files); working tree byte-clean at your verdict except the manifested PDA-lane
  dirt (`web/app/public/debate/[id]/page.tsx`) and `.hermes` orchestrator artifacts.
- Worker skills line: verify the floor (TDD, verification-before-completion,
  systematic-debugging, receiving-code-review) — a named-but-not-loaded skill is a
  fabrication finding.

## 2. Isolation
File-level cp backup/restore for every mutant; `git diff HEAD -- <path>` empty per touched
path at verdict; delete backups; read-only git allowed, no git writes. The working tree is
otherwise IDLE — no parallel seat is coding during your review.

## 3. Bounds
Writes: `.hermes/reports/ui-overhaul/agent-reports/CODE-T9C1-REV-claude.md` (self-report
before handoff, 10–20 honest lines) + board comments on t_4487f9b1. Nothing else.

## 4. Verdict format (final board comment — your LAST write, freeze law)
`VERDICT: PASS — T9-C1 MERGED-READY` or `VERDICT: REWORK — <blocking>` with per-item
CONFIRMED/REFUTED, your own mutants' results, gate outputs, CONFIDENCE + STRONGEST COUNTER,
`SKILLS LOADED: <list>`, `comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
