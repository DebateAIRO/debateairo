import type { Answer, AnswerStory, StoryChart, StoryChartAxis } from "@debateai/contract";
import { formatNumber, t, type MessageCatalog } from "../i18n/translate.js";
import { contractNodesById } from "../v3/adapter.js";

/**
 * Charts in the verdict PDF (design 2026-10-28): the story's stored charts as the report prints them. Pure, so it is
 * tested without drawing a PDF. An AI model chose each chart and its words; every figure on it passed the number check
 * when the story was written (packages/story/src/charts.ts). A strength is never the model's: it is read here, from the
 * answer, the same number the list of points prints.
 */

/** Under every chart, in every language (owner decision 2026-10-28): the company's notice, never translated. */
export const REPORT_CHART_COPYRIGHT = "Copyrighted by DMS Merchandise Shop SRL";

/** The corner mark of every chart until the logo file exists (apps/ui/assets/brand/report-logo.png). */
export const REPORT_CHART_WORDMARK = "Dialectical Engine";

export interface ReportChartAxis {
  readonly label: string;
  readonly log: boolean;
  /** A strength axis, plotted as a percentage from 0 to 100. */
  readonly percent: boolean;
}

/** One thing on a chart: its label, where it sits, and its value as the report prints it. */
export interface ReportChartMark {
  readonly label: string;
  /** Null on a bar chart. */
  readonly x: number | null;
  readonly y: number;
  readonly xText: string | null;
  readonly yText: string;
}

export interface ReportChart {
  /** The paragraph it follows: `why.N` or `long.S.P`, 1-based. */
  readonly after: string;
  readonly kind: "bar" | "scatter";
  readonly title: string;
  readonly x: ReportChartAxis | null;
  readonly y: ReportChartAxis;
  readonly marks: readonly ReportChartMark[];
  /** "From points P4 and P5": the points its numbers come from, in the list of points' order. */
  readonly sources: string;
  /** The AI-generated note, then what the figures and the strengths are. */
  readonly notes: readonly string[];
  readonly copyright: string;
  readonly wordmark: string;
}

/** A strength as a percentage of 0 to 100, to one decimal at most. */
function strengthPercent(value: number): number {
  return Math.round(value * 1000) / 10;
}

function percentText(locale: string, value: number): string {
  return formatNumber(locale, value / 100, { style: "percent", maximumFractionDigits: 1 });
}

function axisOf(axis: StoryChartAxis, catalog: MessageCatalog): ReportChartAxis {
  // A strength axis is named by code, in the report's words, never by the model.
  return axis.source === "strength"
    ? { label: t(catalog, "public.report.chart.strengthAxis"), log: false, percent: true }
    : { label: axis.label, log: axis.log, percent: false };
}

function pointOrder(label: string): number {
  return Number.parseInt(label.slice(1), 10);
}

/**
 * The report's charts, in story order. A chart that names a point the answer does not hold, or a strength the answer
 * does not record, is left out whole: a chart is printed complete or not at all.
 */
export function buildReportCharts(input: Readonly<{
  story: Pick<AnswerStory, "charts">;
  answer: Pick<Answer, "nodes">;
  /** Node id to the point's number in the list of points (P1…Pn). */
  numbers: ReadonlyMap<string, string>;
  locale: string;
  catalog: MessageCatalog;
  /** The report's own list words ("P4 and P5"). */
  listWords: (items: readonly string[]) => string;
}>): readonly ReportChart[] {
  const nodes = contractNodesById(input.answer);
  const charts: ReportChart[] = [];
  for (const chart of input.story.charts ?? []) {
    const built = reportChart(chart, nodes, input);
    if (built !== null) charts.push(built);
  }
  return Object.freeze(charts);
}

