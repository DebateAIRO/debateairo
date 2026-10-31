/**
 * ENGINE 2: THE SHARED STRUCTURED MATERIAL (spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md §4.2b,
 * §4.3, §6.2; INTERFACE §8.2, §11.2-§11.3).
 *
 * What the investigator and the comparing judges (R2), and later the answer writer and the story (R4), read about one
 * debate, built from ONE source, so they all mean the same answer by the same letter (letters are fixed per debate:
 * A = root 0, B = root 1, ...). Plain words: code picks, orders and labels the AI-written texts; it never writes a
 * judgment and never hands an AI a number. The source may carry numbers (honest final strengths, to order by); nothing
 * that leaves `engineMaterialOf`, `engineVerdictMaterialOf`, `engineAnswersForWriter` or `pointInvestigationMaterialOf`
 * does. Kernel, plain TypeScript, no zod: judgement, serve, story and the runner all import it.
 */
import { ENGINE_ANSWER_LETTERS, type EngineAnswerLetter } from "./engine.js";

/** What the investigator reads about one "cannot assess" point (INTERFACE §8.2). AI-written texts only. */
export type PointInvestigationMaterial = Readonly<{
  question: string;
  /** The answer the point bears on, in its fixed words. */
  answer: string;
  point: string;
  /** The point it attacks or supports (an answer's case, or its words when it has no separate case). */
  targetPoint: string;
  targetRelation: "ATTACKS" | "SUPPORTS";
  restsOn: "question" | "assumption" | null;
  /** The "cannot assess" review's reasons, one per line. */
  reviewerReason: string;
}>;

/** One investigation's finding, as every reader sees it (`reason` added: plan deviation 17). */
export type EngineMaterialInvestigation = Readonly<{
  missing: string;
  found: string;
  basis: "established" | "assumption" | "none";
  outcome: "holds" | "fails" | "dead_end";
  reason: string;
}>;

/**
 * Web search (plan 2026-10-30 task W4-1; design §3.5): the checked extract a looked-up point rests on: its id in this
 * debate's packs (`S<path>-<n>`), the quote word for word, and the page it is from. Present only on a point (or a case)
 * whose locator is one of this debate's extract ids; absent everywhere else and on every debate with no packs, so the
 * material built without one is today's, byte for byte. Code copies it from the stored pack; an AI never writes it.
 */
export type EngineCitedExtract = Readonly<{ id: string; quote: string; title: string | null; site: string; date: string | null }>;

export type EngineMaterialPoint = Readonly<{
  /** The node id (the writer's node_refs; the story maps it to Pn). */
  pointRef: string;
  /** The point's statement, whole. */
  text: string;
  relation: "SUPPORTS" | "ATTACKS";
  /** The node it supports or attacks. */
  targetRef: string;
  /** An objection made by that answer's cross-reply. */
  fromRivalReply: EngineAnswerLetter | null;
  restsOn: "question" | "assumption" | null;
  /** A review dispute, or an investigation that found the point fails. */
  disputed: boolean;
  /** "Cannot assess", not resolved by an investigation. */
  notYetChecked: boolean;
  investigation: EngineMaterialInvestigation | null;
  /** W4-1: the extract the point cites; absent when it cites none of this debate's. */
  citedExtract?: EngineCitedExtract;
}>;

export type EngineMaterialAnswer = Readonly<{
  letter: EngineAnswerLetter;
  rootNodeId: string;
  /** The answer's fixed words (the map's chosen words when it has them, else the position's own statement). */
  words: string;
  /** The position writer's case; null when the words ARE the case (today's opening). */
  caseText: string | null;
  /** Strongest first by honest final strength. */
  supports: readonly EngineMaterialPoint[];
  /** Strongest first by honest final strength. */
  objections: readonly EngineMaterialPoint[];
  assumptions: readonly string[];
  /** W4-1: the extract the position's case cites; absent when it cites none of this debate's. */
  citedExtract?: EngineCitedExtract;
}>;

export type EngineDisputedPoint = Readonly<{
  letter: EngineAnswerLetter; pointRef: string; text: string; reviewerReasons: readonly string[];
}>;

export type EngineDebateMaterial = Readonly<{
  question: string;
  /** Letter order (A, B, ...). */
  answers: readonly EngineMaterialAnswer[];
  disputed: readonly EngineDisputedPoint[];
}>;

