# Per-debate role rotation Implementation Plan

> **AMENDMENT 2026-10-11 (orchestrator, owner's delegation) — the spec wins where this plan differs:** the rule is `LEAST_SHARE_SEEDED_TIE_V1` (spec Part 2 step 2/4): order candidates by share = picked / eligible (exact integer cross-multiplication, never floats; never-eligible = share 0), then picked, then the tie key. The pin table gains `eligible_model_ids text[]` (spec Part 3: 2-16 non-blank entries <= 256 chars, containing all four picks), written at admission; the counts query returns per role and model both `picked` and `eligible`. Update Tasks 1, 3, 4 and 6 and their tests accordingly (a test: a model added after N debates is picked once, then rejoins proportionally).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the four single-model roles (answer writer, answer checker, storyteller, story checker) to a different model of the debate's own panel per debate, least-done first, pinned once per debate, recorded for learning, priced safely and switched on by one register row.

**Architecture:** A pure picker in `@debateai/scorecard` chooses the four roles at ask admission from the discovered panel and per-role counts read from a new append-only table `core.run_role_rotation` (migration 0114). The API pins the choice beside the run before work is queued; the runner replaces the sealed role refs with the pinned ones for that run only (the legacy seat book and every downstream path stay as they are). The preview estimate prices each role at each gate's dearest panel member. One optional register row, `answerRoleRotationPolicy`, turns it on.

**Tech Stack:** TypeScript (Node 26.8.2, pnpm 11.20.0), vitest 5.0.1, zod 4.4.3, PostgreSQL 18 (embedded in integration tests), pg.

**Spec:** `docs/superpowers/specs/2026-10-11-role-rotation-design.md` (read it first; this plan argues from it).

All paths below are relative to `dialectical-engine/` in the worktree `.claude/worktrees/role-rotation`, branch `feat/2026-10-11-role-rotation`.

## Global Constraints

- Rules file (read and follow it; pass it on to any subagent): the workers' `RULES-round3.md` (durable copy under `DebateAIRO/docs/handover/2026-10-10-part-i/scratch/mm/`).
- Heavy commands (whole-project `pnpm run typecheck`, any vitest run of more than 3 files, any integration file, `pnpm install`, the `tests/architecture` folder) run inside the shared lock, one at a time, always releasing it. In this plan `LOCKED <command>` means exactly: `until mkdir "$LOCK" 2>/dev/null; do sleep 20; done; <command>; rmdir "$LOCK"` with `LOCK` set to the `heavy.lock` path the rules file names. One to three unit files run without the lock.
- A fresh worktree needs, once: `LOCKED pnpm install --frozen-lockfile --offline`, then `pnpm run generate:contract`.
- Never run the full suite. Never force-push, rebase, amend a pushed commit, or `git stash`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run the rules file's `secret-line-check.sh origin/dev` before every push. No PR is opened by the implementer.
- Sealed register values are never edited (`register.bootstrap.json`, `tests/support/fixtures/register-development-v4.json`, the acceptance seeder's version 4, migrations 0000-0113 and their lineage files).
- No hard-coded one-computer paths in code, tests or docs.
- End-user text never shows scores, counts, rule names, thresholds, prices or internal codes. This plan adds no user-facing text.
- The row key is `answerRoleRotationPolicy`; its value is `{ "kind": "ANSWER_ROLE_ROTATION_POLICY", "enabled": <boolean>, "rule": "LEAST_SHARE_SEEDED_TIE_V1" }`.
- The pin table is `core.run_role_rotation`; the migration is `migrations/0114_role_rotation.sql` (renumber at merge time if `origin/dev` has taken 0114: check `git ls-tree --name-only origin/dev migrations/ | tail -3`).
- The tie seed is `sha256(JSON.stringify([ask.as_of, ask.question_line]))`, used in memory only, never stored, logged or sent.
- Without the row (or with `enabled: false`), with a one-maker panel, or with a scorecard assignment, behaviour is byte-for-byte today's.

## Review Focus

1. **A panel with two refs of one model** (`preview:fixture-a` and `preview:fixture-b`, both GLM): rotation must treat it as one maker, never pick GLM to check GLM. Pinned in Task 1 (dedup case) and Task 3 (the maker CHECKs refuse such a row).
2. **A run that has both a scorecard assignment and a rotation pin** (should be impossible): the runner must refuse it rather than mix the two. Pinned in Task 7 ("both pins" case).
3. **An older sealed register version without the row:** every reader must answer ABSENT and the engine must behave as today. Pinned in Task 2 (absent row) and Task 6 (no row, no pick, no pin).
4. **A rotated debate still unfinished when a new debate is admitted:** it must be held with the rotated pricing, not the boot roles (otherwise the hold under-counts when the boot roles are cheaper). Pinned in Task 5 (unfinished rotated hold case).
5. **A WAIT ask (waiting line) admitted later:** it must keep the pin made at submit; the waker never re-picks. Pinned in Task 6 (WAIT case).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/scorecard/src/role-rotation.ts` (new) | The pure rule: eligibility, seed, tie keys, picks | 1 |
| `packages/scorecard/src/index.ts` | Export it | 1 |
| `packages/register/src/answer-role-rotation-policy.ts` (new) | Row key, schema, value-to-state, reader, the ON row for publishers | 2 |
| `packages/register/src/index.ts` | Export it | 2 |
| `migrations/0114_role_rotation.sql` (new) | The pin table and the story column | 3 |
| `migrations/lineage/role-rotation-forward0114.json` (new) | Chain manifest | 3 |
| `packages/db/src/migration-forward0114.ts` (new) | Chain loader | 3 |
| `packages/db/src/migration-forward-chain.ts` | Append the loader | 3 |
| `migrations/lineage/README.md` | One paragraph for step 0114 | 3 |
| `packages/db/src/schema.ts` | Mirror the new table and column | 3 |
| `packages/db/src/index.ts` | `insertRunRoleRotation`, `readRunRoleRotation`, `readRoleRotationCounts` | 4 |
| `apps/api/src/preview-budget-estimate.ts` | Rotated pricing, rotated unfinished holds | 5 |
| `apps/api/src/index.ts` | Admission pick, `ROLE_ROTATION` setup step on both submit paths | 6 |
| `apps/api/src/main.ts` | Boot stage reading the row; settings wiring | 6 |
| `apps/runner/src/index.ts` | Read the pin at claim; per-run role refs; story role makers | 7 |
| `packages/providers/src/index.ts` | `ProviderCallResult.repairAttempts` | 8 |
| `packages/story/src/writer.ts`, `packages/story/src/repository.ts` | Count and store `storyteller_repairs` | 8 |
| `deploy/preview-auth-dev/v1/publish-register-v2.ts` | Build the row ON; 66 to 67 keys | 9 |
| `apps/runner/src/hosted-register-publish.ts` | Optional `answerRoleRotation` member; boot readiness | 9 |
| `deploy/vps/register/README.md`, `deploy/vps/README.md` | Operator docs for the member | 9 |
| `tests/support/shipped-corpus.manifest.txt` | New shipped files, sorted | 1, 2, 3 |

---

### Task 1: The rotation rule (pure)

**Files:**
- Create: `packages/scorecard/src/role-rotation.ts`
- Modify: `packages/scorecard/src/index.ts` (add one export line)
- Modify: `tests/support/shipped-corpus.manifest.txt` (add `packages/scorecard/src/role-rotation.ts` in sorted position)
- Test: `tests/unit/role-rotation-pick.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `@debateai/scorecard`):
  - `ROTATED_ROLES: readonly ["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"]`, `type RotatedRole`
  - `ROLE_ROTATION_RULE = "LEAST_SHARE_SEEDED_TIE_V1"`
  - `type RotationPanelMember = Readonly<{ provider_ref: string; maker: string; model_id: string }>`
  - `type RotationPick = Readonly<{ providerRef: string; modelId: string; maker: string }>`
  - `type RotatedRoles = Readonly<{ rule: typeof ROLE_ROTATION_RULE; answerWriter: RotationPick; answerChecker: RotationPick; storyteller: RotationPick; storyChecker: RotationPick }>`
  - `type RoleRotationCounts = Readonly<Partial<Record<RotatedRole, Readonly<Record<string, number>>>>>` (model id to count)
  - `roleRotationSeed(ask: Readonly<{ as_of: string; question_line: string }>): string` (64 hex)
  - `rotationEligible(panel: readonly RotationPanelMember[]): readonly RotationPick[]`
  - `pickRotatedRoles(input: Readonly<{ panel: readonly RotationPanelMember[]; counts: RoleRotationCounts; seed: string }>): RotatedRoles | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/role-rotation-pick.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ROLE_ROTATION_RULE, pickRotatedRoles, roleRotationSeed, rotationEligible,
  type RoleRotationCounts, type RotationPanelMember
} from "@debateai/scorecard";

const m = (provider_ref: string, maker: string, model_id: string): RotationPanelMember => ({ provider_ref, maker, model_id });
const GLM_A = m("preview:fixture-a", "Z.AI", "zai-org/GLM-5.3-Flash");
const GLM_B = m("preview:fixture-b", "Z.AI", "zai-org/GLM-5.3-Flash");
const DEEPSEEK = m("preview:deepseek-v4-1-flash", "DeepSeek", "deepseek-ai/DeepSeek-V4.1-Flash");
const MIMO = m("preview:mimo-v2-6-pro", "Xiaomi", "XiaomiMiMo/MiMo-V2.6-Pro");
const QWEN = m("preview:qwen-3-8-flash", "Alibaba", "Qwen/Qwen3.8-Flash");
const HAIKU = m("preview:claude-haiku-5-5", "Anthropic", "claude-haiku-5-5");
const FIVE = [GLM_A, DEEPSEEK, MIMO, QWEN, HAIKU];
const SEED = roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: "Should cities price congestion?" });

describe("the seed is the ask's own, repeatable and never the run's", () => {
  it("is sha256 over [as_of, question_line] as JSON", () => {
    const expected = createHash("sha256").update(JSON.stringify(["2026-10-11T00:00:00.000Z", "Should cities price congestion?"])).digest("hex");
    expect(SEED).toBe(expected);
    expect(roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: "Should cities price congestion?" })).toBe(SEED);
    expect(roleRotationSeed({ as_of: "2026-10-12T00:00:00.000Z", question_line: "Should cities price congestion?" })).not.toBe(SEED);
  });
});

describe("eligibility: the debate's own panel, one member per maker", () => {
  it("keeps the first member of each maker in panel order", () => {
    expect(rotationEligible([GLM_A, GLM_B, DEEPSEEK]).map((pick) => pick.providerRef))
      .toEqual(["preview:fixture-a", "preview:deepseek-v4-1-flash"]);
  });
  it("a one-maker panel keeps today's fixed roles (null)", () => {
    expect(pickRotatedRoles({ panel: [GLM_A, GLM_B], counts: {}, seed: SEED })).toBeNull();
    expect(pickRotatedRoles({ panel: [GLM_A], counts: {}, seed: SEED })).toBeNull();
  });
});

describe("least done first, a different maker checks", () => {
  it("free panel: the writer is the one with fewer writes, the checker the other maker", () => {
    const counts: RoleRotationCounts = { ANSWER_WRITER: { [GLM_A.model_id]: 3, [DEEPSEEK.model_id]: 2 } };
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.rule).toBe(ROLE_ROTATION_RULE);
    expect(picked.answerWriter.modelId).toBe(DEEPSEEK.model_id);
    expect(picked.answerChecker.modelId).toBe(GLM_A.model_id);
  });
  it("five makers: each role goes to its own least-done model", () => {
    const counts: RoleRotationCounts = {
      ANSWER_WRITER: { [GLM_A.model_id]: 1, [DEEPSEEK.model_id]: 1, [MIMO.model_id]: 0, [QWEN.model_id]: 1, [HAIKU.model_id]: 1 },
      ANSWER_CHECKER: { [GLM_A.model_id]: 0, [DEEPSEEK.model_id]: 1, [MIMO.model_id]: 1, [QWEN.model_id]: 1, [HAIKU.model_id]: 1 },
      STORYTELLER: { [GLM_A.model_id]: 2, [DEEPSEEK.model_id]: 2, [MIMO.model_id]: 2, [QWEN.model_id]: 2, [HAIKU.model_id]: 1 },
      STORY_CHECKER: { [GLM_A.model_id]: 1, [DEEPSEEK.model_id]: 1, [MIMO.model_id]: 1, [QWEN.model_id]: 0, [HAIKU.model_id]: 1 }
    };
    const picked = pickRotatedRoles({ panel: FIVE, counts, seed: SEED })!;
    expect([picked.answerWriter.modelId, picked.answerChecker.modelId, picked.storyteller.modelId, picked.storyChecker.modelId])
      .toEqual([MIMO.model_id, GLM_A.model_id, HAIKU.model_id, QWEN.model_id]);
  });
  it("the checker skips the least-done model when it is the writer's maker", () => {
    const counts: RoleRotationCounts = {
      ANSWER_WRITER: { [DEEPSEEK.model_id]: 5 }, ANSWER_CHECKER: { [GLM_A.model_id]: 0, [DEEPSEEK.model_id]: 9 }
    };
    // Writer: GLM (0 writes) beats DeepSeek (5). Checker: GLM has 0 checks but is the writer's maker, so DeepSeek.
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.answerWriter.maker).toBe("Z.AI");
    expect(picked.answerChecker.maker).toBe("DeepSeek");
  });
  it("story roles are picked independently of the answer roles", () => {
    const counts: RoleRotationCounts = { ANSWER_WRITER: { [GLM_A.model_id]: 9 }, STORYTELLER: { [DEEPSEEK.model_id]: 9 } };
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.answerWriter.modelId).toBe(DEEPSEEK.model_id);
    expect(picked.storyteller.modelId).toBe(GLM_A.model_id);
    expect(picked.storyChecker.modelId).toBe(DEEPSEEK.model_id);
  });
});

describe("ties: a fixed, repeatable shuffle from the seed, salted per role", () => {
  it("the same seed and counts always give the same picks", () => {
    const first = pickRotatedRoles({ panel: FIVE, counts: {}, seed: SEED });
    for (let i = 0; i < 5; i += 1) expect(pickRotatedRoles({ panel: [...FIVE].reverse(), counts: {}, seed: SEED })).toEqual(first);
  });
  it("the tie key is sha256 of ROLE_ROTATION_V1, seed, role and model id, joined by NUL", () => {
    const key = (role: string, model: string) => createHash("sha256").update(["ROLE_ROTATION_V1", SEED, role, model].join("\u0000")).digest("hex");
    const expectedWriter = [...FIVE].sort((a, b) => key("ANSWER_WRITER", a.model_id) < key("ANSWER_WRITER", b.model_id) ? -1 : 1)[0]!;
    expect(pickRotatedRoles({ panel: FIVE, counts: {}, seed: SEED })!.answerWriter.modelId).toBe(expectedWriter.model_id);
  });
  it("over many seeds every model gets the writer role at least once (no fixed favourite)", () => {
    const writers = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const seed = roleRotationSeed({ as_of: `2026-10-11T00:00:${String(i % 60).padStart(2, "0")}.000Z`, question_line: `q${String(i)}` });
      writers.add(pickRotatedRoles({ panel: FIVE, counts: {}, seed })!.answerWriter.modelId);
    }
    expect(writers.size).toBe(5);
  });
});

describe("laws for every input", () => {
  it("never leaves the panel, never pairs a checker with its writer's maker (randomized)", () => {
    let state = 7;
    const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 500; round += 1) {
      const panel = FIVE.filter(() => next() < 0.7);
      if (next() < 0.3) panel.push(GLM_B);
      const counts: Record<string, Record<string, number>> = {};
      for (const role of ["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"]) {
        counts[role] = Object.fromEntries(FIVE.map((member) => [member.model_id, Math.floor(next() * 4)]));
      }
      const seed = roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: String(round) });
      const picked = pickRotatedRoles({ panel, counts, seed });
      const makers = new Set(panel.map((member) => member.maker));
      if (makers.size < 2) { expect(picked).toBeNull(); continue; }
      const refs = new Set(panel.map((member) => member.provider_ref));
      for (const pick of [picked!.answerWriter, picked!.answerChecker, picked!.storyteller, picked!.storyChecker]) expect(refs.has(pick.providerRef)).toBe(true);
      expect(picked!.answerChecker.maker).not.toBe(picked!.answerWriter.maker);
      expect(picked!.storyChecker.maker).not.toBe(picked!.storyteller.maker);
    }
  });
  it("refuses a malformed seed or count", () => {
    expect(() => pickRotatedRoles({ panel: FIVE, counts: {}, seed: "short" })).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(() => pickRotatedRoles({ panel: FIVE, counts: { ANSWER_WRITER: { x: -1 } }, seed: SEED })).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(() => pickRotatedRoles({ panel: FIVE, counts: { ANSWER_WRITER: { x: 1.5 } }, seed: SEED })).toThrow("ROLE_ROTATION_INPUT_INVALID");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/role-rotation-pick.test.ts`
Expected: FAIL (`pickRotatedRoles` is not exported by `@debateai/scorecard`).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/scorecard/src/role-rotation.ts
import { createHash } from "node:crypto";

/**
 * Per-debate rotation of the four single-model roles (spec 2026-10-11, Part 2): each goes to the
 * debate's own panel member that has done THAT role least often so far; ties by a fixed shuffle
 * seeded from the ask. A checker is never its writer's maker. Pure: the caller reads the counts.
 */
export const ROTATED_ROLES = Object.freeze(["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"] as const);
export type RotatedRole = typeof ROTATED_ROLES[number];
export const ROLE_ROTATION_RULE = "LEAST_SHARE_SEEDED_TIE_V1" as const;
const TIE_SALT = "ROLE_ROTATION_V1";

export type RotationPanelMember = Readonly<{ provider_ref: string; maker: string; model_id: string }>;
export type RotationPick = Readonly<{ providerRef: string; modelId: string; maker: string }>;
export type RotatedRoles = Readonly<{
  rule: typeof ROLE_ROTATION_RULE;
  answerWriter: RotationPick; answerChecker: RotationPick; storyteller: RotationPick; storyChecker: RotationPick;
}>;
/** Per role, how many earlier pins name each model id. A model never seen counts 0. */
export type RoleRotationCounts = Readonly<Partial<Record<RotatedRole, Readonly<Record<string, number>>>>>;

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const invalid = (): never => { throw new TypeError("ROLE_ROTATION_INPUT_INVALID"); };

/** The ask's own seed: in memory only, never stored, logged or sent. */
export function roleRotationSeed(ask: Readonly<{ as_of: string; question_line: string }>): string {
  return sha256(JSON.stringify([ask.as_of, ask.question_line]));
}

/** The panel, one member per maker (first in panel order): two refs of one model are one candidate. */
export function rotationEligible(panel: readonly RotationPanelMember[]): readonly RotationPick[] {
  const seen = new Set<string>();
  const eligible: RotationPick[] = [];
  for (const member of panel) {
    if (seen.has(member.maker)) continue;
    seen.add(member.maker);
    eligible.push(Object.freeze({ providerRef: member.provider_ref, modelId: member.model_id, maker: member.maker }));
  }
  return Object.freeze(eligible);
}

export function pickRotatedRoles(input: Readonly<{
  panel: readonly RotationPanelMember[]; counts: RoleRotationCounts; seed: string;
}>): RotatedRoles | null {
  if (!/^[0-9a-f]{64}$/u.test(input.seed)) invalid();
  for (const byModel of Object.values(input.counts)) {
    for (const count of Object.values(byModel ?? {})) if (!Number.isSafeInteger(count) || count < 0) invalid();
  }
  const eligible = rotationEligible(input.panel);
  if (eligible.length < 2) return null;
  const ordered = (role: RotatedRole): readonly RotationPick[] => eligible
    .map((pick) => ({ pick, done: input.counts[role]?.[pick.modelId] ?? 0, tie: sha256([TIE_SALT, input.seed, role, pick.modelId].join("\u0000")) }))
    .sort((left, right) => left.done - right.done || (left.tie < right.tie ? -1 : left.tie > right.tie ? 1 : 0))
    .map((entry) => entry.pick);
  const first = (role: RotatedRole, avoidMaker?: string): RotationPick => ordered(role).find((pick) => pick.maker !== avoidMaker)!;
  const answerWriter = first("ANSWER_WRITER");
  const storyteller = first("STORYTELLER");
  return Object.freeze({
    rule: ROLE_ROTATION_RULE,
    answerWriter, answerChecker: first("ANSWER_CHECKER", answerWriter.maker),
    storyteller, storyChecker: first("STORY_CHECKER", storyteller.maker)
  });
}
```

Add to `packages/scorecard/src/index.ts`, after `export * from "./picker.js";`:

```ts
export * from "./role-rotation.js";
```

Add `packages/scorecard/src/role-rotation.ts` to `tests/support/shipped-corpus.manifest.txt` in sorted position.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/role-rotation-pick.test.ts`
Expected: PASS (all cases). If "every model gets the writer role at least once" fails, check the tie key join (NUL) and the sort, never the test.

- [ ] **Step 5: Commit**

```bash
git add packages/scorecard/src/role-rotation.ts packages/scorecard/src/index.ts tests/unit/role-rotation-pick.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "feat(scorecard): the role rotation rule, least done first with a seeded tie-break

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The register row `answerRoleRotationPolicy`

**Files:**
- Create: `packages/register/src/answer-role-rotation-policy.ts`
- Modify: `packages/register/src/index.ts` (export block, next to the `./model-scorecard-policy.js` exports near line 1167)
- Modify: `tests/support/shipped-corpus.manifest.txt`
- Test: `tests/unit/answer-role-rotation-policy.test.ts`

**Interfaces:**
- Consumes: `canonicalRegisterJson` (`packages/register/src/register-publication.ts:251`), `ROLE_ROTATION_RULE` (Task 1).
- Produces (exported from `@debateai/register`):
  - `ANSWER_ROLE_ROTATION_POLICY_ROW_KEY = "answerRoleRotationPolicy"`
  - `type AnswerRoleRotationPolicyState = Readonly<{ state: "ABSENT" }> | Readonly<{ state: "OFF" }> | Readonly<{ state: "ON"; rule: "LEAST_SHARE_SEEDED_TIE_V1" }>`
  - `answerRoleRotationPolicyFromValue(value: unknown): AnswerRoleRotationPolicyState` (throws `TypeError("ANSWER_ROLE_ROTATION_POLICY_INVALID")`)
  - `readAnswerRoleRotationPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<AnswerRoleRotationPolicyState>`
  - `answerRoleRotationPolicyRow(enabled: boolean, sourceRef: string): Readonly<{ rowKey: "answerRoleRotationPolicy"; valueJsonText: string; sourceRef: string }>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/answer-role-rotation-policy.test.ts
import { describe, expect, it } from "vitest";
import {
  ANSWER_ROLE_ROTATION_POLICY_ROW_KEY, answerRoleRotationPolicyFromValue, answerRoleRotationPolicyRow, readAnswerRoleRotationPolicy
} from "@debateai/register";

const ON = { kind: "ANSWER_ROLE_ROTATION_POLICY", enabled: true, rule: "LEAST_SHARE_SEEDED_TIE_V1" };
const poolReturning = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return { calls, pool: { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows }; } } as never };
};

