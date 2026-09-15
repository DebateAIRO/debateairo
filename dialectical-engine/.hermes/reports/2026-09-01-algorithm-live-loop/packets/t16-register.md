# PACKET — T16 (register rows + seeding) · four elements per spine §4

## 1. Ticket-state block
Authoritative typed state in
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T16-register.md
(status ready · rework_round 0 · risk_tier high · your writable surfaces: the lane worktree
at /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t16
on branch lane/t16 — local commits yes, push never — plus your report, self-report, and
logs/t16/**). Working directory for all build/test commands:
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t16/dialectical-engine
(dependencies already installed; pnpm store warm).

## 2. Immediate upstream artifacts
- THE SPEC (frozen, quotes goal-v4 lines 80–96 byte-identically):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S01-register/SPEC.md
  Row list, mechanism (MIGRATION + dev-deployment-register seeding path, dev provenance),
  ownership law (you are the SOLE owner of every new row/schema/migration), and DoD
  (consumers read register only with grep-proof in test; missing row fails loudly, test
  per row family; startup warning test for identical synthesizer/evaluator role refs).
- THE RULED DEFAULTS (J1) + refit extension (J2), mission DECISIONS.md at
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
  — the values the goal's Defaults line omits, judge-ruled, V-vetoable: dispersion scale
  1.0 · disagreement threshold 0.25 · repeated-family multiplier 0.5 · downgrade bands =
  the engine's EXISTING band vocabulary in canonical order, one-step-down, seeded verbatim
  from code (cite the enum source in the row's source_ref; invent NO names) · family map =
  OpenAI/Anthropic/xAI as the relay layer names them, unmapped ⇒ family kind UNKNOWN
  (s04.ts:289 exempts UNKNOWN from the discount — seed that behavior explicitly).
  Dev-provisional synthesizer/evaluator role refs: two DIFFERENT configured provider
  identities (T15b reseeds after V's decision; identical refs stay lawful but must trip
  the startup warning + its test).
- Consumer input shapes you are seeding FOR (read-only): packages/judgement/src/s04.ts:268-317
  (dispersion scale unit-interval assert, repeatedFamilyMultiplier unit-interval assert,
  JudgeFamily KNOWN/UNKNOWN) · packages/register/src/index.ts:158-200 (T17's
  StructuralCeilingInput — seed the envelope formula input rows its extension will read).
- Seeding path (read + extend in your worktree): apps/runner/src/dev-deployment-register.ts
  + dev-deployment-register-cli.ts. register.bootstrap.json is a STRICT five-pin tool file
  and is NOT touched.
- Mission baseline (pre-existing failures you must never absorb):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t00-baseline.md
Deliverable: migration + seeding changes committed on lane/t16, plus
agent-reports/t16-register.md under headings `# T16 REGISTER r1`, `## RED` (each new test
family shown FAILING on the base — command + failure line + log path), `## GREEN` (same
tests passing — passed/total per suite + log path), `## ROWS` (every row seeded: name,
value, provenance ref, migration file), `## SUITES` (pnpm run typecheck + pnpm test:
exit codes, passed/total, every failure named PRE-EXISTING (cite T0) or yours),
`## COMMITS` (sha + message per commit).

## 3. Handoff marker
First line of agent-reports/t16-register.md:
`READY FOR PEER REVIEW — T16 r1 · comments read through: packet-t16-2026-09-01`

## 4. Stop conditions
- RED before GREEN (router §2.5, goal 29-31): the FIRST test asserts the DESIRED behavior
  (e.g. missing-row loud failure per row family; startup warning on identical refs) and
  FAILS on the unmodified base — capture that failing run to logs/t16/ BEFORE implementing.
  Never write a test that passes today and flip it later.
- Superpowers floor: load `superpowers:test-driven-development` before your first test and
  `superpowers:verification-before-completion` before claiming done; `superpowers:systematic-debugging` on any bug.
- Token hygiene: tee suite output to logs/t16/*.log; quote counts/names only.
- Scope: consumers (T3/T9/T11/T17) are NOT wired by you — rows + schema + migration +
  seeding + tests only. No UI, no web/, no propagation/serve edits.
- Commit granularity: migration, seeding, tests may be separate commits; every commit
  message starts `T16:`.
- Blocked or unsure → the specific waiting_* status + reason as your marker line variant
  `BLOCKED — T16 r1 · <status> · comments read through: packet-t16-2026-09-01`; never guess.
- ~90 minutes wall-clock; rework rounds: max 3.
- Self-report at agent-reports/t16-register-self.md BEFORE the marker.
- Final message = `FILED: <report path>` + marker line + `## SUITES` lines verbatim.
