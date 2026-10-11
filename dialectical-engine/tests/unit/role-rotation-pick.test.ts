import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ROLE_ROTATION_RULE, ROTATED_ROLES, pickRotatedRoles, roleRotationSeed, rotationEligible,
  type RoleRotationCounts, type RotatedRole, type RotatedRoles, type RotationPanelMember
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

/** `picked` of `eligible`: how often a model got the role, out of the earlier rotated debates it could have. */
const pe = (picked: number, eligible: number) => ({ picked, eligible });
const tieKey = (seed: string, role: string, model: string) =>
  createHash("sha256").update(["ROLE_ROTATION_V1", seed, role, model].join("\u0000")).digest("hex");
const fourPicks = (picked: RotatedRoles) =>
  [picked.answerWriter, picked.answerChecker, picked.storyteller, picked.storyChecker];
/** Owner ruling R5: [opener, the members after it in panel order, then the members before it]. */
const turned = (panel: readonly RotationPanelMember[], openerModelId: string) => {
  const at = panel.findIndex((member) => member.model_id === openerModelId);
  return [...panel.slice(at), ...panel.slice(0, at)].map((member) => member.model_id);
};

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
  it("the picks carry the eligible model ids, deduplicated, in the debate's position order (opener first), frozen", () => {
    const picked = pickRotatedRoles({ panel: [GLM_A, GLM_B, DEEPSEEK, HAIKU], counts: {}, seed: SEED })!;
    expect(picked.eligibleModelIds).toEqual(turned([GLM_A, DEEPSEEK, HAIKU], picked.opener.modelId));
    expect(Object.isFrozen(picked.eligibleModelIds)).toBe(true);
    expect(Object.isFrozen(picked)).toBe(true);
    for (const pick of fourPicks(picked)) expect(picked.eligibleModelIds).toContain(pick.modelId);
  });
  it("names the four rotated roles in a fixed order", () => {
    expect(ROTATED_ROLES).toEqual(["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER", "STORY_CHECKER"]);
  });
});

describe("least share first, a different maker checks", () => {
  it("free panel: the writer is the one with the smaller share, the checker the other maker", () => {
    const counts: RoleRotationCounts = { ANSWER_WRITER: { [GLM_A.model_id]: pe(3, 5), [DEEPSEEK.model_id]: pe(2, 5) } };
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.rule).toBe(ROLE_ROTATION_RULE);
    expect(picked.answerWriter.modelId).toBe(DEEPSEEK.model_id);
    expect(picked.answerChecker.modelId).toBe(GLM_A.model_id);
  });
  it("five makers: each role goes to its own least-share model", () => {
    const counts: RoleRotationCounts = {
      ANSWER_WRITER: { [GLM_A.model_id]: pe(1, 4), [DEEPSEEK.model_id]: pe(1, 4), [MIMO.model_id]: pe(0, 4), [QWEN.model_id]: pe(1, 4), [HAIKU.model_id]: pe(1, 4) },
      ANSWER_CHECKER: { [GLM_A.model_id]: pe(0, 4), [DEEPSEEK.model_id]: pe(1, 4), [MIMO.model_id]: pe(1, 4), [QWEN.model_id]: pe(1, 4), [HAIKU.model_id]: pe(1, 4) },
      STORYTELLER: { [GLM_A.model_id]: pe(2, 4), [DEEPSEEK.model_id]: pe(2, 4), [MIMO.model_id]: pe(2, 4), [QWEN.model_id]: pe(2, 4), [HAIKU.model_id]: pe(1, 4) },
      STORY_CHECKER: { [GLM_A.model_id]: pe(1, 4), [DEEPSEEK.model_id]: pe(1, 4), [MIMO.model_id]: pe(1, 4), [QWEN.model_id]: pe(0, 4), [HAIKU.model_id]: pe(1, 4) }
    };
    const picked = pickRotatedRoles({ panel: FIVE, counts, seed: SEED })!;
    expect(fourPicks(picked).map((pick) => pick.modelId))
      .toEqual([MIMO.model_id, GLM_A.model_id, HAIKU.model_id, QWEN.model_id]);
  });
  it("the share wins over the raw number of picks", () => {
    // GLM wrote 3 of the 10 debates it could have (0.3); DeepSeek 2 of 4 (0.5): GLM writes although it has more picks.
    const counts: RoleRotationCounts = { ANSWER_WRITER: { [GLM_A.model_id]: pe(3, 10), [DEEPSEEK.model_id]: pe(2, 4) } };
    expect(pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!.answerWriter.modelId).toBe(GLM_A.model_id);
  });
  it("the checker skips the least-share model when it is the writer's maker", () => {
    const counts: RoleRotationCounts = {
      ANSWER_WRITER: { [DEEPSEEK.model_id]: pe(5, 5) }, ANSWER_CHECKER: { [GLM_A.model_id]: pe(0, 9), [DEEPSEEK.model_id]: pe(9, 9) }
    };
    // Writer: GLM (never eligible: share 0) beats DeepSeek (5/5). Checker: GLM has share 0 but is the writer's maker, so DeepSeek.
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.answerWriter.maker).toBe("Z.AI");
    expect(picked.answerChecker.maker).toBe("DeepSeek");
  });
  it("story roles are picked independently of the answer roles", () => {
    const counts: RoleRotationCounts = { ANSWER_WRITER: { [GLM_A.model_id]: pe(9, 9) }, STORYTELLER: { [DEEPSEEK.model_id]: pe(9, 9) } };
    const picked = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed: SEED })!;
    expect(picked.answerWriter.modelId).toBe(DEEPSEEK.model_id);
    expect(picked.storyteller.modelId).toBe(GLM_A.model_id);
    expect(picked.storyChecker.modelId).toBe(DEEPSEEK.model_id);
  });
});

