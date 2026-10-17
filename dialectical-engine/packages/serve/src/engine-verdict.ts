/**
 * ENGINE 2 — THE JUDGES' VERDICT, COUNTED BY CODE (spec 2026-10-15 §4.4, §4.7; INTERFACE §9.4; owner rulings E2, E8, E9,
 * CT1, G6).
 *
 * Plain words: the comparing judges each name the best-supported answer; answers a majority of the seated judges call
 * "the same answer" count together; a vote is not counted when the answer it names, or any answer counted together with
 * it, is one the judge's own maker argued (ruling R2b-B2.1, spec §4.3, §4.4, E9: a judge cannot vote for its own maker's
 * answer through a group either; the vote stays recorded). A debate with fewer than two answers is never judged, so no
 * vote counts in it (deviation 26). The answer with
 * the most counted votes wins (a tie goes to the higher honest final strength, then the lexicographic node id), and the
 * label says how far the judges agree: all of them, with no conditions, is "Clear answer" (SUPPORTED); a majority, or a
 * conditional winner, is "Close call" (CONTESTED); no majority is "Contested" (SPLIT). With no judge at all the honest
 * final strengths decide and the label is at most "Close call". Pure: it never calls an AI, reads a row or invents a
 * judgment; the judges decide, code only counts. Engine 1 never reaches it (`deriveVerdictLabel` stays engine 1's).
 */
import { TypedDomainError, type EngineAnswerLetter, type EngineQuestionKind } from "@debateai/kernel";
import type { EngineLabel } from "@debateai/register";
import type { VerdictLabelDerivation } from "./index.js";

export const ENGINE_VERDICT_TRIGGERS = Object.freeze([
  "JUDGES_UNANIMOUS", "JUDGES_CONDITIONAL", "JUDGES_MAJORITY", "JUDGES_NO_MAJORITY", "JUDGES_UNAVAILABLE", "JUDGES_VOTES_IGNORED"
] as const);
export type EngineVerdictTrigger = typeof ENGINE_VERDICT_TRIGGERS[number];

type JudgesVerdictMark = "VERDICT-JUDGE-MISSING" | "VERDICT-JUDGES-UNAVAILABLE" | "VERDICT-VOTES-IGNORED";
/** The marks in one fixed order, whatever order the rules found them in. */
const MARK_ORDER: readonly JudgesVerdictMark[] = Object.freeze([
  "VERDICT-JUDGE-MISSING", "VERDICT-JUDGES-UNAVAILABLE", "VERDICT-VOTES-IGNORED"
]);

export type ComparingJudgeVote = Readonly<{
  seat: number;
  maker: string;
  /** null = the judge failed after repairs. */
  reply: Readonly<{
    best: EngineAnswerLetter;
    conditional: boolean;
    sameAs: readonly (readonly EngineAnswerLetter[])[];
    questionKind: EngineQuestionKind;
  }> | null;
}>;

export type JudgesVerdictInput = Readonly<{
  /** One per seated judge. */
  votes: readonly ComparingJudgeVote[];
  answers: readonly Readonly<{ letter: EngineAnswerLetter; rootNodeId: string; arguedByMaker: string | null }>[];
  /** rootNodeId -> honest final strength: the tie-break only. */
  honestFinalStrength: ReadonlyMap<string, number>;
  label: EngineLabel;
}>;

export type JudgesVerdict = Readonly<{
  winnerRootNodeId: string;
  /** Clear answer / Close call / Contested. */
  label: "SUPPORTED" | "CONTESTED" | "SPLIT";
  trigger: EngineVerdictTrigger;
  judgesSeated: number;
  judgesAnswered: number;
  counted: readonly Readonly<{ seat: number; counted: boolean; notCountedReason: "OWN_MAKER" | "JUDGE_FAILED" | null }>[];
  /** Groups a majority of the SEATED judges named (> seated / 2), merged transitively; letters in answer order. */
  groups: readonly (readonly EngineAnswerLetter[])[];
  winnerVotes: number;
  questionKinds: readonly EngineQuestionKind[];
  marks: readonly JudgesVerdictMark[];
}>;

const invalid = (why: string): never => { throw new TypedDomainError("JUDGES_VERDICT_INPUT_INVALID", why); };
const codeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const isMaker = (maker: unknown): boolean => typeof maker === "string" && maker.length > 0;

/** A reply stands when every letter it names is an answer and its groups are well formed (B1's content checks again). */
function replyStands(reply: ComparingJudgeVote["reply"], letters: ReadonlySet<string>): boolean {
  if (reply === null || !letters.has(reply.best)) return false;
  const grouped = new Set<string>();
  for (const group of reply.sameAs) {
    const distinct = new Set(group);
    if (distinct.size < 2 || distinct.size !== group.length) return false;
    for (const letter of group) {
      if (!letters.has(letter) || grouped.has(letter)) return false;
      grouped.add(letter);
    }
  }
  return true;
}

