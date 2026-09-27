import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AnswerSchema, AnswerStorySchema, type Answer, type AnswerStory } from "@debateai/contract";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_POINT_NUMBERS,
  STORY_FIXTURE_STATUSES,
  storyFixture,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import { countStoryPositions } from "../../apps/ui/lib/v3/storyWords.js";
import { toStoryView } from "../../apps/ui/lib/v3/storyView.js";

/** The rule the story checks use for a point number (packages/story validate.ts STORY_SHORT_POINT_NUMBER). */
const POINT_NUMBER = /\bP[1-9][0-9]*\b/u;

function twelvePositionAnswer(): Answer {
  return {
    ...STORY_FIXTURE_ANSWER,
    nodes: Array.from({ length: 12 }, (_, index) => storyFixtureNode({
      id: `p-${index}`, claim: `Poziția ${index + 1}.`, way: "REASONING", base: 0.5, final: 0.5,
      maker: "OpenAI", review: null, locator: null, marks: []
    })),
    edges: []
  };
}

function eightPathStory(): AnswerStory {
  const story = storyFixture("READY");
  story.story!.short.paths = Array.from({ length: 8 }, (_, index) => ({
    position_ref: `p-${index}`, fate: "HELD_UP" as const, line: `Poziția ${index + 1} a rezistat.`, node_refs: [`p-${index}`]
  }));
  return story;
}

describe("story fixture (the owner's mock data)", () => {
  it("parses under the strict contract in every state", () => {
    expect(AnswerSchema.parse(STORY_FIXTURE_ANSWER).answer_id).toBe(STORY_FIXTURE_DEBATE_ID);
    for (const status of STORY_FIXTURE_STATUSES) expect(AnswerStorySchema.parse(storyFixture(status)).status).toBe(status);
  });

  it("cites only nodes the answer actually has", () => {
    const ids = new Set(STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id));
    const body = storyFixture("READY").story!;
    const refs = [
      ...body.short.paths.flatMap((path) => [path.position_ref, ...path.node_refs]),
      ...body.short.change.node_refs,
      ...body.why.reasons.flatMap((reason) => reason.node_refs),
      ...body.long.sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => paragraph.node_refs)),
      ...(body.reviewer_note?.node_refs ?? [])
    ];
    expect(refs.filter((ref) => !ids.has(ref))).toEqual([]);
  });

  it("has three positions, each with a path, so nothing is left to count", () => {
    expect(countStoryPositions(STORY_FIXTURE_ANSWER.nodes, STORY_FIXTURE_ANSWER.edges)).toBe(3);
    expect(storyFixture("READY").story!.short.paths).toHaveLength(3);
  });

  it("names no point number in the texts the site shows, and one in the checker's reservation", () => {
    const body = storyFixture("READY").story!;
    const siteTexts = [
      body.short.headline,
      body.short.summary,
      body.short.confidence,
      ...body.short.paths.map((path) => path.line),
      body.short.change.text,
      body.reviewer_note!.text
    ];
    expect(siteTexts.filter((text) => POINT_NUMBER.test(text))).toEqual([]);
    expect(storyFixture("READY_WITH_RESERVATION").reservation).toMatch(POINT_NUMBER);
  });

  it("speaks to the person: no decimal number anywhere in the story, and our answer first (R1)", () => {
    const body = storyFixture("READY").story!;
    const texts = [
      body.short.headline, body.short.summary, body.short.confidence,
      ...body.short.paths.map((path) => path.line), body.short.change.text,
      ...body.why.reasons.map((reason) => reason.text),
      ...body.long.sections.flatMap((section) => [section.title, ...section.paragraphs.map((paragraph) => paragraph.text)]),
      body.reviewer_note!.text
    ];
    // No score, no threshold: the fixture's only figures are the question's own percentages.
    expect(texts.filter((text) => /[0-9][.,][0-9]/u.test(text))).toEqual([]);
    expect(texts.join(" ")).toContain("35%");
    expect(body.short.headline.startsWith("Răspunsul nostru:")).toBe(true);
    expect(body.why.reasons).toHaveLength(3);
    expect(storyFixture("READY").language).toBe("ro");
    expect(storyFixture("WRITING").language).toBeNull();
  });

  it("reads as the personal-choice shape asks: the person knows their situation best, in natural Romanian (R2 carry)", () => {
    const body = storyFixture("READY").story!;
    const opening = body.long.sections[0]!.paragraphs.map((paragraph) => paragraph.text).join(" ");
    expect(opening).toContain("Dumneavoastră vă cunoașteți situația mai bine");
    expect(body.reviewer_note!.text).toContain("celelalte costuri de trai din Cluj");
    expect(body.reviewer_note!.text).not.toContain("costuri ale vieții");
  });

  it("gives each path the fate the pack's threshold rule gives it, and keeps the verdict's numbers consistent (I-5)", () => {
    const story = storyFixture("READY");
    const basis = story.verdict_basis!;
    const finalOf = new Map(STORY_FIXTURE_ANSWER.nodes.map((node) => [node.node_id, node.final_strength?.value ?? null]));
    for (const path of story.story!.short.paths) {
      const final = finalOf.get(path.position_ref);
      if (final === null || final === undefined) throw new Error(`no final for ${path.position_ref}`);
      const ruled = final >= basis.thresholds.high_cut ? "HELD_UP" : final >= basis.thresholds.low_cut ? "PARTLY_HELD" : "FELL";
      expect([path.position_ref, path.fate]).toEqual([path.position_ref, ruled]);
    }
    // The winner is the strongest position and the runner-up the next; the margin is their difference.
    const positions = story.story!.short.paths.map((path) => finalOf.get(path.position_ref)!).sort((a, b) => b - a);
    expect([basis.winner_strength, basis.runner_up_strength]).toEqual(positions.slice(0, 2));
    expect(finalOf.get(basis.winner_node_id)).toBe(basis.winner_strength);
    expect(finalOf.get(basis.runner_up_node_id!)).toBe(basis.runner_up_strength);
    expect(basis.margin).toBeCloseTo(basis.winner_strength - basis.runner_up_strength!, 10);
  });

  it("serves a statement that leads with the answer, never one that says the debate did not settle it (I-4)", () => {
    const [lead] = STORY_FIXTURE_ANSWER.composed_text;
    expect(lead?.text.startsWith("Cea mai bună variantă este mutarea treptată")).toBe(true);
    expect(STORY_FIXTURE_ANSWER.composed_text.map((segment) => segment.text).join(" ")).not.toMatch(/nu a ajuns|răspuns clar/u);
  });

  it("numbers every node exactly once, P1 to P8, the three positions first", () => {
    const ids = STORY_FIXTURE_ANSWER.nodes.map((node) => node.node_id);
    expect(Object.keys(STORY_FIXTURE_POINT_NUMBERS).sort()).toEqual([...ids].sort());
    expect(Object.values(STORY_FIXTURE_POINT_NUMBERS).sort()).toEqual(
      Array.from({ length: ids.length }, (_, index) => `P${index + 1}`).sort()
    );
    const positions = storyFixture("READY").story!.short.paths.map((path) => path.position_ref);
    expect(positions.map((id) => STORY_FIXTURE_POINT_NUMBERS[id]).sort()).toEqual(["P1", "P2", "P3"]);
    expect(storyFixture("READY").point_numbers).toEqual(STORY_FIXTURE_POINT_NUMBERS);
    expect(storyFixture("WRITING").point_numbers).toBeNull();
  });
});