describe("answerRoleRotationPolicy: one optional row, absent means today's engine", () => {
  it("reads ON, OFF and ABSENT", async () => {
    expect(answerRoleRotationPolicyFromValue(ON)).toEqual({ state: "ON", rule: "LEAST_SHARE_SEEDED_TIE_V1" });
    expect(answerRoleRotationPolicyFromValue({ ...ON, enabled: false })).toEqual({ state: "OFF" });
    const absent = poolReturning([]);
    await expect(readAnswerRoleRotationPolicy(absent.pool, 9)).resolves.toEqual({ state: "ABSENT" });
    expect(absent.calls).toEqual([[9, ANSWER_ROLE_ROTATION_POLICY_ROW_KEY]]);
    await expect(readAnswerRoleRotationPolicy(poolReturning([{ value_json: ON }]).pool, 10)).resolves.toEqual({ state: "ON", rule: "LEAST_SHARE_SEEDED_TIE_V1" });
  });
  it.each([
    ["an extra key", { ...ON, extra: 1 }],
    ["an unknown rule", { ...ON, rule: "LEAST_DONE_SEEDED_TIE_V2" }],
    ["a string enabled", { ...ON, enabled: "true" }],
    ["the wrong kind", { ...ON, kind: "SYNTHESIZER_ROLE_REF" }],
    ["not an object", "ON"]
  ])("refuses %s, loudly", (_name, value) => {
    expect(() => answerRoleRotationPolicyFromValue(value)).toThrow("ANSWER_ROLE_ROTATION_POLICY_INVALID");
  });
  it("the publishers' row is canonical JSON of the value", () => {
    const row = answerRoleRotationPolicyRow(true, "preview-register-composer-v2");
    expect(row.rowKey).toBe("answerRoleRotationPolicy");
    expect(JSON.parse(row.valueJsonText)).toEqual(ON);
    expect(answerRoleRotationPolicyFromValue(JSON.parse(answerRoleRotationPolicyRow(false, "x").valueJsonText))).toEqual({ state: "OFF" });
    expect(() => answerRoleRotationPolicyRow(true, " ")).toThrow("ANSWER_ROLE_ROTATION_POLICY_INVALID");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/answer-role-rotation-policy.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/register/src/answer-role-rotation-policy.ts
import type { Pool } from "pg";
import { z } from "zod";
import { canonicalRegisterJson } from "./register-publication.js";

/**
 * Role rotation (spec 2026-10-11, Part 1): ONE optional row in its own family. It is NOT a
 * register.required_row and NOT in SYNTHESIS_ROLE_CONTROLS (whose reader refuses a version missing
 * any key), so every sealed version without it keeps parsing and reads ABSENT: today's engine.
 * A row that does not parse is loud (the API's boot refuses).
 */
export const ANSWER_ROLE_ROTATION_POLICY_ROW_KEY = "answerRoleRotationPolicy" as const;
const schema = z.object({
  kind: z.literal("ANSWER_ROLE_ROTATION_POLICY"),
  enabled: z.boolean(),
  rule: z.literal("LEAST_SHARE_SEEDED_TIE_V1")
}).strict();
export type AnswerRoleRotationPolicyState =
  | Readonly<{ state: "ABSENT" }>
  | Readonly<{ state: "OFF" }>
  | Readonly<{ state: "ON"; rule: "LEAST_SHARE_SEEDED_TIE_V1" }>;

const invalid = (): never => { throw new TypeError("ANSWER_ROLE_ROTATION_POLICY_INVALID"); };

export function answerRoleRotationPolicyFromValue(value: unknown): AnswerRoleRotationPolicyState {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  return parsed.data.enabled ? Object.freeze({ state: "ON", rule: parsed.data.rule }) : Object.freeze({ state: "OFF" });
}

export async function readAnswerRoleRotationPolicy(pool: Pick<Pool, "query">, registerVersion: number): Promise<AnswerRoleRotationPolicyState> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ANSWER_ROLE_ROTATION_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? Object.freeze({ state: "ABSENT" }) : answerRoleRotationPolicyFromValue(row.value_json);
}

/** The row a publisher seals (the preview's v2 kit; the hosted file's optional member). */
export function answerRoleRotationPolicyRow(enabled: boolean, sourceRef: string): Readonly<{
  rowKey: typeof ANSWER_ROLE_ROTATION_POLICY_ROW_KEY; valueJsonText: string; sourceRef: string;
}> {
  if (typeof enabled !== "boolean" || typeof sourceRef !== "string" || sourceRef.trim() === "") return invalid();
  const valueAst = Object.freeze({ kind: "ANSWER_ROLE_ROTATION_POLICY", enabled, rule: "LEAST_SHARE_SEEDED_TIE_V1" });
  return Object.freeze({ rowKey: ANSWER_ROLE_ROTATION_POLICY_ROW_KEY, valueJsonText: canonicalRegisterJson(valueAst), sourceRef });
}
```

If `canonicalRegisterJson`'s parameter type (`CanonicalJsonAst`) refuses the plain object at typecheck, build it the way `packages/register/src/password-reset-policy.ts:23` builds its `valueAst` (strings and booleans need no `canonicalDecimal`). The return type of `canonicalRegisterJson` is a branded `CanonicalRegisterJson`; keep that brand in the returned `valueJsonText` if `RegisterPublicationRow` requires it (change the annotation to `CanonicalRegisterJson`).

Export block in `packages/register/src/index.ts`:

```ts
export {
  ANSWER_ROLE_ROTATION_POLICY_ROW_KEY,
  answerRoleRotationPolicyFromValue,
  answerRoleRotationPolicyRow,
  readAnswerRoleRotationPolicy,
  type AnswerRoleRotationPolicyState
} from "./answer-role-rotation-policy.js";
```

Add `packages/register/src/answer-role-rotation-policy.ts` to the shipped-corpus manifest (sorted).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/answer-role-rotation-policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/register/src/answer-role-rotation-policy.ts packages/register/src/index.ts tests/unit/answer-role-rotation-policy.test.ts tests/support/shipped-corpus.manifest.txt
git commit -m "feat(register): the optional answerRoleRotationPolicy row (absent = today's engine)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration 0114 as the next forward step

**Files:**
- Create: `migrations/0114_role_rotation.sql`
- Create: `migrations/lineage/role-rotation-forward0114.json`
- Create: `packages/db/src/migration-forward0114.ts`
- Modify: `packages/db/src/migration-forward-chain.ts:6` (import) and `:35` (`STEPS`)
- Modify: `migrations/lineage/README.md` (the chain paragraph: "0113 ... the third"; add 0114 as the fourth, and a short "## Role rotation (0114)" section)
- Modify: `packages/db/src/schema.ts` (after `runRoleAssignment`, ~line 354; and the `answerStory` table ~line 578)
- Modify: the tests 0113 touched when it joined the chain. List them with `git show --stat 912dc01de -- tests` and read each hunk with `git show 912dc01de -- <file>`: `tests/architecture/migration-forward-chain.test.ts`, `tests/architecture/migration-forward-auth-db-batch.test.ts`, `tests/architecture/security-migration-0065.test.ts`, `tests/integration/forward-chain-replay-verifiers.test.ts`, `tests/integration/billing-netopia-migration.test.ts`, `tests/integration/billing-migrations.test.ts`, `tests/integration/preview-auth-dev-fallback.test.ts`, `tests/unit/preview-auth-dev-pending-forward.test.ts`. In each, make the same kind of edit for 0114 (the step list grows from three to four entries; the newest step's name, manifest and receipt become 0114's).
- Modify: `tests/support/shipped-corpus.manifest.txt` (the four new files)
- Test: `tests/integration/role-rotation-0114.test.ts`

**Interfaces:**
- Consumes: `ForwardStepAnchor`, `ForwardStepPlan` from `packages/db/src/migration-forward-chain.ts`.
- Produces: table `core.run_role_rotation` (columns per the spec, Part 3), column `serve.answer_story.storyteller_repairs`, `loadForward0114`, drizzle `runRoleRotation`.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/role-rotation-0114.test.ts
/**
 * 0114: the rotation pin is insert-once and immutable, the two maker laws hold in the database,
 * and the story gains its storyteller repair count (spec 2026-10-11, Part 3).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunRepository, migrate } from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const db = () => database.pool;

async function createRun(label: string): Promise<string> {
  return new RunRepository(db()).startRun({
    questionLine: `Which models rotate in the ${label} debate?`,
    principal: { kind: "legacy", legacyAskerId: "asker:0114" },
    sessionId: `session:${label}`, callerScope: "ASKER",
    asOf: new Date("2026-10-11T00:00:00.000Z"), askerRiskTier: "casual", effectiveRiskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: `asker:${label}`, compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1,
    envelopeBasis: { source: "test-layer" }, registerVersion: 1, batteryVersion: "0114-test-layer", batteryRows: []
  });
}
const COLUMNS = `run_id, rule, writer_provider_ref, writer_model_id, writer_maker, checker_provider_ref, checker_model_id, checker_maker,
  storyteller_provider_ref, storyteller_model_id, storyteller_maker, story_checker_provider_ref, story_checker_model_id, story_checker_maker`;
const insert = (runId: string, overrides: Partial<Record<"writerMaker" | "checkerMaker" | "storytellerMaker" | "storyCheckerMaker" | "rule", string>> = {}) =>
  db().query(`INSERT INTO core.run_role_rotation (${COLUMNS}) VALUES ($1,$2,'p:a','model-a',$3,'p:b','model-b',$4,'p:b','model-b',$5,'p:a','model-a',$6)`,
    [runId, overrides.rule ?? "LEAST_SHARE_SEEDED_TIE_V1", overrides.writerMaker ?? "Maker A", overrides.checkerMaker ?? "Maker B",
      overrides.storytellerMaker ?? "Maker B", overrides.storyCheckerMaker ?? "Maker A"]);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
});
afterAll(async () => database?.stop());

describe("0114: core.run_role_rotation is pinned once", () => {
  it("takes one row per run and never changes it", async () => {
    const runId = await createRun("pinned");
    await insert(runId);
    const row = (await db().query("SELECT writer_maker, checker_maker, created_at FROM core.run_role_rotation WHERE run_id=$1", [runId])).rows[0];
    expect(row).toMatchObject({ writer_maker: "Maker A", checker_maker: "Maker B" });
    expect(row.created_at).toBeInstanceOf(Date);
    await expect(insert(runId)).rejects.toThrow(/run_role_rotation_pkey/u);
    await expect(db().query("UPDATE core.run_role_rotation SET writer_maker='x' WHERE run_id=$1", [runId])).rejects.toThrow();
    await expect(db().query("DELETE FROM core.run_role_rotation WHERE run_id=$1", [runId])).rejects.toThrow();
    await expect(db().query("TRUNCATE core.run_role_rotation")).rejects.toThrow(/TRUNCATE_REJECTED/u);
  });
  it("refuses a checker of its writer's maker, for the answer and for the story", async () => {
    await expect(insert(await createRun("same-answer"), { checkerMaker: "Maker A" })).rejects.toThrow(/run_role_rotation_checker_other_maker/u);
    await expect(insert(await createRun("same-story"), { storyCheckerMaker: "Maker B" })).rejects.toThrow(/run_role_rotation_story_checker_other_maker/u);
  });
  it("refuses an unknown rule, a blank identity and an unknown run", async () => {
    await expect(insert(await createRun("rule"), { rule: "LEAST_DONE_SEEDED_TIE_V2" })).rejects.toThrow(/run_role_rotation_rule_known/u);
    await expect(insert(await createRun("blank"), { writerMaker: " " })).rejects.toThrow(/run_role_rotation_identities_present/u);
    await expect(insert(randomUUID())).rejects.toThrow(/run_role_rotation_run_id_fkey/u);
  });
  it("the runtime role inserts and reads, never updates; replay reads", async () => {
    const privileges = (await db().query(`SELECT
      has_table_privilege('debateai_runtime','core.run_role_rotation','SELECT') AS runtime_select,
      has_table_privilege('debateai_runtime','core.run_role_rotation','INSERT') AS runtime_insert,
      has_table_privilege('debateai_runtime','core.run_role_rotation','UPDATE') AS runtime_update,
      has_table_privilege('debateai_runtime','core.run_role_rotation','DELETE') AS runtime_delete,
      has_table_privilege('debateai_replay','core.run_role_rotation','SELECT') AS replay_select`)).rows[0];
    expect(privileges).toEqual({ runtime_select: true, runtime_insert: true, runtime_update: false, runtime_delete: false, replay_select: true });
  });
});

describe("0114: serve.answer_story.storyteller_repairs", () => {
  it("is a nullable integer from 0 to 32", async () => {
    const column = (await db().query(`SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema='serve' AND table_name='answer_story' AND column_name='storyteller_repairs'`)).rows[0];
    expect(column).toEqual({ data_type: "integer", is_nullable: "YES" });
    const check = (await db().query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='serve.answer_story'::regclass AND conname='answer_story_storyteller_repairs_bounded'`)).rows[0];
    expect(check.definition).toMatch(/storyteller_repairs >= 0/u);
    expect(check.definition).toMatch(/storyteller_repairs <= 32/u);
  });
});

