import type { Answer, JudgesComparison } from "@debateai/contract";
import {
  ENGINE_ANSWER_LETTERS, ENGINE_QUESTION_KINDS, STRUCTURE_REPAIR_CALL_SITE_PREFIX, TypedDomainError,
  type EngineAnswerLetter, type EngineQuestionKind
} from "@debateai/kernel";
import { deriveJudgesVerdict, type ComparingJudgeVote } from "./engine-verdict.js";
import { seatBaseCallSiteKey } from "./synthesis.js";

/**
 * R2 (spec §4.4, INTERFACE §9.8; read-time projection, plan deviation 33): how the comparing judges' choices fell, for
 * the owner's honesty panel. Pure: it counts and orders, it never judges.
 *
 * Plain words: every judge that was seated counts as seated, whether or not its reply could be used. Which choices
 * count is COUNTED AGAIN here, by the same code that decided the served answer (`deriveJudgesVerdict`, with ruling
 * R2b-B2.1: a choice is not counted when the answer it names, or any answer a majority grouped with it, is one the
 * judge's own maker argued; a failed judge is never a choice), from the stored letters, groups and makers. The stored
 * `counted` column is a hint that can drift after a resume, because one seat's count depends on the other seats'
 * groups; it is never read here (controller ruling R2b-B5.1). Every position of the debate is listed (a node that
 * argues about no other node, the story's and the page's own rule), most counted choices first, then the stronger
 * case, then the node id; its case is the position's latest final strength.
 *
 * Letters (ruling R2b-B6.1): a letter is the root's place in the debate's PLAN, as the judges' material gives it
 * (`ENGINE_ANSWER_LETTERS[rootIndex]`), never its count among the saved roots: a root that sat out leaves a gap (roots
 * A and C, no B). The place is read exactly from the root's author call (its ledger call-site key: `JUDGE` is root 0,
 * `JUDGE:root:secondary` root 1, `JUDGE:root:<n>` root n). When a position's place cannot be read, the saved order is
 * used only if nothing shows a gap; when anything does, or the rows contradict the places, no section is shown rather
 * than numbers that differ from the served verdict.
 */
// pre-flight PF-R2b4.4: named ComparisonVote, because @debateai/judgement (A10) already exports a different StoredVerdictVote.
// `chosenLetter` resolves a vote reused after a re-claim, whose root is the dead copy's (Ruling PF-R2b4.6 option (a)).
export type ComparisonVote = Readonly<{
  judgeSeat: number;
  /** The judge's maker (0121's code token): the own-maker rule reads it. */
  maker: string;
  /**
   * Test-only: the stored column's value, which the answer read does not select. Never read here (controller ruling
   * R2b-B5.1); tests set it to show the recount wins over it.
   */
  counted?: boolean;
  chosenRootNodeId: string | null;
  chosenLetter: string | null;
  conditional: boolean | null;
  /** The letters the judge named as one answer (0121's `same_as`). */
  sameAs: readonly (readonly string[])[];
  questionKind: string | null;
}>;

/** A root's author call site, as the ledger recorded it for the call whose reply the root node is. */
export type RootCallSite = Readonly<{ nodeId: string; callSiteKey: string }>;

/** The answer letters, fixed per debate: A is root index 0 (A2's list, read as plain strings). */
const LETTER_ORDER: readonly string[] = ENGINE_ANSWER_LETTERS;
const QUESTION_KINDS: readonly string[] = ENGINE_QUESTION_KINDS;
const isLetter = (value: unknown): value is EngineAnswerLetter => typeof value === "string" && LETTER_ORDER.includes(value);

/**
 * The recount reads only which votes count (rule 1, which never reads the label). The label row is not read on an
 * answer read, so the count is given the smallest label that passes its input check; the label it derives is dropped.
 */
const RECOUNT_LABEL = Object.freeze({ clearAgreeing: 1, closeCallAgreeing: 1 });

/** The runner's root call sites (apps/runner rootCallSiteKey, FIRST_POSITION_CALL_SITE_KEY): the root's plan place. */
const ROOT_SITES = Object.freeze({ first: "JUDGE", second: "JUDGE:root:secondary", numbered: /^JUDGE:root:(\d+)$/u });