describe("toStoryView (spec §10)", () => {
  it("shows a READY story with the arithmetic label, the storyteller's confidence and the PDF link", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID, "ro");
    expect(view.status).toBe("READY");
    expect(view.label).toBe("CONTESTED");
    expect(view.verdictState).toBe("contested");
    expect(view.confidence).toBe(storyFixture("READY").story!.short.confidence);
    expect(view.headline).toBe("Răspunsul nostru: mutați-vă treptat, cu lucru hibrid, după încheierea anului școlar.");
    expect(view.paths.map((path) => [path.positionRef, path.fate])).toEqual([
      ["n-hybrid", "PARTLY_HELD"], ["n-yes", "PARTLY_HELD"], ["n-not-now", "FELL"]
    ]);
    expect(view.morePaths).toBe(0);
    expect(view.change).toContain("lucrul hibrid");
    expect(view.reviewerNote).toContain("Nota aceasta nu schimbă răspunsul nostru.");
    expect(view.reservation).toBe(false);
    expect(view.fallbackText).toBeNull();
    expect(view.pdfHref).toBe(`/debate/${STORY_FIXTURE_DEBATE_ID}/report`);
    expect(view.reportUnsupported).toBe(false);
  });

  it("marks the gentle reservation line only for READY_WITH_RESERVATION, never with the checker's own text", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), STORY_FIXTURE_DEBATE_ID, "ro");
    expect(view.status).toBe("READY_WITH_RESERVATION");
    expect(view.reservation).toBe(true);
    expect(view.pdfHref).not.toBeNull();
    expect(JSON.stringify(view)).not.toContain("o singură comparație de anunțuri");
    const leaked: AnswerStory = { ...storyFixture("READY"), reservation: "Rezervă despre P5." };
    expect(toStoryView(STORY_FIXTURE_ANSWER, leaked, STORY_FIXTURE_DEBATE_ID, "ro").reservation).toBe(false);
  });

  it("says WRITING with no story text and no PDF, also before the first reply", () => {
    for (const story of [storyFixture("WRITING"), null]) {
      const view = toStoryView(STORY_FIXTURE_ANSWER, story, STORY_FIXTURE_DEBATE_ID, "ro");
      expect(view.status).toBe("WRITING");
      expect([view.headline, view.summary, view.change, view.fallbackText, view.pdfHref]).toEqual([null, null, null, null, null]);
      expect([view.confidence, view.reviewerNote, view.reservation]).toEqual([null, null, false]);
      expect([view.paths.length, view.morePaths]).toEqual([0, 0]);
    }
  });

  it("falls back to the composed text when the story is UNAVAILABLE", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("UNAVAILABLE"), STORY_FIXTURE_DEBATE_ID, "ro");
    expect(view.status).toBe("UNAVAILABLE");
    expect(view.fallbackText).toBe(STORY_FIXTURE_ANSWER.composed_text.map((segment) => segment.text).join("\n\n"));
    expect(view.pdfHref).toBeNull();
    expect([view.headline, view.confidence, view.reservation]).toEqual([null, null, false]);
    const empty = toStoryView({ ...STORY_FIXTURE_ANSWER, composed_text: [] }, storyFixture("UNAVAILABLE"), STORY_FIXTURE_DEBATE_ID, "ro");
    expect(empty.fallbackText).toBeNull();
  });

  it("never shows READY without a body", () => {
    const broken = { ...storyFixture("READY"), story: null };
    expect(toStoryView(STORY_FIXTURE_ANSWER, broken, STORY_FIXTURE_DEBATE_ID, "ro").status).toBe("UNAVAILABLE");
  });

  it("counts the positions the 8-line short version left out", () => {
    const view = toStoryView(twelvePositionAnswer(), eightPathStory(), STORY_FIXTURE_DEBATE_ID, "ro");
    expect(view.paths).toHaveLength(8);
    expect(view.morePaths).toBe(4);
  });

  it("encodes the debate id in the PDF link", () => {
    expect(toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), "a/b c", "ro").pdfHref).toBe("/debate/a%2Fb%20c/report");
  });

  it("keys the label's colour off the arithmetic state, never off the label's words", () => {
    const state = (label: Answer["verdict_state"]) =>
      toStoryView({ ...STORY_FIXTURE_ANSWER, verdict_state: label }, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID, "ro").verdictState;
    expect([state("SUPPORTED"), state("CONTESTED"), state("UNSUPPORTED"), state(null)])
      .toEqual(["supported", "contested", "unsupported", null]);
  });
});

