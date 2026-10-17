import {
  lengthGuidancePartsField, type CharactersPerWord, type MapWordTargetPart
} from "@debateai/kernel";
import type { FramedMaterialField } from "@debateai/providers";
import type { MapContractName } from "./prompts.js";
import { MAP_LIMITS } from "./types.js";

/** Length guidance (spec 2026-10-15 §3.2): a run's map targets (its receipt's `map` numbers) and the row's factors. */
export type MapLength = Readonly<{ targets: Readonly<Record<MapWordTargetPart, number>>; charactersPerWord: CharactersPerWord }>;
type MapLengthPart = Readonly<{ key: string; part: MapWordTargetPart; most: number | null }>;

function listParts(points: number, answers: number): readonly MapLengthPart[] {
  return Object.freeze([
    Object.freeze({ key: "claim", part: "claim" as const, most: points }),
    Object.freeze({ key: "why_it_matters", part: "whyItMatters" as const, most: points }),
    Object.freeze({ key: "candidate_answers", part: "candidateAnswer" as const, most: answers })
  ]);
}

/**
 * Each contract's told parts: the reply's own JSON key (what the `length` field names), the row's part, and the most of it
 * one reply may hold (null where the schema sets no most: the merge and the choose, which already ask their own long bounds).
 */
export const MAP_LENGTH_PARTS: Readonly<Record<MapContractName, readonly MapLengthPart[]>> = Object.freeze({
  angles: Object.freeze([
    Object.freeze({ key: "label", part: "angleLabel" as const, most: MAP_LIMITS.anglesMax }),
    Object.freeze({ key: "focus", part: "angleFocus" as const, most: MAP_LIMITS.anglesMax })
  ]),
  listAngle: listParts(MAP_LIMITS.listPointsMax, MAP_LIMITS.listAnswersMax),
  listOpen: listParts(MAP_LIMITS.listPointsMax, MAP_LIMITS.listAnswersMax),
  listSnowball: listParts(MAP_LIMITS.snowballPointsMax, MAP_LIMITS.snowballAnswersMax),
  merge: Object.freeze([
    Object.freeze({ key: "claim", part: "claim" as const, most: null }),
    Object.freeze({ key: "answer", part: "candidateAnswer" as const, most: null })
  ]),
  gap: Object.freeze([
    Object.freeze({ key: "claim", part: "claim" as const, most: MAP_LIMITS.gapPointsMax }),
    Object.freeze({ key: "why_it_matters", part: "whyItMatters" as const, most: MAP_LIMITS.gapPointsMax }),
    Object.freeze({ key: "framing_challenges", part: "framingChallenge" as const, most: MAP_LIMITS.framingChallengesMax })
  ]),
  choose: Object.freeze([Object.freeze({ key: "statement", part: "chosenAnswer" as const, most: null })])
});

/** The `length` field of one map call: one line per part ("claim: about 35 words"), characters for zh / ja / th. */
export function mapLengthField(name: MapContractName, length: MapLength, languageTag: string): FramedMaterialField {
  return lengthGuidancePartsField(MAP_LENGTH_PARTS[name].map((entry) => ({ key: entry.key, words: length.targets[entry.part] })),
    languageTag, length.charactersPerWord);
}

/** The words one call is told (INTERFACE §5.6): the sum of its parts, one item each. */
export function mapGuidedWords(name: MapContractName, length: MapLength): number {
  return MAP_LENGTH_PARTS[name].reduce((sum, entry) => sum + length.targets[entry.part], 0);
}

/** The most guided words one reply can hold, for its allowance; null where the schema sets no most (merge, choose). */
export function mapReplyWordsCeiling(name: MapContractName, length: MapLength): number | null {
  const parts = MAP_LENGTH_PARTS[name];
  if (parts.some((entry) => entry.most === null)) return null;
  return parts.reduce((sum, entry) => sum + length.targets[entry.part] * entry.most!, 0);
}

/** The largest of those over every map contract: what a money estimate must price a map call at. */
export function mapLargestReplyWordsCeiling(length: MapLength): number {
  return Math.max(...(Object.keys(MAP_LENGTH_PARTS) as MapContractName[]).map((name) => mapReplyWordsCeiling(name, length) ?? 0));
}