describe("the share is compared exactly (cross-multiplied integers), then picked, then the tie key", () => {
  const writerOf = (counts: RoleRotationCounts, seed = SEED) =>
    pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts, seed })!.answerWriter.modelId;

  it("1/3 and 2/6 are the same share, so the fewer picks write", () => {
    expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(1, 3), [DEEPSEEK.model_id]: pe(2, 6) } })).toBe(GLM_A.model_id);
    expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(2, 6), [DEEPSEEK.model_id]: pe(1, 3) } })).toBe(DEEPSEEK.model_id);
  });
  it("equal share and equal picks fall to the tie key, whatever the eligible totals", () => {
    for (let i = 0; i < 40; i += 1) {
      const seed = roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: `tie ${String(i)}` });
      const byKey = tieKey(seed, "ANSWER_WRITER", GLM_A.model_id) < tieKey(seed, "ANSWER_WRITER", DEEPSEEK.model_id) ? GLM_A : DEEPSEEK;
      // Share 0 three ways: never eligible (absent), 0 of 0 and 0 of 7 are all the same share 0.
      expect(writerOf({}, seed)).toBe(byKey.model_id);
      expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(0, 0), [DEEPSEEK.model_id]: pe(0, 7) } }, seed)).toBe(byKey.model_id);
      // Share 1/2 with the same picks but different totals is impossible; same share and picks means same totals.
      expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(3, 6), [DEEPSEEK.model_id]: pe(3, 6) } }, seed)).toBe(byKey.model_id);
    }
  });
  it("a tiny exact difference in share decides before picked", () => {
    // 333333/1000000 is just under 1/3; that model writes although it has far more picks.
    expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(1, 3), [DEEPSEEK.model_id]: pe(333_333, 1_000_000) } })).toBe(DEEPSEEK.model_id);
    // Shares near the safe-integer edge still compare exactly: (M-2)/(M-1) < (M-1)/M.
    const M = Number.MAX_SAFE_INTEGER;
    expect(writerOf({ ANSWER_WRITER: { [GLM_A.model_id]: pe(M - 1, M), [DEEPSEEK.model_id]: pe(M - 2, M - 1) } })).toBe(DEEPSEEK.model_id);
  });
});

