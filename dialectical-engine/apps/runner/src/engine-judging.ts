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
 * its stored row decides, never this copy's fresh reply. Two stored seats of one maker (two copies after a mid-judging
 * reclaim): the earliest seat is the maker's vote and a later one is not counted (`storedSeatsOfRepeatedMakers`, R3 final
 * wave O2), so the count never refuses a resumed debate and never counts one maker twice. The run body supplies the I/O
 * (`ask`, `record`, the recorded rows), so this step is driven whole by `tests/unit/r2-judging-step.test.ts`.
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
import {
  pickComparingJudges,
  type ComparingJudgeCandidateSeat,
  type ComparingJudgeReply,
  type ComparingJudgeSeat
} from "@debateai/judgement";
import { deriveJudgesVerdict, type ConditionMarkRecord, type JudgesVerdict } from "@debateai/serve";
import type { EngineSettings } from "@debateai/register";
import { CALL_LANE_STOPPED } from "./call-scheduler.js";
import { namedCodeDefect } from "./engine-investigations.js";

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
  /**
   * The judge seats a member could take, each as its first planned member, and (owner ruling 2026-10-29, "prefer neutral
   * judges") the seat's other member, which judges in its place only when its maker argued no answer and the planned
   * member's maker argued one (`pickComparingJudges`).
   */
  candidates: readonly Readonly<{
    maker: string;
    providerRef: string;
    modelId: string;
    alternate?: Readonly<{ maker: string; providerRef: string; modelId: string }>;
  }>[];
  rotationOffset: number;
  /** The arguing ended on a spend stop: no judge is asked (spec §4.7). */
  moneyStopped: boolean;
  /** Votes an earlier copy of this run recorded. */
  recorded: readonly RecordedComparingJudgeVote[];
  /**
   * The run's recorded votes, read again once every judge answered and before any row is written (controller ruling
   * R2b-B5.1): a row another copy stored meanwhile is that seat's vote. Absent: the rows read at the start stand.
   */
  readRecorded?: () => Promise<readonly RecordedComparingJudgeVote[]>;
  ask: (seat: ComparingJudgeSeat) => Promise<ComparingJudgeAsked>;
  /**
   * Records one vote. A vote another write stored first (ALREADY_PRESENT) hands back the STORED row, read back, which
   * then stands in for this copy's vote in every later reading; nothing (or null) when this copy's row was written.
   */
  record: (vote: ComparingJudgeVoteRecord) => Promise<RecordedComparingJudgeVote | null | void>;
}>;

/**
 * R3 final wave O2 (R2b review N2, ruling index b; spec §4.3 "never two judges of one maker"): why a STORED vote was left
 * out of the count. Two copies of a debate after a mid-judging reclaim can each store a vote by one maker at different
 * seats; the earliest stored seat of that maker is its vote and every later one is not counted. The reason is the step's
 * own: a stored row is never written again, so it never reaches 0121's not_counted_reason column (no new code there).
 */
export type ComparingJudgeSetAside = Readonly<{ seat: number; maker: string; reason: "MAKER_SEATED_EARLIER" }>;

