import { z } from "zod";
import { STORY_CHART_LIMITS, STORY_TABLE_LIMITS, StoryChartSchema, type StoryBody, type StoryChart, type StoryChartFigure,
  type StoryParagraph } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { decodeModelJson, decodedRepairsOf, parsedWithRepairs, type ContentClassification, type ModelReplyFacts,
  type PromptContract } from "@debateai/providers";
import { STORY_QUOTE_SENTENCE } from "./contracts.js";
import { STORY_BLOCK_MENU, STORY_QUESTION_FORMS, STORY_QUESTION_FORM_MEANINGS } from "./forms.js";

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

/** v2 (data blocks, 2026-10-30): the reply also names the kind of question and may plan tables. */
export const STORY_CHARTS_CONTRACT_ID = "story.charts.v2" as const;

/** The chart call's one call site: on the story lane, with the storyteller's role (the gateway checks the pair). */
export const STORY_CHARTS_CALL_SITE_KEY = "STORY:CHARTS:1" as const;

/**
 * OWNER WORDING (design 2026-10-28, data blocks 2026-10-30). The instruction half: name the kind of question, then show
 * the comparisons the debate makes in the block that suits each, from what the debate states and nothing else. Code ran
 * this call only because the debate holds figures, options or arguments for and against worth showing.
 */
export const STORY_CHARTS_INSTRUCTION = `You add charts and tables to a finished report about a debate. The report_text field holds the report's text: the reasons in why.reasons and the long version in long.sections, each paragraph with the ids of the points it rests on. The positions and points fields hold the debate's positions and points, each with its claim. The figures field lists, for each point or position whose claim states numbers, those numbers as the claim writes them.
First name the kind of question the debate answers. A question about right and wrong, a relationship or feeling, taste, the meaning of a work, what a word covers, what would have happened, a private person, or a single fact is answered in words: its report gets no chart and no table.
For every other kind, show the comparisons the debate makes in the block that suits them. Options compared on two or more things (such as price, years of updates and encryption) make a comparison table, one row per option and one column per thing compared. Points that argue for and against a position make a pros and cons list. One measure across three or more things makes a bar chart; two measures that cover the same three or more things, such as the price and the test score of several products, make a scatter chart. A measure is either the figures the claims state (source "figure") or how strong each point or position turned out in the debate (source "strength").
Use only what the debate states. Never invent, estimate, convert, round or add up a number, and never put words in a claim: every figure, cell and list entry is copied character for character from the claim of the point it cites. When the claims do not say something a table asks, leave that cell null. A block that repeats a single number, compares things that do not belong together, or decorates a paragraph is worse than none.`;

const STORY_QUESTION_FORM_LINES = STORY_QUESTION_FORMS.map((form) => {
  const menu = STORY_BLOCK_MENU[form];
  const blocks = menu.length === 0 ? "no block" : menu.map((kind) => `"${kind}"`).join(", ");
  return `  "${form}": ${STORY_QUESTION_FORM_MEANINGS[form]} (${blocks})`;
}).join("\n");