describe("ties: a fixed, repeatable shuffle from the seed, salted per role", () => {
  it("the same seed and counts always give the same picks, whatever the panel order", () => {
    const first = pickRotatedRoles({ panel: FIVE, counts: {}, seed: SEED })!;
    for (let i = 0; i < 5; i += 1) {
      const again = pickRotatedRoles({ panel: [...FIVE].reverse(), counts: {}, seed: SEED })!;
      expect(fourPicks(again)).toEqual(fourPicks(first));
      expect(again.opener).toEqual(first.opener);
      expect(again.eligibleModelIds).toEqual(turned([...FIVE].reverse(), first.opener.modelId));
    }
  });
  it("the tie key is sha256 of ROLE_ROTATION_V1, seed, role and model id, joined by NUL", () => {
    const expectedWriter = [...FIVE].sort((a, b) => tieKey(SEED, "ANSWER_WRITER", a.model_id) < tieKey(SEED, "ANSWER_WRITER", b.model_id) ? -1 : 1)[0]!;
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

describe("the opener: root position 0 rotates by the same least-share rule (owner rulings R2, R5, R6, R7)", () => {
  it("goes to the least OPENER share, and the pin's eligible list starts with it", () => {
    const counts: RoleRotationCounts = { OPENER: {
      [GLM_A.model_id]: pe(4, 4), [DEEPSEEK.model_id]: pe(1, 4), [MIMO.model_id]: pe(0, 4), [QWEN.model_id]: pe(1, 4), [HAIKU.model_id]: pe(1, 4)
    } };
    const picked = pickRotatedRoles({ panel: FIVE, counts, seed: SEED })!;
    expect(picked.opener).toEqual({ providerRef: MIMO.provider_ref, modelId: MIMO.model_id, maker: MIMO.maker });
    expect(picked.eligibleModelIds[0]).toBe(MIMO.model_id);
  });
  it("R5: the rest shift round in turn: the opener, the members after it in panel order, then those before it", () => {
    const counts: RoleRotationCounts = { OPENER: { [GLM_A.model_id]: pe(1, 1), [DEEPSEEK.model_id]: pe(1, 1), [QWEN.model_id]: pe(1, 1), [HAIKU.model_id]: pe(1, 1) } };
    const picked = pickRotatedRoles({ panel: FIVE, counts, seed: SEED })!;
    expect(picked.eligibleModelIds).toEqual([MIMO.model_id, QWEN.model_id, HAIKU.model_id, GLM_A.model_id, DEEPSEEK.model_id]);
    const first = pickRotatedRoles({ panel: FIVE, counts: { OPENER: { [GLM_A.model_id]: pe(0, 1), [DEEPSEEK.model_id]: pe(1, 1), [MIMO.model_id]: pe(1, 1), [QWEN.model_id]: pe(1, 1), [HAIKU.model_id]: pe(1, 1) } }, seed: SEED })!;
    expect(first.eligibleModelIds).toEqual(FIVE.map((member) => member.model_id));
  });
  it("equal shares fall to the seeded tie key, salted with the role OPENER", () => {
    for (let i = 0; i < 40; i += 1) {
      const seed = roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: `opener tie ${String(i)}` });
      const expected = [...FIVE].sort((a, b) => tieKey(seed, "OPENER", a.model_id) < tieKey(seed, "OPENER", b.model_id) ? -1 : 1)[0]!;
      const picked = pickRotatedRoles({ panel: FIVE, counts: {}, seed })!;
      expect(picked.opener.modelId).toBe(expected.model_id);
      expect(picked.eligibleModelIds).toEqual(turned(FIVE, expected.model_id));
    }
  });
  it("has no maker rule and is independent of the four roles", () => {
    const four: RoleRotationCounts = {
      ANSWER_WRITER: { [GLM_A.model_id]: pe(0, 3), [DEEPSEEK.model_id]: pe(3, 3) },
      ANSWER_CHECKER: { [DEEPSEEK.model_id]: pe(0, 3), [GLM_A.model_id]: pe(3, 3) },
      STORYTELLER: { [GLM_A.model_id]: pe(0, 3), [DEEPSEEK.model_id]: pe(3, 3) },
      STORY_CHECKER: { [DEEPSEEK.model_id]: pe(0, 3), [GLM_A.model_id]: pe(3, 3) }
    };
    const withOpener = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts: { ...four, OPENER: { [GLM_A.model_id]: pe(0, 3), [DEEPSEEK.model_id]: pe(3, 3) } }, seed: SEED })!;
    // The writer's own model opens too: no maker or role rule touches the opener.
    expect(withOpener.opener.modelId).toBe(GLM_A.model_id);
    expect(withOpener.answerWriter.modelId).toBe(GLM_A.model_id);
    const otherOpener = pickRotatedRoles({ panel: [GLM_A, DEEPSEEK], counts: { ...four, OPENER: { [GLM_A.model_id]: pe(3, 3), [DEEPSEEK.model_id]: pe(0, 3) } }, seed: SEED })!;
    expect(otherOpener.opener.modelId).toBe(DEEPSEEK.model_id);
    expect(fourPicks(otherOpener)).toEqual(fourPicks(withOpener));
    expect(otherOpener.eligibleModelIds).toEqual([DEEPSEEK.model_id, GLM_A.model_id]);
  });
  it("R6: older pins, written in panel order, count their first entry as the opener: GLM sits out until the others catch up", () => {
    type Tally = Record<string, Record<string, { picked: number; eligible: number }>>;
    // Six debates before the opener rotated: every pin in panel order, so GLM (first) opened each one.
    const tally: Tally = { OPENER: Object.fromEntries(FIVE.map((member) => [member.model_id, pe(member === GLM_A ? 6 : 0, 6)])) };
    const openers: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const picked = pickRotatedRoles({ panel: FIVE, counts: tally, seed: roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: `after ${String(i)}` }) })!;
      openers.push(picked.opener.modelId);
      // The counts query reads the opener off the pin's first entry (eligible_model_ids[1] in SQL).
      for (const modelId of picked.eligibleModelIds) {
        const entry = tally.OPENER![modelId]!;
        entry.eligible += 1;
        if (modelId === picked.eligibleModelIds[0]) entry.picked += 1;
      }
    }
    // GLM is at 6/6; each other model opens once before any opens twice, and GLM never opens in these eight.
    expect(new Set(openers.slice(0, 4)).size).toBe(4);
    expect(openers).not.toContain(GLM_A.model_id);
  });
});

