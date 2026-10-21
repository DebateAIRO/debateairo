import type { Answer, JudgesComparison } from "@debateai/contract";
import {
  ENGINE_ANSWER_LETTERS, ENGINE_QUESTION_KINDS, SERVED_ROOT_SELECTION_RULE_JUDGES, STRUCTURE_REPAIR_CALL_SITE_PREFIX,
  TypedDomainError, type EngineAnswerLetter, type EngineQuestionKind
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
 * argues about no other node, the story's and the page's own rule); its case is the position's latest final strength.
 *
 * Groups (ruling W1, whole-branch review I1): the count decides on a group's combined choices, so each position names
 * the others of its group (`same_answer_as`) and the list follows the count: groups by their combined counted choices,
 * the served answer's group first (the recorded one; the count's winner only when none is recorded, follow-up N1),
 * then the group whose strongest case is stronger, then the node id; inside a group the served answer first, then the
 * most counted choices, the stronger case, the node id.
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

/**
 * The plan place a root's author call names (a structure repair is filed under the key it repairs), or null. Exported for
 * the practice report, which keeps only the root sites it reads (R2b final wave P11).
 */
export function rootIndexOfCallSite(key: string): number | null {
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
  positions: readonly JudgesRecountPosition[],
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
  const exact = positions.every((position) => exactPlace(position.nodeId) !== null);
  const letterOfRoot = new Map<string, string>();
  positions.forEach((position, index) => {
    const letter = LETTER_ORDER[exact ? exactPlace(position.nodeId)! : index];
    if (letter !== undefined) letterOfRoot.set(position.nodeId, letter);
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

/** A position as the recount reads it: its node, the maker that argued it (null when unknown) and its case. */
export type JudgesRecountPosition = Readonly<{ nodeId: string; maker: string | null; strength: number | null }>;

/** Which stored votes count, as the served verdict counted them, and the letters that count read. */
export type JudgesRecount = Readonly<{
  /** Each lettered position's letter (its plan place, ruling R2b-B6.1). */
  letterOfRoot: ReadonlyMap<string, string>;
  /** Per seat, from `deriveJudgesVerdict` (rule 1 with ruling R2b-B2.1), never from the stored `counted` column. */
  counted: ReturnType<typeof deriveJudgesVerdict>["counted"];
  /** The groups a majority of the seated judges named (rule 2), letters in answer order. */
  groups: ReturnType<typeof deriveJudgesVerdict>["groups"];
  /**
   * The count's winner (rule 3), over the positions' latest final strengths. A review catch-up can refresh those
   * strengths after the answer was served, so at a tie this need not be the served answer: the panel leads with the
   * RECORDED served answer and reads this only when none is recorded (follow-up N1).
   */
  winnerRootNodeId: string;
}>;

/**
 * The count again, from the stored rows (controller ruling R2b-B5.1): each position lettered by its plan place (ruling
 * R2b-B6.1), then `deriveJudgesVerdict` over the stored letters, groups, makers, conditional flags and question kinds.
 * Null when no honest letter can be given or the count refuses the rows: no numbers rather than numbers that differ
 * from the served verdict. The honesty panel and the practice report (tools/preview-practice) both read it. Pure.
 */
export function recountJudgesVotes(
  votes: readonly ComparisonVote[],
  positions: readonly JudgesRecountPosition[],
  rootSites: readonly RootCallSite[]
): JudgesRecount | null {
  const letters = lettersOf(positions, votes, rootSites);
  if (letters === null) return null;
  const { letterOfRoot, exact } = letters;
  /** Letters some row fixes through a root of this version. */
  const fixedLetters = new Set(votes.flatMap((vote) =>
    vote.chosenRootNodeId !== null && letterOfRoot.has(vote.chosenRootNodeId) && vote.chosenLetter !== null ? [vote.chosenLetter] : []));
  // A row reused after a re-claim names the dead copy's root. With exact letters its letter names its answer; with
  // guessed letters it counts only when a fresh row fixes the same letter, else it is no usable reply (ruling R2b-B6.1).
  const usable = (vote: ComparisonVote): boolean => exact || vote.chosenRootNodeId === null
    || letterOfRoot.has(vote.chosenRootNodeId) || (vote.chosenLetter !== null && fixedLetters.has(vote.chosenLetter));
  const lettered = positions.filter((position) => letterOfRoot.has(position.nodeId));
  try {
    const recount = deriveJudgesVerdict({
      votes: votes.map((vote) => recountVoteOf(vote, usable(vote))),
      answers: lettered.map((position) => Object.freeze({
        letter: letterOfRoot.get(position.nodeId) as EngineAnswerLetter,
        rootNodeId: position.nodeId,
        arguedByMaker: position.maker
      })),
      // The tie-break of the winner only (a position without a strength sorts last). `judgesComparisonOf` reads that
      // winner only when no served answer is recorded (follow-up N1); the practice report reads only the counts and
      // the letters.
      honestFinalStrength: new Map(lettered.map((position) => [position.nodeId, position.strength ?? -1] as const)),
      label: RECOUNT_LABEL
    });
    return Object.freeze({ letterOfRoot, counted: recount.counted, groups: recount.groups, winnerRootNodeId: recount.winnerRootNodeId });
  } catch (error) {
    // Rows the count refuses (B6 fix round 1, Minor 2): no numbers, never a failed read. The code only.
    if (error instanceof TypedDomainError && error.code === "JUDGES_VERDICT_INPUT_INVALID") return null;
    throw error;
  }
}

/** The debate's positions: every node that argues about no other node (the story's and the page's own rule). */
function positionsOf(nodes: Answer["nodes"], edges: Answer["edges"]): Answer["nodes"] {
  const arguing = new Set<string>();
  for (const edge of edges) {
    if (edge.target_kind === "NODE" && edge.target_ref === edge.from_node_ref) continue;
    arguing.add(edge.from_node_ref);
  }
  return nodes.filter((node) => !arguing.has(node.node_id));
}

/**
 * Follow-up N1: the recorded served answer, read from the served number: the one position whose provenance its
 * `source_ref` names (the served node's provenance, as the review catch-up's source read joins them). Null when the
 * answer has no served number (components only) or the numbers name no single position.
 */
export function servedPositionOf(nodes: Answer["nodes"], edges: Answer["edges"], sourceRefs: readonly string[]): string | null {
  const sources = new Set(sourceRefs);
  const named = [...new Set(positionsOf(nodes, edges).filter((node) => sources.has(node.provenance_ref)).map((node) => node.node_id))];
  return named.length === 1 ? named[0]! : null;
}

/**
 * Side-by-side spec §5 (plan C15): two releases read one database, and the recount below is THIS code counting a
 * debate's stored votes again. It is shown only when this code implements the rule that decided the debate:
 *   - no release is named (`ownReleaseKey` undefined: the runner, the practice report, tests): today's behaviour;
 *   - the debate is this release's own (`runReleaseKey === ownReleaseKey`);
 *   - the debate's sealed record names the comparing judges' rule (`SERVED_ROOT_SELECTION_RULE_JUDGES`).
 * Otherwise the section is left out, the same "no section rather than numbers that differ from the served verdict" rule
 * as `lettersOf`.
 *
 * The rule's NAME is the rule's version: a change to `deriveJudgesVerdict`'s counting must take a new
 * `served_root_rule` name. A new name is a migration of 0121's declared rule history
 * (`condition_mark_served_root_rule_rule_check`), which a reviewer sees, so an older release never shows a recount of a
 * rule it does not implement. Pure.
 */
export function judgesRecountApplies(input: Readonly<{
  runReleaseKey: string; ownReleaseKey: string | undefined; servedRootRule: string | null;
}>): boolean {
  return input.ownReleaseKey === undefined
    || input.runReleaseKey === input.ownReleaseKey
    || input.servedRootRule === SERVED_ROOT_SELECTION_RULE_JUDGES;
}

export function judgesComparisonOf(
  votes: readonly ComparisonVote[],
  nodes: Answer["nodes"],
  edges: Answer["edges"],
  rootSites: readonly RootCallSite[],
  /**
   * The answer the run served, as recorded (the answer read takes it from the served number's `source_ref`, the served
   * node's provenance). Its group leads the list; null or absent, or not a listed answer: the recount's winner leads.
   */
  servedRootNodeId: string | null = null
): JudgesComparison | undefined {
  if (votes.length === 0) return undefined;
  const positions = positionsOf(nodes, edges);
  if (positions.length === 0) return undefined;
  const strengthOf = (node: Answer["nodes"][number]): number | null =>
    node.final_strength === null ? null : Math.min(1, Math.max(0, node.final_strength.value));
  const recount = recountJudgesVotes(votes, positions.map((node) => Object.freeze({
    nodeId: node.node_id, maker: node.maker_lineage?.maker ?? null, strength: strengthOf(node)
  })), rootSites);
  if (recount === null) return undefined;
  const rootOfLetter = new Map([...recount.letterOfRoot].map(([root, letter]) => [letter, root] as const));
  const chose = new Map<string, number>();
  const countedSeats = new Set(recount.counted.filter((entry) => entry.counted).map((entry) => entry.seat));
  for (const vote of votes) {
    if (!countedSeats.has(vote.judgeSeat)) continue;
    const root = rootOfLetter.get(vote.chosenLetter ?? "");
    if (root !== undefined) chose.set(root, (chose.get(root) ?? 0) + 1);
  }
  // Ruling W1: the count's groups, as roots; a position in no group is a group of its own.
  const groupOfRoot = new Map<string, readonly string[]>();
  for (const group of recount.groups) {
    const roots = group.flatMap((letter) => rootOfLetter.get(letter) ?? []);
    for (const root of roots) groupOfRoot.set(root, roots);
  }
  type Entry = JudgesComparison["answers"][number];
  const entries: Entry[] = positions.map((node) => ({
    root_node_id: node.node_id,
    honest_score: strengthOf(node),
    judges_chose: chose.get(node.node_id) ?? 0,
    same_answer_as: (groupOfRoot.get(node.node_id) ?? []).filter((root) => root !== node.node_id)
  }));
  const codeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
  // Follow-up N1 (scoped re-review): the served answer and its label stand as stored after a review catch-up, while the
  // strengths the recount reads are the latest; so the recorded served answer leads, never a recount over new strengths.
  const winner = servedRootNodeId !== null && entries.some((entry) => entry.root_node_id === servedRootNodeId)
    ? servedRootNodeId : recount.winnerRootNodeId;
  const firstOf = (entry: Entry): number => (entry.root_node_id === winner ? 0 : 1);
  const stronger = (left: Entry, right: Entry): number =>
    (right.honest_score ?? -1) - (left.honest_score ?? -1) || codeUnits(left.root_node_id, right.root_node_id);
  const byId = new Map(entries.map((entry) => [entry.root_node_id, entry] as const));
  const placed = new Set<string>();
  const clusters: Entry[][] = [];
  for (const entry of entries) {
    if (placed.has(entry.root_node_id)) continue;
    const members = [entry, ...entry.same_answer_as.flatMap((root) => byId.get(root) ?? [])];
    for (const member of members) placed.add(member.root_node_id);
    clusters.push(members.sort((left, right) =>
      firstOf(left) - firstOf(right) || right.judges_chose - left.judges_chose || stronger(left, right)));
  }
  const total = (cluster: readonly Entry[]): number => cluster.reduce((sum, entry) => sum + entry.judges_chose, 0);
  const strongest = (cluster: readonly Entry[]): Entry => [...cluster].sort(stronger)[0]!;
  clusters.sort((left, right) => firstOf(left[0]!) - firstOf(right[0]!) || total(right) - total(left)
    || stronger(strongest(left), strongest(right)));
  const answers = clusters.flat();
  return {
    judges_seated: votes.length,
    judges_counted: answers.reduce((sum, entry) => sum + entry.judges_chose, 0),
    answers
  };
}