describe("story strip layout contract (globals.css)", () => {
  const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
  const open = css.indexOf("/* === verdict-story === */");
  const close = css.indexOf("/* === end verdict-story === */");
  const block = css.slice(open, close);

  it("sits in one delimited block before the consent blocks", () => {
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    expect(close).toBeLessThan(css.indexOf("/* === consent-ui S01 === */"));
  });

  it("keeps the strip at its natural height with a bounded, scrolling body", () => {
    expect(block).toMatch(/\.storyPanel \{[^}]*flex: 0 0 auto;/);
    expect(block).toMatch(/\.storyPanelBody \{[^}]*max-height:[^;]+;[^}]*overflow-y: auto;/);
  });

  it("is never hidden at the tablet or phone breakpoints", () => {
    expect(block).not.toMatch(/\.storyPanel(?:Body|Details)?\s*\{[^}]*display:\s*none/);
    expect(css).not.toMatch(/section\.storyPanel\s*\{[^}]*display:\s*none/);
  });

  it("lets the reader select the summary text, and keeps Hide/Show out of its accessible name", () => {
    expect(block).not.toMatch(/user-select:\s*none/u);
    // R2: the two words come from the catalogue, through the summary's data attributes.
    expect(block).toMatch(/\.storyPanelSummary::after \{[^}]*content: attr\(data-hide-words\) \/ "";/u);
    expect(block).toMatch(/\.storyPanelDetails:not\(\[open\]\) \.storyPanelSummary::after \{[^}]*content: attr\(data-show-words\) \/ "";/u);
    expect(block).not.toMatch(/content: "(?:Hide|Show)"/u);
  });

  it("uses logical properties only, so a right-to-left story mirrors (R2)", () => {
    expect(block).not.toMatch(/(?:margin|padding|border)-(?:left|right)\b|\b(?:left|right):|text-align:\s*(?:left|right)/u);
    expect(block).toMatch(/margin-inline-start: auto;/u);
    expect(block).toMatch(/border-inline-start:/u);
  });

  it("uses only design tokens for colour", () => {
    expect(block).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});