/** Filled after the comparing judges (B5). */
export type EngineVerdictBlock = Readonly<{
  label: "SUPPORTED" | "CONTESTED" | "SPLIT";
  winner: EngineAnswerLetter;
  conditional: boolean;
  /** Never the judge's maker. */
  judgesReasons: readonly Readonly<{ chose: EngineAnswerLetter; reasons: string }>[];
}>;
export type EngineVerdictMaterial = EngineDebateMaterial & Readonly<{ verdict: EngineVerdictBlock }>;

/** One point of the source. Numbers are allowed here (to order by), never in the material built from it. */
export type EngineMaterialSourcePoint = Readonly<{
  nodeId: string;
  text: string;
  relation: "SUPPORTS" | "ATTACKS";
  targetRef: string;
  /** The answer whose root the point's chain of targets ends at. */
  answerLetter: EngineAnswerLetter;
  fromRivalReply: EngineAnswerLetter | null;
  restsOn: "question" | "assumption" | null;
  /** The point's own cross-maker review, after its investigation. */
  status: "AGREE" | "DISPUTE" | "CANNOT_ASSESS" | "NONE";
  reviewerReasons: readonly string[];
  honestFinalStrength: number;
  investigation: EngineMaterialInvestigation | null;
  /** W4-1: the extract the point cites (code's copy from the debate's packs); absent when it cites none. */
  citedExtract?: EngineCitedExtract;
}>;

export type EngineMaterialSource = Readonly<{
  question: string;
  answers: readonly Readonly<{
    letter: EngineAnswerLetter; rootNodeId: string; words: string; caseText: string | null; assumptions: readonly string[];
    /** W4-1: the extract the position's case cites; absent when it cites none. */
    citedExtract?: EngineCitedExtract;
  }>[];
  points: readonly EngineMaterialSourcePoint[];
}>;

/** Which answer a point bears on, how many links from that answer's root, and on which side of it. */
export type EnginePointPlacement = Readonly<{
  answerLetter: EngineAnswerLetter;
  /** 1 = attacks or supports the answer's root itself; 2 = one link further; ... */
  distanceToAnswer: number;
  /** FOR when the chain of links to the root holds an even number of attacks, else AGAINST. */
  side: "FOR" | "AGAINST";
}>;

const invalid = (field: string): TypeError => new TypeError(`ENGINE_MATERIAL_INVALID:${field}`);

/** Code-unit order: the same on every machine, whatever its locale. */
const byText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const letterRank = (letter: EngineAnswerLetter): number => ENGINE_ANSWER_LETTERS.indexOf(letter);

/**
 * Follows a point's chain of targets to an answer's root. Throws ENGINE_MATERIAL_INVALID on an unknown point, a
 * target nobody wrote, or a loop. A placement helper for code (the investigation order reads its distance); it is not
 * material, so its number is never handed to an AI.
 */
export function enginePointPlacement(source: EngineMaterialSource, nodeId: string): EnginePointPlacement {
  const rootLetter = new Map(source.answers.map((answer) => [answer.rootNodeId, answer.letter] as const));
  const points = new Map(source.points.map((point) => [point.nodeId, point] as const));
  let current = points.get(nodeId);
  if (current === undefined) throw invalid("points.nodeId");
  let against = false;
  for (let distance = 1; distance <= points.size; distance += 1) {
    if (current.relation === "ATTACKS") against = !against;
    const letter = rootLetter.get(current.targetRef);
    if (letter !== undefined) return Object.freeze({ answerLetter: letter, distanceToAnswer: distance, side: against ? "AGAINST" : "FOR" });
    const next = points.get(current.targetRef);
    if (next === undefined) throw invalid("points.targetRef");
    current = next;
  }
  throw invalid("points.targetRef");
}

