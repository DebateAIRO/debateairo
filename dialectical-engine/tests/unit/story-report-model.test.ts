import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_TIER_ROSTERS, type Answer, type AnswerStory } from "@debateai/contract";
import { numberPoints } from "../../apps/ui/lib/report/pointNumbers.js";
import { REPORT_TITLES, buildReportModel, reportWordPieces, type ReportModel, type ReportSpan } from "../../apps/ui/lib/report/reportModel.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_POINT_NUMBERS,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";

const GENERATED = new Date("2026-09-26T12:00:00.000Z");

/** The fixture's makers use the premium roster's models; read them, never repeat them. */
function rosterModel(prefix: string): string {
  const model = PLAN_TIER_ROSTERS.premium.find((id) => id.startsWith(prefix));
  if (model === undefined) throw new Error(`no premium model starts with ${prefix}`);
  return model;
}
const OPENAI = `OpenAI · ${rosterModel("gpt-")}`;
const ANTHROPIC = `Anthropic · ${rosterModel("claude-")}`;
const XAI = `xAI · ${rosterModel("grok-")}`;

function allText(model: ReportModel): string {
  return JSON.stringify(model);
}

function spanText(spans: readonly ReportSpan[]): string {
  return spans.map((span) => (span.kind === "text" ? span.text : span.label)).join("");
}

/** The decision line keeps each comparison on one line: a no-break space on both sides of < > ≤ ≥ →. */
function nb(line: string): string {
  return line.replace(/ ([<>≤≥→]) /gu, "\u00A0$1\u00A0");
}

/** A 150-character address, the kind a model may copy into its text: no space to break at. */
const LONG_URL =
  "https://www.exemplu-imobiliare.ro/anunturi/inchiriere/cluj-napoca/apartamente-3-camere/zorilor?pret_min=2500&pret_max=4200&sortare=pret&pagina=12&id=9";

function allSpans(model: ReportModel): ReportSpan[] {
  return [
    ...model.inShort.paths.flatMap((path) => path.line.spans),
    ...model.inShort.change.spans,
    ...model.sections.flatMap((section) => section.paragraphs.flatMap((item) => item.spans)),
    ...(model.reviewerNote === null ? [] : model.reviewerNote.paragraph.spans),
    ...(model.reservation === null ? [] : model.reservation.paragraph.spans)
  ];
}

/**
 * The top-level entries of the first `StyleSheet.create({ ... })` in `source`, name to body text, read by
 * brackets rather than by line, so a style written across several lines is still one entry. Comments
 * are dropped and strings are skipped, so neither can be mistaken for a style.
 */
function styleEntries(source: string): Map<string, string> {
  const open = source.indexOf("StyleSheet.create({");
  if (open < 0) throw new Error("no StyleSheet.create({ in the source");
  const entries = new Map<string, string>();
  let depth = 0;
  let entry = "";
  const finish = () => {
    const text = entry.trim();
    entry = "";
    if (text.length === 0) return;
    const colon = text.indexOf(":");
    entries.set(text.slice(0, colon).trim(), text.slice(colon + 1).trim());
  };
  for (let index = open + "StyleSheet.create(".length; index < source.length; index += 1) {
    const char = source[index]!;
    if (char === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index) - 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index) + 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      const close = source.indexOf(char, index + 1);
      if (depth >= 1) entry += source.slice(index, close + 1);
      index = close;
      continue;
    }
    if (char === "{") {
      depth += 1;
      if (depth === 1) continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        finish();
        break;
      }
    }
    if (depth === 1 && char === ",") {
      finish();
      continue;
    }
    if (depth >= 1) entry += char;
  }
  return entries;
}

function answerWithPoints(roots: number, childrenPerRoot: number): Answer {
  const nodes: Answer["nodes"] = [];
  const edges: Answer["edges"] = [];
  for (let root = 0; root < roots; root += 1) {
    nodes.push(storyFixtureNode({
      id: `r${root}`, claim: `Poziția ${root + 1}.`, way: "REASONING", base: 0.5, final: 0.5,
      maker: "OpenAI", review: null, locator: null, marks: []
    }));
    for (let child = 0; child < childrenPerRoot; child += 1) {
      nodes.push(storyFixtureNode({
        id: `r${root}-c${child}`, claim: `Argumentul ${child + 1} pentru poziția ${root + 1}.`, way: "REASONING",
        base: 0.4, final: 0.4, maker: "Anthropic", review: null, locator: null, marks: []
      }));
      edges.push(storyFixtureEdge({ from: `r${root}-c${child}`, to: `r${root}`, relation: "support", strength: 0.4 }));
    }
  }
  return { ...STORY_FIXTURE_ANSWER, nodes, edges };
}