/** The plan place a root's author call names (a structure repair is filed under the key it repairs), or null. */
function rootIndexOfCallSite(key: string): number | null {
  const unrepaired = key.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX) ? key.slice(STRUCTURE_REPAIR_CALL_SITE_PREFIX.length) : key;
  const base = seatBaseCallSiteKey(unrepaired);
  if (base === ROOT_SITES.first) return 0;
  if (base === ROOT_SITES.second) return 1;
  const numbered = ROOT_SITES.numbered.exec(base);
  return numbered === null ? null : Number(numbered[1]);
}

/** A stored row as the count reads it: a row with no whole, well-formed reply is a judge with no usable reply. */
function recountVoteOf(vote: ComparisonVote, usable: boolean): ComparingJudgeVote {
  const sameAs = Array.isArray(vote.sameAs) && vote.sameAs.every((group) => Array.isArray(group) && group.every(isLetter))
    ? vote.sameAs as readonly (readonly EngineAnswerLetter[])[]
    : null;
  const whole = usable && isLetter(vote.chosenLetter) && typeof vote.conditional === "boolean" && sameAs !== null
    && typeof vote.questionKind === "string" && QUESTION_KINDS.includes(vote.questionKind);
  return Object.freeze({
    seat: vote.judgeSeat,
    maker: vote.maker,
    reply: whole
      ? Object.freeze({
        best: vote.chosenLetter as EngineAnswerLetter,
        conditional: vote.conditional as boolean,
        sameAs: sameAs!,
        questionKind: vote.questionKind as EngineQuestionKind
      })
      : null
  });
}

/** Every letter a row names: its choice and its groups. */
const lettersNamedBy = (vote: ComparisonVote): readonly string[] => [
  ...(vote.chosenLetter === null ? [] : [vote.chosenLetter]),
  ...(Array.isArray(vote.sameAs) ? vote.sameAs.flatMap((group) => (Array.isArray(group) ? group : [])) : [])
];

/**
 * Each position's letter, or null when no honest letter can be given (show no section). Exact: every position's plan
 * place read from its author call. Otherwise the saved order, only when no row shows a gap.
 */
function lettersOf(
  positions: Answer["nodes"],
  votes: readonly ComparisonVote[],
  rootSites: readonly RootCallSite[]
): Readonly<{ letterOfRoot: ReadonlyMap<string, string>; exact: boolean }> | null {
  const placesOf = new Map<string, Set<number | null>>();
  for (const site of rootSites) {
    placesOf.set(site.nodeId, (placesOf.get(site.nodeId) ?? new Set()).add(rootIndexOfCallSite(site.callSiteKey)));
  }
  const exactPlace = (nodeId: string): number | null => {
    const places = [...(placesOf.get(nodeId) ?? [])];
    return places.length === 1 && places[0] !== null && places[0] !== undefined ? places[0] : null;
  };
  const exact = positions.every((node) => exactPlace(node.node_id) !== null);
  const letterOfRoot = new Map<string, string>();
  positions.forEach((node, index) => {
    const letter = LETTER_ORDER[exact ? exactPlace(node.node_id)! : index];
    if (letter !== undefined) letterOfRoot.set(node.node_id, letter);
  });
  // Two positions at one place, or a place past the letters: the record is not a plan the judges could have read.
  if (exact && new Set(letterOfRoot.values()).size !== positions.length) return null;
  // A row whose root is a position of this version fixes that root's letter: it must agree.
  for (const vote of votes) {
    if (vote.chosenRootNodeId === null || !letterOfRoot.has(vote.chosenRootNodeId) || vote.chosenLetter === null) continue;
    if (letterOfRoot.get(vote.chosenRootNodeId) !== vote.chosenLetter) return null;
  }
  if (!exact) {
    // Guessed from the saved order: refuse when any named letter sits at or past the number of saved roots (a gap).
    const saved = positions.length;
    if (votes.some((vote) => lettersNamedBy(vote).some((letter) => {
      const index = LETTER_ORDER.indexOf(letter);
      return index < 0 || index >= saved;
    }))) return null;
  }
  return Object.freeze({ letterOfRoot, exact });
}

