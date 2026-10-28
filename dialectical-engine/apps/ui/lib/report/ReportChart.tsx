import type { JSX } from "react";
import { Circle, Image, Line, Rect, StyleSheet, Svg, View, type Styles } from "@react-pdf/renderer";
import {
  linearScale,
  logScale,
  scalePosition,
  tickText,
  type ReportChart,
  type ReportChartAxis,
  type ReportChartScale
} from "./reportCharts.js";

/**
 * One chart of the report (design 2026-10-28), drawn from ReportChart and nothing else. The marks (grid, bars, dots)
 * are vector shapes; every word and number is a report text, set by the caller's `Words`, so a chart's labels get the
 * report's faces, fallbacks, direction and line-break rule like every other text. The chart, its caption and its
 * copyright line form one block that never breaks across pages.
 */

type Style = Styles[string];
type TextStyle = Style | Style[];
export type ChartWords = (props: { style: TextStyle; text: string }) => JSX.Element;

// The report's print colours (ReportDocument.tsx): ink, muted, hairline, accent.
const INK = "#29261F";
const MUTED = "#6E675C";
const LINE = "#D9D3C8";
const GRID = "#ECE7DE";
const ACCENT = "#C15F3C";

/** The page's text width (A4, 62pt margins) less the block's border and padding. */
const PLOT_WIDTH = 595.28 - 2 * 62 - 2 * 12 - 2;
const TICK_FONT = 7;
const LABEL_FONT = 7.5;
const BAR_ROW = 22;
const SCATTER_HEIGHT = 220;
/** How many places a scatter label is tried in before it is set where it first went. */
const LABEL_TRIES = 5;

const styles = StyleSheet.create({
  block: { marginTop: 4, marginBottom: 14, paddingTop: 10, paddingBottom: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  title: { flex: 1, fontWeight: 700, fontSize: 10, lineHeight: 1.35, color: INK },
  wordmark: { marginLeft: 10, fontWeight: 700, fontSize: 7, lineHeight: 1.3, letterSpacing: 0.4, color: MUTED },
  logo: { marginLeft: 10, height: 12, width: 72, objectFit: "contain" },
  axisLabel: { fontSize: LABEL_FONT, lineHeight: 1.3, color: MUTED },
  axisLabelBelow: { marginTop: 4, fontSize: LABEL_FONT, lineHeight: 1.3, color: MUTED, textAlign: "center" },
  plot: { position: "relative" },
  svg: { position: "absolute", top: 0, left: 0 },
  tick: { position: "absolute", fontSize: TICK_FONT, lineHeight: 1.2, color: MUTED },
  markLabel: { position: "absolute", fontSize: LABEL_FONT, lineHeight: 1.2, color: INK },
  value: { position: "absolute", fontSize: TICK_FONT, lineHeight: 1.2, color: MUTED },
  caption: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: GRID },
  captionLine: { fontSize: 7.5, lineHeight: 1.4, color: MUTED }
});

/** About how wide `text` sets at `size`: CJK characters are square, the rest about half as wide. */
function textWidth(text: string, size: number): number {
  let width = 0;
  for (const character of text) width += /[⺀-鿿가-힯豈-﫿＀-￯]/u.test(character) ? size : size * 0.56;
  return width;
}

/** The text cut, at a whole character, to what fits in `lines` lines of `width`, with an ellipsis when cut. */
function fitted(text: string, size: number, width: number, lines: number): string {
  if (textWidth(text, size) <= width * lines * 0.92) return text;
  const characters = Array.from(text);
  while (characters.length > 1 && textWidth(`${characters.join("")}…`, size) > width * lines * 0.92) characters.pop();
  return `${characters.join("").trimEnd()}…`;
}

function scaleOf(axis: ReportChartAxis, values: readonly number[], fromZero: boolean): ReportChartScale {
  return axis.log ? logScale(values) : linearScale(values, { fromZero, percent: axis.percent });
}