describe("point numbers (the story's P1…Pn)", () => {
  it("without the story's numbers, numbers the positions first, then the other points depth-first", () => {
    expect([...numberPoints(STORY_FIXTURE_ANSWER, null)]).toEqual([
      ["n-yes", "P1"], ["n-not-now", "P2"], ["n-hybrid", "P3"],
      ["n-yes-pay", "P4"], ["n-yes-rent", "P5"], ["n-not-now-once", "P6"],
      ["n-hybrid-school", "P7"], ["n-hybrid-forum", "P8"]
    ]);
    expect(Object.fromEntries(numberPoints(STORY_FIXTURE_ANSWER, null))).toEqual(STORY_FIXTURE_POINT_NUMBERS);
  });

  it("uses the story's own numbers when it has them, so a mention of P3 in the text matches the appendix", () => {
    const story = storyFixture("READY");
    story.point_numbers = {
      "n-hybrid": "P1", "n-yes": "P2", "n-not-now": "P3", "n-hybrid-school": "P4",
      "n-hybrid-forum": "P5", "n-yes-pay": "P6", "n-yes-rent": "P7", "n-not-now-once": "P8"
    };
    expect([...numberPoints(STORY_FIXTURE_ANSWER, story)]).toEqual([
      ["n-hybrid", "P1"], ["n-yes", "P2"], ["n-not-now", "P3"], ["n-hybrid-school", "P4"],
      ["n-hybrid-forum", "P5"], ["n-yes-pay", "P6"], ["n-yes-rent", "P7"], ["n-not-now-once", "P8"]
    ]);
  });

  it("gives a node the story's numbers miss the next free number after the highest", () => {
    const story = storyFixture("READY");
    story.point_numbers = { "n-yes": "P2", "n-hybrid": "P9" };
    expect([...numberPoints(STORY_FIXTURE_ANSWER, story)]).toEqual([
      ["n-yes", "P2"], ["n-hybrid", "P9"], ["n-not-now", "P10"], ["n-yes-pay", "P11"],
      ["n-yes-rent", "P12"], ["n-not-now-once", "P13"], ["n-hybrid-school", "P14"], ["n-hybrid-forum", "P15"]
    ]);
  });
});

