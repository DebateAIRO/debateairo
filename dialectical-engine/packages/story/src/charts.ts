import { z } from "zod";
import { STORY_CHART_LIMITS, StoryChartSchema, type StoryBody, type StoryChart, type StoryChartFigure, type StoryParagraph } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { decodeModelJson, decodedRepairsOf, parsedWithRepairs, type ContentClassification, type ModelReplyFacts,
  type PromptContract } from "@debateai/providers";
import { STORY_QUOTE_SENTENCE } from "./contracts.js";

/**
 * CHARTS IN THE VERDICT PDF (design 2026-10-28). After the story is accepted, ONE more call asks the model that wrote it
 * where a chart would help the reader and what it compares. The model returns a plan, never a picture; code checks every
 * number against the point it cites and keeps only the charts that pass whole. The story never depends on its charts:
 * a chart call that fails, or a plan with nothing valid in it, leaves the story exactly as it is, with no charts.
 *
 * Two kinds of measure. A `figure` is a number a point's claim states, copied character for character (its `text`)
 * with the number it states (its `value`). A `strength` is the engine's own score for the point: the model never
 * writes one, and the PDF reads it from the answer, the same number the report's list of points prints.
 */

export const STORY_CHARTS_CONTRACT_ID = "story.charts.v1" as const;

/** The chart call's one call site: on the story lane, with the storyteller's role (the gateway checks the pair). */
export const STORY_CHARTS_CALL_SITE_KEY = "STORY:CHARTS:1" as const;

/**
 * OWNER WORDING (design 2026-10-28). The instruction half: what a chart is for, and when there should be none.
 */
export const STORY_CHARTS_INSTRUCTION = `You add charts to a finished report about a debate. The report_text field holds the report's text: the reasons in why.reasons and the long version in long.sections, each paragraph with the ids of the points it rests on. The positions and points fields hold the debate's positions and points, each with its claim.
Add a chart only where it lets the reader see a comparison that a paragraph makes, using numbers the debate itself states. Two measures that cover the same things, such as the price and the test score of several products, make a scatter chart; one measure across several things makes a bar chart. A measure is either the figures the claims state (source "figure") or how strong each point or position turned out in the debate (source "strength"). Most reports need no chart or only one: a chart that repeats a single number, compares things that do not belong together, or decorates a paragraph is worse than none. When no chart would help, return an empty list.
Never invent, estimate, convert, round or add up a number: every figure is copied from the claim of the point it belongs to.`;

