import {
  STORY_TABLE_LIMITS,
  StoryTableSchema,
  type StoryChart,
  type StoryCompareTable,
  type StoryProsConsTable,
  type StoryRankingTable,
  type StoryTable,
  type StoryTableCell
} from "@debateai/contract";
import { TypedDomainError, exhaustive } from "@debateai/kernel";
import { decodeModelJson, type ModelReplyFacts } from "@debateai/providers";
import {
  FORBIDDEN_CHARACTERS,
  StoryBlocksReplySchema,
  normalised,
  readStoryCharts,
  scorePattern,
  storyChartParagraph,
  type StoryChartDropCode,
  type StoryChartsContext
} from "./charts.js";
import { STORY_BLOCK_KINDS, STORY_BLOCK_MENU, storyQuestionFormOf, type StoryBlockKind, type StoryQuestionForm } from "./forms.js";
import type { StoryMaterial } from "./material.js";

/**
 * DATA BLOCKS IN THE VERDICT PDF (owner decisions 2026-10-30): tables beside the charts, and the test that decides
 * whether a debate gets any. Code decides whether a debate holds something worth showing (`storyBlockNeeds`): only then
 * is the block call made. The model names the kind of question and plans the blocks; code keeps only the blocks that
 * kind's menu allows (forms.ts), checks every cell against the claim it cites, and builds the ranking of the answers
 * itself. A cell that fails its check prints as "not stated"; a table is left out only when too little is left of it.
 */

/** The figures a claim states, as it writes them: a number with its currency sign before it, or its unit or % after it. */
const FIGURE_SPAN = /[$€£¥₹]\s?[-−]?\d(?:[\d.,'’  ]*\d)?|[-−]?\d(?:[\d.,'’  ]*\d)?(?:\s?(?:%|‰|\p{L}{1,12}))?/gu;
/** A year standing alone ("in 2024") is a date, not a figure to compare. */
const BARE_YEAR = /^(1[89]|20)\d\d$/u;

export function claimFigures(claim: string): readonly string[] {
  const figures: string[] = [];
  for (const match of claim.matchAll(FIGURE_SPAN)) {
    const text = match[0].trim();
    if (BARE_YEAR.test(text.split(/\s/u)[0]!) && !/[$€£¥₹%‰]/u.test(text)) continue;
    if (!figures.includes(text)) figures.push(text);
  }
  return Object.freeze(figures);
}

/** For each position: the points that support it and the points that attack it (their short references). */
export type StoryArgumentSides = ReadonlyMap<string, Readonly<{ pros: ReadonlySet<string>; cons: ReadonlySet<string> }>>;

export function storyArgumentSides(material: Pick<StoryMaterial, "positions" | "points">): StoryArgumentSides {
  const sides = new Map(material.positions.map((position) => [position.id, { pros: new Set<string>(), cons: new Set<string>() }]));
  for (const point of material.points) {
    for (const target of point.supports ?? []) sides.get(target)?.pros.add(point.id);
    for (const target of point.attacks ?? []) sides.get(target)?.cons.add(point.id);
  }
  return sides;
}

/** Every position and point once (a v3 material lists each position among the points too). */
function materialEntries(material: Pick<StoryMaterial, "positions" | "points">): readonly Readonly<{ id: string; claim: string }>[] {
  const seen = new Set<string>();
  return [...material.positions, ...material.points].filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
}

/** The figures field of the block call: each position or point whose claim states figures, with those figures. */
export function storyFiguresField(material: Pick<StoryMaterial, "positions" | "points">): readonly Readonly<{ id: string; figures: readonly string[] }>[] {
  return Object.freeze(materialEntries(material)
    .map((entry) => ({ id: entry.id, figures: claimFigures(entry.claim) }))
    .filter((entry) => entry.figures.length > 0));
}

/**
 * What a debate holds that a block could show (owner decisions Q5, Q6). Figures: three claims or more state numbers (two
 * numbers read better in a sentence). Compare: two options at least, argued with two points or more. Pros and cons: a
 * position with points both for and against it, or two positions argued for or against. Ranking: three answers or
 * more, which code alone draws. The block call is made only when one of the first three holds.
 */
export interface StoryBlockNeeds {
  readonly figures: boolean;
  readonly compare: boolean;
  readonly prosCons: boolean;
  readonly ranking: boolean;
}

export function storyBlockNeeds(material: Pick<StoryMaterial, "positions" | "points">): StoryBlockNeeds {
  const entries = materialEntries(material);
  const positions = new Set(material.positions.map((position) => position.id));
  const points = entries.filter((entry) => !positions.has(entry.id)).length;
  const sides = [...storyArgumentSides(material).values()];
  const argued = sides.filter((side) => side.pros.size + side.cons.size > 0);
  return Object.freeze({
    figures: entries.filter((entry) => claimFigures(entry.claim).length > 0).length >= 3,
    compare: positions.size >= 2 && points >= 2,
    prosCons: argued.some((side) => side.pros.size > 0 && side.cons.size > 0) || argued.length >= 2,
    ranking: positions.size >= STORY_TABLE_LIMITS.minRankingRows
  });
}

