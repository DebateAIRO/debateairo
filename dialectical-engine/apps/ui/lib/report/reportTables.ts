import type { Answer, AnswerStory, StoryCompareTable, StoryProsConsTable, StoryRankingTable, StoryTableCell } from "@debateai/contract";
import { formatNumber, t, type MessageCatalog } from "../i18n/translate.js";
import { contractNodesById } from "../v3/adapter.js";

/**
 * Tables in the verdict PDF (data blocks, 2026-10-30): the story's stored tables as the report prints them. Pure, so it
 * is tested without drawing a PDF. An AI model chose each comparison table and pros and cons list and its words; every
 * cell and entry was checked against the claim it cites when the story was written (packages/story/src/blocks.ts). The
 * ranking is code's: each answer's claim and strength are read here, from the answer, as the list of points prints them.
 * No table carries the chart's copyright line (owner decision Q10).
 */

/** A cell or a list entry, and the point it is copied from ("P3"), or null when the list of points has no such point. */
export interface ReportTableCell {
  readonly text: string;
  readonly cite: string | null;
}

export interface ReportCompareTable {
  readonly kind: "compare";
  /** The paragraph it follows: `why.N` or `long.S.P`, 1-based. */
  readonly after: string;
  readonly title: string;
  readonly columns: readonly string[];
  /** Null cells print `notStated`. */
  readonly rows: readonly Readonly<{ label: string; cells: readonly (ReportTableCell | null)[] }>[];
  readonly notStated: string;
  readonly sources: string;
  readonly notes: readonly string[];
}

export interface ReportProsConsTable {
  readonly kind: "pros_cons";
  readonly after: string;
  readonly title: string;
  readonly prosTitle: string;
  readonly consTitle: string;
  /** Printed under a side no point argued. */
  readonly none: string;
  readonly options: readonly Readonly<{ label: string; pros: readonly ReportTableCell[]; cons: readonly ReportTableCell[] }>[];
  readonly sources: string;
  readonly notes: readonly string[];
}

export type ReportTable = ReportCompareTable | ReportProsConsTable;

/** How the answers placed: in "Why this answer", or in the list of points for a question answered in words. */
export interface ReportRanking {
  readonly placement: StoryRankingTable["placement"];
  readonly title: string;
  readonly headers: Readonly<{ place: string; answer: string; strength: string }>;
  readonly rows: readonly Readonly<{ place: string; answer: string; cite: string | null; strength: string; mark: string | null }>[];
  readonly notes: readonly string[];
}

export interface ReportTables {
  readonly tables: readonly ReportTable[];
  readonly ranking: ReportRanking | null;
}

type Nodes = ReadonlyMap<string, Answer["nodes"][number]>;
type TableInput = Readonly<{
  numbers: ReadonlyMap<string, string>;
  locale: string;
  catalog: MessageCatalog;
  listWords: (items: readonly string[]) => string;
}>;

function pointOrder(label: string): number {
  return Number.parseInt(label.slice(1), 10);
}

/** "From points P2, P4 and P5": the points a table's entries come from, in the list of points' order. */
function sourcesOf(refs: readonly string[], input: TableInput): string {
  const numbers = [...new Set(refs.flatMap((ref) => {
    const number = input.numbers.get(ref);
    return number === undefined ? [] : [number];
  }))].sort((a, b) => pointOrder(a) - pointOrder(b));
  return numbers.length === 0 ? "" : t(input.catalog, "public.report.chart.points", { points: input.listWords(numbers) });
}

/** A cell of a point the answer still holds, or null: a table prints only what the answer can back. */
function cellOf(cell: StoryTableCell, nodes: Nodes, input: TableInput): ReportTableCell | null {
  if (!nodes.has(cell.node_ref)) return null;
  return { text: cell.text, cite: input.numbers.get(cell.node_ref) ?? null };
}

