import { describe, expect, it } from "vitest";
import {
  AskRequestSchema, DepthParamsSchema, ReadingLevelSchema, debateShapeSettingsOf, readingLevelOf, type AskRequest, type ContractClient
} from "@debateai/contract";
import { READING_LEVELS } from "@debateai/kernel";
import { debateShapePolicyStartValues, lengthGuidancePolicyStartValues, normaliseDepthParamsForShape } from "@debateai/register";
import { normaliseAskForDebateShape } from "../../apps/api/src/debate-shape-ask.js";
import { keepsEveryStoredChoice } from "../../apps/api/src/readmission.js";
import { createDebate } from "../../apps/ui/lib/api.js";

/*
 * V4 reading level reaches the writers (owner ruling N6, 2026-10-29): the level rides with the ask as
 * `depth_params.readingLevel`, the way `answerLength` does — validated by the contract, kept by the API's normaliser in
 * every branch, stored with the run's depth_params (jsonb, no migration) and read back by the runner. An ask without it is
 * normalised and stored exactly as today.
 */

const SHAPE = debateShapePolicyStartValues();
const LENGTH = lengthGuidancePolicyStartValues();

const ASK: AskRequest = Object.freeze({
  question_line: "Should the city fund the tram?",
  risk_tier: "standard",
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "personal",
  as_of: "2026-10-29T09:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
});

describe("the contract carries the reading level", () => {
  it("accepts each of the three levels in depth_params, and nothing else", () => {
    expect(ReadingLevelSchema.options).toEqual([...READING_LEVELS]);
    for (const readingLevel of READING_LEVELS) {
      expect(DepthParamsSchema.parse({ depth: 2, readingLevel })).toEqual({ depth: 2, readingLevel });
      expect(AskRequestSchema.safeParse({ ...ASK, depth_params: { depth: 1, readingLevel } }).success).toBe(true);
    }
    for (const readingLevel of ["Plain", "", "basic", 1, null]) {
      expect(DepthParamsSchema.safeParse({ depth: 2, readingLevel }).success, String(readingLevel)).toBe(false);
      expect(AskRequestSchema.safeParse({ ...ASK, depth_params: { depth: 1, readingLevel } }).success).toBe(false);
    }
    // Only depth_params carries it: a top-level member is refused by the strict ask.
    expect(AskRequestSchema.safeParse({ ...ASK, reading_level: "plain" }).success).toBe(false);
  });

  it("readingLevelOf: null when absent (every V3 ask, every older run), the level when stored, refused when invalid", () => {
    expect(readingLevelOf({ depth: 1 })).toBeNull();
    expect(readingLevelOf({ depth: 1, readingLevel: undefined })).toBeNull();
    for (const level of READING_LEVELS) expect(readingLevelOf({ depth: 1, readingLevel: level })).toBe(level);
    expect(() => readingLevelOf({ depth: 1, readingLevel: "basic" })).toThrowError(new TypeError("DEPTH_PARAMS_SHAPE_INVALID:readingLevel"));
    // The shape settings ignore it.
    expect(debateShapeSettingsOf({ depth: 1, readingLevel: "expert" }))
      .toEqual({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
  });
});

describe("the API's normaliser keeps the level in every branch, and leaves an ask without it as today", () => {
  it("no row: { depth } stays the same object; { depth, readingLevel } keeps both, the shape members still dropped", () => {
    const depthOnly = { depth: 1 };
    expect(normaliseDepthParamsForShape(depthOnly, null, "free")).toBe(depthOnly);
    const leveled = { depth: 1, readingLevel: "plain" as const };
    expect(normaliseDepthParamsForShape(leveled, null, "free")).toBe(leveled);
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "detailed", scrutiny: "deep", readingLevel: "expert" },
      null, "free"))).toBe("{\"depth\":2,\"readingLevel\":\"expert\"}");
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "detailed", scrutiny: "deep" }, null, "free")))
      .toBe("{\"depth\":2}");
  });

  it("the length row alone, and the shape row: the level rides last; without it, today's members exactly", () => {
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 1, readingLevel: "background" }, null, "free", LENGTH)))
      .toBe("{\"depth\":1,\"answerLength\":\"standard\",\"readingLevel\":\"background\"}");
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 1 }, null, "free", LENGTH))).toBe("{\"depth\":1,\"answerLength\":\"standard\"}");
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "short", readingLevel: "plain" }, SHAPE, "premium")))
      .toBe("{\"depth\":2,\"depthMode\":\"adaptive\",\"scrutiny\":\"standard\",\"answerLength\":\"short\",\"readingLevel\":\"plain\"}");
    expect(JSON.stringify(normaliseDepthParamsForShape({ depth: 2, answerLength: "short" }, SHAPE, "premium")))
      .toBe("{\"depth\":2,\"depthMode\":\"adaptive\",\"scrutiny\":\"standard\",\"answerLength\":\"short\"}");
  });

  it("the API's ask normaliser keeps it, and re-admission still finds every stored choice", () => {
    for (const [shape, length] of [[null, null], [null, LENGTH], [SHAPE, null], [SHAPE, LENGTH]] as const) {
      const asked = { ...ASK, depth_params: { depth: 1, readingLevel: "expert" as const } };
      const normalised = normaliseAskForDebateShape(asked, shape, "free", length);
      expect(normalised.depth_params.readingLevel).toBe("expert");
      expect(keepsEveryStoredChoice(normalised.depth_params, normaliseAskForDebateShape(normalised, shape, "free", length).depth_params))
        .toBe(true);
      expect(normaliseAskForDebateShape(ASK, shape, "free", length).depth_params).not.toHaveProperty("readingLevel");
    }
  });
});

describe("the site's ask builder sends it inside depth_params", () => {
  const CONFIG = {
    plan_tier: "free", risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "machine:plan-tier-free",
    composition_budget_tier: "low", depth: 1, decision_scope: "personal", as_of: "2026-10-29T09:00:00.000Z",
    steering_presets: [], steering_annotations: []
  };
  const capture = () => {
    const asks: AskRequest[] = [];
    const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:1", status: "QUEUED" }; } };
    return { client: client as unknown as ContractClient, asks };
  };

  it("reading_level becomes depth_params.readingLevel; absent sends today's depth_params; anything else is refused", async () => {
    for (const level of READING_LEVELS) {
      const { client, asks } = capture();
      await createDebate("Should the city fund the tram?", { ...CONFIG, reading_level: level }, "cookie-session", client);
      expect(asks[0]!.depth_params).toEqual({ depth: 1, readingLevel: level });
    }
    const { client, asks } = capture();
    await createDebate("Should the city fund the tram?", CONFIG, "cookie-session", client);
    expect(asks[0]!.depth_params).toEqual({ depth: 1 });
    await expect(createDebate("Should the city fund the tram?", { ...CONFIG, reading_level: "basic" }, "cookie-session", capture().client))
      .rejects.toThrowError("ASK_FIELD_REQUIRED: reading_level must be one of the offered choices when supplied.");
  });
});