describe("a model added later is picked once early, then rejoins in proportion", () => {
  type Tally = Record<string, Record<string, { picked: number; eligible: number }>>;
  /** Apply one debate's pin back into the counts, exactly as the counts query would read it next time. */
  const applyPin = (tally: Tally, picked: RotatedRoles) => {
    const byRole: Record<RotatedRole, string> = {
      ANSWER_WRITER: picked.answerWriter.modelId, ANSWER_CHECKER: picked.answerChecker.modelId,
      STORYTELLER: picked.storyteller.modelId, STORY_CHECKER: picked.storyChecker.modelId
    };
    for (const role of ROTATED_ROLES) {
      const row = (tally[role] ??= {});
      for (const modelId of picked.eligibleModelIds) {
        const entry = (row[modelId] ??= { picked: 0, eligible: 0 });
        entry.eligible += 1;
        if (byRole[role] === modelId) entry.picked += 1;
      }
    }
  };
  const debate = (panel: readonly RotationPanelMember[], tally: Tally, i: number) =>
    pickRotatedRoles({ panel, counts: tally, seed: roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: `debate ${String(i)}` }) })!;

  it("after 40 debates of four makers, a fifth writes once at once, then about one debate in five", () => {
    const tally: Tally = {};
    const FOUR = [GLM_A, DEEPSEEK, MIMO, QWEN];
    for (let i = 0; i < 40; i += 1) applyPin(tally, debate(FOUR, tally, i));
    // Balanced over the four: each wrote 10 of 40.
    for (const member of FOUR) expect(tally.ANSWER_WRITER![member.model_id]).toEqual({ picked: 10, eligible: 40 });

    const writers: string[] = [];
    const storytellers: string[] = [];
    for (let i = 40; i < 91; i += 1) {
      const picked = debate(FIVE, tally, i);
      writers.push(picked.answerWriter.modelId);
      storytellers.push(picked.storyteller.modelId);
      applyPin(tally, picked);
    }
    // Picked once early: the newcomer's share is 0 while every other model is at 1/4.
    expect(writers[0]).toBe(HAIKU.model_id);
    expect(storytellers[0]).toBe(HAIKU.model_id);
    // Not a burst: it does not take the next debate too, nor any two debates in a row.
    expect(writers[1]).not.toBe(HAIKU.model_id);
    for (let i = 1; i < writers.length; i += 1) {
      expect(writers[i] === HAIKU.model_id && writers[i - 1] === HAIKU.model_id).toBe(false);
      expect(storytellers[i] === HAIKU.model_id && storytellers[i - 1] === HAIKU.model_id).toBe(false);
    }
    // Over the next 50 debates it writes in proportion to its chances: about 1/5 (10), within a sane band.
    const later = (list: string[]) => list.slice(1).filter((modelId) => modelId === HAIKU.model_id).length;
    expect(later(writers)).toBeGreaterThanOrEqual(8);
    expect(later(writers)).toBeLessThanOrEqual(12);
    expect(later(storytellers)).toBeGreaterThanOrEqual(8);
    expect(later(storytellers)).toBeLessThanOrEqual(12);
  });
});

