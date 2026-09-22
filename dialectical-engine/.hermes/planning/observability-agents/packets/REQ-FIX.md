# PACKET REQ-FIX — FixAgent requirements (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`.

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_80ef9dec` · **seat:** REQ-FIX · **role:** requirements (`heartbeat-requirements`) · **model for new/rework dispatch:** GPT-5.6-sol
- **session:** record your agent id/session in your CLAIM comment · **recorded initial cursor:** 0; on any new/rework dispatch read every comment currently present on `t_80ef9dec` and record the exact count read
- **review route:** REQ-REV-FIX (Grok 4.6, blind) — dispatched by the orchestrator, not you · **rework rounds: max 3** (round 4 → V DECISIONS PACKET)
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/fixagent.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/fixagent-compass-block.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/FIX-*/` (`SPEC.md`, `PLAN.md`, `PROGRESS.md`, `DECISIONS.md` per slice)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-FIX.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - comments on `t_80ef9dec`
- **forbidden:** everything else. Read-only across the repo. No code, no schema, no config, no migration, no test. Do not edit any predecessor artifact. Board reads permitted: `observability-loop` tickets via `show --json` (read-only).

## 2. Upstream artifacts (absolute paths; read in this order)
1. V's verbatim goal and the contradiction check — `00-intake-H0.md` (above). Contradictions C1, C3, C4, C7 bind you.
2. Predecessor's measure of done — `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/planning/DEFINITION-OF-DONE.md` (D1–D12).
3. Predecessor's slice list and file contracts — `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/planning/VerticalSlices.md` §1 (S01–S30), §4 merge order. Large; read §0, §1, §4 fully, skim the rest.
4. Ratified requirements — `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/research/SYNTHESIS-requirements.md`: read §1, §4 **in full** (the normative OBS-R001…OBS-R144 rows required by Q1), §5, and the ranked recommendations; skim §§2–3 and §6. Read V's rulings in `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/research/POST-SYNTHESIS-RULINGS.md` in full, plus the predecessor intake `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/2026-08-21-observability-loop/00-intake-H0.md`.
5. Demo output — `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/logs/d12-demo-2026-09-01.log`. Verify the file before using its counts. If it is absent or unreadable, use H0 only as the historical record, mark the demo counts `UNVERIFIED`, and continue; absence alone is not a blocker.
6. What exists on `dev` — `packages/obs-capture/**` (read the module headers), `migrations/0034_obs_foundation.sql`, `packages/kernel/src/index.ts` (the `TypedDomainError` that discards `cause`).
7. Predecessor board `observability-loop`: read comments on `t_4deda7ab` (RP-0), `t_3a04cc06` (S05b seam obligations O-1..O-4 — binding on runtime wiring), `t_9f4e5bfb` (S07), `t_40c2cc1b` (D12), and `t_d821f99e` (`audit:source` collision). The columns may be stale. Do not use `list` to reconstruct slice ids: the complete on-disk board-readback map is `docs/missions/2026-08-21-observability-loop/planning/H6-selfaudit.md` §1:
   - S01 `t_1fde033d` · S02 `t_8e040ec2` · S03a `t_489ecbcc` · S03b `t_9b5ca941`
   - S04 `t_d1e18a14` · S05 `t_6e99d607` · S06 `t_5504afe0` · S07 `t_9f4e5bfb`
   - S08 `t_c1651ebb` · S09 `t_3c54fdeb` · S10 `t_6c5e1a6e` · S11 `t_7efcd635`
   - S12 `t_a0ce760a` · S13 `t_1ca8851f` · S14 `t_89061516` · S15 `t_a85ad2d8`
   - S16 `t_aab2d3d2` · S17 `t_f6593842` · S18 `t_220330f5` · S18b `t_49e079f4`
   - S19 `t_f4439c53` · S20 `t_2a85cd89` · S21 `t_0cd47a46` · S22 `t_37f2f56f`
   - S23 `t_5aca48c6` · S24 `t_27975928` · S25 `t_af6161bf` · S26 `t_286bde80`
   - S27 `t_d55caea1` · S28 `t_28c5c2e2` · S29 `t_8cf81861` · S30 `t_af2a1c41`
8. If `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/fixagent-state-audit.md` exists when you reach a section, you may cite it. **Do not wait for it.**

