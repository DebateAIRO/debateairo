// apps/runner/src/engine-judging.ts
/**
 * ENGINE 2 — THE JUDGING STEP (spec 2026-10-15 §4.3, §4.4, §4.7; INTERFACE §9.3-§9.5; owner rulings E2, E9, CT1).
 *
 * Plain words: after the arguing, the reviews, the investigations and the final propagation, and before the answer
 * writer, up to three comparing judges (makers that argued no answer first) compare the answers, each in its own
 * rotated order, all at once under the debate's call lane. Their votes are counted by code (`deriveJudgesVerdict`),
 * recorded once each, and decide the served answer and its label. Nothing here fails the debate: a judge that fails
 * gives no vote (it is recorded, and disclosed); with no judge at all (a money stop before judging, a single servable
 * answer, no seat a maker could take) the honest final strengths decide and the label is at most "Close call" (CT1).
 * Only a stop that ends this copy of the debate (`endsThisCopy`) and a code defect (`comparingJudgeCodeDefect`) leave
 * as they came.
 *
 * Reclaim resume (PR #171): a seat whose vote an earlier copy recorded is never asked again; its row is its vote,
 * a recorded failure included. A vote another write stored first (the record answers ALREADY_PRESENT) is read back and
 * its stored row decides, never this copy's fresh reply. The run body supplies the I/O (`ask`, `record`, the recorded
 * rows), so this step is driven whole by `tests/unit/r2-judging-step.test.ts`.
 */
import {
  TypedDomainError,
  engineVerdictMaterialOf,
  type EngineAnswerLetter,
  type EngineDebateMaterial,
  type EngineMaterialSource,
  type EngineQuestionKind,
  type EngineVerdictMaterial
} from "@debateai/kernel";
import { pickComparingJudges, type ComparingJudgeReply, type ComparingJudgeSeat } from "@debateai/judgement";
import { deriveJudgesVerdict, type ConditionMarkRecord, type JudgesVerdict } from "@debateai/serve";
import type { EngineSettings } from "@debateai/register";
import { CALL_LANE_STOPPED } from "./call-scheduler.js";

/** Why no judge's vote decided (the reason code of VERDICT-JUDGES-UNAVAILABLE). */
export const COMPARING_JUDGES_UNAVAILABLE_CAUSES = Object.freeze(["MONEY_STOP", "ONE_ANSWER", "NO_JUDGE_SEAT", "ALL_JUDGES_FAILED"] as const);
export type ComparingJudgesUnavailableCause = typeof COMPARING_JUDGES_UNAVAILABLE_CAUSES[number];

/** One judge seat's vote as a copy of the run recorded it (`ledger.verdict_vote`, read back through A10). */
export type RecordedComparingJudgeVote = Readonly<{
  judgeSeat: number;
  maker: string;
  providerRef: string;
  modelId: string;
  rawArtifactRef: string | null;
  /** null: the judge failed. */
  chosenLetter: EngineAnswerLetter | null;
  conditional: boolean | null;
  sameAs: readonly (readonly EngineAnswerLetter[])[];
  questionKind: EngineQuestionKind | null;
  reasons: string | null;
}>;

/** One vote to record (A10's `recordVerdictVote`, the run id added by the caller). */
export type ComparingJudgeVoteRecord = RecordedComparingJudgeVote & Readonly<{
  chosenRootNodeId: string | null;
  counted: boolean;
  notCountedReason: "OWN_MAKER" | "JUDGE_FAILED" | null;
}>;

/** What one judge's call gave, and who gave it. */
export type ComparingJudgeAsked = Readonly<{
  reply: ComparingJudgeReply;
  rawArtifactRef: string;
  maker: string;
  providerRef: string;
  modelId: string;
}>;