export function storyBlockCallNeeded(needs: StoryBlockNeeds): boolean {
  return needs.figures || needs.compare || needs.prosCons;
}

/**
 * The ranking of the answers (owner decision Q5), from the engine's own record: every position in its place, whether
 * it won, whether it finished within the tie margin of the winner. Null with fewer than three positions.
 */
export function storyRanking(material: Pick<StoryMaterial, "positions">, placement: StoryRankingTable["placement"]): StoryRankingTable | null {
  if (material.positions.length < STORY_TABLE_LIMITS.minRankingRows) return null;
  const rows = [...material.positions]
    .sort((a, b) => a.place - b.place)
    .slice(0, STORY_TABLE_LIMITS.maxRankingRows)
    .map((position) => ({ node_ref: position.id, won: position.won, close: position.within_tie_margin === true }));
  return Object.freeze({ kind: "ranking", placement, rows });
}

/** What a table is checked against: the chart context, and which points argue for and against each position. */
export interface StoryBlocksContext extends StoryChartsContext {
  readonly sides: StoryArgumentSides;
}

/** Why a table, or a planned block, was left out: a code, never the model's text. */
export type StoryTableDropCode =
  | "TABLE_SCHEMA"
  | "TABLE_OVER_LIMIT"
  | "TABLE_ANCHOR_UNKNOWN"
  | "TABLE_ANCHOR_TAKEN"
  | "TABLE_TEXT_CHARACTERS"
  | "TABLE_TEXT_SCORE_VALUE"
  | "TABLE_LABEL_REPEATED"
  | "TABLE_TOO_LITTLE_DATA"
  | "BLOCK_NOT_FOR_QUESTION";

export interface StoryBlocksReading {
  /** The kind of question the model named, or null when it named none this code knows. */
  readonly form: StoryQuestionForm | null;
  readonly charts: readonly StoryChart[];
  /** The planned tables that passed, with short references; never a ranking (`storyRanking` is code's). */
  readonly tables: readonly StoryTable[];
  readonly dropped: readonly (StoryChartDropCode | StoryTableDropCode)[];
}

/** The words are in the claim of the point the cell cites, whitespace aside. */
function inClaim(cell: StoryTableCell, claims: ReadonlyMap<string, string>): boolean {
  const claim = claims.get(cell.node_ref);
  return claim !== undefined && normalised(claim).includes(normalised(cell.text));
}

/** The model's own words on a table (its title and labels): plain characters, and no score from the material. */
function wordsIssue(texts: readonly string[], scores: RegExp | null): StoryTableDropCode | null {
  if (texts.some((text) => FORBIDDEN_CHARACTERS.test(text))) return "TABLE_TEXT_CHARACTERS";
  if (scores !== null && texts.some((text) => scores.test(text))) return "TABLE_TEXT_SCORE_VALUE";
  return null;
}

function repeated(labels: readonly string[]): boolean {
  return new Set(labels.map(normalised)).size !== labels.length;
}

/**
 * A comparison table with every cell that is not in its claim emptied, then every column with fewer than two cells
 * left and every row with none left taken out (owner decision Q3). Too little data: no column, or fewer than two rows,
 * left. One column of two options or more still compares them.
 */
function checkedCompare(table: StoryCompareTable, context: StoryBlocksContext, scores: RegExp | null): StoryCompareTable | StoryTableDropCode {
  if (storyChartParagraph(context.body, table.after) === null) return "TABLE_ANCHOR_UNKNOWN";
  const words = wordsIssue([table.title, ...table.columns, ...table.rows.map((row) => row.label)], scores);
  if (words !== null) return words;
  if (repeated(table.rows.map((row) => row.label)) || repeated(table.columns)) return "TABLE_LABEL_REPEATED";
  if (table.rows.some((row) => row.cells.length !== table.columns.length)) return "TABLE_SCHEMA";
  const cells = table.rows.map((row) => row.cells.map((cell) => (cell !== null && inClaim(cell, context.claims) ? cell : null)));
  const columns = table.columns.map((_, column) => column).filter((column) => cells.filter((row) => row[column] !== null).length >= 2);
  const rows = table.rows
    .map((row, index) => ({ label: row.label, cells: columns.map((column) => cells[index]![column]!) }))
    .filter((row) => row.cells.some((cell) => cell !== null));
  if (columns.length < STORY_TABLE_LIMITS.minKeptColumns || rows.length < STORY_TABLE_LIMITS.minRows) return "TABLE_TOO_LITTLE_DATA";
  return { ...table, columns: columns.map((column) => table.columns[column]!), rows };
}

/**
 * A pros and cons list with every entry that is not in its claim, or does not argue that side of its position, taken
 * out, and every position left with no entry. Too little data: fewer than two entries left.
 */