/** OWNER WORDING (design 2026-10-28). The answer form: code's, mirrored by `StoryChartsReplySchema` and `readStoryCharts`. */
export const STORY_CHARTS_ANSWER_FORM = `Return only one JSON object with exactly the following schema and no additional keys, with no text before or after it and no code fence. Every string is plain text: no Markdown, no HTML, no links, no control characters, and no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069).
{
  "question_form": the kind of question, one of the ids below,
  "charts": [{
    "after": "why.N" for the N-th entry of why.reasons, or "long.S.P" for paragraph P of section S of long.sections, counting from 1,
    "kind": "bar" | "scatter",
    "title": non-empty string of at most ${String(STORY_CHART_LIMITS.titleMaxChars)} characters,
    "x": null | { "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "source": "figure" | "strength", "log": boolean },
    "y": { "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "source": "figure" | "strength", "log": boolean },
    "items": [{ "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "node_ref": id, "x": null | { "value": number, "text": string }, "y": null | { "value": number, "text": string } }, ...],
    "frontier": null | { "x": "lower" | "higher", "y": "lower" | "higher" }
  }, ...],
  "tables": [{
    "after": as a chart's,
    "kind": "compare",
    "title": as a chart's,
    "columns": [non-empty string of at most ${String(STORY_TABLE_LIMITS.columnMaxChars)} characters, ...],
    "rows": [{ "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "cells": [null | { "text": string, "node_ref": id }, ...] }, ...]
  } | {
    "after": as a chart's,
    "kind": "pros_cons",
    "title": as a chart's,
    "options": [{ "label": non-empty string of at most ${String(STORY_CHART_LIMITS.labelMaxChars)} characters, "position_ref": id, "pros": [{ "text": string, "node_ref": id }, ...], "cons": [{ "text": string, "node_ref": id }, ...] }, ...]
  }, ...]
}
The kinds of question, each with the blocks its report may carry:
${STORY_QUESTION_FORM_LINES}
Only the blocks a kind lists are kept; for a kind with no block, charts and tables are empty lists.
charts has 0 to ${String(STORY_CHART_LIMITS.maxCharts)} entries and tables 0 to ${String(STORY_TABLE_LIMITS.maxTables - 1)}, and at most one chart or table goes after any one paragraph. A bar chart has "x": null and ${String(STORY_CHART_LIMITS.minItems)} to ${String(STORY_CHART_LIMITS.maxItems)} items, and plots y for each item. A scatter chart has both axes, two different measures, and ${String(STORY_CHART_LIMITS.minScatterItems)} to ${String(STORY_CHART_LIMITS.maxItems)} items.
Each node_ref is copied exactly from an id in the points field or the positions field, and the paragraph the chart goes after lists that id in its node_refs. Several items may share one node_ref when one claim states figures for several things.
On an axis whose source is "figure", each item's value for that axis is an object: "text" is copied character for character from the claim of that item's node_ref (the number with its unit or sign exactly as the claim writes it, such as $0.15 or 52 %), and "value" is that same number as a JSON number, in the unit the axis label names. On an axis whose source is "strength", and on the x of a bar chart, each item's value is null: code fills in the strengths.
"log" is true only when the axis's values are all above zero and span more than a hundredfold.
"frontier" is null on a bar chart. On a scatter chart, when a reader would want the best of both measures (a lower price and a higher score, say), it says which end of each axis is better, "lower" or "higher", and the report draws a line through the items nothing else beats on both; otherwise it is null.
A comparison table has ${String(STORY_TABLE_LIMITS.minColumns)} to ${String(STORY_TABLE_LIMITS.maxColumns)} columns and ${String(STORY_TABLE_LIMITS.minRows)} to ${String(STORY_TABLE_LIMITS.maxRows)} rows, and each row has exactly one cell per column. A cell's "text" is copied character for character from the claim of its node_ref, at most ${String(STORY_TABLE_LIMITS.cellMaxChars)} characters, and says that row's option on that column's thing; a cell no claim states is null.
A pros and cons list covers 1 to ${String(STORY_TABLE_LIMITS.maxOptions)} positions, each named by its position_ref, with at most ${String(STORY_TABLE_LIMITS.maxEntries)} pros and ${String(STORY_TABLE_LIMITS.maxEntries)} cons. A pro's node_ref is a point that supports that position and a con's a point that attacks it, and each entry's "text" is copied character for character from that point's claim, at most ${String(STORY_TABLE_LIMITS.cellMaxChars)} characters.
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
 * The reply's outer shape. Each chart and table is read on its own (`readStoryCharts`, `readStoryBlocks`), so one bad
 * block costs that block and never the others; only a reply that is not `{ "charts": [...] }` with at most a kind of
 * question and a list of tables beside it is refused, and repaired by the gateway. An unknown kind is not a refusal:
 * it reads as no kind (`storyQuestionFormOf`).
 */
export const StoryBlocksReplySchema = z.object({
  question_form: z.string().optional(),
  charts: z.array(z.unknown()).max(STORY_CHART_LIMITS.maxCharts * 4),
  tables: z.array(z.unknown()).max(STORY_TABLE_LIMITS.maxTables * 4).optional()
}).strict();

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
export const FORBIDDEN_CHARACTERS =/[\u0000-\u0008\u000B-\u001F\u007F‪-‮⁦-⁩]/u;

/** The paragraph a chart's anchor names, or null when the story has no such paragraph. */
export function storyChartParagraph(body: Pick<StoryBody, "why" | "long">, after: string): StoryParagraph | null {
  const parts = after.split(".").slice(1).map((part) => Number.parseInt(part, 10) - 1);
  if (after.startsWith("why.")) return body.why.reasons[parts[0]!] ?? null;
  return body.long.sections[parts[0]!]?.paragraphs[parts[1]!] ?? null;
}

/** Spaces of every width as one plain space, in canonical composition, so "52 %" with a no-break space matches "52 %". */
export function normalised(text: string): string {
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
export function scorePattern(scoreTexts: ReadonlySet<string>): RegExp | null {
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
  // A best-value line joins points on two measures: a bar chart has only one.
  if (!scatter && chart.frontier !== undefined && chart.frontier !== null) return "CHART_AXES_INVALID";
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
  const reply = StoryBlocksReplySchema.safeParse(value);
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
  const read = StoryBlocksReplySchema.safeParse(decoded.value);
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
