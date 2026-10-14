import { ContractHttpError, type Answer, type ContractClient, type DebateMapView } from "@debateai/contract";
import { modelMeta } from "../models.js";
import { PREVIEW_MODEL_MAKERS } from "../previewPlanRoster.js";
import { t, type MessageCatalog } from "../i18n/translate.js";

/**
 * DEBATE SHAPE P2c (spec 2026-10-12 §3.3 step 8): the debate page's map view, read where the
 * page reads the answer, as the floor is. A 404 (a run without the new shape, or a map that
 * chose nothing) is no view. Any other failure is also no view, but `failed` says it could not
 * be read, so a refresh keeps the view the page already shows for the same answer.
 * Pure: the server-side page imports it. The React context lives in components/PositionTitle.
 */
export type AnswerMapViewRead = Readonly<{ mapView: DebateMapView | null; failed: boolean }>;

export async function readAnswerMapView(
  client: Pick<ContractClient, "readAnswerMapView">,
  answer: Pick<Answer, "answer_id">
): Promise<AnswerMapViewRead> {
  try {
    return { mapView: await client.readAnswerMapView(answer.answer_id), failed: false };
  } catch (failure) {
    return { mapView: null, failed: !(failure instanceof ContractHttpError && failure.code === "NOT_FOUND") };
  }
}

/** The lineage members a title needs. An owner node's `MakerLineage` and a public node's `PublicMakerLineage` both fit. */
export type PositionTitleLineage = Readonly<{ maker: string; model_id: string }>;

/** The two members of an answer's (owner) or a snapshot's (public) node a title needs. */
export type PositionTitleNode = Readonly<{ node_id: string; maker_lineage: PositionTitleLineage | null }>;

/** The model families whose `modelMeta` name is a plain family name in every language ("GPT", "Claude"). */
const PLAIN_FAMILIES: ReadonlySet<string> = new Set(["claude", "gpt", "gemini", "grok"]);

/** A recorded maker that reads as a display name: no id, path or code characters. */
const PLAIN_MAKER_NAME = /^[\p{L}\p{N}][\p{L}\p{N} .&'-]{0,39}$/u;

/** The answer's closing punctuation, which the title's own sentence replaces (pre-flight PF-C24). */
const ANSWER_CLOSE = /[\s.!?。！？؟]+$/u;

/**
 * Ruling C-NAMES (pre-flight PF-C23): the AI's name in a position title, in plain words, never a
 * raw model id.
 * 1. A model of a family the UI names, other than a local one: that family name ("GPT").
 * 2. A reviewed preview model: its maker's display name ("Z.AI", "Alibaba"). `modelMeta` would
 *    give the raw id, or "{name} (local)" in the interface's language, not the question's.
 * 3. The node's recorded maker, when it is a plain display name ("OpenAI").
 * 4. Otherwise null: the position gets no title.
 * `catalog` is the question's catalogue, handed to `modelMeta` so no call falls back to the
 * interface's English; the family names rule 1 returns read the same in every language.
 */
export function positionAiName(lineage: PositionTitleLineage, catalog: MessageCatalog): string | null {
  const modelId = lineage.model_id;
  const meta = modelMeta(modelId, catalog);
  if (PLAIN_FAMILIES.has(meta.key) && !modelId.toLowerCase().includes("local")) return meta.name;
  const previewMaker = Object.hasOwn(PREVIEW_MODEL_MAKERS, modelId) ? PREVIEW_MODEL_MAKERS[modelId] : undefined;
  if (previewMaker !== undefined) return previewMaker;
  const maker = lineage.maker.trim();
  return maker !== modelId && PLAIN_MAKER_NAME.test(maker) ? maker : null;
}

/**
 * "The case for {answer}, argued by {ai}" for each opening position the view names. It uses
 * `storyCatalog`, the QUESTION's `public` catalogue, because the answer is written in the
 * question's language and the label must match it. The AI is named by `positionAiName`, and the
 * answer loses its closing punctuation. A position whose node the page does not hold, whose AI
 * has no plain name, or whose answer is empty, gets no title and keeps today's heading.
 */
export function positionTitlesFrom(
  view: DebateMapView | null,
  nodes: Iterable<PositionTitleNode>,
  storyCatalog: MessageCatalog
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  if (view === null) return titles;
  const byId = new Map<string, PositionTitleNode>();
  for (const node of nodes) byId.set(node.node_id, node);
  for (const position of view.positions) {
    const lineage = byId.get(position.node_id)?.maker_lineage ?? null;
    if (lineage === null) continue;
    const ai = positionAiName(lineage, storyCatalog);
    const answer = position.answer.trim().replace(ANSWER_CLOSE, "");
    if (ai === null || answer === "") continue;
    titles.set(position.node_id, t(storyCatalog, "public.positionTitle", { answer, ai }));
  }
  return titles;
}
