import { beforeAll, describe, expect, it } from "vitest";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import { renderReportPdf, resolveReportFontDirectory, resolveReportLogo } from "../../apps/ui/lib/report/renderReport.js";
import {
  REPORT_CHART_COPYRIGHT,
  REPORT_CHART_WORDMARK,
  linearScale,
  logScale,
  scalePosition
} from "../../apps/ui/lib/report/reportCharts.js";
import { loadReportCatalogs, type ReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import { reportPrintedText } from "../../apps/ui/lib/report/reportLayout.js";
import { buildReportModel } from "../../apps/ui/lib/report/reportModel.js";
import { STORY_CHARTS_SAMPLE_ANSWER, storyChartsSample } from "../../apps/ui/lib/v3/storyChartsSample.js";
import { STORY_FIXTURE_ANSWER, storyFixture, storyFixtureWithCharts } from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * Charts in the verdict PDF (design 2026-10-28): what the report prints for a story's stored charts, the axes, and
 * that a report with charts renders. Strengths are read from the answer, never from the chart plan.
 */

let ROMANIAN: ReportCatalogs;
let ENGLISH: ReportCatalogs;
const GENERATED = new Date("2026-10-28T10:00:00.000Z");

beforeAll(async () => {
  ROMANIAN = await loadReportCatalogs({ questionTag: "ro", interfaceLocale: "en", load: loadNamespace });
  ENGLISH = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load: loadNamespace });
});

describe("the report model's charts", () => {
  it("prints each stored chart after its paragraph, strengths read from the answer, figures as the claims write them", () => {
    const model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixtureWithCharts("READY"), GENERATED, ROMANIAN, null);
    expect(model.charts.map((chart) => chart.after)).toEqual(["long.2.1", "long.3.2"]);
    const [strengths, figures] = model.charts;
    // n-hybrid finished at 0.64 and n-yes at 0.58 (the list of points prints the same numbers).
    expect(strengths!.marks.map((mark) => mark.y)).toEqual([64, 58]);
    expect(strengths!.y).toEqual({ label: t(ROMANIAN.publicCatalog, "public.report.chart.strengthAxis"), log: false, percent: true });
    expect(strengths!.notes).toEqual([
      t(ROMANIAN.publicCatalog, "public.report.chart.aiNote"),
      t(ROMANIAN.publicCatalog, "public.report.chart.strengthNote")
    ]);
    expect(figures!.marks.map((mark) => [mark.y, mark.yText])).toEqual([[35, "35%"], [30, "30%"]]);
    expect(figures!.notes).toContain(t(ROMANIAN.publicCatalog, "public.report.chart.figuresNote"));
    expect(figures!.sources).toContain("P4");
    expect(figures!.sources).toContain("P5");
    for (const chart of model.charts) {
      expect(chart.copyright).toBe("Copyrighted by DMS Merchandise Shop SRL");
      expect(chart.wordmark).toBe(REPORT_CHART_WORDMARK);
    }
    expect(model.about.notes.at(-1)).toBe(t(ROMANIAN.publicCatalog, "public.report.about.charts"));
    // Every chart string is printed text, so the report's faces are chosen to cover it.
    expect(reportPrintedText(model)).toContain(REPORT_CHART_COPYRIGHT);
  });

  it("a story without charts prints none, and About says nothing about charts", () => {
    const model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY"), GENERATED, ROMANIAN, null);
    expect(model.charts).toEqual([]);
    expect(model.about.notes).not.toContain(t(ROMANIAN.publicCatalog, "public.report.about.charts"));
  });

  it("leaves out a chart whose point is not in the answer, whole", () => {
    const story = storyFixtureWithCharts("READY");
    const charts = structuredClone(story.charts!);
    charts[1]!.items[0]!.node_ref = "n-gone";
    const model = buildReportModel(STORY_FIXTURE_ANSWER, { ...story, charts }, GENERATED, ROMANIAN, null);
    expect(model.charts.map((chart) => chart.after)).toEqual(["long.2.1"]);
  });

  it("the scatter sample plots cost against score, both as the claims state them", () => {
    const model = buildReportModel(STORY_CHARTS_SAMPLE_ANSWER, storyChartsSample(), GENERATED, ENGLISH, null);
    const scatter = model.charts.find((chart) => chart.kind === "scatter")!;
    expect(scatter.x).toMatchObject({ log: true, percent: false });
    expect(scatter.marks.find((mark) => mark.label === "Atlas Pro")).toMatchObject({ x: 1.4, y: 54, xText: "$1.40" });
    expect(scatter.notes).not.toContain(t(ENGLISH.publicCatalog, "public.report.chart.strengthNote"));
  });
});

describe("the chart axes", () => {
  it("a bar chart's linear scale holds zero and steps evenly", () => {
    expect(linearScale([35, 30], { fromZero: true, percent: false })).toEqual({ min: 0, max: 40, ticks: [0, 10, 20, 30, 40] });
    expect(linearScale([64, 58], { fromZero: true, percent: true }).ticks.at(-1)).toBe(80);
    expect(linearScale([-3, 5], { fromZero: true, percent: false }).min).toBeLessThan(0);
  });

  it("a log scale spans whole decades, with 2 and 5 between them", () => {
    const scale = logScale([0.15, 10]);
    expect(scale).toEqual({ min: 0.1, max: 10, ticks: [0.1, 0.2, 0.5, 1, 2, 5, 10] });
    expect(scalePosition(scale, 1, true)).toBeCloseTo(0.5);
  });
});

describe("a report with charts renders", () => {
  it("prints the Romanian sample with its bar charts and the English sample with its scatter", async () => {
    const romanian = await renderReportPdf({
      answer: STORY_FIXTURE_ANSWER, story: storyFixtureWithCharts("READY"), generatedAt: GENERATED, catalogs: ROMANIAN
    });
    const plain = await renderReportPdf({
      answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY"), generatedAt: GENERATED, catalogs: ROMANIAN
    });
    const english = await renderReportPdf({
      answer: STORY_CHARTS_SAMPLE_ANSWER, story: storyChartsSample(), generatedAt: GENERATED, catalogs: ENGLISH
    });
    for (const pdf of [romanian, english]) expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(romanian.length).toBeGreaterThan(plain.length);
  }, 120_000);

  it("uses the wordmark until the logo file exists", () => {
    expect(resolveReportLogo(resolveReportFontDirectory())).toBeNull();
  });
});