describe("buildReportModel (spec §10 PDF layout)", () => {
  const model = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), GENERATED);

  it("builds the cover from the question, the arithmetic label and the date", () => {
    expect(model.cover.question).toBe(STORY_FIXTURE_ANSWER.question_line);
    expect(model.cover.labelWords).toBe("Contested");
    expect(model.cover.confidenceWords).toBe(
      "Confidence: held below full, for example because much of the answer rests on reasoning alone, a reviewer disputed a point, or only one AI model argued"
    );
    expect(model.cover.generatedLine).toBe("Generated 2026-09-26 12:00 UTC");
    expect(model.cover.models).toEqual([OPENAI, ANTHROPIC, XAI]);
    expect(model.cover.disclosure.join(" ")).toContain("generated by AI models");
  });

  it("keeps every section title of the long story, in order, next to the fixed titles", () => {
    expect(model.sections.map((section) => section.title))
      .toEqual(storyFixture("READY").story!.long.sections.map((section) => section.title));
    expect(model.inShort.title).toBe(REPORT_TITLES.inShort);
    expect(model.storyTitle).toBe(REPORT_TITLES.story);
    expect(model.storyIntro).toContain("[P3]");
    expect(model.reviewerNote?.title).toBe(REPORT_TITLES.reviewerNote);
    expect(model.reservation?.title).toBe(REPORT_TITLES.reservation);
    expect(model.computation.title).toBe(REPORT_TITLES.computation);
    expect(model.appendix.title).toBe(REPORT_TITLES.appendix);
    expect(model.about.title).toBe(REPORT_TITLES.about);
  });

  it("turns node references into [Pn] citations that point at the appendix", () => {
    const first = model.sections[0]!.paragraphs[0]!;
    expect(first.spans[0]).toEqual({ kind: "text", text: storyFixture("READY").story!.long.sections[0]!.paragraphs[0]!.text });
    expect(first.spans.slice(1)).toEqual([
      { kind: "cite", label: "P1", anchor: "point-P1" },
      { kind: "cite", label: "P3", anchor: "point-P3" }
    ]);
    expect(model.appendix.entries.map((entry) => entry.anchor)).toContain("point-P1");
  });

  it("links a point number the story's own text names to that appendix entry, and leaves any other text alone", () => {
    const story = storyFixture("READY");
    story.story!.long.sections[1]!.paragraphs[0]!.text = "Vezi P3 și P12, nu P0, MP3 sau P3a; [P5](https://example.org) rămâne text.";
    const linked = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED);
    expect(linked.sections[1]!.paragraphs[0]!.spans).toEqual([
      { kind: "text", text: "Vezi " },
      { kind: "mention", label: "P3", anchor: "point-P3" },
      { kind: "text", text: " și P12, nu P0, MP3 sau P3a; [" },
      { kind: "mention", label: "P5", anchor: "point-P5" },
      { kind: "text", text: "](https://example.org) rămâne text." },
      { kind: "cite", label: "P3", anchor: "point-P3" },
      { kind: "cite", label: "P1", anchor: "point-P1" }
    ]);
    // Every link in the report is code-built and internal: an appendix anchor, never model output.
    for (const span of allSpans(linked)) {
      if (span.kind !== "text") expect(span.anchor).toMatch(/^point-P[1-9][0-9]*$/);
    }
  });

  it("puts the short version first, with fate words and what would change the answer", () => {
    expect(model.inShort.headline).toBe(storyFixture("READY").story!.short.headline);
    expect(model.inShort.paths.map((path) => path.fateWords)).toEqual(["Held up", "Partly held", "Fell"]);
    expect(model.inShort.morePaths).toBeNull();
    expect(model.inShort.change.spans.slice(1).map((span) => span.kind === "cite" ? span.label : "")).toEqual(["P3", "P5"]);
  });

  it("boxes the reviewer's note and the checker's reservation separately, the reservation in the checker's own words", () => {
    expect(model.reviewerNote?.caveat).toBe("Written by the AI storyteller. It does not change the verdict.");
    const reservation = storyFixture("READY_WITH_RESERVATION").reservation!;
    expect(spanText(model.reservation!.paragraph.spans)).toBe(reservation);
    expect(model.reservation!.paragraph.spans).toContainEqual({ kind: "mention", label: "P5", anchor: "point-P5" });
    expect(allText(model)).not.toContain("still had a reservation");
    const ready = buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("READY"), GENERATED);
    expect(ready.reservation).toBeNull();
  });

  it("shows this debate's own numbers on the arithmetic page", () => {
    expect(model.computation.rules.map((rule) => rule.number)).toEqual(["1", "2", "3", "4", "5"]);
    expect(model.computation.rules.map((rule) => rule.applied)).toEqual([false, false, false, false, true]);
    expect(model.computation.rules.map((rule) => rule.result)).toEqual(["Contested", "Unsupported", "Contested", "Supported", "Contested"]);
    expect(model.computation.numbers).toEqual([
      { label: "Winner (the leading position)", value: "0.64 (P3)" },
      { label: "Runner-up", value: "0.58 (P1)" },
      { label: "Margin (how far the winner is ahead)", value: "0.06" },
      { label: "Judges' disagreement", value: "0.12 (the limit is 0.25)" },
      { label: "Label", value: "Contested" }
    ]);
    expect(model.computation.decision)
      .toBe(nb("winner 0.64 is between 0.35 and 0.70, margin 0.06 > 0.05, judges' disagreement 0.12 < 0.25 → Contested"));
    // A comparison never splits across lines.
    expect(model.computation.decision).not.toMatch(/ [<>≤≥→]|[<>≤≥→] /u);
    // It says what the rule checked, not that the winner was "clearly" ahead: 0.06 is only just above 0.05.
    expect(model.computation.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.06, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), and the judges' disagreement, 0.12, stayed below the limit of 0.25. But its score of 0.64 did not reach 0.70, the score needed for Supported. So rule 5 applies and the label is Contested."
    );
  });

  it("reads every threshold from the verdict basis, never from the page", () => {
    const story = storyFixture("READY");
    story.verdict_basis = {
      ...story.verdict_basis!,
      label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT",
      winner_strength: 0.86, runner_up_strength: 0.52, margin: 0.34, disagreement: 0.09,
      thresholds: { gamma: 0.08, high_cut: 0.8, low_cut: 0.4, disagreement: 0.3 }
    };
    const computed = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    expect(computed.rules.map((rule) => rule.condition)).toEqual([
      "Part of the comparison is missing: the margin or the judges' disagreement could not be measured, for example because only one position was argued",
      "The winner scores below 0.40",
      "The margin is 0.08 or less, or the judges' disagreement is 0.30 or more",
      "The winner scores 0.80 or more",
      "Anything else: the winner scores at least 0.40 but less than 0.80"
    ]);
    expect(computed.rules.map((rule) => rule.applied)).toEqual([false, false, false, true, false]);
    expect(computed.decision).toBe(nb("winner 0.86 ≥ 0.80, margin 0.34 > 0.08, judges' disagreement 0.09 < 0.30 → Supported"));
    expect(computed.explanation).toBe(
      "The leading position scored 0.86, at or above 0.80. It was ahead of the runner-up by 0.34, more than the tie margin of 0.08 (a lead of 0.08 or less counts as a tie), and the judges' disagreement, 0.09, stayed below the limit of 0.30. So rule 4 applies and the label is Supported."
    );
    expect(computed.numbers[3]).toEqual({ label: "Judges' disagreement", value: "0.09 (the limit is 0.30)" });
    expect(JSON.stringify(computed)).not.toMatch(/0\.05|0\.25|0\.35|0\.70/);
  });

  it("prints the measured disagreement when the judges' disagreement decided", () => {
    const story = storyFixture("READY");
    story.verdict_basis = {
      ...story.verdict_basis!, rung: 2, trigger: "DISAGREEMENT_AT_THRESHOLD",
      winner_strength: 0.78, runner_up_strength: 0.61, margin: 0.17, disagreement: 0.31
    };
    const disagreed = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED);
    expect(disagreed.computation.rules.map((rule) => rule.applied)).toEqual([false, false, true, false, false]);
    expect(disagreed.computation.decision)
      .toBe(nb("margin 0.17 > 0.05, but the judges disagreed by 0.31 ≥ 0.25 → Contested"));
    expect(disagreed.computation.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.17, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), but the judges disagreed about it by 0.31, reaching the limit of 0.25. When the judges disagree that much the engine does not call the question settled, so rule 3 applies and the label is Contested."
    );
    expect(disagreed.computation.explanation).not.toContain("clearly");
  });

  it("words a too-close margin and a weak winner plainly", () => {
    const close = storyFixture("READY");
    close.verdict_basis = { ...close.verdict_basis!, rung: 2, trigger: "MARGIN_WITHIN_GAMMA", winner_strength: 0.62, runner_up_strength: 0.58, margin: 0.04 };
    expect(buildReportModel(STORY_FIXTURE_ANSWER, close, GENERATED).computation.decision)
      .toBe(nb("winner 0.62, runner-up 0.58, margin 0.04 ≤ 0.05 → Contested"));
    const weak = storyFixture("READY");
    weak.verdict_basis = { ...weak.verdict_basis!, label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT", winner_strength: 0.3 };
    const computed = buildReportModel(STORY_FIXTURE_ANSWER, weak, GENERATED).computation;
    expect(computed.decision).toBe(nb("winner 0.30 < 0.35 → Unsupported"));
    expect(computed.explanation).toContain("not a disproved one");
  });

  it("never lets rounding contradict a comparison: a value and its threshold get extra decimals, up to 4, when two would print them alike", () => {
    const story = storyFixture("READY");
    story.verdict_basis = {
      ...story.verdict_basis!, rung: 4, trigger: "MID_BAND",
      winner_strength: 0.698, runner_up_strength: 0.646, margin: 0.052, disagreement: 0.248,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }
    };
    const edge = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    expect(edge.decision)
      .toBe(nb("winner 0.698 is between 0.350 and 0.700, margin 0.052 > 0.050, judges' disagreement 0.248 < 0.250 → Contested"));
    expect(edge.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.052, more than the tie margin of 0.050 (a lead of 0.050 or less counts as a tie), and the judges' disagreement, 0.248, stayed below the limit of 0.250. But its score of 0.698 did not reach 0.700, the score needed for Supported. So rule 5 applies and the label is Contested."
    );
    // The numbers beside the rule table say the same, so "Winner 0.70" never sits next to "0.70 or more".
    expect(edge.numbers.slice(0, 4)).toEqual([
      { label: "Winner (the leading position)", value: "0.698 (P3)" },
      // The runner-up shares the winner's and the margin's precision, so the subtraction adds up: 0.698 − 0.646 = 0.052.
      { label: "Runner-up", value: "0.646 (P1)" },
      { label: "Margin (how far the winner is ahead)", value: "0.052" },
      { label: "Judges' disagreement", value: "0.248 (the limit is 0.250)" }
    ]);
    // Equal values stay at two decimals.
    const below = storyFixture("READY");
    below.verdict_basis = { ...below.verdict_basis!, label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT", winner_strength: 0.349 };
    expect(buildReportModel(STORY_FIXTURE_ANSWER, below, GENERATED).computation.decision).toBe(nb("winner 0.349 < 0.350 → Unsupported"));
    const atLimit = storyFixture("READY");
    atLimit.verdict_basis = { ...atLimit.verdict_basis!, rung: 2, trigger: "DISAGREEMENT_AT_THRESHOLD", margin: 0.17, disagreement: 0.25 };
    expect(buildReportModel(STORY_FIXTURE_ANSWER, atLimit, GENERATED).computation.decision)
      .toBe(nb("margin 0.17 > 0.05, but the judges disagreed by 0.25 ≥ 0.25 → Contested"));
    // The too-close line prints the winner and the runner-up at the table's precision, so the page agrees with itself.
    const close = storyFixture("READY");
    close.verdict_basis = {
      ...close.verdict_basis!, rung: 2, trigger: "MARGIN_WITHIN_GAMMA",
      winner_strength: 0.698, runner_up_strength: 0.66, margin: 0.038, disagreement: 0.12
    };
    const tooClose = buildReportModel(STORY_FIXTURE_ANSWER, close, GENERATED).computation;
    expect(tooClose.decision).toBe(nb("winner 0.698, runner-up 0.660, margin 0.038 ≤ 0.050 → Contested"));
    expect(tooClose.numbers.slice(0, 3).map((row) => row.value)).toEqual(["0.698 (P3)", "0.660 (P1)", "0.038"]);
  });

  it("words a near miss from real float arithmetic honestly, never as a comparison between identical numbers", () => {
    const near = (basis: Partial<NonNullable<AnswerStory["verdict_basis"]>>) => {
      const story = storyFixture("READY");
      story.verdict_basis = { ...story.verdict_basis!, ...basis };
      return buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    };
    // 0.20 − 0.15 = 0.05000000000000002: above the tie margin, so the lead is not a tie.
    const marginAbove = near({ margin: 0.20 - 0.15 });
    expect(marginAbove.decision).toBe(nb(
      "winner 0.64 is between 0.35 and 0.70, margin 0.05, just above the tie margin of 0.05 (by less than 0.0001), judges' disagreement 0.12 < 0.25 → Contested"
    ));
    expect(marginAbove.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.05, just above the tie margin of 0.05 (by less than 0.0001; a lead of 0.05 or less counts as a tie), and the judges' disagreement, 0.12, stayed below the limit of 0.25. But its score of 0.64 did not reach 0.70, the score needed for Supported. So rule 5 applies and the label is Contested."
    );
    // The numbers table beside the shaded rule says it the same way.
    expect(marginAbove.numbers[2]).toEqual({
      label: "Margin (how far the winner is ahead)", value: "0.05, just above the tie margin of 0.05 (by less than 0.0001)"
    });
    // 0.30 − 0.25 = 0.04999999999999999: just below the tie margin counts as a tie (rule 3).
    const marginBelow = near({ rung: 2, trigger: "MARGIN_WITHIN_GAMMA", runner_up_strength: 0.59, margin: 0.3 - 0.25 });
    expect(marginBelow.decision).toBe(nb("winner 0.64, runner-up 0.59, margin 0.05, just below the tie margin of 0.05 (by less than 0.0001) → Contested"));
    expect(marginBelow.explanation).toBe(
      "The leading position was ahead by only 0.05, just below the tie margin of 0.05 (by less than 0.0001): too close to pick a winner. So rule 3 applies and the label is Contested."
    );
    // (0.35 − 0.10) = 0.24999999999999997: below the limit, so the judges broadly agreed.
    const disagreementBelow = near({ disagreement: 0.35 - 0.1 });
    expect(disagreementBelow.decision).toBe(nb(
      "winner 0.64 is between 0.35 and 0.70, margin 0.06 > 0.05, judges' disagreement 0.25, just below the limit of 0.25 (by less than 0.0001) → Contested"
    ));
    expect(disagreementBelow.explanation).toContain(
      "and the judges' disagreement, 0.25, was just below the limit of 0.25 (by less than 0.0001). But its score of 0.64 did not reach 0.70"
    );
    expect(disagreementBelow.numbers[3]).toEqual({
      label: "Judges' disagreement", value: "0.25, just below the limit of 0.25 (by less than 0.0001)"
    });
    // 0.55 − 0.30 = 0.25000000000000006: past the limit, so the judges' disagreement decided (rule 3).
    const disagreementAbove = near({ rung: 2, trigger: "DISAGREEMENT_AT_THRESHOLD", margin: 0.17, disagreement: 0.55 - 0.3 });
    expect(disagreementAbove.decision)
      .toBe(nb("margin 0.17 > 0.05, but the judges disagreed by 0.25, just above the limit of 0.25 (by less than 0.0001) → Contested"));
    expect(disagreementAbove.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.17, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), but the judges disagreed about it by 0.25, just above the limit of 0.25 (by less than 0.0001). When the judges disagree that much the engine does not call the question settled, so rule 3 applies and the label is Contested."
    );
    for (const computed of [marginAbove, marginBelow, disagreementBelow, disagreementAbove]) {
      // No comparison sign between two numbers that print alike, at any precision.
      expect(`${computed.decision} ${computed.explanation}`).not.toMatch(/(\d\.\d+)\u00A0[<>≤≥]\u00A0\1(?!\d)|0\.0500|0\.2500/u);
      expect(computed.numbers.map((row) => row.value).join(" | ")).not.toMatch(/(\d\.\d+) \(the limit is \1\)/u);
    }
  });

  it("words a near miss at either cut the same way in the decision line, the explanation and the numbers table", () => {
    const near = (basis: Partial<NonNullable<AnswerStory["verdict_basis"]>>) => {
      const story = storyFixture("READY");
      story.verdict_basis = { ...story.verdict_basis!, ...basis };
      return buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    };
    // 0.69 − 0.34 = 0.3499999999999999: just below the low cut, so rule 2 (Unsupported).
    const belowLow = near({ label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT", winner_strength: 0.69 - 0.34 });
    expect(belowLow.decision).toBe(nb("winner 0.35, just below 0.35 (by less than 0.0001) → Unsupported"));
    expect(belowLow.explanation).toBe(
      "Even the leading position scored 0.35, just below 0.35 (by less than 0.0001), so rule 2 applies and the label is Unsupported: a weak case, not a disproved one."
    );
    expect(belowLow.numbers[0]).toEqual({
      label: "Winner (the leading position)", value: "0.35 (P3), just below 0.35 (by less than 0.0001)"
    });
    // 0.02 + 0.68 = 0.7000000000000001: just above the high cut, so rule 4 (Supported).
    const aboveHigh = near({
      label: "SUPPORTED", rung: 3, trigger: "AT_OR_ABOVE_HIGH_CUT", winner_strength: 0.02 + 0.68, margin: 0.2, disagreement: 0.09
    });
    expect(aboveHigh.decision)
      .toBe(nb("winner 0.70, just above 0.70 (by less than 0.0001), margin 0.20 > 0.05, judges' disagreement 0.09 < 0.25 → Supported"));
    expect(aboveHigh.explanation).toBe(
      "The leading position scored 0.70, just above 0.70 (by less than 0.0001). It was ahead of the runner-up by 0.20, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), and the judges' disagreement, 0.09, stayed below the limit of 0.25. So rule 4 applies and the label is Supported."
    );
    expect(aboveHigh.numbers[0]?.value).toBe("0.70 (P3), just above 0.70 (by less than 0.0001)");
    // 0.12 + 0.95 − 0.37 = 0.6999999999999998: just below the high cut, the middle band (rule 5).
    const belowHigh = near({ winner_strength: 0.12 + 0.95 - 0.37 });
    expect(belowHigh.decision)
      .toBe(nb("winner 0.70, just below 0.70 (by less than 0.0001), margin 0.06 > 0.05, judges' disagreement 0.12 < 0.25 → Contested"));
    expect(belowHigh.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.06, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), and the judges' disagreement, 0.12, stayed below the limit of 0.25. But its score of 0.70 was just below 0.70 (by less than 0.0001), the score needed for Supported. So rule 5 applies and the label is Contested."
    );
    expect(belowHigh.numbers[0]?.value).toBe("0.70 (P3), just below 0.70 (by less than 0.0001)");
    // 0.01 + 0.34 = 0.35000000000000003: just above the low cut, still the middle band (rule 5).
    const aboveLow = near({ winner_strength: 0.01 + 0.34 });
    expect(aboveLow.decision)
      .toBe(nb("winner 0.35, just above 0.35 (by less than 0.0001), margin 0.06 > 0.05, judges' disagreement 0.12 < 0.25 → Contested"));
    expect(aboveLow.explanation).toBe(
      "The leading position was ahead of the runner-up by 0.06, more than the tie margin of 0.05 (a lead of 0.05 or less counts as a tie), and the judges' disagreement, 0.12, stayed below the limit of 0.25. But its score of 0.35 did not reach 0.70, the score needed for Supported. So rule 5 applies and the label is Contested."
    );
    expect(aboveLow.numbers[0]?.value).toBe("0.35 (P3), just above 0.35 (by less than 0.0001)");
    for (const computed of [belowLow, aboveHigh, belowHigh, aboveLow]) {
      expect(`${computed.decision} ${computed.explanation}`).not.toMatch(/(\d\.\d+)\u00A0[<>≤≥]\u00A0\1(?!\d)|0\.3500|0\.7000/u);
    }
  });

  it("words the single-position case plainly, with no missing number printed", () => {
    const story = storyFixture("READY");
    story.verdict_basis = {
      label: "CONTESTED", rung: 0, trigger: "BASIS_INCOMPLETE",
      winner_node_id: "n-hybrid", winner_strength: 0.71,
      runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
      thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
      confidence_band: null, marks: ["LABEL-BASIS-INCOMPLETE"]
    };
    const single = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED);
    expect(single.computation.rules[0]!.applied).toBe(true);
    expect(single.computation.decision).toBe(nb("Only one position was argued, so there is no margin to measure → Contested"));
    expect(single.computation.explanation).toContain("Only one position was argued in this debate");
    expect(single.computation.explanation).toContain("cannot call it settled");
    expect(single.computation.numbers[1]).toEqual({ label: "Runner-up", value: "None. Only one position was put forward." });
    expect(single.computation.numbers[2]).toEqual({ label: "Margin (how far the winner is ahead)", value: "Not measured. There was no runner-up." });
    expect(single.computation.numbers[3]).toEqual({ label: "Judges' disagreement", value: "Not measured. The limit is 0.25." });
    expect(single.computation.marks).toEqual(["Verdict basis incomplete — no rival position or no second judge to compare"]);
    expect(JSON.stringify(single.computation)).not.toMatch(/null|NaN|undefined/);
    expect(single.computation.marksLine).toBe("Marks: Verdict basis incomplete — no rival position or no second judge to compare");
    expect(new Map(single.about.rows.map((row) => [row.label, row.value])).get("Label rule")).toBe("Rule 1 of 5, which gives Contested");
  });

  it("says plainly when the numbers behind the verdict were not stored", () => {
    const story: AnswerStory = { ...storyFixture("READY"), verdict_basis: null };
    const computed = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    expect(computed.rules).toEqual([]);
    expect(computed.numbers).toEqual([]);
    expect(computed.decision).toBe("The numbers behind this verdict were not stored with the story.");
    expect(computed.numbersTitle).toBeNull();
  });

  it("describes every point in the appendix, in number order: stance, claim, scores, way of knowing, author, review, set-aside", () => {
    expect(model.appendix.entries.map((entry) => entry.number)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]);
    const byNumber = new Map(model.appendix.entries.map((entry) => [entry.number, entry]));
    expect(byNumber.get("P1")).toMatchObject({ stance: "Position", scores: "66% alone → 58% after weighing", wayOfKnowing: "How it is known: Reasoning", author: `Written by ${OPENAI}` });
    expect(byNumber.get("P2")?.stance).toBe("Position");
    expect(byNumber.get("P2")?.review).toBe(`Reviewer (${OPENAI}) disputed it. Costul mutării se plătește o singură dată, nu în fiecare an.`);
    expect(byNumber.get("P4")?.stance).toBe("Supports P1");
    expect(byNumber.get("P5")?.stance).toBe("Challenges P1");
    expect(byNumber.get("P8")?.stance).toBe("Challenges P3");
    expect(byNumber.get("P8")?.setAside).toBe("Branch not expanded: it could not move the answer");
    expect(byNumber.get("P8")?.review).toBe("No cross-model review recorded.");
  });

  it("does not call a point that argues about a link a position", () => {
    const undercut = storyFixtureNode({
      id: "n-under", claim: "Comparația de chirii nu spune nimic despre cartierele mai ieftine.", way: "REASONING",
      base: 0.4, final: 0.4, maker: "xAI", review: null, locator: null, marks: []
    });
    const onLink = { ...storyFixtureEdge({ from: "n-under", to: "n-yes", relation: "attack", strength: 0.4 }), target_kind: "EDGE" as const, target_ref: "edge:n-yes-rent:n-yes" };
    const answer: Answer = { ...STORY_FIXTURE_ANSWER, nodes: [...STORY_FIXTURE_ANSWER.nodes, undercut], edges: [...STORY_FIXTURE_ANSWER.edges, onLink] };
    const story = storyFixture("READY");
    story.point_numbers = { ...STORY_FIXTURE_POINT_NUMBERS, "n-under": "P9" };
    const entry = buildReportModel(answer, story, GENERATED).appendix.entries.find((item) => item.number === "P9");
    expect(entry?.stance).toBe("Challenges the link from P5 to P1");
  });

  it("lists every one of 150 points, numbered in order, each with its own anchor", () => {
    const unnumbered: AnswerStory = { ...storyFixture("READY"), point_numbers: null };
    const big = buildReportModel(answerWithPoints(10, 14), unnumbered, GENERATED);
    expect(big.appendix.entries).toHaveLength(150);
    expect(big.appendix.entries.map((entry) => entry.number))
      .toEqual(Array.from({ length: 150 }, (_, index) => `P${index + 1}`));
    expect(new Set(big.appendix.entries.map((entry) => entry.anchor)).size).toBe(150);
    expect(big.appendix.entries[9]!.stance).toBe("Position");
    expect(big.appendix.entries[10]!.stance).toBe("Supports P1");
    expect(big.appendix.entries[24]!.stance).toBe("Supports P2");
    expect(big.inShort.morePaths).toBe("and 7 more positions");
  });

  it("records where the story came from on the About page", () => {
    const rows = new Map(model.about.rows.map((row) => [row.label, row.value]));
    expect(rows.get("Answer")).toBe(`${STORY_FIXTURE_ANSWER.answer_id}, version 1`);
    expect(rows.get("Storyteller model")).toBe(OPENAI);
    expect(rows.get("Checker model")).toBe(ANTHROPIC);
    expect(rows.get("Write-and-check rounds")).toBe("2");
    expect(rows.get("Story shape")).toBe("Personal choice (personal-choice)");
    expect(rows.get("Shape pack version")).toBe("2026-09-26.1");
    expect(rows.get("Story written")).toBe("2026-09-26 09:31 UTC");
    expect(rows.get("Report generated")).toBe("2026-09-26 12:00 UTC");
    // Plain words: the rule's number on the computation page and what it gives, never the engine's trigger name.
    expect(rows.get("Label rule")).toBe("Rule 5 of 5, which gives Contested");
    expect(model.about.rows.map((row) => row.value).join(" ")).not.toMatch(/MID_BAND|BASIS_INCOMPLETE|_/u);
    // Grouped in eights so the 64 characters wrap at a space instead of running off the page.
    expect(rows.get("Shape pack fingerprint"))
      .toBe("e4a5f9d6 b9cb4e63 10c15b2c c06830fe 09b7b477 239e6e22 29102c40 6f318c32");
    expect(rows.get("Shape pack fingerprint")!.replaceAll(" ", "")).toBe(storyFixture("READY").pack!.fingerprint);
  });

  it("holds every fixed string the PDF prints, so the view writes none of its own", () => {
    expect(model.footer).toEqual({ text: "DebateAI · AI-generated report", pageWords: "Page {page} of {pages}" });
    expect(model.cover.modelsLine).toBe(`Models that took part: ${OPENAI}, ${ANTHROPIC}, ${XAI}`);
    expect(model.computation.tableHead).toEqual({ rule: "Rule", when: "When", label: "Label" });
    expect(model.computation.numbersTitle).toBe("This debate's numbers");
    expect(model.computation.appliedWords).toBe("This debate");
    expect(model.computation.marksLine).toBeNull();
    const byNumber = new Map(model.appendix.entries.map((entry) => [entry.number, entry]));
    expect(byNumber.get("P8")?.setAsideLine).toBe("Set aside: Branch not expanded: it could not move the answer");
    expect(byNumber.get("P8")?.marksLine).toBeNull();
    expect(byNumber.get("P1")?.setAsideLine).toBeNull();
    const marked = storyFixtureNode({
      id: "n-marked", claim: "Un punct marcat.", way: "REASONING", base: 0.3, final: 0.3,
      maker: null, review: null, locator: null, marks: ["STALE", "UNDER-REVIEW"]
    });
    const unrecorded = buildReportModel({ ...STORY_FIXTURE_ANSWER, nodes: [marked], edges: [] }, storyFixture("READY"), GENERATED);
    expect(unrecorded.cover.modelsLine).toBe("Models that took part: not recorded");
    expect(unrecorded.appendix.entries[0]?.marksLine).toBe("Marks: Stale; Under review");
  });

  it("keeps the Romanian text intact", () => {
    expect(allText(model)).toContain("ș");
    expect(allText(model)).toContain("ț");
    expect(allText(model)).toContain("„nu acum”");
  });

  it("is pure: the same input gives the same model, and the input is left as it was", () => {
    const story = storyFixture("READY_WITH_RESERVATION");
    const storyBefore = structuredClone(story);
    const answerBefore = structuredClone(STORY_FIXTURE_ANSWER);
    expect(buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED)).toEqual(buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED));
    expect(story).toEqual(storyBefore);
    expect(STORY_FIXTURE_ANSWER).toEqual(answerBefore);
  });

  it("refuses a story that is not ready", () => {
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("WRITING"), GENERATED)).toThrow("REPORT_STORY_NOT_READY");
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, storyFixture("UNAVAILABLE"), GENERATED)).toThrow("REPORT_STORY_NOT_READY");
    const empty: AnswerStory = { ...storyFixture("READY"), story: null };
    expect(() => buildReportModel(STORY_FIXTURE_ANSWER, empty, GENERATED)).toThrow("REPORT_STORY_NOT_READY");
  });
});