export type ComparingJudgesStepResult = Readonly<{
  verdict: JudgesVerdict;
  /** O2: stored seats of a maker an earlier stored seat holds, not counted (ascending seat order; [] on a first pass). */
  setAside: readonly ComparingJudgeSetAside[];
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
 * The stops that end this copy of the debate (`run-keep-alive.ts`; side-by-side spec §4 adds a retiring release's
 * RUNNER_RETIRING) and a call the debate's stopped lane refused unsent (`call-scheduler.ts`): they leave the judging
 * step as they came, as A14's `pointInvestigationFailureOutcome` does (pre-flight PF-R2b3.9). Recorded as a failed
 * judge, a lane stop would be reused by a resumed copy and never asked.
 */
const ENDS_THIS_COPY: ReadonlySet<string> = new Set([
  // R22 W3-8: the month wall's planned stop (./month-pause.ts) ends this copy too.
  "RUNNER_CLAIM_LOST", "RUNNER_TIME_LIMIT_REACHED", "RUNNER_RETIRING", "RUN_MONTH_PAUSED", CALL_LANE_STOPPED
]);
export function endsThisCopy(error: unknown): boolean {
  const code = (error as Readonly<{ code?: unknown }> | null)?.code;
  return typeof code === "string" && ENDS_THIS_COPY.has(code);
}

/**
 * A code defect inside a judge's call fails the debate: the one rule of engine 2's AI steps (`namedCodeDefect`, a
 * TypeError whose message is a code, shared with A14's `pointInvestigationFailureOutcome`). The one intended difference
 * from A14: DEBATE_MAKER_UNRESOLVED (`callSeat` found no eligible member) is a failed judge here, disclosed as
 * VERDICT-JUDGE-MISSING, and effectively unreachable, since the judge's maker comes from `seatCaller.plan` on the same
 * seat; A14, which has no such disclosure, rethrows it.
 */
export function comparingJudgeCodeDefect(error: unknown): boolean {
  return namedCodeDefect(error);
}

/**
 * Controller carry 6 and ruling R2b-B5.1 (B5 fix 1): what a vote's write hands back to the step. ALREADY_PRESENT: the
 * STORED row of the seat, read back; a stored row that cannot be read back is a code defect, never a reason to act on
 * the unstored vote. INSERTED and RUN_ERASED: nothing (an erased run is ignored, as A14's investigation rows are).
 */
export async function storedVoteOnConflict(
  outcome: "INSERTED" | "ALREADY_PRESENT" | "RUN_ERASED",
  judgeSeat: number,
  readBack: () => Promise<readonly RecordedComparingJudgeVote[]>
): Promise<RecordedComparingJudgeVote | null> {
  if (outcome !== "ALREADY_PRESENT") return null;
  const stored = (await readBack()).find((row) => row.judgeSeat === judgeSeat);
  if (stored === undefined) throw new TypeError("COMPARING_JUDGE_STORED_ROW_MISSING");
  return stored;
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
 * strongest first). A point that did not propagate (the standing projection hid it, its base is null: no reduced
 * judgement, or it abstained; `evaluate` gives such a node no strength) sorts last at the bottom of the scale, as A8's
 * links and A14's material read it. Only a point that should have propagated (in the standing snapshot, a base, not
 * abstained: `propagatableNodeIds`) and still has no strength is a code defect (controller carry 7; B5 fix 1, Important
 * 1). A rival reply is named only when it came from a servable answer (pre-flight PF-R2b3.19). A kept point that is
 * neither in the standing snapshot nor hidden by the standing projection was built from another graph than the one this
 * pass propagated: a source/snapshot mismatch, a named code defect (R2b final wave P5, B5 re-review Minor 1).
 */