export type ComparingJudgesStepInput = Readonly<{
  engine: EngineSettings;
  /** The SERVABLE answers only, letter order (letters fixed per debate). */
  material: EngineDebateMaterial;
  /** rootNodeId -> the maker that argued that answer. */
  arguedByMaker: ReadonlyMap<string, string>;
  /** rootNodeId -> this pass's honest final strength (the tie-break). */
  honestFinalStrength: ReadonlyMap<string, number>;
  /** The judge seats a member could take, each as its first planned member. */
  candidates: readonly Readonly<{ maker: string; providerRef: string; modelId: string }>[];
  rotationOffset: number;
  /** The arguing ended on a spend stop: no judge is asked (spec §4.7). */
  moneyStopped: boolean;
  /** Votes an earlier copy of this run recorded. */
  recorded: readonly RecordedComparingJudgeVote[];
  ask: (seat: ComparingJudgeSeat) => Promise<ComparingJudgeAsked>;
  /**
   * Records one vote. A vote another write stored first (ALREADY_PRESENT) hands back the STORED row, read back, which
   * then stands in for this copy's vote in every later reading; nothing (or null) when this copy's row was written.
   */
  record: (vote: ComparingJudgeVoteRecord) => Promise<RecordedComparingJudgeVote | null | void>;
}>;

export type ComparingJudgesStepResult = Readonly<{
  verdict: JudgesVerdict;
  unavailable: ComparingJudgesUnavailableCause | null;
  seats: readonly ComparingJudgeSeat[];
  /** Per seat: the letter its reply named (null: failed) and whether it counted (the step's own record; the panel and the report read the vote rows). */
  ballots: readonly Readonly<{ seat: number; letter: EngineAnswerLetter | null; counted: boolean }>[];
  /** The answer-scope records of the verdict's marks, naming the served root. */
  records: readonly ConditionMarkRecord[];
  /** The writer's and the story's verdict block (R4), never naming a judge's maker. */
  verdictMaterial: EngineVerdictMaterial;
  asked: number;
  reused: number;
}>;

/**
 * The stops that end this copy of the debate (`run-keep-alive.ts`) and a call the debate's stopped lane refused unsent
 * (`call-scheduler.ts`): they leave the judging step as they came, as A14's `pointInvestigationFailureOutcome` does
 * (pre-flight PF-R2b3.9). Recorded as a failed judge, a lane stop would be reused by a resumed copy and never asked.
 */
const ENDS_THIS_COPY: ReadonlySet<string> = new Set(["RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED", CALL_LANE_STOPPED]);
export function endsThisCopy(error: unknown): boolean {
  const code = (error as Readonly<{ code?: unknown }> | null)?.code;
  return typeof code === "string" && ENDS_THIS_COPY.has(code);
}

/**
 * A TypeError the code raised by name (its message is a code of two or more words, optionally `:<field path>`: the
 * length field's `LENGTH_FIELD_INVALID`, the material's `ENGINE_MATERIAL_INVALID:<field>`, ...) is a code defect: it
 * fails the debate, as A14's investigation step rules (`pointInvestigationFailureOutcome`, the same pattern, held equal
 * by `tests/unit/r2-judging-step.test.ts`). Decided by the message being a code, never by the class: fetch's own network
 * failure is a TypeError ("fetch failed") and stays a failed judge.
 */
const NAMED_CODE_DEFECT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?::[A-Za-z0-9_.]+)?$/u;
export function comparingJudgeCodeDefect(error: unknown): boolean {
  return error instanceof TypeError && NAMED_CODE_DEFECT.test(error.message);
}

/**
 * Controller carry 5 (B5): a vote names only this debate's own answer letters, its root the letter's root in THIS copy's
 * servable answers, and a failed vote names none. A10's write check knows only A-H, no repeats and no letter in two
 * groups; this is the debate's own list, checked before every write.
 */
export function comparingJudgeVoteLettersStand(
  vote: Pick<ComparingJudgeVoteRecord, "chosenLetter" | "chosenRootNodeId" | "sameAs">,
  rootOfLetter: ReadonlyMap<EngineAnswerLetter, string>
): boolean {
  if (vote.chosenLetter === null) return vote.chosenRootNodeId === null && vote.sameAs.length === 0;
  return rootOfLetter.get(vote.chosenLetter) === vote.chosenRootNodeId
    && vote.sameAs.every((group) => group.every((letter) => rootOfLetter.has(letter)));
}

/**
 * The source the judges' material is built from (and R4's final writers read, Ruling PF-R43.1): only the servable
 * answers (letters stay fixed), every point ordered by THIS pass's honest final strength (`engineMaterialOf` sorts
 * strongest first). A point the standing projection hid (its review never landed; the source is built from A8's
 * link-weighted snapshot before the projection, as A14's investigator material is) has no propagated strength and sorts
 * last at the bottom of the scale; any other point without one is a code defect (controller carry 7, B5). A rival reply
 * is named only when it came from a servable answer (pre-flight PF-R2b3.19).
 */