/** Refuses a source code could not have built (duplicates, unknown letters or targets, loops, a non-number strength). */
function checkSource(source: EngineMaterialSource): void {
  if (source.question.trim() === "") throw invalid("question");
  if (source.answers.length === 0) throw invalid("answers");
  const letters = new Set<string>();
  const roots = new Set<string>();
  source.answers.forEach((answer, index) => {
    const at = `answers.${String(index)}`;
    if (!(ENGINE_ANSWER_LETTERS as readonly string[]).includes(answer.letter) || letters.has(answer.letter)) throw invalid(`${at}.letter`);
    if (roots.has(answer.rootNodeId)) throw invalid(`${at}.rootNodeId`);
    if (answer.words.trim() === "") throw invalid(`${at}.words`);
    // R2a final wave (Ruling (A11 Minors) 3): a case is the writer's text or null (the words ARE the case), never blank.
    if (answer.caseText !== null && answer.caseText.trim() === "") throw invalid(`${at}.caseText`);
    letters.add(answer.letter);
    roots.add(answer.rootNodeId);
  });
  const ids = new Set<string>();
  source.points.forEach((point, index) => {
    const at = `points.${String(index)}`;
    if (ids.has(point.nodeId) || roots.has(point.nodeId)) throw invalid(`${at}.nodeId`);
    if (point.text.trim() === "") throw invalid(`${at}.text`);
    if (!letters.has(point.answerLetter)) throw invalid(`${at}.answerLetter`);
    if (point.fromRivalReply !== null && !letters.has(point.fromRivalReply)) throw invalid(`${at}.fromRivalReply`);
    if (!Number.isFinite(point.honestFinalStrength)) throw invalid(`${at}.honestFinalStrength`);
    if (point.targetRef === point.nodeId) throw invalid(`${at}.targetRef`);
    ids.add(point.nodeId);
  });
  source.points.forEach((point, index) => {
    const at = `points.${String(index)}`;
    if (!ids.has(point.targetRef) && !roots.has(point.targetRef)) throw invalid(`${at}.targetRef`);
    let placement: EnginePointPlacement;
    try {
      placement = enginePointPlacement(source, point.nodeId);
    } catch {
      throw invalid(`${at}.targetRef`);
    }
    if (placement.answerLetter !== point.answerLetter) throw invalid(`${at}.answerLetter`);
  });
}

function investigationOf(investigation: EngineMaterialInvestigation | null): EngineMaterialInvestigation | null {
  return investigation === null ? null : Object.freeze({
    missing: investigation.missing, found: investigation.found, basis: investigation.basis,
    outcome: investigation.outcome, reason: investigation.reason
  });
}

/** W4-1: a cited extract, rebuilt member by member (a widened object never passes its extra members on). */
function citedExtractOf(extract: EngineCitedExtract | undefined): Readonly<{ citedExtract?: EngineCitedExtract }> {
  return extract === undefined ? {} : { citedExtract: Object.freeze({ id: extract.id, quote: extract.quote, title: extract.title,
    site: extract.site, date: extract.date }) };
}

function materialPoint(point: EngineMaterialSourcePoint): EngineMaterialPoint {
  return Object.freeze({
    pointRef: point.nodeId,
    text: point.text,
    relation: point.relation,
    targetRef: point.targetRef,
    fromRivalReply: point.fromRivalReply,
    restsOn: point.restsOn,
    disputed: point.status === "DISPUTE",
    notYetChecked: point.status === "CANNOT_ASSESS",
    investigation: investigationOf(point.investigation),
    ...citedExtractOf(point.citedExtract)
  });
}

/** The reasons a disputed point is shown with: the investigator's when its finding was "fails", else the review's. */
function disputeReasons(point: EngineMaterialSourcePoint): readonly string[] {
  return Object.freeze(point.investigation?.outcome === "fails" ? [point.investigation.reason] : [...point.reviewerReasons]);
}

const strongestFirst = (left: EngineMaterialSourcePoint, right: EngineMaterialSourcePoint): number =>
  right.honestFinalStrength - left.honestFinalStrength || byText(left.nodeId, right.nodeId);

/**
 * Pure: selects, orders and labels; never writes a judgment. Each point sits under the answer its chain ends at: as a
 * support when the chain holds an even number of attacks, else as an objection (a reply that attacks an objection
 * speaks FOR the answer). Strongest first by honest final strength, ties by node id. Disputed points appear both in
 * their answer and in `disputed`, in letter order. Throws ENGINE_MATERIAL_INVALID.
 */
export function engineMaterialOf(source: EngineMaterialSource): EngineDebateMaterial {
  checkSource(source);
  const placed = source.points.map((point) => Object.freeze({ point, placement: enginePointPlacement(source, point.nodeId) }));
  const answers = [...source.answers].sort((left, right) => letterRank(left.letter) - letterRank(right.letter));
  const ofAnswer = (letter: EngineAnswerLetter): readonly EngineMaterialSourcePoint[] => placed
    .filter((entry) => entry.placement.answerLetter === letter).map((entry) => entry.point);
  const sideOf = new Map(placed.map((entry) => [entry.point.nodeId, entry.placement.side] as const));
  return Object.freeze({
    question: source.question,
    answers: Object.freeze(answers.map((answer): EngineMaterialAnswer => {
      const mine = [...ofAnswer(answer.letter)].sort(strongestFirst);
      return Object.freeze({
        letter: answer.letter,
        rootNodeId: answer.rootNodeId,
        words: answer.words,
        caseText: answer.caseText,
        supports: Object.freeze(mine.filter((point) => sideOf.get(point.nodeId) === "FOR").map(materialPoint)),
        objections: Object.freeze(mine.filter((point) => sideOf.get(point.nodeId) === "AGAINST").map(materialPoint)),
        assumptions: Object.freeze([...answer.assumptions]),
        ...citedExtractOf(answer.citedExtract)
      });
    })),
    disputed: Object.freeze(answers.flatMap((answer) => [...ofAnswer(answer.letter)]
      .filter((point) => point.status === "DISPUTE")
      .sort(strongestFirst)
      .map((point): EngineDisputedPoint => Object.freeze({
        letter: answer.letter, pointRef: point.nodeId, text: point.text, reviewerReasons: disputeReasons(point)
      }))))
  });
}