function reportChart(
  chart: StoryChart,
  nodes: ReadonlyMap<string, Answer["nodes"][number]>,
  input: Readonly<{ numbers: ReadonlyMap<string, string>; locale: string; catalog: MessageCatalog; listWords: (items: readonly string[]) => string }>
): ReportChart | null {
  const { locale, catalog } = input;
  const strengthOf = (nodeId: string): number | null => {
    const node = nodes.get(nodeId);
    if (node === undefined) return null;
    const value = node.final_strength?.value ?? node.base_score.value;
    return Number.isFinite(value) ? strengthPercent(value) : null;
  };
  const marks: ReportChartMark[] = [];
  for (const item of chart.items) {
    if (!nodes.has(item.node_ref)) return null;
    const value = (axis: StoryChartAxis | null, figure: StoryChart["items"][number]["y"]): { value: number; text: string } | null => {
      if (axis === null) return null;
      if (axis.source === "figure") return figure === null ? null : { value: figure.value, text: figure.text };
      const strength = strengthOf(item.node_ref);
      return strength === null ? null : { value: strength, text: percentText(locale, strength) };
    };
    const y = value(chart.y, item.y);
    const x = value(chart.x, item.x);
    if (y === null || (chart.x !== null && x === null)) return null;
    marks.push({ label: item.label, x: x?.value ?? null, y: y.value, xText: x?.text ?? null, yText: y.text });
  }
  const numbers = [...new Set(chart.items.flatMap((item) => {
    const number = input.numbers.get(item.node_ref);
    return number === undefined ? [] : [number];
  }))].sort((a, b) => pointOrder(a) - pointOrder(b));
  const sources = [chart.x, chart.y].filter((axis): axis is StoryChartAxis => axis !== null).map((axis) => axis.source);
  return {
    after: chart.after,
    kind: chart.kind,
    title: chart.title,
    x: chart.x === null ? null : axisOf(chart.x, catalog),
    y: axisOf(chart.y, catalog),
    marks: Object.freeze(marks),
    sources: numbers.length === 0 ? "" : t(catalog, "public.report.chart.points", { points: input.listWords(numbers) }),
    notes: Object.freeze([
      t(catalog, "public.report.chart.aiNote"),
      ...(sources.includes("figure") ? [t(catalog, "public.report.chart.figuresNote")] : []),
      ...(sources.includes("strength") ? [t(catalog, "public.report.chart.strengthNote")] : [])
    ]),
    copyright: REPORT_CHART_COPYRIGHT,
    wordmark: REPORT_CHART_WORDMARK
  };
}

/** An axis's extent and the values its ticks sit at. */
export interface ReportChartScale {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

/** A step of 1, 2, 2.5 or 5 times a power of ten, so about `count` ticks span the range. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Removes the float noise of repeated adding (0.30000000000000004 becomes 0.3). */
function tidy(value: number): number {
  return Number.parseFloat(value.toPrecision(12));
}

/**
 * A linear scale over `values`. A bar chart's scale always holds zero, so every bar starts at the axis; a percentage
 * axis spans 0 to 100 unless its values need less of it.
 */
export function linearScale(values: readonly number[], options: Readonly<{ fromZero: boolean; percent: boolean }>): ReportChartScale {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (options.fromZero || options.percent) {
    low = Math.min(0, low);
    high = Math.max(0, high);
  }
  if (options.percent && low >= 0 && high <= 100) high = Math.min(100, Math.max(high, 10));
  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low) * 0.1;
    low -= pad;
    high += pad;
  }
  const step = niceStep(high - low, 5);
  const min = tidy(Math.floor(low / step) * step);
  const max = tidy(Math.ceil(high / step) * step);
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 2; tick += step) ticks.push(tidy(tick));
  return { min, max, ticks: Object.freeze(ticks) };
}

/** A log scale over positive `values`: whole decades, with 2 and 5 between them when it spans three decades or fewer. */
export function logScale(values: readonly number[]): ReportChartScale {
  const low = 10 ** Math.floor(Math.log10(Math.min(...values)));
  const high = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  const max = high === low ? high * 10 : high;
  const decades = Math.round(Math.log10(max / low));
  const ticks: number[] = [];
  for (let decade = low; decade < max * 1.0001; decade *= 10) {
    for (const value of decades <= 3 ? [decade, decade * 2, decade * 5] : [decade]) {
      const tick = tidy(value);
      if (tick <= max * 1.0001) ticks.push(tick);
    }
  }
  return { min: low, max, ticks: Object.freeze(ticks) };
}

/** Where `value` falls on the scale, from 0 (its min) to 1 (its max). */
export function scalePosition(scale: ReportChartScale, value: number, log: boolean): number {
  if (log) return (Math.log10(value) - Math.log10(scale.min)) / (Math.log10(scale.max) - Math.log10(scale.min));
  return (value - scale.min) / (scale.max - scale.min);
}

/** A tick's label in the report's language: a percentage on a strength axis, a plain number otherwise. */
export function tickText(locale: string, value: number, percent: boolean): string {
  return percent
    ? formatNumber(locale, value / 100, { style: "percent", maximumFractionDigits: 0 })
    : formatNumber(locale, value, { maximumFractionDigits: 6 });
}
