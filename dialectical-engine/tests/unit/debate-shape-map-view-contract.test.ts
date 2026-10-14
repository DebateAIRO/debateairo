import { describe, expect, it } from "vitest";
import {
  DEBATE_MAP_VIEW_LIMITS, DebateMapViewSchema, PublicDebateSchema, contractInventory, type PublicDebate
} from "@debateai/contract";
import { MAP_LIMITS } from "@debateai/map";
import { CHECKED_TEXT_PATHS, extractCheckedText } from "../../apps/api/src/publication-check/material.js";

/** Debate shape P2c (spec 2026-10-12 §3.3 step 8, §3.4): what the debate page reads from the map. */

const VIEW = {
  positions: [{ node_id: "n-hybrid", answer: "Move gradually, with hybrid work." }],
  also_raised: ["Ask the school about a mid-year move."]
};

const BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Should we move to Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Move gradually." }], badges: [], residual_objections: [],
    reversal_point: "A cheaper flat in Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

describe("debate shape P2c — the debate map view contract", () => {
  it("accepts the page's view and nothing more: no maker, no count, no extra key", () => {
    expect(DebateMapViewSchema.parse(VIEW)).toEqual(VIEW);
    expect(DebateMapViewSchema.safeParse({ ...VIEW, raised_by: [3] }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [{ node_id: "n", answer: "Yes.", maker: "OpenAI" }], also_raised: []
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: ["x".repeat(DEBATE_MAP_VIEW_LIMITS.maxClaimChars + 1)]
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: [], also_raised: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised + 1 }, () => "x")
    }).success).toBe(false);
    expect(DebateMapViewSchema.safeParse({
      positions: Array.from({ length: DEBATE_MAP_VIEW_LIMITS.maxPositions + 1 }, (_, index) => ({ node_id: `n${String(index)}`, answer: "A." })),
      also_raised: []
    }).success).toBe(false);
  });

  // Whole-branch review m-5: one limit everywhere. The page shows at most the answers the map can choose and store
  // (MAP_LIMITS.chooseAnswersMax; 0117's answer ids a1..a4; the register's plan answers 2..4, debate-shape-policy test).
  it("shows at most the answers the map can choose (one limit: four)", () => {
    expect(DEBATE_MAP_VIEW_LIMITS.maxPositions).toBe(MAP_LIMITS.chooseAnswersMax);
    expect(DEBATE_MAP_VIEW_LIMITS.maxPositions).toBe(4);
  });

  it("rides a public snapshot only when present, so every older snapshot still parses", () => {
    expect(PublicDebateSchema.parse(BASE)).not.toHaveProperty("map_view");
    expect(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }).map_view).toEqual(VIEW);
  });

  it("checks the map view's public text with the arguments, and never the node id", () => {
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.positions[].answer", kind: "ARGUMENTS" });
    expect(CHECKED_TEXT_PATHS).toContainEqual({ path: "map_view.also_raised[]", kind: "ARGUMENTS" });
    const leaves = extractCheckedText(PublicDebateSchema.parse({ ...BASE, map_view: VIEW }) as PublicDebate);
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Move gradually, with hybrid work." });
    expect(leaves).toContainEqual({ kind: "ARGUMENTS", text: "Ask the school about a mid-year move." });
    expect(leaves.some((leaf) => leaf.text === "n-hybrid")).toBe(false);
  });

  it("is a declared route and resource of the contract inventory", () => {
    expect(contractInventory.routes).toContain("GET /v1/answers/{id}/map");
    expect(contractInventory.resources.DebateMapViewSchema).toBe(DebateMapViewSchema);
  });
});