export function judgesComparisonOf(
  votes: readonly ComparisonVote[],
  nodes: Answer["nodes"],
  edges: Answer["edges"],
  rootSites: readonly RootCallSite[]
): JudgesComparison | undefined {
  if (votes.length === 0) return undefined;
  const arguing = new Set<string>();
  for (const edge of edges) {
    if (edge.target_kind === "NODE" && edge.target_ref === edge.from_node_ref) continue;
    arguing.add(edge.from_node_ref);
  }
  const positions = nodes.filter((node) => !arguing.has(node.node_id));
  if (positions.length === 0) return undefined;
  const letters = lettersOf(positions, votes, rootSites);
  if (letters === null) return undefined;
  const { letterOfRoot, exact } = letters;
  const rootOfLetter = new Map([...letterOfRoot].map(([root, letter]) => [letter, root] as const));
  /** Letters some row fixes through a root of this version. */
  const fixedLetters = new Set(votes.flatMap((vote) =>
    vote.chosenRootNodeId !== null && letterOfRoot.has(vote.chosenRootNodeId) && vote.chosenLetter !== null ? [vote.chosenLetter] : []));
  // A row reused after a re-claim names the dead copy's root. With exact letters its letter names its answer; with
  // guessed letters it counts only when a fresh row fixes the same letter, else it is no usable reply (ruling R2b-B6.1).
  const usable = (vote: ComparisonVote): boolean => exact || vote.chosenRootNodeId === null
    || letterOfRoot.has(vote.chosenRootNodeId) || (vote.chosenLetter !== null && fixedLetters.has(vote.chosenLetter));

  const lettered = positions.filter((node) => letterOfRoot.has(node.node_id));
  const strengthOf = (node: Answer["nodes"][number]): number | null =>
    node.final_strength === null ? null : Math.min(1, Math.max(0, node.final_strength.value));
  const chose = new Map<string, number>();
  let recount: ReturnType<typeof deriveJudgesVerdict>;
  try {
    recount = deriveJudgesVerdict({
      votes: votes.map((vote) => recountVoteOf(vote, usable(vote))),
      answers: lettered.map((node) => Object.freeze({
        letter: letterOfRoot.get(node.node_id) as EngineAnswerLetter,
        rootNodeId: node.node_id,
        arguedByMaker: node.maker_lineage?.maker ?? null
      })),
      // The tie-break of the winner only, which this read never uses; a position without a strength sorts last.
      honestFinalStrength: new Map(lettered.map((node) => [node.node_id, strengthOf(node) ?? -1] as const)),
      label: RECOUNT_LABEL
    });
  } catch (error) {
    // Rows the count refuses (B6 fix round 1, Minor 2): no section, never a failed answer read. The code only.
    if (error instanceof TypedDomainError && error.code === "JUDGES_VERDICT_INPUT_INVALID") return undefined;
    throw error;
  }
  const countedSeats = new Set(recount.counted.filter((entry) => entry.counted).map((entry) => entry.seat));
  for (const vote of votes) {
    if (!countedSeats.has(vote.judgeSeat)) continue;
    const root = rootOfLetter.get(vote.chosenLetter ?? "");
    if (root !== undefined) chose.set(root, (chose.get(root) ?? 0) + 1);
  }
  const answers = positions.map((node) => ({
    root_node_id: node.node_id,
    honest_score: strengthOf(node),
    judges_chose: chose.get(node.node_id) ?? 0
  })).sort((left, right) =>
    right.judges_chose - left.judges_chose
    || (right.honest_score ?? -1) - (left.honest_score ?? -1)
    || (left.root_node_id < right.root_node_id ? -1 : left.root_node_id > right.root_node_id ? 1 : 0));
  return {
    judges_seated: votes.length,
    judges_counted: answers.reduce((sum, entry) => sum + entry.judges_chose, 0),
    answers
  };
}
