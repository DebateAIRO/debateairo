# GOAL PACKET — S01-CODE · PROGRAMMING · seat: Codex

**Mission:** `public-debate-access` · **Board:** `public-debate-access` (9119)
**Ticket:** `t_383216fe` · **Worktree (your cwd):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine`
**Rework rounds: max 3.** No token budget. Round 4 does not exist — it becomes a V row instead.

You implement the **publication envelope and publish path**: the public envelope carries the argument tree, and old snapshots keep reading.

## 0. Your handoff OPENS with this line — binding law

> `SKILLS LOADED: <every skill you actually loaded, comma-separated>`

No seat reaches FULLY DONE without it (spine v3.3.0 item 15). Naming a skill you did not load is
a fabrication finding. You cannot invoke the Skill tool — read them as markdown and say so.

## 1. Read first (absolute paths, verified to resolve)

1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md`
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md` ← **your contract**
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/docs/missions/public-debate-access/slices/S01/PLAN.md` ← **what you implement, step by step**
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/docs/missions/public-debate-access/slices/S01/SPEC.md` ← **FROZEN. Never edit.**
5. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/docs/missions/public-debate-access/INTAKE.md` — measured ground truth + CORRECTIONS LOG
6. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/docs/missions/public-debate-access/V-DECISIONS-PACKET.md` — **four CLOSED V rulings, below**
7. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/prog-a-s01/dialectical-engine/.hermes/TOOLING-TRAPS.md` — **read it. Four seats have paid for skipping it.**

Superpowers as markdown under
`/Users/vladmihaimiron/.claude/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/<name>/SKILL.md`.
Your floor: `test-driven-development`, `verification-before-completion`,
`systematic-debugging` (any bug), `receiving-code-review` (on rework). The whole library is open.

## 2. The plan is the work. Do not redesign it.

Your PLAN was written by an architecture seat, reviewed by an independent Grok lens, reworked
twice, and confirmed PASS. **Implement the steps as written.** If a step is wrong or cannot be
done as specified, STOP and say so on the ticket (§2.7) — do NOT silently substitute your own
design. A step you cannot mechanically verify is a packet defect worth reporting.

## 3. RED before GREEN — every step, no exceptions

The plan names an acceptance test per step. **Write/run the failing test FIRST and show the RED
output**, then make it pass. A test written after the fix, with no failing evidence, is not
evidence (§2.5). This matters most for the residual leak tests: a residual test that passes
against pre-fix code pins nothing at all.

**Three-run law:** each cluster's verification command runs THREE times and the **WORST** run is
the verdict. Green-green-red is RED — fix the cause; re-running until green is falsification.

## 4. V's four CLOSED rulings — violating one is a blocking defect, not a preference

- **Row 1:** anonymous visitors get every READ affordance; **no** delete, unpublish or
  replay-generation.
- **Row 2:** the one already-published debate serves **disclosed answer-only** with an honest
  typed label. A silent 404 and a silent answer-only page are BOTH banned.
- **Row 4:** `cost_envelope` and `tier_provenance_ref` stay **EXCLUDED** from the public envelope.
- **Row 5:** the lane plan is approved; you are lane S01-CODE.

## 5. Your file contract

**You OWN:** `packages/contract/src/index.ts` · **`packages/contract/generated/**`** (build output of
`pnpm run generate:contract`, required by PLAN S01-C1-2 — this path was MISSING from the first
version of this packet and you were right to stop; ticket `PKT-01`) · `apps/api/src/publications.ts` ·
`apps/api/src/index.ts` (public routes only) · `tests/**` for S01's own tests
**Single-writer rule:** another lane is running in parallel. Touch nothing outside your surface.
**Forbidden:** every `SPEC.md` (frozen) · every `PROGRESS.md` (orchestrator is sole writer) ·
`INSTRUCTIONS.md` · `INTAKE.md` · the other lane's files.
**Never:** push · merge (V performs every merge) · mark Done · delete product or database data ·
fabricate runtime data · commit outside your worktree.

## 5b. The three defects this plan exists to prevent — all found at design time, all measured

1. **Back-compat.** The trap is **REQUIRED KEYS + `catch → null` + handler `null → 404`** —
   **NOT** `.strict()`. Measured: same `.strict()`, OPTIONAL widen → 200, REQUIRED widen → 404.
   *Removing `.strict()` does not make a required widen safe.* New fields optional/nullable, and
   the RED old-shape-snapshot test is the headline test of this slice.
2. **`replay_handle` leaks** at THREE sites — `base_score`, `final_strength`, edge
   `strength.number`. One shared `redactLabeledNumber`, key kept, value redacted.
3. **Open-shape bags.** `stranger_restatement` is `.passthrough()` → **project** to a NEW object
   naming only `check_status`; never spread the source. `disagreement` is
   `z.record(string, unknown)` → **redact wholesale to null**. One residual test PER bag
   (S01-C2-7, S01-C2-8), each injecting an unexpected key and asserting it is absent from
   published JSON. Both MUST fail against a wholesale spread first.

## 6. Baseline — already verified, do not re-litigate it

The Router verified this worktree GREEN before dispatch:
`npx vitest run tests/architecture/s8-publication-contract.test.ts` → **5 passed (5)**.
`node_modules` is symlinked from the main tree (same commit, same deps) — do NOT run a fresh
install unless something actually fails to resolve. If a test fails, it is yours until proven
pre-existing, and `heartbeat-protocol` §2.6 requires you to name it and date it either way.

## 7. Handoff

`SKILLS LOADED: <list>`, then `READY FOR PEER REVIEW` on `t_383216fe` carrying: every RED frame ·
suites as `passed/total` with failures named and dated as pre-existing or yours · the three-run
cluster table · every constant you chose, disclosed · packet defects · `comments read through`.

File your self-report at
`.hermes/reports/public-debate-access/agent-reports/S01-CODE-codex.md` **and copy it to the main
tree at `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/public-debate-access/agent-reports/`**
— a receipt left only in a worktree is destroyed by cleanup and turns the ledger into a floor.
No FULLY DONE without it. The question it answers, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How
> can we turn this into a one prompt machine even better.

Name the CAUSE not the symptom. PRICE each finding. Say what you NEARLY got wrong. Name DEAD
ENDS. Say exactly where this packet was unclear.

## 8. Return rule

Return control at `READY FOR PEER REVIEW`, a genuine blocker, or an IMPORTANT OPERATION; keep
the session alive and resumable. Post with:

```
hermes kanban --board public-debate-access comment t_383216fe "<your handoff>"
```

Board flag BEFORE the verb. Never `boards switch`.