/** The labels a verdict block may carry (EngineVerdictBlock["label"]). */
const VERDICT_LABELS: ReadonlySet<string> = new Set<EngineVerdictBlock["label"]>(["SUPPORTED", "CONTESTED", "SPLIT"]);

/**
 * The material with the judges' verdict block (B5). Throws ENGINE_MATERIAL_INVALID on a letter the material lacks, an
 * off-list label or a conditional that is not a boolean. R2a final wave (Ruling (A11 Minors) 1, 2): the material is
 * rebuilt member by member, so a widened object (one carrying a number) never passes its extra members on.
 */
export function engineVerdictMaterialOf(material: EngineDebateMaterial, verdict: EngineVerdictBlock): EngineVerdictMaterial {
  const letters = new Set<string>(material.answers.map((answer) => answer.letter));
  if (!VERDICT_LABELS.has(verdict.label)) throw invalid("verdict.label");
  if (!letters.has(verdict.winner)) throw invalid("verdict.winner");
  if (typeof verdict.conditional !== "boolean") throw invalid("verdict.conditional");
  verdict.judgesReasons.forEach((entry, index) => {
    if (!letters.has(entry.chose)) throw invalid(`verdict.judgesReasons.${String(index)}.chose`);
  });
  return Object.freeze({
    question: material.question,
    answers: material.answers,
    disputed: material.disputed,
    verdict: Object.freeze({
      label: verdict.label,
      winner: verdict.winner,
      conditional: verdict.conditional,
      judgesReasons: Object.freeze(verdict.judgesReasons.map((entry) => Object.freeze({ chose: entry.chose, reasons: entry.reasons })))
    })
  });
}

/**
 * The answers in the order the caller names (R4: winner first, then by counted votes, then honest final strength;
 * the caller computes that order, because the material carries no number). `order` names every letter once.
 */
export function engineAnswersForWriter(material: EngineVerdictMaterial, order: readonly EngineAnswerLetter[]): readonly EngineMaterialAnswer[] {
  const byLetter = new Map(material.answers.map((answer) => [answer.letter, answer] as const));
  if (order.length !== byLetter.size || new Set(order).size !== order.length || order.some((letter) => !byLetter.has(letter))) {
    throw invalid("order");
  }
  return Object.freeze(order.flatMap((letter) => { const answer = byLetter.get(letter); return answer === undefined ? [] : [answer]; }));
}

/**
 * The investigator's material for one point (INTERFACE §8.2): the answer the point bears on in its fixed words, the
 * point, the node it attacks or supports (an answer's case, or its words without one), and the reviewer's reasons.
 */
export function pointInvestigationMaterialOf(source: EngineMaterialSource, nodeId: string): PointInvestigationMaterial {
  checkSource(source);
  const point = source.points.find((candidate) => candidate.nodeId === nodeId);
  if (point === undefined) throw invalid("points.nodeId");
  const answer = source.answers.find((candidate) => candidate.letter === point.answerLetter);
  if (answer === undefined) throw invalid("points.answerLetter");
  const targetAnswer = source.answers.find((candidate) => candidate.rootNodeId === point.targetRef);
  const targetPoint = targetAnswer !== undefined
    ? targetAnswer.caseText ?? targetAnswer.words
    : source.points.find((candidate) => candidate.nodeId === point.targetRef)?.text;
  if (targetPoint === undefined) throw invalid("points.targetRef");
  return Object.freeze({
    question: source.question,
    answer: answer.words,
    point: point.text,
    targetPoint,
    targetRelation: point.relation,
    restsOn: point.restsOn,
    reviewerReason: point.reviewerReasons.join("\n")
  });
}
