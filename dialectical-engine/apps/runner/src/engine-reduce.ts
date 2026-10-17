// apps/runner/src/engine-reduce.ts
/**
 * ENGINE REDESIGN R2 (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.2; INTERFACE §6.2): engine 2's
 * reduction of the voices a node's panel heard, the branch `reduceHeard` takes when the run's receipt says engine 2.
 *
 * Plain words: every grader's assessment becomes an honest grade; the point's score is the median of the OTHER makers'
 * grades, and the author's own grade counts only when no other maker graded the point. The spread between the grades, the
 * family record and the degradation marks are read exactly as engine 1 reads them, over the honest grades, so the
 * close-call extension and the single-voice disclosure work unchanged. Pure: no database, no call, no register read.
 */
import {
  applyCorrelatedErrorDiscount, honestDisagreementRecord, honestGrade, honestPointScore, honestSelectionRule, measureDispersion,
  type HonestDisagreementRecord, type HonestGrade, type HonestSelectionRule, type HonestVoice, type JudgeAssessment, type JudgeFamily
} from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import { ENGINE_VERSION_POLICY_ROW_KEY, type EngineScoring, type EngineSettings } from "@debateai/register";

/** Engine 2's selection rule: the engine row's key, on the register version and source the runner's own selection
 *  rule was read from (the receipt carries no register version; open question 5). Kept here so the runner's index.ts
 *  never names the engine row (tests/unit/runner-engine-wiring.test.ts, R1d). */
export function engineHonestSelectionRule(boot: Readonly<{ registerVersion: number; sourceRef: string }>): HonestSelectionRule {
  return honestSelectionRule({ rowKey: ENGINE_VERSION_POLICY_ROW_KEY, registerVersion: boot.registerVersion, sourceRef: boot.sourceRef });
}

/** One voice as runJudgePanel hands it over (the author's own judgement among them). */
export type HonestHeardVoice = Readonly<{ judgementRef: string; assessment: JudgeAssessment; memberRole: string; actorRef: string }>;

/** The sealed panel rows the spread and the family record read (the runner's RunnerPanelPolicy has them all). */
export type HonestPanelRows = Readonly<{
  registerVersion: number;
  dispersionScale: number;
  repeatedFamilyMultiplier: number;
  providerFamilies: readonly Readonly<{ familyRef: string; providerRefs: readonly string[] }>[];
  unmappedReason: string;
  sourceRefs: Readonly<Record<string, string>>;
}>;

/**
 * The point's honest score, through the one combine the engine row admits. The row's schema admits only the median today;
 * a later value is refused by name here, never silently read as the median (A3 review carry).
 */
function pointScoreOf(voices: readonly HonestVoice[], scoring: EngineScoring) {
  const combine: string = scoring.combine;
  if (combine !== "MEDIAN") {
    throw new TypedDomainError("ENGINE_SCORING_COMBINE_UNSUPPORTED", `Engine 2 combines graders by the median, not by ${combine}`);
  }
  return honestPointScore(voices);
}

/**
 * The voices heard → the same shape engine 1's reduction returns (`reducedMembers` with each voice's `tau`, the spread,
 * the family-weighted record, the selection), plus the `honest` record. Every voice stays on record, the author first;
 * only the median leaves the author out (and any other voice of the author's maker: spec §4.2's producer law, applied by
 * `honestPointScore` over each voice's `memberRole`, the maker that answered).
 */
export function reduceHonest<V extends HonestHeardVoice>(input: Readonly<{
  voices: readonly V[];
  authorJudgementRef: string;
  engine: EngineSettings;
  panel: HonestPanelRows;
  earnedWeight: number;
  rule: HonestSelectionRule;
}>) {
  const reducedMembers = input.voices.map((entry) => {
    const honest: HonestGrade = honestGrade(entry.assessment, input.engine.scoring);
    return { ...entry, tau: honest.grade, honest };
  });
  const score = pointScoreOf(reducedMembers.map((entry) => ({
    judgementRef: entry.judgementRef, maker: entry.memberRole,
    isAuthor: entry.judgementRef === input.authorJudgementRef, grade: entry.honest
  })), input.engine.scoring);
  if (score === null) throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no reducible judgement");
  const dispersion = measureDispersion(
    reducedMembers.map((entry) => ({ judgementRef: entry.judgementRef, tau: entry.tau })),
    {
      scale: input.panel.dispersionScale,
      rowKey: "dispersionScale",
      registerVersion: input.panel.registerVersion,
      sourceRef: input.panel.sourceRefs.dispersionScale ?? input.panel.unmappedReason
    }
  );
  const familyOf = (actorRef: string): JudgeFamily => {
    const entry = input.panel.providerFamilies.find((family) => family.providerRefs.includes(actorRef));
    return entry === undefined
      ? { kind: "UNKNOWN", reason: input.panel.unmappedReason }
      : { kind: "KNOWN", familyRef: entry.familyRef };
  };
  const weighted = applyCorrelatedErrorDiscount(
    reducedMembers.map((entry) => ({ memberRole: entry.memberRole, earnedWeight: input.earnedWeight, family: familyOf(entry.actorRef) })),
    {
      repeatedFamilyMultiplier: input.panel.repeatedFamilyMultiplier,
      rowKey: "repeatedFamilyMultiplier",
      registerVersion: input.panel.registerVersion,
      sourceRef: input.panel.sourceRefs.repeatedFamilyMultiplier ?? input.panel.unmappedReason
    }
  );
  const selection = Object.freeze({
    kind: "SELECTED" as const, selectedJudgementRef: score.selectedJudgementRef, tau: score.score, selectionScore: score.score, rule: input.rule
  });
  const honest: HonestDisagreementRecord = honestDisagreementRecord(
    reducedMembers.map((entry) => ({ memberRole: entry.memberRole, grade: entry.honest })), score);
  return Object.freeze({ reducedMembers, dispersion, weighted, selection, honest });
}

/** A one-maker debate (no panel): the author's honest grade, the last resort (spec §4.2 item 5). */
export function honestAuthorOnly(input: Readonly<{
  authorJudgementRef: string; authorMaker: string; authorAssessment: JudgeAssessment; engine: EngineSettings; rule: HonestSelectionRule;
}>) {
  const grade = honestGrade(input.authorAssessment, input.engine.scoring);
  const score = pointScoreOf([{ judgementRef: input.authorJudgementRef, maker: input.authorMaker, isAuthor: true, grade }], input.engine.scoring);
  if (score === null) throw new TypedDomainError("NO_USABLE_JUDGEMENTS", "The panel produced no selectable judgement");
  return Object.freeze({
    selectedJudgementRef: score.selectedJudgementRef, tau: score.score, selectionScore: score.score, rule: input.rule,
    honest: honestDisagreementRecord([{ memberRole: input.authorMaker, grade }], score)
  });
}
