import { z } from "zod";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8, §3.4) — what the debate page shows from the
 * map. It holds each argued answer's statement, keyed by the opening position (root node) that
 * argued it, and the points that were raised but not debated. It carries only text the page
 * shows and node ids the answer already carries: never a maker, a count, a mark or a map id.
 * It imports only zod (never ./index.js), for the same module-cycle reason disclosure.ts does.
 * The same shape rides a public snapshot (`PublicDebateSchema.map_view`).
 */
export const DEBATE_MAP_VIEW_LIMITS = Object.freeze({
  // Whole-branch review m-5: the map chooses and stores at most four answers (@debateai/map MAP_LIMITS.chooseAnswersMax,
  // 0117's answer ids a1..a4, the register's plan answers 2..4). The contract imports only zod, so the value is
  // written here and a unit test (debate-shape-map-view-contract) holds it equal to the map's.
  maxPositions: 4,
  maxAnswerChars: 600,
  maxAlsoRaised: 20,
  maxClaimChars: 240
});

export const DebateMapViewSchema = z.object({
  positions: z.array(z.object({
    node_id: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxAnswerChars)
  }).strict()).max(DEBATE_MAP_VIEW_LIMITS.maxPositions),
  also_raised: z.array(z.string().trim().min(1).max(DEBATE_MAP_VIEW_LIMITS.maxClaimChars))
    .max(DEBATE_MAP_VIEW_LIMITS.maxAlsoRaised)
}).strict();
export type DebateMapView = z.infer<typeof DebateMapViewSchema>;