## 3. The work — numbered charges
**Q1. Re-scope under V-in-charge.** State, requirement by requirement, what of the predecessor's ratified set STANDS, what CHANGES under C1 (approval-first everywhere; the QUICK auto-merge arm and its size bound become a V-flipped later phase — specify the switch, its default OFF, and what must be true before V may flip it), and what is REMOVED. The FixAgent's job in phase 1: listen for thrown errors → trace to root → size the fix → file a ticket carrying the root → for anything it can fix, open an approval-first PR with RED→GREEN evidence → wait. It never merges.
**Q2. Inputs boundary (C4).** The FixAgent consumes error-shaped input only. Specify the input contract it needs from the store and from the ObservationAgent (a typed signal that names a code defect); everything infra-side is out. State the interface you need in one table so REQ-OBS's table can be diffed against it.
**Q3. Vertical slices.** Cut the remaining work into TESTABLE VERTICAL SLICES `FIX-01 … FIX-nn`, each with a beginning and an end V can run in the real dev stack (Postgres at `127.0.0.1:55432`, Hatchet, the runner). FIX-01 must be the smallest complete proof: a real fault on ONE surface produces a real row V can query. Every slice cites the predecessor S-tickets it absorbs (ids), the D-criteria it evidences, and the seam obligations (S05b O-1..O-4) that bind it. Prefer slices that can run IN PARALLEL in separate worktrees; state per slice which other slices it must not overlap on files (single-writer rule).
**Q4. Per-slice files.** For each slice create `slices/FIX-nn/`: `SPEC.md` (frozen: intent, requirements numbered `FIX-nn-R01…`, states, copy/vocabulary, V-runnable acceptance steps, out-of-scope, absorbed S-tickets) · `PLAN.md` (SCAFFOLD only: header, SPEC-trace table with one row per requirement and empty step cells, the quantifiability law and banned words, cluster table headers `FIX-nn-C1…` with empty verification commands — the architecture seat fills them) · `PROGRESS.md` (skeleton: DONE / NEXT / TRIED AND FAILED / WORKED, all empty) · `DECISIONS.md` (append-only; seed with the intake dispositions that bind this slice, dated 2026-09-01, ruled by V or orchestrator as recorded).
**Q5. Phase gates.** Restate the predecessor's gate ladder (G1 capture → G2 listener → G3 dispatch → G4 approval-first fixes; G5 QUICK arm deferred) as V-observable checkpoints, each with the D-criteria it proves and the demo stages it turns from SKIPPED to PASSED.
**Q6. The pending custodian acts.** RP-0, the `audit:source` collision, and the stage-16 D6 finding each block or shape a slice — say which slice, and what the slice does if V has not ruled by dispatch time (UNVERIFIED-respecting).
**Q7. Contested decisions for V** — table: id, the question in plain words, options, your pick, confidence, strongest counter. Do NOT ask V; collect.
**Q8. Compass block.** Write `requirements/fixagent-compass-block.md`: ≤25 lines the synthesis seat pastes into `INSTRUCTIONS.md` — one line per slice (code, name, what V will see), pointers to your files, nothing else.

## 4. Output skeleton — `requirements/fixagent.md` (exact headings)
```
# FixAgent — requirements (observability-agents)
## Verdict summary                      (≤10 lines: what stands, what changes, slice count, first proof)
## Q1 Re-scope under V-in-charge        (table: predecessor requirement → STANDS / CHANGES / REMOVED → why)
## Q2 Input contract                    (table)
## Q3 Vertical slices                   (table: code · name · absorbs · D-criteria · V acceptance in one line · parallel-safe with)
## Q5 Phase gates
## Q6 Custodian acts and their slices
## Q7 Contested decisions for V         (table)
## Ranked recommendations               (top 10; VERDICT / CONFIDENCE / STRONGEST COUNTER each)
## UNVERIFIED / gaps
## Handoff
```

## 5. Handoff
Post `READY FOR PEER REVIEW` on `t_80ef9dec` (and write the same text at the end of `fixagent.md` under `## Handoff`), OPENING with `SKILLS LOADED: <list>`, then: the slice table · SPEC→PLAN-scaffold trace count per slice (requirements vs scaffold rows, must be equal) · contradictions found (target zero; each one with the two requirements quoted) · packet defects you found in THIS packet · `comments read through: <n>`. File your self-report first (COMMON §5). Then stop.

## 6. Stop conditions
COMMON §6, plus: stop and post `BLOCKED` if the predecessor artifacts contradict V's verbatim goal in a way the intake contradiction table does not already dispose of — quote both sides; the orchestrator routes it.
