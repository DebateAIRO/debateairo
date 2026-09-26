import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_TIER_ROSTERS, type Answer, type AnswerStory } from "@debateai/contract";
import { numberPoints } from "../../apps/ui/lib/report/pointNumbers.js";
import { REPORT_TITLES, buildReportModel, type ReportModel, type ReportSpan } from "../../apps/ui/lib/report/reportModel.js";
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

function allSpans(model: ReportModel): ReportSpan[] {
  return [
    ...model.inShort.paths.flatMap((path) => path.line.spans),
    ...model.inShort.change.spans,
    ...model.sections.flatMap((section) => section.paragraphs.flatMap((item) => item.spans)),
    ...(model.reviewerNote === null ? [] : model.reviewerNote.paragraph.spans),
    ...(model.reservation === null ? [] : model.reservation.paragraph.spans)
  ];
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
      .toBe("winner 0.64 is between 0.35 and 0.70, margin 0.06 > 0.05, judges' disagreement 0.12 < 0.25 → Contested");
    expect(model.computation.explanation).toContain("did not reach 0.70");
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
    expect(computed.decision).toBe("winner 0.86 ≥ 0.80, margin 0.34 > 0.08, judges' disagreement 0.09 < 0.30 → Supported");
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
      .toBe("margin 0.17 > 0.05, but the judges disagreed by 0.31 ≥ 0.25 → Contested");
    expect(disagreed.computation.explanation).toContain("disagreed");
  });

  it("words a too-close margin and a weak winner plainly", () => {
    const close = storyFixture("READY");
    close.verdict_basis = { ...close.verdict_basis!, rung: 2, trigger: "MARGIN_WITHIN_GAMMA", winner_strength: 0.62, runner_up_strength: 0.58, margin: 0.04 };
    expect(buildReportModel(STORY_FIXTURE_ANSWER, close, GENERATED).computation.decision)
      .toBe("winner 0.62, runner-up 0.58, margin 0.04 ≤ 0.05 → Contested");
    const weak = storyFixture("READY");
    weak.verdict_basis = { ...weak.verdict_basis!, label: "UNSUPPORTED", rung: 1, trigger: "BELOW_LOW_CUT", winner_strength: 0.3 };
    const computed = buildReportModel(STORY_FIXTURE_ANSWER, weak, GENERATED).computation;
    expect(computed.decision).toBe("winner 0.30 < 0.35 → Unsupported");
    expect(computed.explanation).toContain("not a disproved one");
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
    expect(single.computation.decision).toBe("Only one position was argued, so there is no margin to measure → Contested");
    expect(single.computation.explanation).toContain("Only one position was argued in this debate");
    expect(single.computation.explanation).toContain("cannot call it settled");
    expect(single.computation.numbers[1]).toEqual({ label: "Runner-up", value: "None. Only one position was put forward." });
    expect(single.computation.numbers[2]).toEqual({ label: "Margin (how far the winner is ahead)", value: "Not measured. There was no runner-up." });
    expect(single.computation.numbers[3]).toEqual({ label: "Judges' disagreement", value: "Not measured. The limit is 0.25." });
    expect(single.computation.marks).toEqual(["Verdict basis incomplete — no rival position or no second judge to compare"]);
    expect(JSON.stringify(single.computation)).not.toMatch(/null|NaN|undefined/);
    expect(new Map(single.about.rows.map((row) => [row.label, row.value])).get("Label rule")).toBe("Rule 1 (BASIS_INCOMPLETE)");
  });

  it("says plainly when the numbers behind the verdict were not stored", () => {
    const story: AnswerStory = { ...storyFixture("READY"), verdict_basis: null };
    const computed = buildReportModel(STORY_FIXTURE_ANSWER, story, GENERATED).computation;
    expect(computed.rules).toEqual([]);
    expect(computed.numbers).toEqual([]);
    expect(computed.decision).toBe("The numbers behind this verdict were not stored with the story.");
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
    expect(rows.get("Label rule")).toBe("Rule 5 (MID_BAND)");
    // Grouped in eights so the 64 characters wrap at a space instead of running off the page.
    expect(rows.get("Shape pack fingerprint"))
      .toBe("e4a5f9d6 b9cb4e63 10c15b2c c06830fe 09b7b477 239e6e22 29102c40 6f318c32");
    expect(rows.get("Shape pack fingerprint")!.replaceAll(" ", "")).toBe(storyFixture("READY").pack!.fingerprint);
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

describe("the PDF's text styles (apps/ui/lib/report/ReportDocument.tsx)", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/ui/lib/report/ReportDocument.tsx"), "utf8");
  // One style per line inside StyleSheet.create: "  name: { ... },".
  const styles = source.split("\n").filter((line) => /^ {2}[A-Za-z]+: \{.*\},?$/u.test(line));

  it("sets no line height on the page, only on text styles", () => {
    // A Page-level lineHeight next to the page-number footer crashed 4.9.0 past ~15 pages (measured 2026-09-26).
    const page = styles.filter((line) => line.startsWith("  page: "));
    expect(page).toHaveLength(1);
    expect(page[0]).not.toContain("lineHeight");
  });

  it("gives every style that sets a line height its own font size", () => {
    // react-pdf resolves a unitless lineHeight against the fontSize of the SAME style (18 when absent),
    // so a bare lineHeight of 1.6 spaced 10.5pt body text 29pt apart (measured 2026-09-26).
    const withLineHeight = styles.filter((line) => line.includes("lineHeight"));
    expect(withLineHeight.length).toBeGreaterThan(10);
    expect(withLineHeight.filter((line) => !line.includes("fontSize"))).toEqual([]);
  });

  it("uses the serif family for the fixed headings only", () => {
    expect(styles.filter((line) => line.includes("REPORT_FONT_SERIF")).map((line) => line.trim().split(":")[0])).toEqual(["heading"]);
    expect(source.match(/style=\{styles\.heading\}/gu)).toHaveLength(1);
  });
});
