import type { Answer, JudgesComparison } from "@debateai/contract";
import {
  ENGINE_ANSWER_LETTERS, ENGINE_QUESTION_KINDS, type EngineAnswerLetter, type EngineQuestionKind
} from "@debateai/kernel";
import { deriveJudgesVerdict, type ComparingJudgeVote } from "./engine-verdict.js";

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
 */
// pre-flight PF-R2b4.4: named ComparisonVote, because @debateai/judgement (A10) already exports a different StoredVerdictVote.
// `chosenLetter` resolves a vote reused after a re-claim, whose root is the dead copy's (Ruling PF-R2b4.6 option (a)).
export type ComparisonVote = Readonly<{
  judgeSeat: number;
  /** The judge's maker (0121's code token): the own-maker rule reads it. */
  maker: string;
  /** The stored column: a hint only, never read (controller ruling R2b-B5.1). */
  counted: boolean;
  chosenRootNodeId: string | null;
  chosenLetter: string | null;
  conditional: boolean | null;
  /** The letters the judge named as one answer (0121's `same_as`). */
  sameAs: readonly (readonly string[])[];
  questionKind: string | null;
}>;

/** The answer letters, fixed per debate: A is root index 0 (A2's list, read as plain strings). */
const LETTER_ORDER: readonly string[] = ENGINE_ANSWER_LETTERS;
const QUESTION_KINDS: readonly string[] = ENGINE_QUESTION_KINDS;
const isLetter = (value: unknown): value is EngineAnswerLetter => typeof value === "string" && LETTER_ORDER.includes(value);

/**
 * The recount reads only which votes count (rule 1, which never reads the label). The label row is not read on an
 * answer read, so the count is given the smallest label that passes its input check; the label it derives is dropped.
 */
const RECOUNT_LABEL = Object.freeze({ clearAgreeing: 1, closeCallAgreeing: 1 });

/** A stored row as the count reads it: a row with no whole, well-formed reply is a judge with no usable reply. */
function recountVoteOf(vote: ComparisonVote): ComparingJudgeVote {
  const sameAs = Array.isArray(vote.sameAs) && vote.sameAs.every((group) => Array.isArray(group) && group.every(isLetter))
    ? vote.sameAs as readonly (readonly EngineAnswerLetter[])[]
    : null;
  const whole = isLetter(vote.chosenLetter) && typeof vote.conditional === "boolean" && sameAs !== null
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

export function judgesComparisonOf(
  votes: readonly ComparisonVote[],
  nodes: Answer["nodes"],
  edges: Answer["edges"]
): JudgesComparison | undefined {
  if (votes.length === 0) return undefined;
  const arguing = new Set<string>();
  for (const edge of edges) {
    if (edge.target_kind === "NODE" && edge.target_ref === edge.from_node_ref) continue;
    arguing.add(edge.from_node_ref);
  }
  const positions = nodes.filter((node) => !arguing.has(node.node_id));
  if (positions.length === 0) return undefined;
  const positionIds = new Set(positions.map((node) => node.node_id));

  // Each position's letter. A stored row names its letter and the root that letter meant in the copy that wrote it: a
  // fresh row of the serving copy names a position of this version, so its pair is the letter's root. A position no
  // such row names takes the letter of its root index (the nodes are read in creation order and the roots are made in
  // root-index order), so a vote reused after a re-claim, which names the dead copy's root, is resolved by its letter
  // (Ruling PF-R2b4.6 option (a)).
  const rootOfLetter = new Map<string, string>();
  const letterOfRoot = new Map<string, string>();
  for (const vote of votes) {
    if (!isLetter(vote.chosenLetter) || vote.chosenRootNodeId === null || !positionIds.has(vote.chosenRootNodeId)) continue;
    if (rootOfLetter.has(vote.chosenLetter) || letterOfRoot.has(vote.chosenRootNodeId)) continue;
    rootOfLetter.set(vote.chosenLetter, vote.chosenRootNodeId);
    letterOfRoot.set(vote.chosenRootNodeId, vote.chosenLetter);
  }
  positions.forEach((node, index) => {
    const letter = LETTER_ORDER[index];
    if (letter === undefined || letterOfRoot.has(node.node_id) || rootOfLetter.has(letter)) return;
    rootOfLetter.set(letter, node.node_id);
    letterOfRoot.set(node.node_id, letter);
  });

  const lettered = positions.filter((node) => letterOfRoot.has(node.node_id));
  const strengthOf = (node: Answer["nodes"][number]): number | null =>
    node.final_strength === null ? null : Math.min(1, Math.max(0, node.final_strength.value));
  const chose = new Map<string, number>();
  if (lettered.length > 0) {
    const recount = deriveJudgesVerdict({
      votes: votes.map(recountVoteOf),
      answers: lettered.map((node) => Object.freeze({
        letter: letterOfRoot.get(node.node_id) as EngineAnswerLetter,
        rootNodeId: node.node_id,
        arguedByMaker: node.maker_lineage?.maker ?? null
      })),
      // The tie-break of the winner only, which this read never uses; a position without a strength sorts last.
      honestFinalStrength: new Map(lettered.map((node) => [node.node_id, strengthOf(node) ?? -1] as const)),
      label: RECOUNT_LABEL
    });
    const countedSeats = new Set(recount.counted.filter((entry) => entry.counted).map((entry) => entry.seat));
    for (const vote of votes) {
      if (!countedSeats.has(vote.judgeSeat)) continue;
      const root = rootOfLetter.get(vote.chosenLetter ?? "");
      if (root !== undefined) chose.set(root, (chose.get(root) ?? 0) + 1);
    }
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