function checkedProsCons(table: StoryProsConsTable, context: StoryBlocksContext, scores: RegExp | null): StoryProsConsTable | StoryTableDropCode {
  if (storyChartParagraph(context.body, table.after) === null) return "TABLE_ANCHOR_UNKNOWN";
  const words = wordsIssue([table.title, ...table.options.map((option) => option.label)], scores);
  if (words !== null) return words;
  if (repeated(table.options.map((option) => option.label))) return "TABLE_LABEL_REPEATED";
  const options = table.options.flatMap((option) => {
    const side = context.sides.get(option.position_ref);
    if (side === undefined) return [];
    const kept = (entries: readonly StoryTableCell[], arguing: ReadonlySet<string>) =>
      entries.filter((entry) => arguing.has(entry.node_ref) && inClaim(entry, context.claims));
    const pros = kept(option.pros, side.pros);
    const cons = kept(option.cons, side.cons);
    return pros.length + cons.length === 0 ? [] : [{ ...option, pros, cons }];
  });
  const entries = options.reduce((total, option) => total + option.pros.length + option.cons.length, 0);
  if (options.length === 0 || entries < 2) return "TABLE_TOO_LITTLE_DATA";
  return { ...table, options };
}

/**
 * The plan's blocks that pass every check, for the kind of question it names. A chart or table whose kind that kind's
 * menu does not list is left out (`BLOCK_NOT_FOR_QUESTION`); a kind this code does not know keeps every kind, so the
 * checks alone decide. At most one block after any one paragraph, a chart before a table. Never throws for anything
 * the model wrote.
 */
export function readStoryBlocks(value: unknown, context: StoryBlocksContext): StoryBlocksReading {
  const reply = StoryBlocksReplySchema.safeParse(value);
  if (!reply.success) return { form: null, charts: [], tables: [], dropped: ["CHART_SCHEMA"] };
  const form = storyQuestionFormOf(reply.data.question_form);
  const menu = new Set<StoryBlockKind>(form === null ? STORY_BLOCK_KINDS : STORY_BLOCK_MENU[form]);
  const dropped: (StoryChartDropCode | StoryTableDropCode)[] = [];
  const read = readStoryCharts({ charts: reply.data.charts }, context);
  dropped.push(...read.dropped);
  const charts: StoryChart[] = [];
  for (const chart of read.charts) {
    if (menu.has(chart.kind)) charts.push(chart);
    else dropped.push("BLOCK_NOT_FOR_QUESTION");
  }
  const anchors = new Set(charts.map((chart) => chart.after));
  const scores = scorePattern(context.scoreTexts);
  const tables: StoryTable[] = [];
  for (const candidate of reply.data.tables ?? []) {
    const parsed = StoryTableSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.kind === "ranking") {
      dropped.push("TABLE_SCHEMA");
      continue;
    }
    if (!menu.has(parsed.data.kind)) {
      dropped.push("BLOCK_NOT_FOR_QUESTION");
      continue;
    }
    const checked = parsed.data.kind === "compare"
      ? checkedCompare(parsed.data, context, scores)
      : checkedProsCons(parsed.data, context, scores);
    if (typeof checked === "string") dropped.push(checked);
    else if (anchors.has(checked.after)) dropped.push("TABLE_ANCHOR_TAKEN");
    // One table's room is the ranking's, which code adds.
    else if (tables.length >= STORY_TABLE_LIMITS.maxTables - 1) dropped.push("TABLE_OVER_LIMIT");
    else {
      anchors.add(checked.after);
      tables.push(checked);
    }
  }
  return { form, charts, tables, dropped };
}

/** The accepted reply's blocks, decoded as the classifier decoded it (pass the same `reply`). */
export function parseStoryBlocks(content: string, context: StoryBlocksContext, reply?: ModelReplyFacts): StoryBlocksReading {
  const decoded = decodeModelJson(content, reply);
  if (!decoded.ok) throw new TypedDomainError("STORY_CHARTS_CONTENT_INVALID", "PARSE_FAILED");
  return readStoryBlocks(decoded.value, context);
}

/** The tables with each short reference turned back into its node id, for storage (as `restoreChartRefs`). */
export function restoreTableRefs(tables: readonly StoryTable[], refMap: ReadonlyMap<string, string>): readonly StoryTable[] {
  const nodeId = (ref: string): string => {
    const id = refMap.get(ref);
    if (id === undefined) throw new TypedDomainError("STORY_REF_UNMAPPED", "A table cites a reference the material never offered");
    return id;
  };
  const cell = (entry: StoryTableCell): StoryTableCell => ({ ...entry, node_ref: nodeId(entry.node_ref) });
  return Object.freeze(tables.map((table): StoryTable => {
    switch (table.kind) {
      case "compare":
        return { ...table, rows: table.rows.map((row) => ({ ...row, cells: row.cells.map((entry) => (entry === null ? null : cell(entry))) })) };
      case "pros_cons":
        return {
          ...table,
          options: table.options.map((option) => ({
            ...option, position_ref: nodeId(option.position_ref), pros: option.pros.map(cell), cons: option.cons.map(cell)
          }))
        };
      case "ranking":
        return { ...table, rows: table.rows.map((row) => ({ ...row, node_ref: nodeId(row.node_ref) })) };
      default:
        return exhaustive(table);
    }
  }));
}