/** Pairs named together by more than half of the seated judges, merged transitively (union-find over answer order). */
function majorityGroups(
  groupings: readonly (readonly (readonly EngineAnswerLetter[])[])[],
  seated: number,
  order: readonly EngineAnswerLetter[]
): readonly (readonly EngineAnswerLetter[])[] {
  const position = new Map(order.map((letter, index) => [letter, index] as const));
  const pairCount = new Map<string, number>();
  for (const grouping of groupings) {
    const named = new Set<string>();
    for (const group of grouping) {
      const sorted = [...group].sort((left, right) => (position.get(left) ?? 0) - (position.get(right) ?? 0));
      for (let i = 0; i < sorted.length; i += 1) {
        for (let j = i + 1; j < sorted.length; j += 1) named.add(`${sorted[i]!}|${sorted[j]!}`);
      }
    }
    for (const pair of named) pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1);
  }
  const parent = new Map<string, string>(order.map((letter) => [letter, letter] as const));
  const find = (letter: string): string => {
    let root = letter;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const [pair, count] of pairCount) {
    if (count * 2 <= seated) continue;
    const [left, right] = pair.split("|") as [string, string];
    const a = find(left);
    const b = find(right);
    // The earlier letter in answer order is the class's root, so the result never depends on the map's order.
    if (a !== b) {
      if ((position.get(a as EngineAnswerLetter) ?? 0) < (position.get(b as EngineAnswerLetter) ?? 0)) parent.set(b, a);
      else parent.set(a, b);
    }
  }
  const classes = new Map<string, EngineAnswerLetter[]>();
  for (const letter of order) {
    const root = find(letter);
    classes.set(root, [...(classes.get(root) ?? []), letter]);
  }
  return Object.freeze([...classes.values()].filter((group) => group.length >= 2).map((group) => Object.freeze(group)));
}

/**
 * Counting, winner and label (INTERFACE §9.4 rules 1-5, with plan deviations 26 and 28's readings, and rule 1 read
 * through the voted group by ruling R2b-B2.1, spec §4.3, §4.4, E9).
 */