describe("0114: a forward step, applied once", () => {
  it("is recorded after 0113 and a second migrate() changes nothing", async () => {
    const steps = (await db().query(`SELECT name FROM public.debateai_schema_migration_step ORDER BY name`)).rows.map((row) => row.name);
    expect(steps.slice(-2)).toEqual(["0113_billing_price_currencies.sql", "0114_role_rotation.sql"]);
    await migrate(database.pool);
    const again = (await db().query(`SELECT name FROM public.debateai_schema_migration_step ORDER BY name`)).rows.map((row) => row.name);
    expect(again).toEqual(steps);
  });
});
```

(If `public.debateai_schema_migration_step`'s name column is called differently, use the one `tests/integration/billing-price-currencies-migration.test.ts` reads; that suite is the template for the last describe.)

- [ ] **Step 2: Run it to verify it fails**

Run: `LOCKED pnpm exec vitest run tests/integration/role-rotation-0114.test.ts`
Expected: FAIL (`relation "core.run_role_rotation" does not exist`).

- [ ] **Step 3: Write the migration**

```sql
-- migrations/0114_role_rotation.sql
-- 0114 — per-debate rotation of the four single-model roles (spec 2026-10-11, Part 3). The fourth forward step of the
-- chain after 0113 (migrations/lineage/README.md; its manifest lineage/role-rotation-forward0114.json binds these
-- bytes; it adds no billing relation and no function, so lineage/verify-effective-capabilities-111.sql stays the
-- verifier in force). Forward-only and replayable: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, each
-- constraint dropped IF EXISTS and added again.
--
-- core.run_role_rotation: the four roles admission picked for one rotated debate, pinned beside the run the moment
-- it exists and BEFORE its work is queued. Provider refs, model ids and makers: engine identifiers, never debate
-- text, so it is not a content carrier. Insert-once (the primary key), then immutable. No backfill: counting starts
-- at zero. A debate with rotation off, a one-maker panel or a scorecard assignment has no row.
CREATE TABLE IF NOT EXISTS core.run_role_rotation (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  rule text NOT NULL,
  writer_provider_ref text NOT NULL,
  writer_model_id text NOT NULL,
  writer_maker text NOT NULL,
  checker_provider_ref text NOT NULL,
  checker_model_id text NOT NULL,
  checker_maker text NOT NULL,
  storyteller_provider_ref text NOT NULL,
  storyteller_model_id text NOT NULL,
  storyteller_maker text NOT NULL,
  story_checker_provider_ref text NOT NULL,
  story_checker_model_id text NOT NULL,
  story_checker_maker text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_rule_known;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_rule_known CHECK (rule = 'LEAST_SHARE_SEEDED_TIE_V1');
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_identities_present;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_identities_present CHECK (
  length(btrim(writer_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(writer_model_id)) BETWEEN 1 AND 256
  AND length(btrim(writer_maker)) BETWEEN 1 AND 256
  AND length(btrim(checker_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(checker_model_id)) BETWEEN 1 AND 256
  AND length(btrim(checker_maker)) BETWEEN 1 AND 256
  AND length(btrim(storyteller_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(storyteller_model_id)) BETWEEN 1 AND 256
  AND length(btrim(storyteller_maker)) BETWEEN 1 AND 256
  AND length(btrim(story_checker_provider_ref)) BETWEEN 1 AND 256 AND length(btrim(story_checker_model_id)) BETWEEN 1 AND 256
  AND length(btrim(story_checker_maker)) BETWEEN 1 AND 256);
-- The owner's law (2026-10-10): a checker is always another company than the writer it checks.
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_checker_other_maker;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_checker_other_maker CHECK (checker_maker <> writer_maker);
ALTER TABLE core.run_role_rotation DROP CONSTRAINT IF EXISTS run_role_rotation_story_checker_other_maker;
ALTER TABLE core.run_role_rotation ADD CONSTRAINT run_role_rotation_story_checker_other_maker CHECK (story_checker_maker <> storyteller_maker);

SELECT core.install_truncate_guard('core.run_role_rotation');
DROP TRIGGER IF EXISTS reject_mutation ON core.run_role_rotation;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_role_rotation
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The API writes it (as debateai_runtime; debateai_authorization_runtime inherits that role, 0039) and the runner
-- reads it; the replay role reads.
GRANT SELECT, INSERT ON core.run_role_rotation TO debateai_runtime;
GRANT SELECT ON core.run_role_rotation TO debateai_replay;

-- serve.answer_story.storyteller_repairs: how many of the story's rounds had a storyteller reply accepted only after
-- the format repair try. NULL: a story written before 0114, or one that failed before any storyteller reply.
ALTER TABLE serve.answer_story ADD COLUMN IF NOT EXISTS storyteller_repairs integer;
ALTER TABLE serve.answer_story DROP CONSTRAINT IF EXISTS answer_story_storyteller_repairs_bounded;
ALTER TABLE serve.answer_story ADD CONSTRAINT answer_story_storyteller_repairs_bounded
  CHECK (storyteller_repairs IS NULL OR (storyteller_repairs >= 0 AND storyteller_repairs <= 32));
```

Before relying on `core.install_truncate_guard` and `core.reject_mutation`, confirm they exist at this point of the chain: `grep -n "install_truncate_guard\|FUNCTION core.reject_mutation" migrations/0090_model_scorecard.sql migrations/00*.sql | head`.

- [ ] **Step 4: Write the manifest and loader**

Compute digests after the SQL is final (any SQL edit later means recomputing):

```bash
shasum -a 256 migrations/0114_role_rotation.sql migrations/lineage/billing-price-currencies-forward0113.json migrations/lineage/verify-effective-capabilities-111.sql
```

```json
{
  "version": "role-rotation-forward0114-v1",
  "baseRecipeSha256": "3ad4ca844799fa0e498124250dba11683d0e305a2e3571468809ec5a6cec45c2",
  "previous": {
    "name": "0113_billing_price_currencies.sql",
    "manifestSha256": "<sha256 of lineage/billing-price-currencies-forward0113.json from the command above>",
    "verifierSha256": "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"
  },
  "migration": { "name": "0114_role_rotation.sql", "sha256": "<sha256 of migrations/0114_role_rotation.sql>" },
  "verifier": { "path": "lineage/verify-effective-capabilities-111.sql", "sha256": "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a" }
}
```

(The two angle-bracket values are the outputs of the `shasum` command, pasted in; the `baseRecipeSha256` and verifier digest are copied from `billing-price-currencies-forward0113.json` and must match the command's output for the verifier.)

`packages/db/src/migration-forward0114.ts`: copy `packages/db/src/migration-forward0113.ts` and change exactly these parts:

```ts
/**
 * Role rotation's migration (spec 2026-10-11, Part 3) as the chain step after 0113. It adds no billing relation and
 * no function, so the effective verifier 0113 keeps in force (0111's) stays in force and is named as its own. Its
 * checks are its postcondition (the pin table's columns and four CHECKs, and the story column and its CHECK),
 * compared on every later migrate(); it has no supplemental verifier, so no replayVerifierSql.
 */
const NAME='0114_role_rotation.sql';
const VERSION='role-rotation-forward0114-v1';
const MANIFEST_PATH='lineage/role-rotation-forward0114.json';
const VERIFIER_PATH='lineage/verify-effective-capabilities-111.sql';
const PREVIOUS='0113_billing_price_currencies.sql';
const CONSTRAINTS=['run_role_rotation_rule_known','run_role_rotation_identities_present','run_role_rotation_checker_other_maker',
 'run_role_rotation_story_checker_other_maker','answer_story_storyteller_repairs_bounded'] as const;
const fail=(detail:string):never=>{throw Error(`MIGRATION_FORWARD0114_${detail}`);};

/** What the step creates: the pin table's columns, the story column, and the definitions of the five CHECKs. */
async function postconditionEvidence(client:PoolClient):Promise<string>{
 const rows=(await client.query(`
  SELECT 'column' AS kind,a.attrelid::regclass::text||'.'||a.attname::text AS name,jsonb_build_object(
    'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',a.atthasdef) AS facts
  FROM pg_attribute a
  WHERE ((a.attrelid='core.run_role_rotation'::regclass) OR (a.attrelid='serve.answer_story'::regclass AND a.attname='storyteller_repairs'))
   AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT 'constraint',k.conname::text,jsonb_build_object('relation',k.conrelid::regclass::text,'definition',pg_get_constraintdef(k.oid))
  FROM pg_constraint k
  WHERE k.conrelid IN ('core.run_role_rotation'::regclass,'serve.answer_story'::regclass) AND k.conname=ANY($1::text[])
  ORDER BY 1,2
 `,[CONSTRAINTS])).rows as Array<{kind:string}>;
 if(rows.filter(row=>row.kind==='column').length!==16||rows.filter(row=>row.kind==='constraint').length!==CONSTRAINTS.length){
  return fail('POSTCONDITION_OBJECTS');
 }
 return sha(JSON.stringify(rows));
}

export async function loadForward0114(anchor:ForwardStepAnchor):Promise<ForwardStepPlan>{
 // body identical to loadForward0113's (same manifest checks, same returned shape)
}
```

The `loadForward0114` body is `loadForward0113`'s body unchanged (it reads the constants above). 16 columns = 15 in the table + the story column.

`packages/db/src/migration-forward-chain.ts`:

```ts
import { loadForward0114 } from './migration-forward0114.js';
// ...
const STEPS:readonly StepLoader[]=Object.freeze([loadForward111,loadForwardAuthDbBatch,loadForward0113,loadForward0114]);
```

`packages/db/src/schema.ts`, after `runRoleAssignment`:

```ts
// Role rotation (0114): the four roles one rotated debate was given at admission. Append-only.
export const runRoleRotation = core.table("run_role_rotation", {
  runId: uuid("run_id").primaryKey(),
  rule: text("rule").notNull(),
  writerProviderRef: text("writer_provider_ref").notNull(),
  writerModelId: text("writer_model_id").notNull(),
  writerMaker: text("writer_maker").notNull(),
  checkerProviderRef: text("checker_provider_ref").notNull(),
  checkerModelId: text("checker_model_id").notNull(),
  checkerMaker: text("checker_maker").notNull(),
  storytellerProviderRef: text("storyteller_provider_ref").notNull(),
  storytellerModelId: text("storyteller_model_id").notNull(),
  storytellerMaker: text("storyteller_maker").notNull(),
  storyCheckerProviderRef: text("story_checker_provider_ref").notNull(),
  storyCheckerModelId: text("story_checker_model_id").notNull(),
  storyCheckerMaker: text("story_checker_maker").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
```

and in `answerStory` add `storytellerRepairs: integer("storyteller_repairs"),` (import `integer` from the drizzle pg-core import at the top if it is not already imported).

README: in `migrations/lineage/README.md`, change "Part C's prices (0113, below) the third." to "Part C's prices (0113, below) the third, and role rotation (0114, below) the fourth." and in step 2's text "after 0113: 0113, ..." to name 0114 and `role-rotation-forward0114.json`; append:

```markdown
## Role rotation (0114)

The fourth chain step, after Part C's 0113 (spec `docs/superpowers/specs/2026-10-11-role-rotation-design.md`, Part 3):
`0114_role_rotation.sql`, `role-rotation-forward0114.json`, `packages/db/src/migration-forward0114.ts`. It creates
`core.run_role_rotation` (insert-once, immutable) and adds `serve.answer_story.storyteller_repairs`. No billing relation
or function, so `verify-effective-capabilities-111.sql` stays the verifier in force. If `origin/dev` takes 0114 first,
renumber this step at merge time (its manifest, loader name and `previous` follow).
```

Then edit the eight tests 0113 touched (see Files above) so they expect four steps.

- [ ] **Step 5: Run the tests to verify they pass**

Run, one at a time:
`LOCKED pnpm exec vitest run tests/integration/role-rotation-0114.test.ts`
`LOCKED pnpm exec vitest run tests/architecture/migration-forward-chain.test.ts tests/architecture/migration-forward-auth-db-batch.test.ts tests/architecture/security-migration-0065.test.ts`
`LOCKED pnpm exec vitest run tests/integration/forward-chain-replay-verifiers.test.ts`
`LOCKED pnpm exec vitest run tests/integration/billing-price-currencies-migration.test.ts tests/integration/billing-netopia-migration.test.ts`
`LOCKED pnpm exec vitest run tests/integration/billing-migrations.test.ts tests/integration/preview-auth-dev-fallback.test.ts`
`pnpm exec vitest run tests/unit/preview-auth-dev-pending-forward.test.ts`
`LOCKED pnpm exec vitest run tests/integration/story-repository.test.ts`
Expected: all PASS (the story suite proves the new nullable column does not disturb the attestation guard).

- [ ] **Step 6: Commit**

```bash
git add migrations/0114_role_rotation.sql migrations/lineage/role-rotation-forward0114.json migrations/lineage/README.md packages/db/src/migration-forward0114.ts packages/db/src/migration-forward-chain.ts packages/db/src/schema.ts tests/integration/role-rotation-0114.test.ts tests/support/shipped-corpus.manifest.txt tests/architecture tests/integration tests/unit/preview-auth-dev-pending-forward.test.ts
git commit -m "feat(db): 0114, the role rotation pin and the story's repair count, chained after 0113

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Check `git status` first: only the files listed above may be staged.)

---

### Task 4: Database access for the pin and the counts

**Files:**
- Modify: `packages/db/src/index.ts` (after `readRunRoleAssignment`, ~line 1333)
- Test: `tests/integration/role-rotation-0114.test.ts` (new describe blocks)

**Interfaces:**
- Consumes: Task 3's table.
- Produces (exported from `@debateai/db`):

```ts
export type RunRoleRotationRole = Readonly<{ providerRef: string; modelId: string; maker: string }>;
export type RunRoleRotationInput = Readonly<{
  runId: string; rule: "LEAST_SHARE_SEEDED_TIE_V1";
  answerWriter: RunRoleRotationRole; answerChecker: RunRoleRotationRole;
  storyteller: RunRoleRotationRole; storyChecker: RunRoleRotationRole;
}>;
export type RunRoleRotationRecord = RunRoleRotationInput & Readonly<{ createdAt: Date }>;
export function insertRunRoleRotation(executor: Pick<Pool, "query"> | PoolClient, input: RunRoleRotationInput): Promise<void>;
export function readRunRoleRotation(executor: Pick<Pool, "query"> | PoolClient, runId: string): Promise<RunRoleRotationRecord | null>;
/** Per role, per model id, how many pins name it: `{ ANSWER_WRITER: { [modelId]: n }, ... }`. */
export function readRoleRotationCounts(executor: Pick<Pool, "query"> | PoolClient): Promise<Readonly<Record<"ANSWER_WRITER" | "ANSWER_CHECKER" | "STORYTELLER" | "STORY_CHECKER", Readonly<Record<string, number>>>>>;
```

`RunRoleRotationInput` is structurally a `RotatedRoles` (Task 1) plus `runId`, so the API passes `{ runId, ...picked }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/role-rotation-0114.test.ts`; add `insertRunRoleRotation, readRunRoleRotation, readRoleRotationCounts` to its `@debateai/db` import)

```ts
const role = (providerRef: string, modelId: string, maker: string) => ({ providerRef, modelId, maker });
const A = role("p:a", "model-a", "Maker A");
const B = role("p:b", "model-b", "Maker B");
const C = role("p:c", "model-c", "Maker C");

describe("insertRunRoleRotation / readRunRoleRotation", () => {
  it("round-trips one pin and answers null for a run without one", async () => {
    const runId = await createRun("round-trip");
    await insertRunRoleRotation(db(), { runId, rule: "LEAST_SHARE_SEEDED_TIE_V1", answerWriter: A, answerChecker: B, storyteller: C, storyChecker: A });
    const pinned = await readRunRoleRotation(db(), runId);
    expect(pinned).toMatchObject({ runId, rule: "LEAST_SHARE_SEEDED_TIE_V1", answerWriter: A, answerChecker: B, storyteller: C, storyChecker: A });
    expect(pinned!.createdAt).toBeInstanceOf(Date);
    expect(Object.isFrozen(pinned)).toBe(true);
    expect(await readRunRoleRotation(db(), await createRun("none"))).toBeNull();
  });
  it("refuses a malformed input before the database does", async () => {
    const runId = await createRun("malformed");
    await expect(insertRunRoleRotation(db(), { runId, rule: "LEAST_SHARE_SEEDED_TIE_V1", answerWriter: A, answerChecker: A, storyteller: C, storyChecker: A }))
      .rejects.toThrow("RUN_ROLE_ROTATION_INVALID");
    await expect(insertRunRoleRotation(db(), { runId, rule: "OTHER" as never, answerWriter: A, answerChecker: B, storyteller: C, storyChecker: A }))
      .rejects.toThrow("RUN_ROLE_ROTATION_INVALID");
  });
});

describe("readRoleRotationCounts", () => {
  it("counts each role's model ids over every pin", async () => {
    const before = await readRoleRotationCounts(db());
    for (const label of ["count-1", "count-2"]) {
      await insertRunRoleRotation(db(), { runId: await createRun(label), rule: "LEAST_SHARE_SEEDED_TIE_V1", answerWriter: C, answerChecker: B, storyteller: B, storyChecker: C });
    }
    const after = await readRoleRotationCounts(db());
    expect((after.ANSWER_WRITER["model-c"] ?? 0) - (before.ANSWER_WRITER["model-c"] ?? 0)).toBe(2);
    expect((after.ANSWER_CHECKER["model-b"] ?? 0) - (before.ANSWER_CHECKER["model-b"] ?? 0)).toBe(2);
    expect((after.STORYTELLER["model-b"] ?? 0) - (before.STORYTELLER["model-b"] ?? 0)).toBe(2);
    expect((after.STORY_CHECKER["model-c"] ?? 0) - (before.STORY_CHECKER["model-c"] ?? 0)).toBe(2);
    expect(Object.keys(after).sort()).toEqual(["ANSWER_CHECKER", "ANSWER_WRITER", "STORYTELLER", "STORY_CHECKER"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `LOCKED pnpm exec vitest run tests/integration/role-rotation-0114.test.ts`
Expected: FAIL (the three functions are not exported).

- [ ] **Step 3: Implement** (in `packages/db/src/index.ts`, after `readRunRoleAssignment`)

```ts
/** Role rotation (spec 2026-10-11, Part 3): one pinned role. */
export type RunRoleRotationRole = Readonly<{ providerRef: string; modelId: string; maker: string }>;
export type RunRoleRotationInput = Readonly<{
  runId: string; rule: "LEAST_SHARE_SEEDED_TIE_V1";
  answerWriter: RunRoleRotationRole; answerChecker: RunRoleRotationRole;
  storyteller: RunRoleRotationRole; storyChecker: RunRoleRotationRole;
}>;
export type RunRoleRotationRecord = RunRoleRotationInput & Readonly<{ createdAt: Date }>;
type RoleRotationCountRole = "ANSWER_WRITER" | "ANSWER_CHECKER" | "STORYTELLER" | "STORY_CHECKER";

const isRotationRole = (value: unknown): value is RunRoleRotationRole => typeof value === "object" && value !== null
  && ["providerRef", "modelId", "maker"].every((key) => {
    const field = (value as Record<string, unknown>)[key];
    return typeof field === "string" && field.trim().length >= 1 && field.length <= 256;
  });

function assertRotationShape(input: Omit<RunRoleRotationInput, "runId">): void {
  if (input.rule !== "LEAST_SHARE_SEEDED_TIE_V1"
    || ![input.answerWriter, input.answerChecker, input.storyteller, input.storyChecker].every(isRotationRole)
    || input.answerChecker.maker === input.answerWriter.maker
    || input.storyChecker.maker === input.storyteller.maker) {
    throw new TypeError("RUN_ROLE_ROTATION_INVALID");
  }
}

export async function insertRunRoleRotation(executor: Pick<Pool, "query"> | PoolClient, input: RunRoleRotationInput): Promise<void> {
  assertRotationShape(input);
  const roles = [input.answerWriter, input.answerChecker, input.storyteller, input.storyChecker]
    .flatMap((pick) => [pick.providerRef, pick.modelId, pick.maker]);
  await executor.query(
    `INSERT INTO core.run_role_rotation (run_id, rule,
       writer_provider_ref, writer_model_id, writer_maker, checker_provider_ref, checker_model_id, checker_maker,
       storyteller_provider_ref, storyteller_model_id, storyteller_maker,
       story_checker_provider_ref, story_checker_model_id, story_checker_maker)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [input.runId, input.rule, ...roles]
  );
}

export async function readRunRoleRotation(executor: Pick<Pool, "query"> | PoolClient, runId: string): Promise<RunRoleRotationRecord | null> {
  const row = (await executor.query<Record<string, string> & { created_at: Date }>(
    `SELECT run_id, rule, writer_provider_ref, writer_model_id, writer_maker, checker_provider_ref, checker_model_id, checker_maker,
            storyteller_provider_ref, storyteller_model_id, storyteller_maker,
            story_checker_provider_ref, story_checker_model_id, story_checker_maker, created_at
     FROM core.run_role_rotation WHERE run_id=$1`,
    [runId]
  )).rows[0];
  if (row === undefined) return null;
  const pick = (prefix: string): RunRoleRotationRole => Object.freeze({
    providerRef: row[`${prefix}_provider_ref`]!, modelId: row[`${prefix}_model_id`]!, maker: row[`${prefix}_maker`]!
  });
  const record = {
    runId: row.run_id!, rule: row.rule as "LEAST_SHARE_SEEDED_TIE_V1",
    answerWriter: pick("writer"), answerChecker: pick("checker"), storyteller: pick("storyteller"), storyChecker: pick("story_checker")
  };
  assertRotationShape(record);
  return Object.freeze({ ...record, createdAt: row.created_at });
}

export async function readRoleRotationCounts(
  executor: Pick<Pool, "query"> | PoolClient
): Promise<Readonly<Record<RoleRotationCountRole, Readonly<Record<string, number>>>>> {
  const rows = (await executor.query<{ role: RoleRotationCountRole; model_id: string; count: number }>(
    `SELECT 'ANSWER_WRITER' AS role, writer_model_id AS model_id, count(*)::integer AS count FROM core.run_role_rotation GROUP BY 2
     UNION ALL SELECT 'ANSWER_CHECKER', checker_model_id, count(*)::integer FROM core.run_role_rotation GROUP BY 2
     UNION ALL SELECT 'STORYTELLER', storyteller_model_id, count(*)::integer FROM core.run_role_rotation GROUP BY 2
     UNION ALL SELECT 'STORY_CHECKER', story_checker_model_id, count(*)::integer FROM core.run_role_rotation GROUP BY 2`
  )).rows;
  const counts: Record<RoleRotationCountRole, Record<string, number>> = { ANSWER_WRITER: {}, ANSWER_CHECKER: {}, STORYTELLER: {}, STORY_CHECKER: {} };
  for (const row of rows) counts[row.role][row.model_id] = row.count;
  return Object.freeze(Object.fromEntries(Object.entries(counts).map(([role, byModel]) => [role, Object.freeze(byModel)]))) as never;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `LOCKED pnpm exec vitest run tests/integration/role-rotation-0114.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/index.ts tests/integration/role-rotation-0114.test.ts
git commit -m "feat(db): insert, read and count role rotation pins

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The estimate prices a rotated debate at each gate's dearest member

**Files:**
- Modify: `apps/api/src/preview-budget-estimate.ts` (`PreviewUnfinishedRun` ~206, `previewCallShares` ~495-562, `estimatePreviewGateNeeds` ~616-642, `estimateUnfinishedRunHolds` ~644-658, `assertPreviewBudgetAdmits` ~814-878, `PREVIEW_UNFINISHED_RUNS_SQL` ~880-896, `unfinishedRunFrom` ~897-923, `readUnfinishedRuns` in `readPreviewBudgetGateSettings` ~1043-1047)
- Test: `tests/unit/preview-budget-estimate.test.ts` (new describe at the end)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `PreviewUnfinishedRun` gains `rotated?: boolean`.
  - `previewCallShares` and `estimatePreviewGateNeeds` accept `rotated?: boolean`; `previewCallShares` also accepts `dearestFor?: (models: readonly string[], role: "ANSWER" | "STORYTELLER" | "STORY_CHECKER") => string` (required when `rotated` is true; `estimatePreviewGateNeeds` and `estimateUnfinishedRunHolds` build it from their pricer).
  - `assertPreviewBudgetAdmits(gate, input: { basis, panel, storyTier?, rotated?: boolean }, clock?, lock?)`.
  - `PREVIEW_UNFINISHED_RUNS_SQL` selects `rotated` (boolean).

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/preview-budget-estimate.test.ts`)

```ts
describe("a rotated debate: each role on every gate, at that gate's dearest panel member (spec 2026-10-11, Part 5)", () => {
  const HAIKU = "claude-haiku-5-5";
  const member = (provider_ref: string, model_id: string) => ({ provider_ref, model_id });
  const FREE = [member("preview:fixture-a", GLM), member("preview:deepseek-v4-1-flash", DEEPSEEK)];
  const PREMIUM = [...FREE, member("preview:mimo-v2-6-pro", MIMO), member("preview:qwen-3-8-flash", QWEN)];
  const ALL_FIVE = [...PREMIUM, member("preview:claude-haiku-5-5", HAIKU)];
  const roleModels = Object.freeze({ answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: GLM, storyChecker: GLM });
  const roleProviderRefs = ["preview:fixture-a", "preview:deepseek-v4-1-flash", "preview:fixture-b"];
  const basisFor = (panelSize: number, depth: number) => computeStructuralCeilingBasis({ panelSize, depth, judgeMaxAttempts: 3, organMaxAttempts: 3,
    maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4,
    reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 }) as unknown as Readonly<Record<string, unknown>>;
  const config = parsePreviewProviderTestConfig(JSON.stringify({ deployment: "v3-preview", requested_thinking_level: "high",
    budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture", free_model_ids: [GLM, DEEPSEEK],
    premium_model_ids: [GLM, DEEPSEEK, MIMO, QWEN] }))!;
  const sent = previewCallOutputTokens(config, { debate: [2048, 2048, 2048, 2048, 2048], story: { storyteller: 12_000, checker: 2048 } });
  const HOLD = 10n * MIMO_LARGEST;
  const ANTHROPIC_HOLD = 2n * (264_192n * 500n + 32_768n * 2500n);
  const needs = (panel: readonly { provider_ref: string; model_id: string }[], depth: number, rotated: boolean) =>
    estimatePreviewGateNeeds({ basis: basisFor(panel.length, depth), panel, roleModels, roleProviderRefs, storyRounds: 2, callOutputTokens: sent,
      askProbeModelIds: [...ASK_PROBE_MODELS, ...(panel.some((entry) => entry.model_id === HAIKU) ? [HAIKU] : [])], maxCooldownHoldsPerRun: 2, rotated });

  it("puts the answer roles on the dearest DEBATE member and the story roles on the dearest story member of each gate", () => {
    const shares = previewCallShares({ basis: basisFor(5, 1), panel: ALL_FIVE, roleModels, roleProviderRefs, storyRounds: 2,
      maxCooldownHoldsPerRun: 2, rotated: true,
      dearestFor: (models, role) => models.includes(MIMO) ? MIMO : models.includes(HAIKU) ? HAIKU : models[0]! });
    const calls = callsBy(shares);
    expect(calls[`${MIMO} STORYTELLER`]).toBe(2);
    expect(calls[`${HAIKU} STORYTELLER`]).toBe(2);
    expect(calls[`${MIMO} STORY_CHECKER`]).toBe(2);
    expect(calls[`${HAIKU} STORY_CHECKER`]).toBe(2);
    expect(calls[`${GLM} STORYTELLER`]).toBeUndefined();
    // No off-panel role refs: fixture-b is never health-checked for a rotated debate.
    expect(shares.shares.filter((share) => share.type === "PROBE" && share.model === GLM).length).toBe(1);
  });

  it("names only the panel's models on each gate (the register's role models are not called)", () => {
    const [deepinfra] = needs(FREE, 1, true);
    expect([...deepinfra!.modelIds].sort()).toEqual([DEEPSEEK, GLM].sort());
  });

  it("re-pins the depth 1-3 room table; every combination still fits DeepInfra's $10.00 / 2,000 and Anthropic's $2.00 / 600", () => {
    const usd = (nano: bigint) => Math.round(Number(nano) / 1e7) / 100;
    const table = [1, 2, 3].map((depth) => {
      const five = needs(ALL_FIVE, depth, true);
      return [needs(FREE, depth, true)[0]!, needs(PREMIUM, depth, true)[0]!, five[0]!, five[1]!].map((need, column) => {
        const anthropic = column === 3;
        return [usd(need.callsNanoUsd + (anthropic ? ANTHROPIC_HOLD : HOLD)), need.callsWithMargin + (anthropic ? 2 : 10)];
      });
    });
    // Rows: depth 1, 2, 3; columns: free, premium, all five (DeepInfra), all five (Anthropic); each [dollars, calls].
    // Computed 2026-10-11 by the spec's scratch run of the same rule (spec Part 5).
    expect(table).toEqual([
      [[1.98, 106], [3.56, 338], [4.27, 465], [1.07, 177]],
      [[2.22, 161], [4.59, 522], [5.56, 695], [1.33, 260]],
      [[2.71, 272], [6.66, 890], [8.15, 1155], [1.85, 426]]
    ]);
    for (const [free, premium, fiveDeepinfra, fiveAnthropic] of table) {
      for (const [dollars, calls] of [free!, premium!, fiveDeepinfra!]) { expect(dollars).toBeLessThanOrEqual(10); expect(calls).toBeLessThanOrEqual(2000); }
      expect(fiveAnthropic![0]).toBeLessThanOrEqual(2);
      expect(fiveAnthropic![1]).toBeLessThanOrEqual(600);
    }
  });

  it("a non-rotated debate is priced exactly as before", () => {
    expect(needs(PREMIUM, 2, false)).toEqual(estimatePreviewGateNeeds({ basis: basisFor(4, 2), panel: PREMIUM, roleModels, roleProviderRefs,
      storyRounds: 2, callOutputTokens: sent, askProbeModelIds: ASK_PROBE_MODELS, maxCooldownHoldsPerRun: 2 }));
  });

  it("an unfinished rotated debate is held with the rotated pricing, not the boot roles", () => {
    const settings = { roleModels, roleProviderRefs, storyRounds: 2, callOutputTokens: sent, maxCooldownHoldsPerRun: 2 };
    const rotated = estimateUnfinishedRunHolds({ basis: basisFor(4, 2), panel: PREMIUM, phase: "DEBATE", rotated: true }, settings);
    const fixed = estimateUnfinishedRunHolds({ basis: basisFor(4, 2), panel: PREMIUM, phase: "DEBATE" }, settings);
    // Roles on MiMo (dearer than the boot roles' GLM and DeepSeek), and no health checks of the off-panel fixture-b.
    expect(rotated[0]!.callsNanoUsd).toBeGreaterThan(fixed[0]!.callsNanoUsd);
    expect(rotated[0]!.callsWithMargin).toBeLessThan(fixed[0]!.callsWithMargin);
  });

  it("the unfinished-runs query reports whether each run is rotated", () => {
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toContain("core.run_role_rotation");
    expect(PREVIEW_UNFINISHED_RUNS_SQL).toMatch(/AS rotated/u);
  });
});
```

Note the test reuses the file's existing top-level `GLM`, `DEEPSEEK`, `MIMO`, `QWEN`, `ASK_PROBE_MODELS`, `MIMO_LARGEST`, `callsBy` and imports; it adds no import.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/preview-budget-estimate.test.ts`
Expected: FAIL in the new describe only (unknown `rotated`/`dearestFor`, wrong figures). Every older case still passes.

- [ ] **Step 3: Implement**

In `previewCallShares`'s input type add:

```ts
  /** Spec 2026-10-11 Part 5: a rotated debate; its four roles are panel members, priced per gate at `dearestFor`. */
  rotated?: boolean;
  dearestFor?: (models: readonly string[], role: "ANSWER" | "STORYTELLER" | "STORY_CHECKER") => string;
```

Inside, keep the non-rotated code exactly. For the rotated case:

```ts
  const rotated = input.rotated === true;
  if (rotated && input.dearestFor === undefined) throw new TypeError("PREVIEW_ROTATION_PRICER_MISSING");
  // Each gate's panel models, in panel order (a model off the reviewed rows is its own gate).
  const panelGates = new Map<string, string[]>();
  for (const model of panelModels) {
    const gate = previewGateKeyOf(model) ?? `model:${model}`;
    panelGates.set(gate, [...(panelGates.get(gate) ?? []), model]);
  }
  const perGate = (role: "ANSWER" | "STORYTELLER" | "STORY_CHECKER"): readonly string[] =>
    [...panelGates.values()].map((models) => input.dearestFor!(models, role));
```

Replace the two answer-role lines with:

```ts
      if (rotated) {
        // The careful side: every gate carries the roles at its dearest member (spec Part 5).
        for (const model of perGate("ANSWER")) {
          addDebate(model, BigInt(sites.answerWriter) * debate * members);
          addDebate(model, BigInt(sites.answerChecker) * debate * members);
        }
      } else {
        addDebate(input.roleModels.answerWriter, BigInt(sites.answerWriter) * debate * members);
        addDebate(input.roleModels.answerChecker, BigInt(sites.answerChecker) * debate * members);
      }
```

Replace the off-panel probe line with:

```ts
    if (!rotated) for (const ref of offPanelRoleRefs(input.panel, input.roleProviderRefs)) add(modelOfRef(ref), "PROBE", pickups);
```

Replace the story block with:

```ts
  if (rounds > 0n) {
    const tellers = rotated ? perGate("STORYTELLER") : [input.roleModels.storyteller!];
    const checkers = rotated ? perGate("STORY_CHECKER") : [input.roleModels.storyChecker!];
    for (const model of tellers) { add(model, "STORYTELLER", rounds); add(model, "STORYTELLER_RETRY", rounds); }
    for (const model of checkers) { add(model, "STORY_CHECKER", rounds); add(model, "UNBILLED_RETRY", rounds); }
  }
```

And pass `roleProviderRefs: rotated ? [] : input.roleProviderRefs` into its `previewExpectedCalls` call (so the probe count matches), i.e. `previewExpectedCalls({ ...input, roleProviderRefs: rotated ? [] : input.roleProviderRefs, askProbeTargets: askProbeModelIds.length })`. The `PREVIEW_STORY_ROLE_MISSING` check applies only when `!rotated`.

A shared helper (module level) builds `dearestFor` from a pricer and a row resolver:

```ts
function dearestByPricer(pricer: PreviewCallPricer, rowOf: (model: string) => PreviewModelRow) {
  const cost = (model: string, role: "ANSWER" | "STORYTELLER" | "STORY_CHECKER"): bigint => {
    const row = rowOf(model);
    return role === "ANSWER" ? pricer(row, "DEBATE")
      : role === "STORYTELLER" ? pricer(row, "STORYTELLER") + pricer(row, "STORYTELLER_RETRY") : pricer(row, "STORY_CHECKER");
  };
  return (models: readonly string[], role: "ANSWER" | "STORYTELLER" | "STORY_CHECKER"): string =>
    models.reduce((best, model) => cost(model, role) > cost(best, role) ? model : best);
}
```

`estimatePreviewGateNeeds` gains `rotated?: boolean`; when true, the gate model list is the panel only (skip `roleModelList`), and it calls `previewCallShares({ ...input, dearestFor: dearestByPricer(pricer, reviewedRow) })`. `estimateUnfinishedRunHolds` does the same when `run.rotated === true` (model list = `run.panel` only; `dearestFor: dearestByPricer(pricer, rowOf)`; `rotated: true`).

`PreviewUnfinishedRun` gains `/** Spec 2026-10-11: admitted with a rotation pin. */ rotated?: boolean;`.

`PREVIEW_UNFINISHED_RUNS_SQL`: add to the select list, after `run.composition_budget_tier,`:

```sql
              EXISTS (SELECT 1 FROM core.run_role_rotation AS rotation WHERE rotation.run_id = run.run_id) AS rotated,
```

`unfinishedRunFrom` reads `row.rotated` (must be a boolean when present, else `PREVIEW_UNFINISHED_RUN_UNREADABLE`) and sets `rotated: row.rotated === true`; the `readUnfinishedRuns` query's row type gains `rotated: unknown`.

`assertPreviewBudgetAdmits`'s input gains `rotated?: boolean` and passes it to `estimatePreviewGateNeeds`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/preview-budget-estimate.test.ts tests/unit/preview-anthropic-gate.test.ts`
Expected: PASS, the old room table case unchanged, the new one equal to the table above. If a figure in the new table differs, recompute it by hand from the rule in spec Part 5 before changing the expectation; record the reason in the commit message.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/preview-budget-estimate.ts tests/unit/preview-budget-estimate.test.ts
git commit -m "feat(api): price a rotated debate's roles at each gate's dearest member; re-pin the room table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Admission picks and pins

**Files:**
- Modify: `apps/api/src/index.ts`: `RunCreationSettings` (~3849-3912), `PlannedAskAdmission` (~3915-3926), `evaluateAskAdmission` (~4187-4300), `RunSetupStep` (4321-4323), `submit` (~4573-4590), `#submitWithRoom` (~4817-4831)
- Modify: `apps/api/src/main.ts` (a `boot.run("answer-role-rotation-policy", ...)` stage before `new PostgresAskApplication`, ~line 939; pass the setting)
- Test: `tests/unit/role-rotation-admission.test.ts` (new), `tests/unit/role-rotation-submit.test.ts` (new)

**Interfaces:**
- Consumes: `pickRotatedRoles`, `roleRotationSeed`, `type RotatedRoles`, `type RoleRotationCounts` (Task 1); `readAnswerRoleRotationPolicy` (Task 2); `insertRunRoleRotation`, `readRoleRotationCounts` (Task 4); `assertPreviewBudgetAdmits(..., { rotated })` (Task 5).
- Produces:
  - `RunCreationSettings.roleRotation?: Readonly<{ readCounts: () => Promise<RoleRotationCounts> }>` (present only when the row is ON)
  - `PlannedAskAdmission.roleRotation?: RotatedRoles`
  - `RunSetupStep` gains `"ROLE_ROTATION"`

- [ ] **Step 1: Write the failing admission test**

```ts
// tests/unit/role-rotation-admission.test.ts
/**
 * Spec 2026-10-11 Part 4: with the row ON and two or more makers, admission picks the four roles
 * BEFORE the estimate and hands them to submit; otherwise nothing changes.
 */
import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { roleRotationSeed, pickRotatedRoles, type RoleRotationCounts } from "@debateai/scorecard";

const CEILING_TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const member = (providerRef: string, maker: string, modelId: string): DiscoveredPanelMember => Object.freeze({
  provider_ref: providerRef, maker, model_id: modelId, probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-11T00:00:00.000Z" });
/** The free plan's two local roster models (PLAN_TIER_ROSTERS.free), two makers. */
const PANEL = Object.freeze([member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:claude-cli", "Anthropic", "claude-sonnet-5")]);
const ASK: AskRequest = { question_line: "Should cities price congestion?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker:test", composition_budget_tier: "low", depth_params: { depth: 1 }, decision_scope: "rotation admission test",
  as_of: "2026-10-11T00:00:00.000Z", steering_presets: [], plan_tier: "free", steering_annotations: [] };

function settings(input: Readonly<{ counts?: RoleRotationCounts; rotation?: boolean; panel?: readonly DiscoveredPanelMember[]; order?: string[]; failCounts?: boolean }>): RunCreationSettings {
  return {
    strangerSampleRate: 0, registerVersion: 1, batteryVersion: "battery:rotation", settlementWatchHandle: "watch:rotation",
    resolveDiscoveredPanel: async () => input.panel ?? PANEL,
    resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) => {
      input.order?.push("basis");
      return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned });
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
    ...(input.rotation === true ? { roleRotation: { readCounts: async () => {
      input.order?.push("counts");
      if (input.failCounts === true) throw new Error("database gone");
      return input.counts ?? {};
    } } } : {})
  };
}

describe("role rotation at admission", () => {
  it("ON with two makers: the pick is the rule's, from this ask's seed and the counts, made before the envelope basis", async () => {
    const order: string[] = [];
    const counts: RoleRotationCounts = { ANSWER_WRITER: { "gpt-5.6-luna": 4 } };
    const admitted = await evaluateAskAdmission(settings({ rotation: true, counts, order }), ASK);
    expect(admitted.roleRotation).toEqual(pickRotatedRoles({ panel: PANEL, counts, seed: roleRotationSeed(ASK) }));
    expect(admitted.roleRotation!.answerWriter.modelId).toBe("claude-sonnet-5");
    expect(order).toEqual(["counts", "basis"]);
  });
  it("absent setting: no counts read, no pick", async () => {
    const order: string[] = [];
    const admitted = await evaluateAskAdmission(settings({ order }), ASK);
    expect("roleRotation" in admitted).toBe(false);
    expect(order).toEqual(["basis"]);
  });
  it("a one-maker panel keeps today's roles and reads no counts", async () => {
    const order: string[] = [];
    const oneMaker = [member("development:codex-cli", "OpenAI", "gpt-5.6-luna"), member("development:codex-premium-cli", "OpenAI", "claude-sonnet-5")];
    const admitted = await evaluateAskAdmission(settings({ rotation: true, panel: oneMaker, order }), ASK);
    expect("roleRotation" in admitted).toBe(false);
    expect(order).toEqual(["basis"]);
  });
  it("counts that cannot be read refuse the ask as not available right now, never admit it unpinned", async () => {
    await expect(evaluateAskAdmission(settings({ rotation: true, failCounts: true }), ASK))
      .rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
  });
});
```

(The one-maker panel uses the free roster's two model ids under one maker on purpose, so the roster filter still finds both.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/role-rotation-admission.test.ts`
Expected: FAIL (`roleRotation` unknown; no pick).

- [ ] **Step 3: Implement admission**

In `RunCreationSettings` (after `modelPicker`):

```ts
  /**
   * Role rotation (spec 2026-10-11): present only when the register's answerRoleRotationPolicy row is ON.
   * Asked only for a debate with two or more makers and no scorecard assignment.
   */
  readonly roleRotation?: Readonly<{ readCounts: () => Promise<RoleRotationCounts> }>;
```

In `PlannedAskAdmission` (after `modelAssignment`):

```ts
  /** Role rotation: the four roles picked for this debate, pinned by submit before the work is queued. */
  readonly roleRotation?: RotatedRoles;
```

In `evaluateAskAdmission`, on the non-scorecard path, right after the `assertMakerAdmission` try/catch and before `let envelopeBasis`:

```ts
  // Role rotation (spec 2026-10-11 Part 4): picked here, before the estimate, from this debate's own panel.
  let roleRotation: RotatedRoles | null = null;
  if (settings.roleRotation !== undefined && new Set(filteredPanel.map((entry) => entry.maker)).size >= 2) {
    let counts: RoleRotationCounts;
    try {
      counts = await settings.roleRotation.readCounts();
    } catch {
      return markAskRefusal(new TypedDomainError("ASK_MODEL_CANDIDATE_UNAVAILABLE",
        "A model this debate needs cannot be reached right now. Please try again in a minute."));
    }
    roleRotation = pickRotatedRoles({ panel: filteredPanel, counts, seed: roleRotationSeed(ask) });
  }
```

(`markAskRefusal`, `apps/api/src/index.ts:1866`, returns `never`: it wraps a `TypedDomainError` in an `AskRefusal` carrying the same code.)

Pass `rotated: roleRotation !== null` into the `assertPreviewBudgetAdmits` input, and add to the returned object `...(roleRotation === null ? {} : { roleRotation })`.

Imports at the top of `apps/api/src/index.ts`: add `pickRotatedRoles, roleRotationSeed, type RoleRotationCounts, type RotatedRoles` to the existing `@debateai/scorecard` import, and `insertRunRoleRotation` to the existing `@debateai/db` import.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/role-rotation-admission.test.ts tests/unit/model-picker-admission.test.ts tests/unit/tiers-s02-admission.test.ts`
Expected: PASS (the two existing suites prove the absent path is unchanged).

- [ ] **Step 5: Write the failing submit test**

Create `tests/unit/role-rotation-submit.test.ts` by copying `tests/unit/s1-scorecard-merge-submit.test.ts` lines 1-205 (its whole harness: mocks, constants, fake pool, room double, application builder) and then:

1. In its `vi.mock("@debateai/db", ...)` factory, keep the `insertRunRoleAssignment` double and add:

```ts
  insertRunRoleRotation: async (_executor: unknown, input: unknown) => {
    pinning.order.push("insertRunRoleRotation");
    pinning.rotations.push(input);
    if (pinning.rotationReject !== null) throw pinning.rotationReject;
  },
```

with `pinning` hoisted as `{ order: [] as string[], reject: null as Error | null, rotations: [] as unknown[], rotationReject: null as Error | null }`.

2. Make the settings builder in the copied harness take the free panel of two makers and `roleRotation: { readCounts: async () => ({}) }`, and make the picker double return no scorecard (the scorecard state `ABSENT`), so admission takes the rotation path.

3. Replace the copied `describe` blocks with:

```ts
describe("role rotation: the pin is a setup step before anything is queued", () => {
  it("pins the four roles with the new run's id, after the run exists and before the memory question and the queue", async () => {
    await expect(submit()).resolves.toMatchObject({ run_ref: RUN_ID, status: "QUEUED" });
    expect(pinning.rotations).toEqual([expect.objectContaining({ runId: RUN_ID, rule: "LEAST_SHARE_SEEDED_TIE_V1" })]);
    expect(pinning.order.indexOf("insertRunRoleRotation")).toBeLessThan(pinning.order.indexOf("recordMemoryQuestion"));
    expect(pinning.order.indexOf("insertRunRoleRotation")).toBeLessThan(pinning.order.indexOf("enqueue"));
  });
  it("records the run FAILED as ROLE_ROTATION when the pin fails, and queues nothing", async () => {
    const failure = new Error("pin refused");
    pinning.rotationReject = failure;
    await expect(submit()).rejects.toBe(failure);
    expect(failedReasons()).toContain("RUN_SETUP_FAILED:ROLE_ROTATION");
    expect(pinning.order).not.toContain("enqueue");
  });
  it("with a room (START and WAIT alike) pins before the place in line; a WAIT keeps that pin", async () => {
    useRoom("WAIT");
    await submit();
    expect(pinning.rotations).toHaveLength(1);
    expect(pinning.order.indexOf("insertRunRoleRotation")).toBeLessThan(pinning.order.indexOf("joinWaitingLine"));
  });
});
```

`failedReasons`, `useRoom`, `recordMemoryQuestion`, `enqueue` and `joinWaitingLine` are the names the copied harness already records in `pinning.order` and its failure list; if the harness names them differently, use its names (read lines 40-205 once). Add an `afterEach` that resets `pinning` the way the copied file does.

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/role-rotation-submit.test.ts`
Expected: FAIL (no `insertRunRoleRotation` call).

- [ ] **Step 7: Implement the pin on both submit paths**

`RunSetupStep`: add `| "ROLE_ROTATION"`.

In `submit`, directly after the `if (modelAssignment !== undefined) { ... }` block (~4590), with `roleRotation` destructured from the admission the same way `modelAssignment` is:

```ts
      // Role rotation (spec 2026-10-11): the four roles are pinned beside the run (core.run_role_rotation,
      // append-only) BEFORE its work is queued, so no runner can claim a rotated debate without them. A failed
      // pin records the run FAILED (RUN_SETUP_FAILED:ROLE_ROTATION). No rotation: nothing is pinned.
      if (roleRotation !== undefined) {
        setupStep = "ROLE_ROTATION";
        await insertRunRoleRotation(this.pool, { runId, ...roleRotation });
        setupStep = "MEMORY_QUESTION";
      }
```

In `#submitWithRoom`, directly after the `if (evaluated.modelAssignment !== undefined) { ... }` block (~4831), using `evaluated` (the admission the run was created from; a WAIT keeps it):

```ts
          if (evaluated.roleRotation !== undefined) {
            setupStep = "ROLE_ROTATION";
            await insertRunRoleRotation(this.pool, { runId, ...evaluated.roleRotation });
          }
```

`apps/api/src/main.ts`: before `const application = new PostgresAskApplication(`, add

```ts
// Role rotation (spec 2026-10-11): the optional row; ABSENT/OFF is today's engine, a malformed row refuses the boot.
const answerRoleRotation = await boot.run("answer-role-rotation-policy", () => readAnswerRoleRotationPolicy(pool, environment.REGISTER_VERSION));
```

and in the settings object, next to `modelPicker,`:

```ts
  ...(answerRoleRotation.state === "ON" ? { roleRotation: { readCounts: () => readRoleRotationCounts(pool) } } : {}),
```

(import `readAnswerRoleRotationPolicy` from `@debateai/register` and `readRoleRotationCounts` from `@debateai/db`). The boot stage must use `boot.run`; a bare await fails `tests/unit/dl7-f7-boot-custody.test.ts`.

- [ ] **Step 8: Run to verify everything passes**

Run: `pnpm exec vitest run tests/unit/role-rotation-submit.test.ts tests/unit/s1-scorecard-merge-submit.test.ts tests/unit/dl7-f7-boot-custody.test.ts`
then `LOCKED pnpm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/main.ts tests/unit/role-rotation-admission.test.ts tests/unit/role-rotation-submit.test.ts
git commit -m "feat(api): pick the four roles at admission and pin them before the debate is queued

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The runner uses the pin

**Files:**
- Modify: `apps/runner/src/index.ts`: after the role-assignment read (~4501-4528); `synthesisRolePolicy` (~4744); `synthesisRoles` (7087); the story's `roleMakers` (~8128-8135)
- Test: `tests/integration/database.test.ts` (extend `executeSeatScenario` ~9842 with an optional rotation pin; a new describe after the seat scenarios)

**Interfaces:**
- Consumes: `readRunRoleRotation` (Task 4).
- Produces: runner behaviour only. New terminal reason `RUN_ROLE_ROTATION_INVALID`.

- [ ] **Step 1: Write the failing integration tests**

In `tests/integration/database.test.ts`:

1. Make `executeSeatScenario`'s `assignment` optional and add `readonly rotation?: RunRoleRotationInputWithoutRun` where `type RunRoleRotationInputWithoutRun = Omit<RunRoleRotationInput, "runId">` (import `insertRunRoleRotation, type RunRoleRotationInput` from `@debateai/db`). Replace `await pinRoleAssignment(runId, input.assignment);` with:

```ts
    if (input.assignment !== undefined) await pinRoleAssignment(runId, input.assignment);
    if (input.rotation !== undefined) await insertRunRoleRotation(database.pool, { runId, ...input.rotation });
```

2. Add, after the last seat-scenario describe:

```ts
describe("role rotation (spec 2026-10-11 Part 6): a pinned debate's roles come from its pin", () => {
  const pick = (route: SeatRoute) => ({ providerRef: SEAT_ROUTES[route].providerRef, modelId: SEAT_ROUTES[route].model, maker: SEAT_ROUTES[route].maker });
  const ROTATION = Object.freeze({ rule: "LEAST_SHARE_SEEDED_TIE_V1" as const,
    answerWriter: pick("secondary"), answerChecker: pick("third"), storyteller: pick("third"), storyChecker: pick("primary") });

  it("the secondary writes the answer and the third checks it, recorded as planned (no false fallback)", async () => {
    const scenario = await executeSeatScenario({ label: "rotation-answer", rotation: ROTATION, ...fullDebateDoubles("rotation-answer") });
    const answerId = answerIdOf(scenario);
    const makers = await servedRoundMakers(answerId);
    expect(makers.at(-1)).toMatchObject({ writer: SEAT_ROUTES.secondary.providerRef, checker: SEAT_ROUTES.third.providerRef });
    const disclosure = await disclosureRowOf(answerId);
    expect(disclosure).toMatchObject({ planned_writer_ref: SEAT_ROUTES.secondary.providerRef, served_writer_ref: SEAT_ROUTES.secondary.providerRef });
  });

  it("the story is written by the pinned storyteller and checked by the pinned story checker", async () => {
    const scenario = await executeSeatScenario({ label: "rotation-story", rotation: ROTATION, ...fullDebateDoubles("rotation-story"),
      storyAnswers: { third: { storyteller: seatHarnessStory(), checker: evaluatorSatisfied() }, primary: { storyteller: seatHarnessStory(), checker: evaluatorSatisfied() } } });
    const story = (await database.pool.query(`SELECT storyteller_lineage, checker_lineage FROM serve.answer_story WHERE run_id=$1`, [scenario.runId])).rows[0];
    // MakerLineage (packages/contract/src/lineage.ts:10-15): { maker, model_id, transport, provider_ref }.
    expect(story.storyteller_lineage.provider_ref).toBe(SEAT_ROUTES.third.providerRef);
    expect(story.checker_lineage.provider_ref).toBe(SEAT_ROUTES.primary.providerRef);
  });

  it("a pinned writer absent at claim refuses the run with J24, terminally", async () => {
    await expect(executeSeatScenario({ label: "rotation-absent", rotation: { ...ROTATION, answerWriter: pick("secondary") },
      ...fullDebateDoubles("rotation-absent"), settings: { claimTimeProbe: absentFor(SEAT_ROUTES.secondary.providerRef) } }))
      .rejects.toMatchObject({ code: "SYNTHESIS_ROLE_PROVIDER_ABSENT_AT_CLAIM" });
  });

  it("a run with both a scorecard assignment and a rotation pin is refused (RUN_ROLE_ROTATION_INVALID)", async () => {
    await expect(executeSeatScenario({ label: "rotation-both", assignment: runnerUpAssignment(), rotation: ROTATION, ...fullDebateDoubles("rotation-both") }))
      .rejects.toMatchObject({ code: "RUN_ROLE_ROTATION_INVALID" });
  });

  it("a run without a pin is today's run (the sealed refs serve)", async () => {
    const scenario = await executeSeatScenario({ label: "rotation-none", ...fullDebateDoubles("rotation-none") });
    const makers = await servedRoundMakers(answerIdOf(scenario));
    expect(makers.at(-1)!.writer).toBe(runnerSettings().synthesisRolePolicy.synthesizerRoleRef);
  });
});
```

`fullDebateDoubles(label)` returns the `{ primary, secondary, third }` double responses a three-route debate needs; build it from the existing helpers the seat scenarios already use (`fullDebate(label)` at ~5733 gives judgements and reviews; follow the first `executeSeatScenario` call site in the file for the exact shape and copy it into this helper). `absentFor(ref)` returns a `claimTimeProbe` that answers `{ state: "ABSENT", modelId: null, failureCode: "CLAIM_PROVIDER_ABSENT" }` for `ref` and HEALTHY with the member's model for every other member (the T9/J24 case at ~7560-7600 builds the same probe; copy it). `servedRoundMakers` (~5745) and `disclosureRowOf` (~5780) exist; read their return shapes and adjust the property names in the expectations to theirs (the expectations above use the obvious names). The runner settings' sealed refs must name the primary route for both roles (they do in `runnerSettings()`), so the rotated refs differ from the sealed ones and the test proves the pin is used.

- [ ] **Step 2: Run to verify it fails**

Run: `LOCKED pnpm exec vitest run tests/integration/database.test.ts -t "role rotation"`
Expected: FAIL (the sealed refs serve; no `RUN_ROLE_ROTATION_INVALID`).

- [ ] **Step 3: Implement**

In `apps/runner/src/index.ts`, import `readRunRoleRotation, type RunRoleRotationRecord` from `@debateai/db`.

Right after the `if (pinnedRoleAssignment !== null) { ... }` block (~4528):

```ts
    /**
     * Role rotation (spec 2026-10-11 Part 6): the four roles admission picked, pinned beside the run.
     * A rotated run swaps the two sealed answer-role refs for the pinned ones for THIS run only; the
     * legacy seat book and every downstream path stay as they are. A run cannot carry both pins.
     */
    let rotationPin: RunRoleRotationRecord | null;
    try {
      rotationPin = await readRunRoleRotation(this.pool, run.runId);
      if (rotationPin !== null && roleAssignment !== null) throw new TypeError("BOTH_PINS");
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      await this.#work.recordTerminalFailure({ runId: run.runId, workItemId: claimed.workItemId, reason: "RUN_ROLE_ROTATION_INVALID" });
      throw new TypedDomainError("RUN_ROLE_ROTATION_INVALID", "The run's pinned role rotation cannot seat a debate");
    }
```

Replace `const synthesisRolePolicy = this.settings.synthesisRolePolicy;` (~4744) with:

```ts
    const synthesisRolePolicy = this.settings.synthesisRolePolicy === undefined || rotationPin === null
      ? this.settings.synthesisRolePolicy
      : Object.freeze({
        ...this.settings.synthesisRolePolicy,
        synthesizerRoleRef: rotationPin.answerWriter.providerRef,
        evaluatorRoleRef: rotationPin.answerChecker.providerRef
      });
```

(The pinned refs are panel members, so the `sealedRefRoles` loop skips their probes by `panelRefs.has(roleRef)`, and the J24 refusal loop below refuses a pinned member that is not claim-eligible, with today's event.)

Replace `const synthesisRoles = this.settings.synthesisRolePolicy;` (7087) with `const synthesisRoles = synthesisRolePolicy;` (the same `execute` method; confirm the 4744 const is in scope at 7087 by its indentation, else hoist a `let runSynthesisRolePolicy` next to `rotationPin`).

At the story's `roleMakers:` (~8128), wrap the existing expression:

```ts
              roleMakers: rotationPin !== null
                ? {
                    // Role rotation: the pinned story pair, looked up among this run's claim-eligible members.
                    // A pinned member not claim-eligible reads null, which keeps the register's story ref (writer.ts:457-459).
                    storyteller: storyRoleMakerOf(rotationPin.storyteller.providerRef),
                    checker: storyRoleMakerOf(rotationPin.storyChecker.providerRef)
                  }
                : seatBook.assigned && (seatBook.answerWriter !== null || seatBook.answerChecker !== null)
                  ? { /* the existing object, unchanged */ }
                  : undefined,
```

with, just above the story call:

```ts
            const storyRoleMakerOf = (providerRef: string) => {
              const maker = synthesisMakers.find((candidate) => candidate.providerRef === providerRef);
              return maker === undefined ? null : { provider: maker.provider, providerRef: maker.providerRef };
            };
```

(Spec Part 6: a pinned story member that is not claim-eligible reads null, and the story package then uses the register's story ref, as a FALLBACK seat does today.)

- [ ] **Step 4: Run to verify it passes**

Run: `LOCKED pnpm exec vitest run tests/integration/database.test.ts -t "role rotation"`
then `LOCKED pnpm exec vitest run tests/integration/database.test.ts -t "J24|A15|seat"`
then `LOCKED pnpm exec vitest run tests/architecture/t09-synthesis-entrypoint.test.ts tests/architecture/story-runner-wiring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/runner/src/index.ts tests/integration/database.test.ts
git commit -m "feat(runner): a rotated debate's writer, checker and story pair come from its pin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The story records whether its writer needed the repair try

**Files:**
- Modify: `packages/providers/src/index.ts` (`ProviderCallResult` ~210-222; the attempt loop ~1631-1662 and ~2075-2096; the success return ~2137-2147)
- Modify: `packages/story/src/repository.ts` (`StoryRecordInput` ~34-46; `insert` ~165-211; the reader ~300-312)
- Modify: `packages/story/src/writer.ts` (`failedRecord` ~284-296; `recordFromOutcome` ~318-370; `writeStory` in `#compose` ~527-556)
- Test: `tests/unit/provider-preview-story-repair.test.ts`, `tests/unit/story-writer.test.ts`, `tests/integration/story-repository.test.ts`

**Interfaces:**
- Produces: `ProviderCallResult.repairAttempts?: number` (repair packets sent before the accepted reply; absent from wrappers that build their own result means 0); `StoryRecordInput.storytellerRepairs: number | null`; column written.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/provider-preview-story-repair.test.ts`, inside "native gateway repairs a rejected story citation using only its schema locator", after `expect(result.content).toBe(accepted);` add:

```ts
    expect(result.repairAttempts).toBe(1);
```

and add a new case to the same describe:

```ts
  it("a story accepted on the first try reports no repair", async () => {
    const { gateway } = nativeHarness([story()]);
    const result = await gateway.call({ ...storyRequest(), costEnvelope: {
      assertCallAllowed: () => undefined, recordCall: () => undefined, assertUsageReported: () => undefined } });
    expect(result.repairAttempts).toBe(0);
  });
```

In `tests/unit/story-writer.test.ts`, add a case to the describe that writes a READY story with stand-in gateways (find the existing READY case and copy its setup): make the storyteller double return `{ ...result, repairAttempts: 1 }` in round 1, then assert the record handed to the sink has `storytellerRepairs: 1`; and in the same file's existing READY case assert `storytellerRepairs: 0`; and in the pre-loop failure case (`failedRecord`, e.g. missing material) assert `storytellerRepairs: null`.

In `tests/integration/story-repository.test.ts`, in the insert/read round-trip case, insert with `storytellerRepairs: 2` and assert the read-back record has `storytellerRepairs: 2` and the column holds `2` (`SELECT storyteller_repairs FROM serve.answer_story WHERE story_id=$1`).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run tests/unit/provider-preview-story-repair.test.ts tests/unit/story-writer.test.ts`
Expected: FAIL (`repairAttempts` undefined; `storytellerRepairs` missing).

- [ ] **Step 3: Implement**

`ProviderCallResult`:

```ts
  /** Role rotation (spec 2026-10-11 Part 3): repair packets sent before the accepted reply (0: accepted as first asked). */
  readonly repairAttempts?: number;
```

In the gateway's call method, next to `let lengthFailures = 0;` add `let repairAttempts = 0;`; where the repair packet is adopted (`attemptPacket = repair;`) add `repairAttempts += 1;`; in the success return add `repairAttempts,`. (A length retry re-sends the original packet and is not a repair; it is not counted.)

`StoryRecordInput` gains `readonly storytellerRepairs: number | null;`. `insert` writes it as the new last column (`storyteller_repairs`), and the reader maps `row.storyteller_repairs` (null stays null). `failedRecord` sets `storytellerRepairs: null`.

In `#compose`, before `runStoryLoop`: `const repairedRounds = new Set<number>();`; in `writeStory`, after `callStoryRole`: `if ((result.repairAttempts ?? 0) > 0) repairedRounds.add(round);`. Pass `repairedRounds.size` to `recordFromOutcome` (new last parameter `storytellerRepairs: number`) and put `storytellerRepairs` in its `shared` object.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run tests/unit/provider-preview-story-repair.test.ts tests/unit/story-writer.test.ts tests/unit/provider-story-json-mode.test.ts`
then `LOCKED pnpm exec vitest run tests/integration/story-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/providers/src/index.ts packages/story/src/repository.ts packages/story/src/writer.ts tests/unit/provider-preview-story-repair.test.ts tests/unit/story-writer.test.ts tests/integration/story-repository.test.ts
git commit -m "feat(story): record how many rounds needed the storyteller's format repair

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Publishing the row (preview kit v2 and the hosted file)

**Files:**
- Modify: `deploy/preview-auth-dev/v1/publish-register-v2.ts` (`PREVIEW_SOURCE_ROW_KEYS_V2` :62-75; the comment "66 at dev b75e4c294" :58-61; `buildPreviewSourceRowsV2` :119-121)
- Modify: `apps/runner/src/hosted-register-publish.ts` (`TOP_LEVEL_KEYS` :185-197; `HostedRegisterFile` ~:379; `parseHostedRegisterFile` ~:444; validation ~:764; `operatorRows.set` ~:836; `verifyHostedRegisterBootReadiness` ~:1219)
- Modify: `deploy/vps/register/README.md` (members table) and `deploy/vps/README.md` §11 (must-carry table and an "Upgrading to role rotation" paragraph)
- Test: `tests/unit/preview-register-publish-v2.test.ts` (:61-62 and the `differing` line), `tests/integration/preview-register-publish-v2.test.ts`, `tests/integration/hosted-register-publish.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/preview-register-publish-v2.test.ts`, in "builds exactly the reviewed key list": change `expect(rows).toHaveLength(66);` to `67`, change the `differing` expectation to `[...MULTI_MODEL_KEYS, "answerRoleRotationPolicy"]` (in row order; if the file sorts it, sort it), and add:

```ts
    expect(value("answerRoleRotationPolicy")).toEqual({ kind: "ANSWER_ROLE_ROTATION_POLICY", enabled: true, rule: "LEAST_SHARE_SEEDED_TIE_V1" });
```

`tests/integration/hosted-register-publish.test.ts`: add a case that publishes a hosted file with `answerRoleRotation: { enabled: true }` and reads `readAnswerRoleRotationPolicy(pool, version)` as `{ state: "ON", ... }`; a file without the member publishes no such row (`ABSENT`); a file with `answerRoleRotation: { enabled: "yes" }` is refused before anything is sealed (`HOSTED_REGISTER_FILE_INVALID` or the file's existing refusal code for a malformed member: use the one the `taxAuthorities` cases expect). Follow the existing `taxAuthorities` cases in that file for the publish harness.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts`
Expected: FAIL (66 rows).

- [ ] **Step 3: Implement**

`publish-register-v2.ts`: add `'answerRoleRotationPolicy'` to `PREVIEW_SOURCE_ROW_KEYS_V2` (alphabetical: after `'admissionPolicy'`), update the comment to "67 at dev 5109a5501 plus role rotation", and append to the rows in `buildPreviewSourceRowsV2`:

```ts
    // Role rotation (spec 2026-10-11): the preview rotates the four roles over each debate's own panel.
    answerRoleRotationPolicyRow(true, 'docs/superpowers/specs/2026-10-11-role-rotation-design.md; owner 2026-10-10'),
```

(import `answerRoleRotationPolicyRow` from `@debateai/register`.) The v1 kit `publish-register.ts` is not touched.

`hosted-register-publish.ts`: add `"answerRoleRotation"` to `TOP_LEVEL_KEYS` with the comment `// Role rotation (spec 2026-10-11): OPTIONAL. Left out, no row is sealed and the engine keeps its fixed roles.`; add `answerRoleRotation?: unknown;` to `HostedRegisterFile`; copy it in `parseHostedRegisterFile` the way `taxAuthorities` is copied; validate:

```ts
  if (file.answerRoleRotation !== undefined) {
    const member = file.answerRoleRotation;
    if (typeof member !== "object" || member === null || Array.isArray(member) || Object.keys(member).join() !== "enabled"
      || typeof (member as { enabled: unknown }).enabled !== "boolean") refuse("HOSTED_REGISTER_ROLE_ROTATION_INVALID");
  }
```

(`refuse` is the file's existing refusal helper; use whatever the `taxAuthorities` validation uses.) Seal it:

```ts
  if (file.answerRoleRotation !== undefined) {
    const row = answerRoleRotationPolicyRow((file.answerRoleRotation as { enabled: boolean }).enabled, file.sourceRef);
    operatorRows.set(row.rowKey, Object.freeze({ rowKey: row.rowKey, valueJsonText: row.valueJsonText, sourceRef: row.sourceRef }));
  }
```

In `verifyHostedRegisterBootReadiness`, after `await readPublicationCheckPolicy(pool, version);`:

```ts
  // Role rotation: optional (ABSENT keeps the fixed roles), but a malformed row would refuse the API's boot.
  await readAnswerRoleRotationPolicy(pool, version);
```

Docs: one row in the members table of `deploy/vps/register/README.md` ("`answerRoleRotation` | optional | `{ "enabled": true }` turns per-debate role rotation on; left out, the fixed roles stay"), and in `deploy/vps/README.md` §11 an "Upgrading to role rotation" paragraph: apply migration 0114 first, then publish with the member, repin `REGISTER_VERSION`, restart the API and the runner; rollback = publish without the member.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm exec vitest run tests/unit/preview-register-publish-v2.test.ts tests/unit/preview-auth-dev-snapshot.test.ts`
then `LOCKED pnpm exec vitest run tests/integration/preview-register-publish-v2.test.ts`
then `LOCKED pnpm exec vitest run tests/integration/hosted-register-publish.test.ts`
Expected: PASS (`preview-auth-dev-snapshot` still pins v1's 66: unchanged).

- [ ] **Step 5: Commit**

```bash
git add deploy/preview-auth-dev/v1/publish-register-v2.ts apps/runner/src/hosted-register-publish.ts deploy/vps/register/README.md deploy/vps/README.md tests/unit/preview-register-publish-v2.test.ts tests/integration/preview-register-publish-v2.test.ts tests/integration/hosted-register-publish.test.ts
git commit -m "feat(register): publish answerRoleRotationPolicy from the preview kit v2 and the hosted file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final guards, sync and push

**Files:** none new (fixes only, if a guard is red).

- [ ] **Step 1: Merge the latest dev** (plain merge, never rebase)

```bash
git fetch origin dev
git merge --no-edit origin/dev
git ls-tree --name-only origin/dev migrations/ | grep -E '^migrations/011[4-9]'
```

If `origin/dev` now has a `0114_*.sql`, renumber this step to the next free number: rename the SQL, manifest and loader, update `previous` to dev's newest step, `STEPS`, the README paragraph and the chain tests; recompute the digests.

- [ ] **Step 2: Typecheck and the guarding suites** (one at a time)

```
LOCKED pnpm run typecheck
LOCKED pnpm exec vitest run tests/architecture
pnpm exec vitest run tests/unit/role-rotation-pick.test.ts tests/unit/answer-role-rotation-policy.test.ts tests/unit/preview-budget-estimate.test.ts
pnpm exec vitest run tests/unit/role-rotation-admission.test.ts tests/unit/role-rotation-submit.test.ts tests/unit/preview-register-publish-v2.test.ts
pnpm exec vitest run tests/unit/preview-anthropic-gate.test.ts tests/unit/model-picker-admission.test.ts tests/unit/s1-scorecard-merge-submit.test.ts
LOCKED pnpm exec vitest run tests/integration/role-rotation-0114.test.ts
LOCKED pnpm exec vitest run tests/integration/preview-estimate-database.test.ts
LOCKED pnpm exec vitest run tests/integration/database.test.ts -t "role rotation|J24|A15"
```

Expected: all green. `tests/integration/preview-estimate-database.test.ts` proves the new `rotated` column of `PREVIEW_UNFINISHED_RUNS_SQL` runs on a real database.

- [ ] **Step 3: Secret-line check and push**

```bash
sh "$RULES_DIR/secret-line-check.sh" origin/dev
git push origin feat/2026-10-11-role-rotation
```

(`RULES_DIR` is the folder holding the rules file and `secret-line-check.sh`.) Report the branch and head commit; do not open a PR.

---

## Self-review (done while writing)

- **Spec coverage:** Part 1 (row, preview kit, hosted member) = Tasks 2, 9; Part 2 (rule, seed) = Task 1; Part 3 (table, story column) = Tasks 3, 4, 8; Part 4 (admission, both submit paths, scorecard hand-over: the picker path returns before the rotation code) = Task 6; Part 5 (estimate, unfinished holds, room table) = Task 5; Part 6 (runner, J24, story pair, no pin = today) = Task 7; Part 7 (page shows actual models: the disclosure case in Task 7; no new user text); error table rows = Tasks 2, 6, 7; deploying = Task 9 docs.
- **Placeholder scan:** the manifest's two digests are computed by the step's command (they cannot be known before the SQL is final); every other step carries its code.
- **Type consistency:** `RotatedRoles` (Task 1) spreads into `RunRoleRotationInput` (Task 4) with `runId`; `RoleRotationCounts` (Task 1) is what `readRoleRotationCounts` (Task 4) returns and `roleRotation.readCounts` (Task 6) yields; `rotated` is the one flag name in Tasks 5 and 6.
- **Review Focus:** each of the five lines has its test in the named task.
