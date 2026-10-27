import type { AskRoomQuery } from "@/lib/billing/room";
import type { MessageCatalog } from "@/lib/i18n/translate";
import {
  buildNewDebateAskConfig,
  dateTimeLocalValue,
  DECISION_SCOPE_DEFAULT,
  PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
  type AnswerLength,
  type DepthMode,
  type Scrutiny
} from "@/app/new/defaults";
import type { DigMode, ReadingLevel } from "./types";

/*
 * V4 initial (spec 2026-10-28, B2): the person's two V4 choices (Quick look / Thorough, and the reading level) become
 * the V3 ask, built by V3's own buildNewDebateAskConfig so createDebate validates it exactly as it validates /new's.
 * Everything else is /new's untouched default: risk tier "standard" (not edited), the provisional budget tier, the
 * personal decision scope, no model strength, as of the moment of Start.
 */

/** What the room read said for this person: the decided plan, the shape and length switches, the settings version. */
export type V4AskSettings = Readonly<{
  planTier: "free" | "premium";
  shapeSettings: boolean;
  lengthSettings: boolean;
  settingsVersion?: number;
}>;

/** Row D decision 5: a quick look is the shallowest debate; thorough is Free's ceiling (2), so no plan is refused it. */
const DEPTH_BY_MODE: Readonly<Record<DigMode, number>> = Object.freeze({ quick: 1, thorough: 2 });

/** The reading level picks the answer length (plain → short, background → standard, expert → detailed). */
const ANSWER_LENGTH_BY_LEVEL: Readonly<Record<ReadingLevel, AnswerLength>> = Object.freeze({
  plain: "short",
  background: "standard",
  expert: "detailed"
});

/** The P2c shape choices, exactly when /new would send them: all three with the shape row, the length alone with the length row. */
function shapeChoices(mode: DigMode, level: ReadingLevel, settings: V4AskSettings): Readonly<{
  depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength;
}> {
  const answerLength = ANSWER_LENGTH_BY_LEVEL[level];
  if (settings.shapeSettings) {
    // Free never sends a scrutiny above standard (S7); thorough on a paid plan asks for the deeper check.
    const scrutiny: Scrutiny = mode === "thorough" && settings.planTier === "premium" ? "deep" : "standard";
    return { depthMode: "adaptive", scrutiny, answerLength };
  }
  return settings.lengthSettings ? { answerLength } : {};
}

/** The room read for the ask these choices would send (/new's roomQuery, Contract deviation 9). */
export function v4RoomQuery(mode: DigMode, level: ReadingLevel, settings: V4AskSettings): AskRoomQuery {
  const choices = shapeChoices(mode, level, settings);
  return {
    plan_tier: settings.planTier,
    composition_budget_tier: PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
    depth: DEPTH_BY_MODE[mode],
    ...(choices.depthMode === undefined ? {} : { depth_mode: choices.depthMode }),
    ...(choices.scrutiny === undefined ? {} : { scrutiny: choices.scrutiny }),
    ...(choices.answerLength === undefined ? {} : { answer_length: choices.answerLength })
  };
}

/** The V3 ask config for these choices (passed to createDebate). Throws only what buildNewDebateAskConfig throws. */
export function v4AskConfig(mode: DigMode, level: ReadingLevel, settings: V4AskSettings, submitTime: Date,
  newDebateCatalog: MessageCatalog): Record<string, unknown> {
  return buildNewDebateAskConfig({
    planTier: settings.planTier,
    riskTier: "standard",
    budgetTier: PROVISIONAL_COMPOSITION_BUDGET_DEFAULT,
    decisionScope: DECISION_SCOPE_DEFAULT,
    asOf: dateTimeLocalValue(submitTime),
    depth: DEPTH_BY_MODE[mode],
    asOfWasEdited: false,
    riskTierWasEdited: false,
    modelStrength: null,
    ...shapeChoices(mode, level, settings),
    ...(settings.settingsVersion === undefined ? {} : { settingsVersion: settings.settingsVersion })
  }, submitTime, newDebateCatalog);
}