function BarChart({ chart, locale, Words }: { chart: ReportChart; locale: string; Words: ChartWords }): JSX.Element {
  const marks = chart.marks;
  const labelWidth = Math.min(160, Math.max(64, Math.max(...marks.map((mark) => textWidth(mark.label, LABEL_FONT))) / 2 + 12));
  const longestValue = Math.max(...marks.map((mark) => textWidth(mark.yText, TICK_FONT)));
  const left = labelWidth + 8;
  const right = PLOT_WIDTH - Math.min(90, longestValue + 8);
  const scale = scaleOf(chart.y, marks.map((mark) => mark.y), true);
  const at = (value: number): number => left + scalePosition(scale, value, chart.y.log) * (right - left);
  const base = at(chart.y.log ? scale.min : Math.min(Math.max(0, scale.min), scale.max));
  const plotHeight = marks.length * BAR_ROW;
  const height = plotHeight + 14;
  return (
    <>
      <View style={[styles.plot, { width: PLOT_WIDTH, height }]}>
        <Svg style={styles.svg} width={PLOT_WIDTH} height={height}>
          {scale.ticks.map((tick, index) => (
            <Line key={`grid-${index}`} x1={at(tick)} y1={0} x2={at(tick)} y2={plotHeight} stroke={GRID} strokeWidth={0.6} />
          ))}
          {marks.map((mark, index) => {
            const end = at(mark.y);
            return (
              <Rect key={`bar-${index}`} x={Math.min(base, end)} y={index * BAR_ROW + 5} width={Math.max(0.8, Math.abs(end - base))}
                height={BAR_ROW - 10} fill={ACCENT} />
            );
          })}
          <Line x1={base} y1={0} x2={base} y2={plotHeight} stroke={MUTED} strokeWidth={0.8} />
        </Svg>
        {marks.map((mark, index) => (
          <View key={`label-${index}`} style={{ position: "absolute", left: 0, top: index * BAR_ROW + 2, width: labelWidth, height: BAR_ROW - 2, justifyContent: "center" }}>
            <Words style={[styles.axisLabel, { color: INK, textAlign: "right" }]} text={fitted(mark.label, LABEL_FONT, labelWidth, 2)} />
          </View>
        ))}
        {marks.map((mark, index) => (
          <Words key={`value-${index}`} style={[styles.value, { left: Math.max(base, at(mark.y)) + 4, top: index * BAR_ROW + (BAR_ROW - 9) / 2, width: 90 }]}
            text={mark.yText} />
        ))}
        {scale.ticks.map((tick, index) => (
          <Words key={`tick-${index}`} style={[styles.tick, { left: at(tick) - 24, top: plotHeight + 3, width: 48, textAlign: "center" }]}
            text={tickText(locale, tick, chart.y.percent)} />
        ))}
      </View>
      <Words style={styles.axisLabelBelow} text={chart.y.label} />
    </>
  );
}

interface PlacedLabel {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && Math.abs(a.top - b.top) < LABEL_FONT * 1.25;
}