/** OWNER WORDING (design 2026-10-28). The answer form: code's, mirrored by `StoryChartsReplySchema` and `readStoryCharts`. */
export const STORY_CHARTS_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence. Every string is plain text: no Markdown, no HTML, no links, no control characters, and no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069).
{
  "charts": [{
    "after": "why.N" for the N-th entry of why.reasons, or "long.S.P" for paragraph P of section S of long.sections, counting from 1,
    "kind": "bar" | "scatter",
    "title": non-empty string of at most ${String(STORY_CHART_LIMITS.titleMaxChars)} characters,
    "x": null | { "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "source": "figure" | "strength", "log": boolean },
    "y": { "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "source": "figure" | "strength", "log": boolean },
    "items": [{ "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "node_ref": id, "x": null | { "value": number, "text": string }, "y": null | { "value": number, "text": string } }, ...]
  }, ...]
}
charts has 0 to ${String(STORY_CHART_LIMITS.maxCharts)} entries, and at most one chart goes after any one paragraph. A bar chart has "x": null and ${String(STORY_CHART_LIMITS.minItems)} to ${String(STORY_CHART_LIMITS.maxItems)} items, and plots y for each item. A scatter chart has both axes, two different measures, and ${String(STORY_CHART_LIMITS.minScatterItems)} to ${String(STORY_CHART_LIMITS.maxItems)} items.
Each node_ref is copied exactly from an id in the points field or the positions field, and the paragraph the chart goes after lists that id in its node_refs. Several items may share one node_ref when one claim states figures for several things.
On an axis whose source is "figure", each item's value for that axis is an object: "text" is copied character for character from the claim of that item's node_ref (the number with its unit or sign exactly as the claim writes it, such as $0.15 or 52 %), and "value" is that same number as a JSON number, in the unit the axis label names. On an axis whose source is "strength", and on the x of a bar chart, each item's value is null: code fills in the strengths.
"log" is true only when the axis's values are all above zero and span more than a hundredfold.
Titles and labels are in the question's language, say what is measured and in which unit, and contain no score or threshold from the material and no engine words such as judge, evaluator, checker, margin, band or rung.
${STORY_QUOTE_SENTENCE}`;

export function buildStoryChartsContract(): PromptContract {
  return Object.freeze({
    contractId: STORY_CHARTS_CONTRACT_ID,
    instruction: STORY_CHARTS_INSTRUCTION,
    answerForm: STORY_CHARTS_ANSWER_FORM
  });
}

/**
 * The reply's outer shape. Each chart is read on its own (`readStoryCharts`), so one bad chart costs that chart and
 * never the others; only a reply that is not `{ "charts": [...] }` at all is refused, and repaired by the gateway.
 */
const StoryChartsReplySchema = z.object({ charts: z.array(z.unknown()).max(STORY_CHART_LIMITS.maxCharts * 4) }).strict();

/** What a chart plan is checked against: the story as the model read it (short refs) and each reference's claim. */
export interface StoryChartsContext {
  readonly body: StoryBody;
  /** Every point's and position's claim, by the short reference the model reads (P1…Pn). */
  readonly claims: ReadonlyMap<string, string>;
  /** The material's scores as a story might print them (`StoryMaterialIndex.scoreTexts`): never in a title or label. */
  readonly scoreTexts: ReadonlySet<string>;
}

/** Why a chart was left out: a code, never the model's text. */
export type StoryChartDropCode =
  | "CHART_SCHEMA"
  | "CHART_OVER_LIMIT"
  | "CHART_ANCHOR_UNKNOWN"
  | "CHART_ANCHOR_TAKEN"
  | "CHART_AXES_INVALID"
  | "CHART_TOO_FEW_ITEMS"
  | "CHART_REF_UNKNOWN"
  | "CHART_REF_NOT_CITED"
  | "CHART_FIGURE_MISSING"
  | "CHART_FIGURE_NOT_IN_CLAIM"
  | "CHART_FIGURE_MISMATCH"
  | "CHART_FIGURE_OUT_OF_RANGE"
  | "CHART_LOG_NOT_POSITIVE"
  | "CHART_LABEL_REPEATED"
  | "CHART_TEXT_CHARACTERS"
  | "CHART_TEXT_SCORE_VALUE";

export interface StoryChartsReading {
  /** The charts that passed every check, in the model's order, with short references (`restoreChartRefs` for storage). */
  readonly charts: readonly StoryChart[];
  readonly dropped: readonly StoryChartDropCode[];
}

/** Control characters other than line feed and tab, and the bidirectional overrides the story refuses too. */
const FORBIDDEN_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/u;

/** The paragraph a chart's anchor names, or null when the story has no such paragraph. */
export function storyChartParagraph(body: Pick<StoryBody, "why" | "long">, after: string): StoryParagraph | null {
  const parts = after.split(".").slice(1).map((part) => Number.parseInt(part, 10) - 1);
  if (after.startsWith("why.")) return body.why.reasons[parts[0]!] ?? null;
  return body.long.sections[parts[0]!]?.paragraphs[parts[1]!] ?? null;
}

/** Spaces of every width as one plain space, in canonical composition, so "52 %" with a no-break space matches "52 %". */
function normalised(text: string): string {
  return text.normalize("NFC").replace(/[\s    ]+/gu, " ").trim();
}

/** A run of digits with the separators a written number may carry, and the sign just before it. */
const NUMBER_RUN = /([-−‐–]?)(\d(?:[\d.,'’    ]*\d)?)/gu;

/**
 * Every number `text` could be read as: each digit run, with "." as the decimal point and ","," ", "'" as thousands
 * separators, and the other way round. "1,234.5" reads 1234.5; "0,15" reads 0.15 or 15; "1.234,5" reads 1234.5.
 */
export function figureReadings(text: string): readonly number[] {
  const readings: number[] = [];
  for (const match of text.matchAll(NUMBER_RUN)) {
    const sign = match[1] === "" ? 1 : -1;
    const run = match[2]!.replace(/['’    ]/gu, "");
    for (const [thousands, decimal] of [[",", "."], [".", ","]] as const) {
      const plain = run.split(thousands).join("").replace(decimal, ".");
      if (!/^\d+(\.\d+)?$/u.test(plain)) continue;
      const value = sign * Number.parseFloat(plain);
      if (Number.isFinite(value)) readings.push(value);
    }
  }
  // Each number on its own too, so "5, 10 and 15" reads 5, 10 and 15 and not only one run of digits.
  for (const match of text.matchAll(/([-−‐–]?)(\d+(?:[.,]\d+)?)/gu)) {
    const sign = match[1] === "" ? 1 : -1;
    for (const plain of [match[2]!.replace(",", "."), match[2]!.replace(/[.,]/u, "")]) {
      const value = sign * Number.parseFloat(plain);
      if (Number.isFinite(value)) readings.push(value);
    }
  }
  return readings;
}

/** The largest and the smallest non-zero size a charted figure may have. */
export const STORY_CHART_FIGURE_BOUNDS = Object.freeze({ maxMagnitude: 1e15, minMagnitude: 1e-9 });

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** The figure is in the claim, character for character, and it states the number the plan gives it. */
function figureIssue(figure: StoryChartFigure | null, claim: string): StoryChartDropCode | null {
  if (figure === null) return "CHART_FIGURE_MISSING";
  // A chart compares everyday magnitudes; a figure beyond these bounds is not one a reader can compare on an axis.
  const size = Math.abs(figure.value);
  if (size > STORY_CHART_FIGURE_BOUNDS.maxMagnitude || (size !== 0 && size < STORY_CHART_FIGURE_BOUNDS.minMagnitude)) {
    return "CHART_FIGURE_OUT_OF_RANGE";
  }
  if (!normalised(claim).includes(normalised(figure.text))) return "CHART_FIGURE_NOT_IN_CLAIM";
  return figureReadings(figure.text).some((reading) => sameNumber(reading, figure.value)) ? null : "CHART_FIGURE_MISMATCH";
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** A material score as a whole token (no digit on either side, and no percent sign after), as the story's own check reads it. */
function scorePattern(scoreTexts: ReadonlySet<string>): RegExp | null {
  if (scoreTexts.size === 0) return null;
  return new RegExp(`(?<![0-9])(?:${[...scoreTexts].map(escaped).join("|")})(?![0-9%])`, "u");
}

/** One chart against the story and the claims; the first problem found, or the chart as it will be stored. */
function checkedChart(chart: StoryChart, context: StoryChartsContext, scores: RegExp | null): StoryChart | StoryChartDropCode {
  const paragraph = storyChartParagraph(context.body, chart.after);
  if (paragraph === null) return "CHART_ANCHOR_UNKNOWN";
  const scatter = chart.kind === "scatter";
  if (scatter !== (chart.x !== null)) return "CHART_AXES_INVALID";
  if (scatter && chart.x!.source === "strength" && chart.y.source === "strength") return "CHART_AXES_INVALID";
  if (chart.items.length < (scatter ? STORY_CHART_LIMITS.minScatterItems : STORY_CHART_LIMITS.minItems)) return "CHART_TOO_FEW_ITEMS";
  const texts = [chart.title, chart.y.label, ...(chart.x === null ? [] : [chart.x.label]), ...chart.items.map((item) => item.label)];
  if (texts.some((text) => FORBIDDEN_CHARACTERS.test(text))) return "CHART_TEXT_CHARACTERS";
  if (scores !== null && texts.some((text) => scores.test(text))) return "CHART_TEXT_SCORE_VALUE";
  if (new Set(chart.items.map((item) => normalised(item.label))).size !== chart.items.length) return "CHART_LABEL_REPEATED";
  const cited = new Set(paragraph.node_refs);
  const items: StoryChart["items"][number][] = [];
  for (const item of chart.items) {
    const claim = context.claims.get(item.node_ref);
    if (claim === undefined) return "CHART_REF_UNKNOWN";
    if (!cited.has(item.node_ref)) return "CHART_REF_NOT_CITED";
    // A strength, and a bar chart's x, is code's: whatever the model wrote there is not kept.
    const x = chart.x === null || chart.x.source === "strength" ? null : item.x;
    const y = chart.y.source === "strength" ? null : item.y;
    for (const [axis, figure] of [[chart.x, x], [chart.y, y]] as const) {
      if (axis === null || axis.source !== "figure") continue;
      const issue = figureIssue(figure, claim);
      if (issue !== null) return issue;
      if (axis.log && figure!.value <= 0) return "CHART_LOG_NOT_POSITIVE";
    }
    items.push({ label: item.label, node_ref: item.node_ref, x, y });
  }
  return { ...chart, items };
}

/**
 * The plan's charts that pass every check (at most `STORY_CHART_LIMITS.maxCharts`, one per paragraph), and a code for
 * each one left out. Never throws for anything the model wrote.
 */
export function readStoryCharts(value: unknown, context: StoryChartsContext): StoryChartsReading {
  const reply = StoryChartsReplySchema.safeParse(value);
  if (!reply.success) return { charts: [], dropped: ["CHART_SCHEMA"] };
  const scores = scorePattern(context.scoreTexts);
  const charts: StoryChart[] = [];
  const dropped: StoryChartDropCode[] = [];
  const anchors = new Set<string>();
  for (const candidate of reply.data.charts) {
    const parsed = StoryChartSchema.safeParse(candidate);
    if (!parsed.success) {
      dropped.push("CHART_SCHEMA");
      continue;
    }
    const checked = checkedChart(parsed.data, context, scores);
    if (typeof checked === "string") dropped.push(checked);
    else if (anchors.has(checked.after)) dropped.push("CHART_ANCHOR_TAKEN");
    else if (charts.length >= STORY_CHART_LIMITS.maxCharts) dropped.push("CHART_OVER_LIMIT");
    else {
      anchors.add(checked.after);
      charts.push(checked);
    }
  }
  return { charts, dropped };
}

/**
 * The chart call's content classifier: only the outer form `{ "charts": [...] }` is a reason to re-ask. What is inside
 * each chart is checked afterwards, chart by chart, and a bad chart is dropped rather than repaired.
 */
export function classifyStoryChartsContent(content: string, reply?: ModelReplyFacts): ContentClassification {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) return { parseStatus: "PARSE_FAILED", parseError: decoded.error };
  const read = StoryChartsReplySchema.safeParse(decoded.value);
  return read.success
    ? parsedWithRepairs(decodedRepairsOf(decoded))
    : { parseStatus: "SCHEMA_FAILED", parseError: read.error.message };
}

/** The accepted reply's charts, decoded as the classifier decoded it (pass the same `reply`). */
export function parseStoryCharts(content: string, context: StoryChartsContext, reply?: ModelReplyFacts): StoryChartsReading {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) throw new TypedDomainError("STORY_CHARTS_CONTENT_INVALID", "PARSE_FAILED");
  return readStoryCharts(decoded.value, context);
}

/** The charts with each short reference turned back into its node id, for storage (as `restoreStoryRefs`). */
export function restoreChartRefs(charts: readonly StoryChart[], refMap: ReadonlyMap<string, string>): readonly StoryChart[] {
  return Object.freeze(charts.map((chart) => ({
    ...chart,
    items: chart.items.map((item) => {
      const nodeId = refMap.get(item.node_ref);
      if (nodeId === undefined) {
        throw new TypedDomainError("STORY_REF_UNMAPPED", "A chart cites a reference the material never offered");
      }
      return { ...item, node_ref: nodeId };
    })
  })));
}
