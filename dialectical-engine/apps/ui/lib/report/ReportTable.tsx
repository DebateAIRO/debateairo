import type { JSX } from "react";
import { StyleSheet, View, type Styles } from "@react-pdf/renderer";
import type { ReportCompareTable, ReportProsConsTable, ReportRanking, ReportTable, ReportTableCell } from "./reportTables.js";

/**
 * The report's tables (data blocks, 2026-10-30), drawn from ReportTables and nothing else. Every word is a report text,
 * set by the caller's `Words` and `Cell` (a cell's words, then its [Pn] link to the list of points), so a table gets
 * the report's faces, fallbacks, direction and line-break rule like every other text. A table may run across pages; each
 * row stays whole, and the head stays with the first row.
 */

type Style = Styles[string];
type TextStyle = Style | Style[];
export type TableWords = (props: { style: TextStyle; text: string }) => JSX.Element;
export type TableCell = (props: { style: TextStyle; cell: ReportTableCell }) => JSX.Element;

// The report's print colours (ReportDocument.tsx): ink, strong, muted, hairline, accent, the note's background.
const INK = "#29261F";
const STRONG = "#1A1613";
const MUTED = "#6E675C";
const LINE = "#D9D3C8";
const GRID = "#ECE7DE";
const ACCENT = "#C15F3C";
const HEAD_BG = "#F3ECE0";

/** The page's text width (A4, 62pt margins) less the block's border and padding. */
const TABLE_WIDTH = 595.28 - 2 * 62 - 2 * 12 - 2;
/** A comparison table's option column; the things compared share the rest. */
const OPTION_COLUMN = 104;
const PLACE_COLUMN = 34;
const STRENGTH_COLUMN = 64;

const styles = StyleSheet.create({
  block: { marginTop: 4, marginBottom: 14, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  title: { fontWeight: 700, fontSize: 10, lineHeight: 1.35, color: INK, marginBottom: 8 },
  headRow: { flexDirection: "row", backgroundColor: HEAD_BG, borderBottomWidth: 1, borderBottomColor: LINE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GRID },
  headCell: { paddingVertical: 4, paddingHorizontal: 5, fontWeight: 700, fontSize: 7.5, lineHeight: 1.3, color: STRONG },
  labelCell: { paddingVertical: 4, paddingHorizontal: 5, fontWeight: 700, fontSize: 8, lineHeight: 1.35, color: STRONG },
  cell: { paddingVertical: 4, paddingHorizontal: 5, fontSize: 8, lineHeight: 1.35, color: INK },
  notStated: { paddingVertical: 4, paddingHorizontal: 5, fontSize: 7.5, lineHeight: 1.35, fontStyle: "italic", color: MUTED },
  // Pros and cons: each position's name, then its two sides beside each other.
  option: { marginBottom: 8 },
  optionLabel: { fontWeight: 700, fontSize: 9, lineHeight: 1.35, color: STRONG, marginBottom: 4 },
  sides: { flexDirection: "row" },
  side: { flex: 1, paddingRight: 8 },
  sideTitle: { fontWeight: 700, fontSize: 7.5, lineHeight: 1.3, letterSpacing: 0.6, color: ACCENT, marginBottom: 3 },
  entry: { fontSize: 8, lineHeight: 1.4, color: INK, marginBottom: 3 },
  noEntry: { fontSize: 7.5, lineHeight: 1.4, fontStyle: "italic", color: MUTED },
  // The ranking: the mark under an answer's words ("Chosen answer").
  mark: { paddingHorizontal: 5, paddingBottom: 4, fontWeight: 700, fontSize: 7, lineHeight: 1.3, color: ACCENT },
  caption: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: GRID },
  captionUnruled: { marginTop: 8 },
  captionLine: { fontSize: 7.5, lineHeight: 1.4, color: MUTED }
});

function Caption({ sources, notes, ruled, Words }: {
  sources: string;
  notes: readonly string[];
  /** A rule above it, where no table row's own line already ends the table. */
  ruled: boolean;
  Words: TableWords;
}): JSX.Element {
  // The sources on their own line, as under a chart: "From points P1, P2" ends without a full stop in every language.
  const lines = [...(sources.length === 0 ? [] : [sources]), notes.join(" ")];
  return (
    <View style={ruled ? styles.caption : styles.captionUnruled} wrap={false}>
      {lines.map((line, index) => <Words key={index} style={styles.captionLine} text={line} />)}
    </View>
  );
}