export function comparingJudgesSourceOf(input: Readonly<{
  source: EngineMaterialSource;
  servableRootIds: ReadonlySet<string>;
  honestFinalStrength: ReadonlyMap<string, number>;
  hiddenNodeIds: ReadonlySet<string>;
}>): EngineMaterialSource {
  const servableLetters = new Set(input.source.answers.filter((answer) => input.servableRootIds.has(answer.rootNodeId))
    .map((answer) => answer.letter));
  return Object.freeze({
    ...input.source,
    answers: Object.freeze(input.source.answers.filter((answer) => servableLetters.has(answer.letter))),
    points: Object.freeze(input.source.points.filter((point) => servableLetters.has(point.answerLetter)).map((point) => {
      const strength = input.honestFinalStrength.get(point.nodeId);
      if (strength === undefined && !input.hiddenNodeIds.has(point.nodeId)) {
        throw new TypeError("ENGINE_MATERIAL_INVALID:honestFinalStrength");
      }
      return Object.freeze({
        ...point,
        honestFinalStrength: strength ?? 0,
        fromRivalReply: point.fromRivalReply !== null && servableLetters.has(point.fromRivalReply) ? point.fromRivalReply : null
      });
    }))
  });
}

type Outcome = Readonly<{ seat: ComparingJudgeSeat; recorded: RecordedComparingJudgeVote | null; asked: ComparingJudgeAsked | null }>;
type Tally = Readonly<{
  verdict: JudgesVerdict;
  countedBySeat: ReadonlyMap<number, JudgesVerdict["counted"][number]>;
}>;

/** A recorded row's reply; a row with a letter but no kind, flag or reasons is read as a failure, never completed. */
function recordedReply(row: RecordedComparingJudgeVote): ComparingJudgeReply | null {
  if (row.chosenLetter === null || row.conditional === null || row.questionKind === null || row.reasons === null) return null;
  return Object.freeze({ best: row.chosenLetter, conditional: row.conditional, sameAs: row.sameAs, reasons: row.reasons,
    questionKind: row.questionKind });
}

const replyOf = (outcome: Outcome): ComparingJudgeReply | null =>
  outcome.asked !== null ? outcome.asked.reply : outcome.recorded === null ? null : recordedReply(outcome.recorded);

/**
 * The reply the count accepted; null for a failed judge, a reply the count refused included (an unknown letter, an
 * invalid group: B2's `replyStands`). 0121's `verdict_vote_reply_whole` and A10's write check tie "no letter" to
 * JUDGE_FAILED, so a row never carries a letter beside JUDGE_FAILED (pre-flight PF-R2b3.8; carried item 5).
 */
function standingReplyOf(tally: Tally, outcome: Outcome): ComparingJudgeReply | null {
  const entry = tally.countedBySeat.get(outcome.seat.seat);
  return entry === undefined || entry.notCountedReason === "JUDGE_FAILED" ? null : replyOf(outcome);
}