function ScatterChart({ chart, locale, Words }: { chart: ReportChart; locale: string; Words: ChartWords }): JSX.Element {
  const marks = chart.marks;
  const xAxis = chart.x!;
  const xScale = scaleOf(xAxis, marks.map((mark) => mark.x!), false);
  const yScale = scaleOf(chart.y, marks.map((mark) => mark.y), false);
  const left = 40;
  const right = PLOT_WIDTH - 8;
  const top = 6;
  const bottom = SCATTER_HEIGHT - 18;
  const px = (value: number): number => left + scalePosition(xScale, value, xAxis.log) * (right - left);
  const py = (value: number): number => bottom - scalePosition(yScale, value, chart.y.log) * (bottom - top);
  // Each dot's label beside it, on the side with room, moved down or up a line when it would cover a label placed before.
  const placed: PlacedLabel[] = [];
  const labels = marks
    .map((mark, index) => ({ mark, index, x: px(mark.x!), y: py(mark.y) }))
    .sort((a, b) => a.y - b.y)
    .map(({ mark, index, x, y }) => {
      const text = fitted(mark.label, LABEL_FONT, 150, 1);
      const width = textWidth(text, LABEL_FONT) + 4;
      const onLeft = x + 6 + width > right;
      const label = { left: onLeft ? x - 6 - width : x + 6, top: y - LABEL_FONT * 0.65, width };
      // Where it would go first, then a line down, a line up, two down, two up.
      for (let attempt = 0; attempt < LABEL_TRIES; attempt += 1) {
        const shift = attempt % 2 === 1 ? Math.ceil(attempt / 2) : -attempt / 2;
        const tried = { ...label, top: label.top + shift * LABEL_FONT * 1.3 };
        if (!placed.some((other) => overlaps(other, tried))) {
          placed.push(tried);
          return { index, text, box: tried, onLeft };
        }
      }
      placed.push(label);
      return { index, text, box: label, onLeft };
    });
  return (
    <>
      <Words style={[styles.axisLabel, { marginBottom: 4 }]} text={chart.y.label} />
      <View style={[styles.plot, { width: PLOT_WIDTH, height: SCATTER_HEIGHT }]}>
        <Svg style={styles.svg} width={PLOT_WIDTH} height={SCATTER_HEIGHT}>
          {yScale.ticks.map((tick, index) => (
            <Line key={`ygrid-${index}`} x1={left} y1={py(tick)} x2={right} y2={py(tick)} stroke={GRID} strokeWidth={0.6} />
          ))}
          {xScale.ticks.map((tick, index) => (
            <Line key={`xgrid-${index}`} x1={px(tick)} y1={top} x2={px(tick)} y2={bottom} stroke={GRID} strokeWidth={0.6} />
          ))}
          <Line x1={left} y1={bottom} x2={right} y2={bottom} stroke={MUTED} strokeWidth={0.8} />
          <Line x1={left} y1={top} x2={left} y2={bottom} stroke={MUTED} strokeWidth={0.8} />
          {marks.map((mark, index) => (
            <Circle key={`dot-${index}`} cx={px(mark.x!)} cy={py(mark.y)} r={3.6} fill={ACCENT} stroke="#FFFFFF" strokeWidth={0.8} />
          ))}
        </Svg>
        {yScale.ticks.map((tick, index) => (
          <Words key={`ytick-${index}`} style={[styles.tick, { left: 0, top: py(tick) - 4.5, width: left - 5, textAlign: "right" }]}
            text={tickText(locale, tick, chart.y.percent)} />
        ))}
        {xScale.ticks.map((tick, index) => (
          <Words key={`xtick-${index}`} style={[styles.tick, { left: px(tick) - 24, top: bottom + 4, width: 48, textAlign: "center" }]}
            text={tickText(locale, tick, xAxis.percent)} />
        ))}
        {labels.map(({ index, text, box, onLeft }) => (
          <Words key={`mark-${index}`} style={[styles.markLabel, { left: box.left, top: box.top, width: box.width, textAlign: onLeft ? "right" : "left" }]}
            text={text} />
        ))}
      </View>
      <Words style={styles.axisLabelBelow} text={xAxis.label} />
    </>
  );
}

export function ReportChartBlock({ chart, locale, logo, row, Words }: {
  chart: ReportChart;
  locale: string;
  /** The logo file, when the company has one; the wordmark otherwise. */
  logo: string | null;
  /** The report's row direction (a right-to-left report puts the title on the right and the mark on the left). */
  row: Style;
  Words: ChartWords;
}): JSX.Element {
  // The sources on their own line: "From points P1, P2" ends without a full stop in every language.
  const caption = [...(chart.sources.length === 0 ? [] : [chart.sources]), chart.notes.join(" ")];
  return (
    <View style={styles.block} wrap={false}>
      <View style={[styles.head, row]}>
        <Words style={styles.title} text={chart.title} />
        {/* react-pdf's Image takes no alt text; the wordmark beside the title says whose chart it is. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {logo === null ? <Words style={styles.wordmark} text={chart.wordmark} /> : <Image style={styles.logo} src={logo} />}
      </View>
      {chart.kind === "bar"
        ? <BarChart chart={chart} locale={locale} Words={Words} />
        : <ScatterChart chart={chart} locale={locale} Words={Words} />}
      <View style={styles.caption}>
        {caption.map((line, index) => <Words key={index} style={styles.captionLine} text={line} />)}
        <Words style={styles.captionLine} text={chart.copyright} />
      </View>
    </View>
  );
}