function CompareTable({ table, row, Words, Cell }: { table: ReportCompareTable; row: Style; Words: TableWords; Cell: TableCell }): JSX.Element {
  const width = (TABLE_WIDTH - OPTION_COLUMN) / table.columns.length;
  return (
    <>
      <View style={[styles.headRow, row]} wrap={false} minPresenceAhead={40}>
        <View style={{ width: OPTION_COLUMN }} />
        {table.columns.map((column, index) => (
          <View key={index} style={{ width }}><Words style={styles.headCell} text={column} /></View>
        ))}
      </View>
      {table.rows.map((item, rowIndex) => (
        <View key={rowIndex} style={[styles.row, row]} wrap={false}>
          <View style={{ width: OPTION_COLUMN }}><Words style={styles.labelCell} text={item.label} /></View>
          {item.cells.map((cell, index) => (
            <View key={index} style={{ width }}>
              {cell === null ? <Words style={styles.notStated} text={table.notStated} /> : <Cell style={styles.cell} cell={cell} />}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function ProsConsTable({ table, row, Words, Cell }: { table: ReportProsConsTable; row: Style; Words: TableWords; Cell: TableCell }): JSX.Element {
  return (
    <>
      {table.options.map((option, index) => (
        <View key={index} style={styles.option} wrap={false}>
          <Words style={styles.optionLabel} text={option.label} />
          <View style={[styles.sides, row]}>
            {([[table.prosTitle, option.pros], [table.consTitle, option.cons]] as const).map(([title, entries], side) => (
              <View key={side} style={styles.side}>
                <Words style={styles.sideTitle} text={title} />
                {entries.length === 0
                  ? <Words style={styles.noEntry} text={table.none} />
                  : entries.map((entry, at) => <Cell key={at} style={styles.entry} cell={entry} />)}
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

export function ReportTableBlock({ table, row, Words, Cell }: {
  table: ReportTable;
  /** The report's row direction (a right-to-left report runs each row from the right). */
  row: Style;
  Words: TableWords;
  Cell: TableCell;
}): JSX.Element {
  return (
    <View style={styles.block}>
      <View wrap={false} minPresenceAhead={60}><Words style={styles.title} text={table.title} /></View>
      {table.kind === "compare"
        ? <CompareTable table={table} row={row} Words={Words} Cell={Cell} />
        : <ProsConsTable table={table} row={row} Words={Words} Cell={Cell} />}
      <Caption sources={table.sources} notes={table.notes} ruled={table.kind === "pros_cons"} Words={Words} />
    </View>
  );
}

export function ReportRankingBlock({ ranking, row, Words, Cell }: {
  ranking: ReportRanking;
  row: Style;
  Words: TableWords;
  Cell: TableCell;
}): JSX.Element {
  return (
    <View style={styles.block}>
      <View wrap={false} minPresenceAhead={60}><Words style={styles.title} text={ranking.title} /></View>
      <View style={[styles.headRow, row]} wrap={false}>
        <View style={{ width: PLACE_COLUMN }}><Words style={styles.headCell} text={ranking.headers.place} /></View>
        <View style={{ flex: 1 }}><Words style={styles.headCell} text={ranking.headers.answer} /></View>
        <View style={{ width: STRENGTH_COLUMN }}><Words style={styles.headCell} text={ranking.headers.strength} /></View>
      </View>
      {ranking.rows.map((item, index) => (
        <View key={index} style={[styles.row, row]} wrap={false}>
          <View style={{ width: PLACE_COLUMN }}><Words style={styles.labelCell} text={item.place} /></View>
          <View style={{ flex: 1 }}>
            <Cell style={styles.cell} cell={{ text: item.answer, cite: item.cite }} />
            {item.mark === null ? null : <Words style={styles.mark} text={item.mark} />}
          </View>
          <View style={{ width: STRENGTH_COLUMN }}><Words style={styles.cell} text={item.strength} /></View>
        </View>
      ))}
      <Caption sources="" notes={ranking.notes} ruled={false} Words={Words} />
    </View>
  );
}