export async function runComparingJudges(input: ComparingJudgesStepInput): Promise<ComparingJudgesStepResult> {
  const answers = Object.freeze(input.material.answers.map((answer) => Object.freeze({
    letter: answer.letter, rootNodeId: answer.rootNodeId, arguedByMaker: input.arguedByMaker.get(answer.rootNodeId) ?? null
  })));
  const arguingMakers = new Set(answers.flatMap((answer) => answer.arguedByMaker === null ? [] : [answer.arguedByMaker]));
  const mayAsk = !input.moneyStopped && answers.length >= 2;
  const picked = mayAsk ? pickComparingJudges({
    seats: input.candidates.map(({ maker, providerRef }) => Object.freeze({ maker, providerRef })),
    arguingMakers,
    count: input.engine.sites.comparingJudges,
    rotationOffset: input.rotationOffset
  }) : [];
  const seatOfRow = (row: RecordedComparingJudgeVote): ComparingJudgeSeat => Object.freeze({
    seat: row.judgeSeat, maker: row.maker, providerRef: row.providerRef, argued: arguingMakers.has(row.maker)
  });
  // A recorded vote is the seat's vote, whatever this pass would pick (reclaim resume).
  const recordedBySeat = new Map(input.recorded.map((row) => [row.judgeSeat, row] as const));
  const seatsByNumber = new Map<number, ComparingJudgeSeat>(picked.map((seat) => [seat.seat, seat] as const));
  for (const row of input.recorded) seatsByNumber.set(row.judgeSeat, seatOfRow(row));
  const seatsAsked = [...seatsByNumber.values()].sort((left, right) => left.seat - right.seat);

  // All judges at once: the debate's call lane admits them under its limits (12 per debate, 3 per AI).
  const outcomes: readonly Outcome[] = await Promise.all(seatsAsked.map(async (seat): Promise<Outcome> => {
    const recorded = recordedBySeat.get(seat.seat) ?? null;
    if (recorded !== null || !mayAsk) return Object.freeze({ seat, recorded, asked: null });
    try {
      return Object.freeze({ seat, recorded: null, asked: await input.ask(seat) });
    } catch (error) {
      if (endsThisCopy(error) || comparingJudgeCodeDefect(error)) throw error;
      // A failed or unusable reply (a refusal after the repairs, a vendor error, a money refusal): no vote, recorded.
      return Object.freeze({ seat, recorded: null, asked: null });
    }
  }));
  const tallyOf = (of: readonly Outcome[]): Tally => {
    const verdict = deriveJudgesVerdict({
      votes: of.map((outcome) => {
        const reply = replyOf(outcome);
        return Object.freeze({
          seat: outcome.seat.seat,
          maker: outcome.asked?.maker ?? outcome.seat.maker,
          reply: reply === null ? null : Object.freeze({ best: reply.best, conditional: reply.conditional, sameAs: reply.sameAs,
            questionKind: reply.questionKind })
        });
      }),
      answers,
      honestFinalStrength: input.honestFinalStrength,
      label: input.engine.label
    });
    return Object.freeze({ verdict, countedBySeat: new Map(verdict.counted.map((entry) => [entry.seat, entry] as const)) });
  };
  const counted = tallyOf(outcomes);

  // Each new vote recorded once, in seat order, after the count (so `counted` and its reason are known).
  // The letter's root in THIS copy's servable answers, never a root read from a recorded row (ruling PF-R2b4.6).
  const rootOf = new Map(answers.map((answer) => [answer.letter, answer.rootNodeId] as const));
  const modelOf = new Map(input.candidates.map((candidate) => [candidate.providerRef, candidate.modelId] as const));
  const storedBySeat = new Map<number, RecordedComparingJudgeVote>();
  let asked = 0;
  for (const outcome of outcomes) {
    if (outcome.recorded !== null) continue;
    asked += 1;
    const reply = standingReplyOf(counted, outcome);
    const entry = counted.countedBySeat.get(outcome.seat.seat);
    const vote: ComparingJudgeVoteRecord = Object.freeze({
      judgeSeat: outcome.seat.seat,
      maker: outcome.asked?.maker ?? outcome.seat.maker,
      providerRef: outcome.asked?.providerRef ?? outcome.seat.providerRef,
      modelId: outcome.asked?.modelId ?? modelOf.get(outcome.seat.providerRef) ?? outcome.seat.providerRef,
      // A refused reply was still a reply that arrived: its artifact is kept (pre-flight PF-R2b3.8).
      rawArtifactRef: outcome.asked?.rawArtifactRef ?? null,
      chosenLetter: reply?.best ?? null,
      chosenRootNodeId: reply === null ? null : rootOf.get(reply.best) ?? null,
      conditional: reply?.conditional ?? null,
      counted: entry?.counted ?? false,
      notCountedReason: entry === undefined ? "JUDGE_FAILED" : entry.notCountedReason,
      questionKind: reply?.questionKind ?? null,
      sameAs: reply?.sameAs ?? Object.freeze([]),
      reasons: reply?.reasons ?? null
    });
    // Unreachable by construction (B2 counts only replies naming the answers' letters): a code defect, never a write.
    if (!comparingJudgeVoteLettersStand(vote, rootOf)) throw new TypeError("COMPARING_JUDGE_VOTE_LETTER_UNKNOWN");
    const stored = await input.record(vote);
    if (stored !== undefined && stored !== null) {
      if (stored.judgeSeat !== vote.judgeSeat) throw new TypeError("COMPARING_JUDGE_STORED_SEAT_MISMATCH");
      storedBySeat.set(vote.judgeSeat, stored);
    }
  }
  // Controller carry 6 (B5): a seat another write stored first decides by its STORED row, read back, so the count, the
  // ballots, the records and the writer's block all read it, exactly as a resumed copy would.
  const final: readonly Outcome[] = storedBySeat.size === 0 ? outcomes : Object.freeze(outcomes.map((outcome) => {
    const stored = storedBySeat.get(outcome.seat.seat);
    return stored === undefined ? outcome : Object.freeze({ seat: seatOfRow(stored), recorded: stored, asked: null });
  }));
  const tally = storedBySeat.size === 0 ? counted : tallyOf(final);
  const { verdict } = tally;
  const seats = Object.freeze(final.map((outcome) => outcome.seat));

  // The disclosure: one typed record per mark, naming the served root (reason codes only, as the shape's records).
  // One servable answer comes first: B2 counts no vote then (plan deviation 26), so a resumed copy whose earlier copy
  // recorded seats still reads ONE_ANSWER, never ALL_JUDGES_FAILED (pre-flight PF-R2b2.5, pre-flight consistency R2b).
  const unavailable: ComparingJudgesUnavailableCause | null = verdict.trigger !== "JUDGES_UNAVAILABLE" ? null
    : answers.length < 2 ? "ONE_ANSWER"
      : seats.length > 0 ? "ALL_JUDGES_FAILED"
        : input.moneyStopped ? "MONEY_STOP" : "NO_JUDGE_SEAT";
  const failed = verdict.judgesSeated - verdict.judgesAnswered;
  const ignored = verdict.counted.filter((entry) => entry.notCountedReason === "OWN_MAKER").length;
  const reasonOf: Readonly<Record<JudgesVerdict["marks"][number], string>> = Object.freeze({
    "VERDICT-JUDGE-MISSING": `VERDICT_JUDGE_MISSING:${String(failed)}`,
    "VERDICT-JUDGES-UNAVAILABLE": `VERDICT_JUDGES_UNAVAILABLE:${unavailable ?? "NO_JUDGE_SEAT"}`,
    "VERDICT-VOTES-IGNORED": `VERDICT_VOTES_IGNORED:${String(ignored)}`
  });
  const records = Object.freeze(verdict.marks.map((mark) => Object.freeze({
    mark, scope: "answer" as const, subjectRef: verdict.winnerRootNodeId, reason: reasonOf[mark], liftPath: null,
    servedRootRule: null, affectedNodeIds: Object.freeze([verdict.winnerRootNodeId])
  } satisfies ConditionMarkRecord)));

  // The writer's verdict block (R4): the counted judges' reasons, never their makers.
  const winner = answers.find((answer) => answer.rootNodeId === verdict.winnerRootNodeId)?.letter;
  if (winner === undefined) throw new TypedDomainError("COMPARING_JUDGES_WINNER_UNRESOLVED", verdict.winnerRootNodeId);
  const winningGroup = verdict.groups.find((group) => group.includes(winner)) ?? [winner];
  const countedReplies = final.flatMap((outcome) => {
    const reply = replyOf(outcome);
    return reply !== null && tally.countedBySeat.get(outcome.seat.seat)?.counted === true ? [reply] : [];
  });
  const verdictMaterial = engineVerdictMaterialOf(input.material, Object.freeze({
    label: verdict.label,
    winner,
    conditional: countedReplies.some((reply) => winningGroup.includes(reply.best) && reply.conditional),
    judgesReasons: Object.freeze(countedReplies.map((reply) => Object.freeze({ chose: reply.best, reasons: reply.reasons })))
  }));
  return Object.freeze({
    verdict,
    unavailable,
    seats,
    ballots: Object.freeze(final.map((outcome) => Object.freeze({
      seat: outcome.seat.seat,
      // B6's panel and B11's report never show a letter for a failed judge (pre-flight PF-R2b3.8).
      letter: standingReplyOf(tally, outcome)?.best ?? null,
      counted: tally.countedBySeat.get(outcome.seat.seat)?.counted === true
    }))),
    records,
    verdictMaterial,
    asked,
    reused: final.length - asked
  });
}
