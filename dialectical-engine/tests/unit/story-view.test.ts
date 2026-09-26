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
import {
  storyConfidenceWords,
  storyLabelSentence,
  storyLabelWords,
  toStoryView
} from "../../apps/ui/lib/v3/storyView.js";
import { STORY_SUPPORTED_SENTENCE, VERDICT_STATE_SENTENCES } from "../../apps/ui/lib/v3/verdictStateSentences.js";

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
      ...body.short.paths.map((path) => path.line),
      body.short.change.text,
      body.reviewer_note!.text
    ];
    expect(siteTexts.filter((text) => POINT_NUMBER.test(text))).toEqual([]);
    expect(storyFixture("READY_WITH_RESERVATION").reservation).toMatch(POINT_NUMBER);
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
  it("shows a READY story with the arithmetic label, fate words and the PDF link", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID);
    expect(view.status).toBe("READY");
    expect(view.labelWords).toBe("Contested");
    expect(view.verdictState).toBe("contested");
    expect(view.labelSentence).toBe(VERDICT_STATE_SENTENCES.contested);
    expect(view.confidenceWords).toBe("Confidence: held below full, for example because much of the answer rests on reasoning alone, a reviewer disputed a point, or only one AI model argued");
    expect(view.headline).toBe("Mutarea poate merita, dar nu dintr-odată: totul depinde de lucrul hibrid.");
    expect(view.paths.map((path) => [path.positionRef, path.fateWords])).toEqual([
      ["n-hybrid", "Held up"], ["n-yes", "Partly held"], ["n-not-now", "Fell"]
    ]);
    expect(view.morePaths).toBe(0);
    expect(view.change).toContain("lucrul hibrid");
    expect(view.reviewerNote).toContain("Nota aceasta nu schimbă verdictul.");
    expect(view.reservation).toBeNull();
    expect(view.reservationPointNumber).toBeNull();
    expect(view.fallbackText).toBeNull();
    expect(view.pdfHref).toBe(`/debate/${STORY_FIXTURE_DEBATE_ID}/report`);
  });

  it("adds the checker's reservation only for READY_WITH_RESERVATION", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), STORY_FIXTURE_DEBATE_ID);
    expect(view.status).toBe("READY_WITH_RESERVATION");
    expect(view.reservation).toContain("30%");
    expect(view.pdfHref).not.toBeNull();
  });

  it("picks out the first point number the reservation names, for the note inside the reservation box", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY_WITH_RESERVATION"), STORY_FIXTURE_DEBATE_ID);
    expect(view.reservationPointNumber).toBe("P5");
    const withReservation = (reservation: string): AnswerStory => ({ ...storyFixture("READY_WITH_RESERVATION"), reservation });
    const pointNumberOf = (reservation: string): string | null =>
      toStoryView(STORY_FIXTURE_ANSWER, withReservation(reservation), STORY_FIXTURE_DEBATE_ID).reservationPointNumber;
    expect(pointNumberOf("Cifra de 30% vine dintr-o singură comparație.")).toBeNull();
    expect(pointNumberOf("Punctele P12 și P3 se contrazic.")).toBe("P12");
    expect(pointNumberOf("Nu P0, nu MP3, nu P3a, nu p3.")).toBeNull();
  });

  it("never carries a reservation or its point number outside READY_WITH_RESERVATION", () => {
    const leaked: AnswerStory = { ...storyFixture("READY"), reservation: "Rezervă despre P5." };
    const view = toStoryView(STORY_FIXTURE_ANSWER, leaked, STORY_FIXTURE_DEBATE_ID);
    expect([view.reservation, view.reservationPointNumber]).toEqual([null, null]);
  });

  it("says WRITING with no story text and no PDF, also before the first reply", () => {
    for (const story of [storyFixture("WRITING"), null]) {
      const view = toStoryView(STORY_FIXTURE_ANSWER, story, STORY_FIXTURE_DEBATE_ID);
      expect(view.status).toBe("WRITING");
      expect([view.headline, view.summary, view.change, view.fallbackText, view.pdfHref]).toEqual([null, null, null, null, null]);
      expect([view.reviewerNote, view.reservation, view.reservationPointNumber]).toEqual([null, null, null]);
      expect([view.paths.length, view.morePaths]).toEqual([0, 0]);
    }
  });

  it("falls back to the composed text when the story is UNAVAILABLE", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("UNAVAILABLE"), STORY_FIXTURE_DEBATE_ID);
    expect(view.status).toBe("UNAVAILABLE");
    expect(view.fallbackText).toBe(STORY_FIXTURE_ANSWER.composed_text.map((segment) => segment.text).join("\n\n"));
    expect(view.pdfHref).toBeNull();
    expect([view.headline, view.reservation, view.reservationPointNumber]).toEqual([null, null, null]);
    const empty = toStoryView({ ...STORY_FIXTURE_ANSWER, composed_text: [] }, storyFixture("UNAVAILABLE"), STORY_FIXTURE_DEBATE_ID);
    expect(empty.fallbackText).toBeNull();
  });

  it("never shows READY without a body", () => {
    const broken = { ...storyFixture("READY"), story: null };
    expect(toStoryView(STORY_FIXTURE_ANSWER, broken, STORY_FIXTURE_DEBATE_ID).status).toBe("UNAVAILABLE");
  });

  it("counts the positions the 8-line short version left out", () => {
    const view = toStoryView(twelvePositionAnswer(), eightPathStory(), STORY_FIXTURE_DEBATE_ID);
    expect(view.paths).toHaveLength(8);
    expect(view.morePaths).toBe(4);
  });

  it("encodes the debate id in the PDF link", () => {
    expect(toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), "a/b c").pdfHref).toBe("/debate/a%2Fb%20c/report");
  });

  it("words every label from the arithmetic, with the D77 sentences", () => {
    expect(storyLabelWords("SUPPORTED")).toBe("Supported");
    expect(storyLabelWords("UNSUPPORTED")).toBe("Unsupported");
    expect(storyLabelWords(null)).toBe("No verdict");
    expect(storyLabelSentence("SUPPORTED")).toBe(STORY_SUPPORTED_SENTENCE);
    expect(storyLabelSentence("UNSUPPORTED")).toBe(VERDICT_STATE_SENTENCES.unsupported);
    expect(storyLabelSentence("CONTESTED")).toBe(VERDICT_STATE_SENTENCES.contested);
    expect(storyLabelSentence(null)).toContain("without a verdict");
    expect(storyConfidenceWords(null)).toBeNull();
    expect(storyConfidenceWords("FULL")).toBe("Confidence: full, because none of the checks that can lower it found a reason to");
    expect(storyConfidenceWords("CAPPED")).toBe("Confidence: held below full, for example because much of the answer rests on reasoning alone, a reviewer disputed a point, or only one AI model argued");
    // CAPPED is reached by several rules (the evidence mix, a one-model run, a
    // one-voice panel, a disputed review), so the words give examples and name
    // no single cause.
    expect(storyConfidenceWords("CAPPED")).toContain("for example");
    expect(storyConfidenceWords("MODERATE")).toBe("Confidence: moderate");
  });

  it("keys the label's colour off the arithmetic state, never off the label's words", () => {
    const state = (label: Answer["verdict_state"]) =>
      toStoryView({ ...STORY_FIXTURE_ANSWER, verdict_state: label }, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID).verdictState;
    expect([state("SUPPORTED"), state("CONTESTED"), state("UNSUPPORTED"), state(null)])
      .toEqual(["supported", "contested", "unsupported", null]);
  });

  it("says SUPPORTED in plain words: exactly what rung 3 checks, with no engine term and no overclaim", () => {
    expect(STORY_SUPPORTED_SENTENCE).toBe(
      "The leading position came out strong, stayed ahead of the other positions by more than the tie margin (a smaller lead counts as a tie), and the judges broadly agreed."
    );
    // "Clearly ahead" overclaimed: rung 3 only needs the margin to beat the tie margin, which 0.06 against 0.05 does.
    expect(STORY_SUPPORTED_SENTENCE).not.toMatch(/clearly|gamma|threshold/u);
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
    expect(block).toMatch(/\.storyPanelSummary::after \{[^}]*content: "Hide" \/ "";/u);
    expect(block).toMatch(/\.storyPanelDetails:not\(\[open\]\) \.storyPanelSummary::after \{[^}]*content: "Show" \/ "";/u);
  });

  it("uses only design tokens for colour", () => {
    expect(block).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|\brgba?\(/i);
  });
});