function compareTable(table: StoryCompareTable, nodes: Nodes, input: TableInput): ReportCompareTable | null {
  const rows = table.rows.map((row) => ({
    label: row.label,
    cells: Object.freeze(row.cells.map((cell) => (cell === null ? null : cellOf(cell, nodes, input))))
  })).filter((row) => row.cells.some((cell) => cell !== null));
  if (rows.length < 2) return null;
  const refs = table.rows.flatMap((row) => row.cells.flatMap((cell) => (cell === null ? [] : [cell.node_ref])));
  return {
    kind: "compare",
    after: table.after,
    title: table.title,
    columns: Object.freeze([...table.columns]),
    rows: Object.freeze(rows),
    notStated: t(input.catalog, "public.report.table.notStated"),
    sources: sourcesOf(refs, input),
    notes: Object.freeze([t(input.catalog, "public.report.table.aiNote")])
  };
}

function prosConsTable(table: StoryProsConsTable, nodes: Nodes, input: TableInput): ReportProsConsTable | null {
  const kept = (entries: readonly StoryTableCell[]) => entries.flatMap((entry) => {
    const cell = cellOf(entry, nodes, input);
    return cell === null ? [] : [cell];
  });
  const options = table.options
    .map((option) => ({ label: option.label, pros: Object.freeze(kept(option.pros)), cons: Object.freeze(kept(option.cons)) }))
    .filter((option) => option.pros.length + option.cons.length > 0);
  if (options.length === 0) return null;
  const refs = table.options.flatMap((option) => [...option.pros, ...option.cons].map((entry) => entry.node_ref));
  return {
    kind: "pros_cons",
    after: table.after,
    title: table.title,
    prosTitle: t(input.catalog, "public.report.table.pros"),
    consTitle: t(input.catalog, "public.report.table.cons"),
    none: t(input.catalog, "public.report.table.notStated"),
    options: Object.freeze(options),
    sources: sourcesOf(refs, input),
    notes: Object.freeze([t(input.catalog, "public.report.table.aiNote")])
  };
}

/** A strength as the report prints a percentage, to one decimal at most. */
function strengthText(locale: string, value: number): string {
  return formatNumber(locale, Math.round(value * 1000) / 1000, { style: "percent", maximumFractionDigits: 1 });
}

function rankingOf(table: StoryRankingTable, nodes: Nodes, input: TableInput): ReportRanking | null {
  const { catalog, locale } = input;
  const rows = table.rows.flatMap((row) => {
    const node = nodes.get(row.node_ref);
    if (node === undefined) return [];
    const strength = node.final_strength?.value ?? node.base_score.value;
    return [{
      answer: node.claim,
      cite: input.numbers.get(row.node_ref) ?? null,
      strength: Number.isFinite(strength) ? strengthText(locale, strength) : t(catalog, "public.report.table.notStated"),
      mark: row.won ? t(catalog, "public.report.table.won") : row.close ? t(catalog, "public.report.table.close") : null
    }];
  });
  if (rows.length < 3) return null;
  return {
    placement: table.placement,
    title: t(catalog, "public.report.table.rankingTitle"),
    headers: {
      place: t(catalog, "public.report.table.place"),
      answer: t(catalog, "public.report.table.answer"),
      strength: t(catalog, "public.report.table.strength")
    },
    rows: Object.freeze(rows.map((row, index) => ({ ...row, place: formatNumber(locale, index + 1) }))),
    notes: Object.freeze([t(catalog, "public.report.chart.strengthNote")])
  };
}

/**
 * The report's tables, in story order, and its ranking. A table whose points the answer no longer holds is printed with
 * what is left, or left out when too little is; the ranking needs three answers the answer still holds.
 */
export function buildReportTables(input: TableInput & Readonly<{
  story: Pick<AnswerStory, "tables">;
  answer: Pick<Answer, "nodes">;
}>): ReportTables {
  const nodes = contractNodesById(input.answer);
  const tables: ReportTable[] = [];
  let ranking: ReportRanking | null = null;
  for (const table of input.story.tables ?? []) {
    if (table.kind === "ranking") {
      ranking ??= rankingOf(table, nodes, input);
      continue;
    }
    const built = table.kind === "compare" ? compareTable(table, nodes, input) : prosConsTable(table, nodes, input);
    if (built !== null) tables.push(built);
  }
  return { tables: Object.freeze(tables), ranking };
}