describe("long unbroken words (reportWordPieces, used as the PDF's line-break rule)", () => {
  const graphemes = (text: string) => [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text)].length;

  it("keeps every ordinary word whole, Romanian included", () => {
    for (const word of ["Chiriile", "încrederea", "două-trei", "0.25\u00A0→\u00A0Contested", "ș".repeat(30)]) {
      expect(reportWordPieces(word)).toEqual([word]);
    }
  });

  it("cuts a 150-character address after / ? & = - _ . and at least every 20 characters, losing nothing", () => {
    expect(LONG_URL).toHaveLength(150);
    const pieces = reportWordPieces(LONG_URL);
    expect(pieces.join("")).toBe(LONG_URL);
    expect(pieces.length).toBeGreaterThan(7);
    for (const piece of pieces) expect(graphemes(piece)).toBeLessThanOrEqual(20);
    expect(pieces.slice(0, 4)).toEqual(["https:/", "/", "www.", "exemplu-"]);
    // A word with no break character is cut every 20 characters, never inside a letter with its accent.
    expect(reportWordPieces("ș".repeat(45))).toEqual(["ș".repeat(20), "ș".repeat(20), "ș".repeat(5)]);
  });

  it("gives a long address in a story paragraph and in an appendix claim its break points", () => {
    const story = storyFixture("READY");
    story.story!.long.sections[0]!.paragraphs[0]!.text = `Anunțurile sunt aici: ${LONG_URL} și arată chirii mai mari.`;
    const answer: Answer = {
      ...STORY_FIXTURE_ANSWER,
      nodes: STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id === "n-yes-rent" ? { ...node, claim: `Vezi ${LONG_URL}` } : node)
    };
    const built = buildReportModel(answer, story, GENERATED);
    const longest = (text: string) => text.split(/\s+/u).reduce((a, b) => (b.length > a.length ? b : a), "");
    const paragraph = spanText(built.sections[0]!.paragraphs[0]!.spans);
    const claim = built.appendix.entries.find((entry) => entry.number === "P5")!.claim;
    for (const text of [paragraph, claim]) {
      const pieces = reportWordPieces(longest(text));
      expect(pieces.length).toBeGreaterThan(7);
      expect(Math.max(...pieces.map(graphemes))).toBeLessThanOrEqual(20);
    }
    // The model's text itself is untouched: nothing invisible is added, so a copied address still works.
    expect(paragraph).toContain(LONG_URL);
    expect(claim).toBe(`Vezi ${LONG_URL}`);
  });
});