export function comparingJudgesSourceOf(input: Readonly<{
  source: EngineMaterialSource;
  servableRootIds: ReadonlySet<string>;
  honestFinalStrength: ReadonlyMap<string, number>;
  /** The standing snapshot's nodes with a base strength that did not abstain: each one must have propagated. */
  propagatableNodeIds: ReadonlySet<string>;
  /** Every node of the standing snapshot. */
  standingNodeIds: ReadonlySet<string>;
  /** The nodes the standing projection hid (no judged basis). */
  hiddenNodeIds: ReadonlySet<string>;
}>): EngineMaterialSource {
  const servableLetters = new Set(input.source.answers.filter((answer) => input.servableRootIds.has(answer.rootNodeId))
    .map((answer) => answer.letter));
  return Object.freeze({
    ...input.source,
    answers: Object.freeze(input.source.answers.filter((answer) => servableLetters.has(answer.letter))),
    points: Object.freeze(input.source.points.filter((point) => servableLetters.has(point.answerLetter)).map((point) => {
      if (!input.standingNodeIds.has(point.nodeId) && !input.hiddenNodeIds.has(point.nodeId)) {
        throw new TypeError("ENGINE_MATERIAL_INVALID:sourceSnapshot");
      }
      const strength = input.honestFinalStrength.get(point.nodeId);
      if (strength === undefined && input.propagatableNodeIds.has(point.nodeId)) {
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
type TallyEntry = Readonly<{ seat: number; counted: boolean;
  notCountedReason: JudgesVerdict["counted"][number]["notCountedReason"] | ComparingJudgeSetAside["reason"] }>;
type Tally = Readonly<{
  verdict: JudgesVerdict;
  /** Every seat of the outcomes: the count's entry, or a set-aside stored seat (not counted, no letter withheld). */
  countedBySeat: ReadonlyMap<number, TallyEntry>;
  setAside: readonly ComparingJudgeSetAside[];
}>;

const makerOfOutcome = (outcome: Outcome): string => outcome.asked?.maker ?? outcome.seat.maker;

/**
 * O2: the stored seats (a row an earlier copy recorded, or one another copy stored meanwhile) whose maker an EARLIER stored
 * seat already holds, in seat order. A seat this copy asks is never set aside: its maker holds no stored seat by
 * construction (the pick skips recorded makers, `finalOf` drops a fresh seat whose maker a re-read row took), so a
 * repeated maker among fresh seats still reaches the count's own refusal, a code defect.
 */
export function storedSeatsOfRepeatedMakers(outcomes: readonly Readonly<{ seat: number; maker: string; stored: boolean }>[]):
  readonly ComparingJudgeSetAside[] {
  const held = new Set<string>();
  const setAside: ComparingJudgeSetAside[] = [];
  for (const outcome of [...outcomes].filter((entry) => entry.stored).sort((left, right) => left.seat - right.seat)) {
    if (held.has(outcome.maker)) setAside.push(Object.freeze({ seat: outcome.seat, maker: outcome.maker, reason: "MAKER_SEATED_EARLIER" }));
    else held.add(outcome.maker);
  }
  return Object.freeze(setAside);
}

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
  const candidateSeats: readonly ComparingJudgeCandidateSeat[] = Object.freeze(input.candidates.map(({ maker, providerRef, alternate }) =>
    Object.freeze({ maker, providerRef,
      ...(alternate === undefined ? {} : { alternate: Object.freeze({ maker: alternate.maker, providerRef: alternate.providerRef }) }) })));
  const pickOf = (seats: readonly ComparingJudgeCandidateSeat[], count: number): readonly ComparingJudgeSeat[] =>
    pickComparingJudges({ seats, arguingMakers, count, rotationOffset: input.rotationOffset });
  const seatOfRow = (row: RecordedComparingJudgeVote): ComparingJudgeSeat => Object.freeze({
    seat: row.judgeSeat, maker: row.maker, providerRef: row.providerRef, argued: arguingMakers.has(row.maker)
  });
  // A recorded vote is the seat's vote, whatever this pass would pick (reclaim resume).
  const recordedBySeat = new Map(input.recorded.map((row) => [row.judgeSeat, row] as const));
  /*
   * Ruling W2 (R2b whole-branch review M1, spec §4.3 "never two judges of one maker"): a maker that holds a recorded seat
   * is never picked again for another seat. A resumed copy's pick can differ from the earlier copy's (a member's sit-out
   * state changed between claims), so this pass's seat for that maker goes to the next eligible maker no seat holds, in
   * the same rotation and order; when none is left, the seat stays unfilled. A first pass (no recorded row) is today's.
   */
  const heldMakers = new Set(input.recorded.map((row) => row.maker));
  const firstPick = mayAsk ? pickOf(candidateSeats, input.engine.sites.comparingJudges) : [];
  const freshSeats = firstPick.filter((seat) => !recordedBySeat.has(seat.seat));
  const clashing = freshSeats.filter((seat) => heldMakers.has(seat.maker));
  const seatedMakers = new Set([...heldMakers, ...freshSeats.filter((seat) => !heldMakers.has(seat.maker)).map((seat) => seat.maker)]);
  const spares = clashing.length === 0 ? [] : pickOf(Object.freeze(candidateSeats.flatMap((seat) => {
    // Owner ruling 2026-10-29: a seated maker's member never sits again, and the other member still stands in only as a
    // maker that argued no answer (it never becomes a fallback).
    const alternate = seat.alternate !== undefined && !seatedMakers.has(seat.alternate.maker) ? seat.alternate : undefined;
    if (!seatedMakers.has(seat.maker)) {
      return [Object.freeze({ maker: seat.maker, providerRef: seat.providerRef, ...(alternate === undefined ? {} : { alternate }) })];
    }
    return alternate !== undefined && !arguingMakers.has(alternate.maker) ? [alternate] : [];
  })), clashing.length);
  const picked: readonly ComparingJudgeSeat[] = [
    ...firstPick.filter((seat) => !clashing.includes(seat)),
    ...clashing.flatMap((seat, index) => {
      const spare = spares[index];
      return spare === undefined ? [] : [Object.freeze({ ...spare, seat: seat.seat })];
    })
  ];
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
    // O2: a later stored seat of a maker an earlier stored seat holds is left out of the count (never one maker twice).
    const setAside = storedSeatsOfRepeatedMakers(of.map((outcome) =>
      ({ seat: outcome.seat.seat, maker: makerOfOutcome(outcome), stored: outcome.recorded !== null })));
    const asideSeats = new Set(setAside.map((entry) => entry.seat));
    const verdict = deriveJudgesVerdict({
      votes: of.filter((outcome) => !asideSeats.has(outcome.seat.seat)).map((outcome) => {
        const reply = replyOf(outcome);
        return Object.freeze({
          seat: outcome.seat.seat,
          maker: makerOfOutcome(outcome),
          reply: reply === null ? null : Object.freeze({ best: reply.best, conditional: reply.conditional, sameAs: reply.sameAs,
            questionKind: reply.questionKind })
        });
      }),
      answers,
      honestFinalStrength: input.honestFinalStrength,
      label: input.engine.label
    });
    const countedBySeat = new Map<number, TallyEntry>(verdict.counted.map((entry) => [entry.seat, entry] as const));
    for (const entry of setAside) countedBySeat.set(entry.seat, Object.freeze({ seat: entry.seat, counted: false, notCountedReason: entry.reason }));
    return Object.freeze({ verdict, countedBySeat, setAside });
  };
  // Controller ruling R2b-B5.1 (B5 fix 1): a fresh row's `counted` is written from the FINAL tally. One seat's `counted`
  // depends on the other seats' replies (OWN_MAKER reads the majority groups, built from every standing reply), so every
  // row another copy stored while these judges were being asked (read again now, `readRecorded`) is the seat's vote
  // before any fresh row is written.
  const storedBySeat = new Map<number, RecordedComparingJudgeVote>();
  if (input.readRecorded !== undefined && outcomes.some((outcome) => outcome.recorded === null)) {
    for (const row of await input.readRecorded()) {
      if (!recordedBySeat.has(row.judgeSeat)) storedBySeat.set(row.judgeSeat, row);
    }
  }
  // Controller carry 6 (B5): a seat another write stored first decides by its STORED row, so the count, the ballots, the
  // records and the writer's block all read it, exactly as a resumed copy would.
  const finalOf = (): readonly Outcome[] => {
    const asRecorded = (row: RecordedComparingJudgeVote): Outcome => Object.freeze({ seat: seatOfRow(row), recorded: row, asked: null });
    const replaced = outcomes.map((outcome) => {
      const stored = storedBySeat.get(outcome.seat.seat);
      return stored === undefined ? outcome : asRecorded(stored);
    });
    const extra = [...storedBySeat.values()].filter((row) => !outcomes.some((outcome) => outcome.seat.seat === row.judgeSeat))
      .map(asRecorded);
    // Ruling W2: a seat this copy asked whose maker another copy's row now holds at another seat is not this copy's to
    // fill (never two judges of one maker); it is neither counted nor written.
    const storedMakers = new Set([...storedBySeat.values()].map((row) => row.maker));
    const kept = replaced.filter((outcome) => outcome.recorded !== null || !storedMakers.has(outcome.asked?.maker ?? outcome.seat.maker));
    return Object.freeze([...kept, ...extra].sort((left, right) => left.seat.seat - right.seat.seat));
  };
  let final = finalOf();
  let tally = tallyOf(final);

  // Each new vote recorded once, in seat order, after the count (so `counted` and its reason are known).
  // The letter's root in THIS copy's servable answers, never a root read from a recorded row (ruling PF-R2b4.6).
  const rootOf = new Map(answers.map((answer) => [answer.letter, answer.rootNodeId] as const));
  const modelOf = new Map(input.candidates.flatMap((candidate) => [[candidate.providerRef, candidate.modelId] as const,
    ...(candidate.alternate === undefined ? [] : [[candidate.alternate.providerRef, candidate.alternate.modelId] as const])]));
  /** The seats this copy asked (a call was made); every other seat's vote is a stored row. */
  const asked = outcomes.filter((outcome) => outcome.recorded === null).length;
  for (const outcome of outcomes) {
    if (outcome.recorded !== null || storedBySeat.has(outcome.seat.seat) || !final.includes(outcome)) continue;
    const reply = standingReplyOf(tally, outcome);
    // The count's own entry: a seat written here is never a set-aside one (O2 sets aside stored seats only).
    const entry = tally.verdict.counted.find((counted) => counted.seat === outcome.seat.seat);
    /*
     * The counted column is a hint; readers recount through deriveJudgesVerdict from the stored letters, groups and
     * makers (controller ruling R2b-B5.1). Rows are immutable: a row an earlier copy wrote keeps the counted value of
     * ITS tally, and a row written here before a later write in this loop answers ALREADY_PRESENT keeps this tally's.
     */
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
      final = finalOf();
      tally = tallyOf(final);
    }
  }
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
    setAside: tally.setAside,
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
    reused: final.length - outcomes.filter((outcome) => outcome.recorded === null && final.some((seat) => seat.seat.seat === outcome.seat.seat)).length
  });
}
