import { ContractHttpError, type Answer, type AnswerFloor, type ContractClient } from "@debateai/contract";
import { localeDirection } from "../i18n/questionLocale.js";
import { t, type MessageCatalog } from "../i18n/translate.js";
import type { LiveVerdictState } from "../types.js";
import { liveVerdictState } from "./labels.js";
import { storyLabelWords, type StoryLabel } from "./storyWords.js";

/**
 * THE FLOOR ANSWER (spec 2026-09-26 §14.4.4, Task M6). When no answer could be
 * written, the engine still kept the arithmetic label and the position it rests
 * on (Task M5). The page then shows, in place of the "Components-only…" line:
 * the label in human words, "Our best answer:", and the leading position's own
 * statement, which is already in the question's language. The sealed answer
 * stays components-only; the honesty drawer keeps its true marks.
 */

/** An answer as the floor needs it: the owner's Answer, or a public snapshot's answer (publicFloorHost). */
export interface FloorHost {
  readonly terminal: string;
  /** The answer's own label; a floor only ever stands in for an answer that has none. */
  readonly verdict: StoryLabel | null;
  readonly nodes: readonly Readonly<{ node_id: string; claim: string }>[];
}

/** A floor that applies to its answer, with the leading position's statement taken from that answer. */
export interface ResolvedFloor {
  readonly label: StoryLabel;
  readonly leadingNodeId: string;
  readonly statement: string;
  /** The label was derived without a rival position or a second opinion to compare (the page says so plainly). */
  readonly basisIncomplete: boolean;
}

/**
 * The floor, when it applies: the answer ended components-only, carries no
 * label of its own, and names the leading position among its own points. Null
 * otherwise, and the page then reads exactly as it did before.
 */
export function resolveFloor(host: FloorHost | null, floor: AnswerFloor | null | undefined): ResolvedFloor | null {
  if (host === null || floor === null || floor === undefined) return null;
  if (host.terminal !== "COMPONENTS_ONLY" || host.verdict !== null) return null;
  const statement = host.nodes.find((node) => node.node_id === floor.leading_node_id)?.claim.trim() ?? "";
  if (statement.length === 0) return null;
  return {
    label: floor.verdict_state,
    leadingNodeId: floor.leading_node_id,
    statement,
    basisIncomplete: floor.basis_incomplete
  };
}

/** A public snapshot's answer as a floor host. A snapshot published without its points has no statement to show. */
export function publicFloorHost(answer: Readonly<{
  terminal: string;
  verdict: StoryLabel | null;
  nodes?: readonly Readonly<{ node_id: string; claim: string }>[] | undefined;
}>): FloorHost {
  return { terminal: answer.terminal, verdict: answer.verdict, nodes: answer.nodes ?? [] };
}

/**
 * The floor answer in words. `catalog` is a `public` catalogue and `locale` its
 * locale: the interface's in the owner's verdict area (like every other fixed
 * word there), the question's on the public page and in the story strip.
 * `statementLocale` is the language the debate was argued in, the statement's
 * own.
 */
export interface FloorAnswerView {
  readonly locale: string;
  readonly direction: "ltr" | "rtl";
  readonly statementLocale: string;
  readonly statementDirection: "ltr" | "rtl";
  readonly verdictState: LiveVerdictState;
  readonly labelWords: string;
  readonly lead: string;
  readonly statement: string;
  /** One plain line when the label rests on less than usual; null otherwise. */
  readonly thinBasis: string | null;
}

export function floorAnswerView(
  floor: ResolvedFloor,
  catalog: MessageCatalog,
  locale: string,
  statementLocale: string
): FloorAnswerView {
  return {
    locale,
    direction: localeDirection(locale),
    statementLocale,
    statementDirection: localeDirection(statementLocale),
    verdictState: liveVerdictState(floor.label),
    labelWords: storyLabelWords(floor.label, catalog),
    lead: t(catalog, "public.story.floorLead"),
    statement: floor.statement,
    thinBasis: floor.basisIncomplete ? t(catalog, "public.story.floorThinBasis") : null
  };
}

/**
 * The owner's read of the floor, where the page reads the answer. Only a
 * components-only answer can have one, so no other answer is read. A 404
 * (DISCLOSURE_NOT_FOUND: an answer from before the record existed) is no floor;
 * any other failure is no floor either, but `failed` says it could not be read,
 * so a refresh keeps a floor the page already shows for the same answer.
 */
export type AnswerFloorRead = Readonly<{ floor: AnswerFloor | null; failed: boolean }>;

export async function readAnswerFloor(
  client: Pick<ContractClient, "readAnswerDisclosure">,
  answer: Pick<Answer, "answer_id" | "terminal">
): Promise<AnswerFloorRead> {
  if (answer.terminal !== "COMPONENTS_ONLY") return { floor: null, failed: false };
  try {
    return { floor: (await client.readAnswerDisclosure(answer.answer_id)).floor, failed: false };
  } catch (failure) {
    return { floor: null, failed: !(failure instanceof ContractHttpError && failure.code === "NOT_FOUND") };
  }
}