describe("the PDF's text styles (apps/ui/lib/report/ReportDocument.tsx)", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/ui/lib/report/ReportDocument.tsx"), "utf8");
  const styles = styleEntries(source);
  const lineHeightWithoutFontSize = (entries: ReadonlyMap<string, string>) =>
    [...entries].filter(([, body]) => /\blineHeight\s*:/u.test(body) && !/\bfontSize\s*:/u.test(body)).map(([name]) => name);

  it("reads the style object itself, whatever the line layout (control)", () => {
    const sample = [
      "const styles = StyleSheet.create({",
      "  // lineHeight in a comment is not a style",
      "  one: { fontSize: 9, lineHeight: 1.4 },",
      "  two: {",
      "    color: \"#000\",",
      "    lineHeight: 1.5",
      "  },",
      "  three: { label: \"a, b: { c }\" }",
      "});"
    ].join("\n");
    const entries = styleEntries(sample);
    expect([...entries.keys()]).toEqual(["one", "two", "three"]);
    expect(lineHeightWithoutFontSize(entries)).toEqual(["two"]);
  });

  it("sets no line height on the page, only on text styles", () => {
    // A Page-level lineHeight next to the page-number footer crashed 4.9.0 past ~15 pages (measured 2026-09-26).
    expect(styles.get("page")).toBeDefined();
    expect(styles.get("page")).not.toMatch(/\blineHeight\s*:/u);
  });

  it("gives every style that sets a line height its own font size", () => {
    // react-pdf resolves a unitless lineHeight against the fontSize of the SAME style (18 when absent),
    // so a bare lineHeight of 1.6 spaced 10.5pt body text 29pt apart (measured 2026-09-26).
    expect(styles.size).toBeGreaterThan(40);
    expect([...styles.values()].filter((body) => /\blineHeight\s*:/u.test(body)).length).toBeGreaterThan(10);
    expect(lineHeightWithoutFontSize(styles)).toEqual([]);
  });

  it("uses the serif family for the fixed headings only", () => {
    expect([...styles].filter(([, body]) => body.includes("REPORT_FONT_SERIF")).map(([name]) => name)).toEqual(["heading"]);
    expect(source.match(/style=\{styles\.heading\}/gu)).toHaveLength(1);
  });

  it("underlines a point number the text names, and keeps each [Pn] citation with the word before it", () => {
    expect(styles.get("mention")).toMatch(/textDecoration:\s*"underline"/u);
    // A no-break space before each citation marker, so "[P5]" never starts a line on its own.
    expect(source).toContain("`\\u00A0[${span.label}]`");
  });

  it("never lets story text break between runs (where textkit would print a stray hyphen)", () => {
    // textkit 7.0.1 treats every run boundary (a word, then a [Pn] marker or an underlined P5) as a
    // hyphenation point; at its own infinity, 10000, a penalty is never a line break.
    expect(source).toMatch(/^const NEVER_BREAK_BETWEEN_RUNS = 10000;$/mu);
    expect(source).toMatch(/<Text style=\{style\} hyphenationPenalty=\{NEVER_BREAK_BETWEEN_RUNS\}>/u);
    expect(source.match(/hyphenationPenalty=/gu)).toHaveLength(1);
  });
});