export function deriveJudgesVerdict(input: JudgesVerdictInput): JudgesVerdict {
  const { clearAgreeing, closeCallAgreeing } = input.label;
  if (!Number.isSafeInteger(clearAgreeing) || !Number.isSafeInteger(closeCallAgreeing)
    || closeCallAgreeing < 1 || closeCallAgreeing > clearAgreeing) invalid("label");
  if (input.answers.length === 0) invalid("answers");
  const order = input.answers.map((answer) => answer.letter);
  const byLetter = new Map(input.answers.map((answer) => [answer.letter, answer] as const));
  if (byLetter.size !== input.answers.length
    || new Set(input.answers.map((answer) => answer.rootNodeId)).size !== input.answers.length
    || input.answers.some((answer) => answer.arguedByMaker !== null && !isMaker(answer.arguedByMaker))) invalid("answers");
  const strengthOf = (letter: EngineAnswerLetter): number => {
    const strength = input.honestFinalStrength.get(byLetter.get(letter)!.rootNodeId);
    return strength !== undefined && Number.isFinite(strength) ? strength : invalid(`honestFinalStrength:${letter}`);
  };
  for (const letter of order) strengthOf(letter);
  /** Stronger first: honest final strength, then today's lexicographic node id. */
  const stronger = (left: EngineAnswerLetter, right: EngineAnswerLetter): number =>
    strengthOf(right) - strengthOf(left) || codeUnits(byLetter.get(left)!.rootNodeId, byLetter.get(right)!.rootNodeId);

  const votes = [...input.votes].sort((left, right) => left.seat - right.seat);
  // Ruling W2 (R2b whole-branch review M1, spec §4.3): never two judges of one maker; a second seat of a maker would
  // count one maker's choice twice, so the count refuses it rather than serve on it.
  if (votes.some((vote, index) => !Number.isSafeInteger(vote.seat) || vote.seat < 1 || votes[index - 1]?.seat === vote.seat
    || !isMaker(vote.maker)) || new Set(votes.map((vote) => vote.maker)).size !== votes.length) {
    invalid("votes");
  }
  const letters = new Set<string>(order);
  const standing = votes.map((vote) => Object.freeze({ vote, reply: replyStands(vote.reply, letters) ? vote.reply : null }));

  const judgesSeated = votes.length;
  const judgesAnswered = standing.filter(({ reply }) => reply !== null).length;
  // Deviation 26 (pre-flight PF-R2b2.5): fewer than two answers is never judged, whatever votes a resumed copy hands in.
  const judged = order.length >= 2;

  // Rule 2 (before rule 1 reads it): the judges' groups, counted only when a majority of the seated judges named them,
  // from every standing reply, counted or not.
  const groups = majorityGroups(standing.flatMap(({ reply }) => reply === null ? [] : [reply.sameAs]), judgesSeated, order);
  const groupOf = (letter: EngineAnswerLetter): readonly EngineAnswerLetter[] =>
    groups.find((group) => group.includes(letter)) ?? [letter];

  // Rule 1: which votes count. OWN_MAKER when the group holding `best` (or `best` alone) holds ANY answer the judge's own
  // maker argued (ruling R2b-B2.1, spec §4.3, §4.4, E9). In a debate that was not judged no vote counts: a failed or
  // own-maker vote keeps its reason and any other carries none. That pair (not counted, no reason) never reaches
  // 0121's verdict_vote rows: with fewer than two answers B5 asks no judge and records no new vote.
  const counted = Object.freeze(standing.map(({ vote, reply }) => Object.freeze(
    reply === null ? { seat: vote.seat, counted: false, notCountedReason: "JUDGE_FAILED" as const }
      : groupOf(reply.best).some((letter) => byLetter.get(letter)!.arguedByMaker === vote.maker)
        ? { seat: vote.seat, counted: false, notCountedReason: "OWN_MAKER" as const }
        : { seat: vote.seat, counted: judged, notCountedReason: null }
  )));
  const countedReplies = standing.flatMap(({ reply }, index) => reply !== null && counted[index]!.counted ? [reply] : []);
  const candidates = order.filter((letter) => groups.every((group) => !group.includes(letter) || group[0] === letter))
    .map((letter) => groups.find((group) => group[0] === letter) ?? Object.freeze([letter]));

  // Rule 3: the winner.
  const direct = (letter: EngineAnswerLetter): number => countedReplies.filter((reply) => reply.best === letter).length;
  const groupVotes = (group: readonly EngineAnswerLetter[]): number => group.reduce((sum, letter) => sum + direct(letter), 0);
  const strongestOf = (group: readonly EngineAnswerLetter[]): EngineAnswerLetter => [...group].sort(stronger)[0]!;
  const winningGroup = [...candidates].sort((left, right) =>
    groupVotes(right) - groupVotes(left) || stronger(strongestOf(left), strongestOf(right)))[0]!;
  const winner = [...winningGroup].sort((left, right) => direct(right) - direct(left) || stronger(left, right))[0]!;
  const winnerVotes = groupVotes(winningGroup);

  // Rules 4 and 5: the label, and the marks that disclose a missing, unavailable or ignored judge.
  const marks = new Set<JudgesVerdictMark>();
  let label: JudgesVerdict["label"];
  let trigger: EngineVerdictTrigger;
  if (judgesAnswered === 0 || !judged) {
    label = "CONTESTED";
    trigger = "JUDGES_UNAVAILABLE";
    marks.add("VERDICT-JUDGES-UNAVAILABLE");
  } else {
    if (judgesAnswered < judgesSeated) marks.add("VERDICT-JUDGE-MISSING");
    if (countedReplies.length === 0) {
      label = "SPLIT";
      trigger = "JUDGES_VOTES_IGNORED";
      marks.add("VERDICT-VOTES-IGNORED");
    } else {
      const conditionalWinner = countedReplies.some((reply) => winningGroup.includes(reply.best) && reply.conditional);
      const allAgree = winnerVotes === judgesSeated && winnerVotes >= clearAgreeing;
      if (allAgree && !conditionalWinner) {
        label = "SUPPORTED";
        trigger = "JUDGES_UNANIMOUS";
      } else if (allAgree) {
        label = "CONTESTED";
        trigger = "JUDGES_CONDITIONAL";
      } else if (winnerVotes >= closeCallAgreeing && winnerVotes * 2 > judgesSeated) {
        // More than half of the seated judges (pre-flight PF-R2b2.2, E8): a tie at the top is no majority.
        label = "CONTESTED";
        trigger = "JUDGES_MAJORITY";
      } else {
        label = "SPLIT";
        trigger = "JUDGES_NO_MAJORITY";
      }
    }
  }
  return Object.freeze({
    winnerRootNodeId: byLetter.get(winner)!.rootNodeId,
    label,
    trigger,
    judgesSeated,
    judgesAnswered,
    counted,
    groups,
    winnerVotes,
    questionKinds: Object.freeze(standing.flatMap(({ reply }) => reply === null ? [] : [reply.questionKind])),
    marks: Object.freeze(MARK_ORDER.filter((mark) => marks.has(mark)))
  });
}

/**
 * The judges' verdict as the label record every served answer, receipt and story reads (INTERFACE §9.5): rung 5 ("decided
 * under the comparing judges' rule"), its trigger, no basis absence and no LABEL-BASIS-INCOMPLETE mark (the judges' own
 * marks are the runner's typed records). Rung 5 also when no judge could compare (JUDGES_UNAVAILABLE): the honest final
 * strengths chose the answer then, but the rule and its label cap ("Close call" at most) are still the judges'.
 * `deriveVerdictLabel` stays engine 1's and is not touched.
 */
export function verdictDerivationOfJudges(verdict: JudgesVerdict): VerdictLabelDerivation {
  return Object.freeze({
    label: verdict.label,
    rung: 5,
    trigger: verdict.trigger,
    basisAbsence: Object.freeze([]),
    marks: Object.freeze([])
  });
}