describe("laws for every input", () => {
  it("never leaves the panel, never pairs a checker with its writer's maker (randomized)", () => {
    let state = 7;
    const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 500; round += 1) {
      const panel = FIVE.filter(() => next() < 0.7);
      if (next() < 0.3) panel.push(GLM_B);
      const counts: Record<string, Record<string, { picked: number; eligible: number }>> = {};
      for (const role of ROTATED_ROLES) {
        counts[role] = Object.fromEntries(FIVE.map((member) => {
          const picked = Math.floor(next() * 4);
          return [member.model_id, pe(picked, picked + Math.floor(next() * 4))];
        }));
      }
      const seed = roleRotationSeed({ as_of: "2026-10-11T00:00:00.000Z", question_line: String(round) });
      const picked = pickRotatedRoles({ panel, counts, seed });
      const makers = new Set(panel.map((member) => member.maker));
      if (makers.size < 2) { expect(picked).toBeNull(); continue; }
      const refs = new Set(panel.map((member) => member.provider_ref));
      for (const pick of fourPicks(picked!)) {
        expect(refs.has(pick.providerRef)).toBe(true);
        expect(picked!.eligibleModelIds).toContain(pick.modelId);
      }
      expect(picked!.eligibleModelIds).toHaveLength(makers.size);
      expect(picked!.answerChecker.maker).not.toBe(picked!.answerWriter.maker);
      expect(picked!.storyChecker.maker).not.toBe(picked!.storyteller.maker);
    }
  });
  it("refuses a malformed seed or count", () => {
    const bad = (entry: unknown) => () =>
      pickRotatedRoles({ panel: FIVE, counts: { ANSWER_WRITER: { x: entry } } as unknown as RoleRotationCounts, seed: SEED });
    expect(() => pickRotatedRoles({ panel: FIVE, counts: {}, seed: "short" })).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(() => pickRotatedRoles({ panel: FIVE, counts: {}, seed: SEED.toUpperCase() })).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(-1, 2))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(1, -1))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(1.5, 3))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(1, 2.5))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(3, 2))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(1, 0))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(0, Number.MAX_SAFE_INTEGER + 1))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(Number.NaN, 1))).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(3)).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(null)).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad({ picked: 1 })).toThrow("ROLE_ROTATION_INPUT_INVALID");
    expect(bad(pe(0, 0))).not.toThrow();
  });
});
