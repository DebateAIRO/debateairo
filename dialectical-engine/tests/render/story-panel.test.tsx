import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer, AnswerStory } from "@debateai/contract";
import { StoryPanel } from "../../apps/ui/components/StoryPanel.js";
import { toStoryView } from "../../apps/ui/lib/v3/storyView.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  storyFixture,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";
import publicArabic from "../../apps/ui/messages/ar/public.json" with { type: "json" };
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import publicRomanian from "../../apps/ui/messages/ro/public.json" with { type: "json" };

/**
 * The owner's story strip (spec 2026-09-26 §10, §14). The sample question is
 * Romanian and the reader's interface is English: the strip is Romanian from
 * its title to its last label, because its catalogue is the question's.
 */
function markup(
  story: AnswerStory | null,
  answer: Answer = STORY_FIXTURE_ANSWER,
  catalog: Record<string, string> = publicRomanian,
  locale = "ro"
): string {
  return renderToStaticMarkup(
    <StoryPanel view={toStoryView(answer, story, STORY_FIXTURE_DEBATE_ID, locale)} catalog={catalog} locale={locale} />
  );
}

const ro = (key: string): string => {
  const value = (publicRomanian as Record<string, string>)[key];
  if (value === undefined) throw new Error(`ro/public lacks ${key}`);
  return value;
};

/** HTML-escaped the way React writes text. */
const html = (text: string): string => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#x27;");

/** The actions paragraph: the PDF link, alone. */
function actions(markupText: string): string | null {
  return /<p class="storyPanelActions">([\s\S]*?)<\/p>/u.exec(markupText)?.[1] ?? null;
}

/** The reservation box. */
function reservationBox(markupText: string): string | null {
  return /<div class="storyBox" data-box="reservation">([\s\S]*?)<\/div>/u.exec(markupText)?.[1] ?? null;
}

/** Fixed English words the old panel printed; none may show in a Romanian panel. */
const ENGLISH_FIXED = [
  "The story of this debate", "Writing the full story", "Download full report", "What would change the answer",
  "Worth knowing", "Partly held", "Held up", "Fell", "Clear answer", "Close call", "Hide", "Show",
  "Reviewer", "checker", "Confidence:"
];

describe("StoryPanel in the question's language (R2, spec §14.2, §14.3)", () => {
  it("renders a Romanian story strip under an English interface: every fixed word Romanian, lang and dir set", () => {
    for (const status of ["WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"] as const) {
      const text = markup(storyFixture(status));
      expect(text).toMatch(new RegExp(`^<section class="storyPanel" aria-label="${ro("public.story.panelTitle")}" lang="ro" dir="ltr" data-story-status="${status}"`, "u"));
      for (const english of ENGLISH_FIXED) expect(text, `${status}: ${english}`).not.toContain(english);
      expect(text).toContain(`data-hide-words="${ro("public.story.hide")}" data-show-words="${ro("public.story.show")}"`);
    }
  });

  it("the same panel in English, from the English catalogue (control)", () => {
    const text = markup(storyFixture("READY"), STORY_FIXTURE_ANSWER, publicEnglish, "en");
    expect(text).toContain('lang="en" dir="ltr"');
    expect(text).toContain(">Close call<");
    expect(text).toContain("Download full report (PDF)");
    expect(text).toContain(">What would change the answer<");
  });

  it("WRITING: says the story is being written, with the label, no confidence line and no download", () => {
    const text = markup(storyFixture("WRITING"));
    expect(text).toContain(`role="status" data-writing="true">${ro("public.story.writing")}</p>`);
    expect(text).toContain(ro("public.story.writingNote"));
    expect(text).toContain(`>${ro("public.story.label.contested")}</span>`);
    expect(text).not.toContain("storyConfidence");
    expect(text).not.toContain(ro("public.story.download"));
  });

  it("READY: headline, the storyteller's confidence sentence, summary, fates, what would change it, the note and the download", () => {
    const story = storyFixture("READY");
    const text = markup(story);
    expect(text).toContain('<details class="storyPanelDetails" open="">');
    expect(text).toContain('<div class="storyPanelStory" lang="ro" dir="ltr" data-ai-generated="true"><h2 class="storyHeadline">');
    expect(text).toContain(`<p class="storyConfidence">${html(story.story!.short.confidence)}</p>`);
    // The fixture's fates follow the threshold rule: two positions partly held, one fell.
    expect(text.match(new RegExp(`>${ro("public.story.fate.partlyHeld")}<`, "gu"))).toHaveLength(2);
    expect(text).toContain(`>${ro("public.story.fate.fell")}<`);
    expect(text).toContain(`<span class="storyChangeLead">${ro("public.story.changeLead")}</span>`);
    expect(text).toContain(`<span class="storyBoxTitle">${ro("public.story.noteTitle")}</span>`);
    expect(text).toContain(`aria-label="${ro("public.story.pathsListName")}"`);
    expect(actions(text)).toBe(`<a class="storyPanelDownload" href="/debate/${STORY_FIXTURE_DEBATE_ID}/report">${ro("public.story.download")}</a>`);
    expect(reservationBox(text)).toBeNull();
  });

  it("puts the download above the story, where it shows without scrolling", () => {
    const text = markup(storyFixture("READY"));
    const download = text.indexOf('<p class="storyPanelActions">');
    expect(download).toBeGreaterThan(text.indexOf('<div class="storyPanelInner">'));
    expect(download).toBeLessThan(text.indexOf('<div class="storyPanelStory"'));
  });

  it("words the label for each state in human words, and shows no pill with no verdict", () => {
    const label = (verdict: Answer["verdict_state"]) =>
      /<span class="storyPanelLabel" data-verdict="([a-z]+)">([^<]*)<\/span>/u.exec(markup(storyFixture("READY"), { ...STORY_FIXTURE_ANSWER, verdict_state: verdict }))?.slice(1) ?? null;
    expect(label("SUPPORTED")).toEqual(["supported", ro("public.story.label.supported")]);
    expect(label("CONTESTED")).toEqual(["contested", ro("public.story.label.contested")]);
    expect(label("UNSUPPORTED")).toEqual(["unsupported", ro("public.story.label.unsupported")]);
    expect(label(null)).toBeNull();
  });

  it("READY_WITH_RESERVATION: shows the gentle line only, never the checker's own text", () => {
    const story = storyFixture("READY_WITH_RESERVATION");
    const text = markup(story);
    expect(reservationBox(text)).toBe(`<p>${ro("public.story.reservation")}</p>`);
    expect(text).not.toContain(html(story.reservation!.slice(0, 30)));
    expect(text).not.toContain("P5");
    expect(actions(text)).toContain(ro("public.story.download"));
  });

  it("UNAVAILABLE: says so plainly, shows the debate's summary instead, and no confidence line", () => {
    const text = markup(storyFixture("UNAVAILABLE"));
    expect(text).toContain(ro("public.story.unavailable"));
    expect(text).toContain("Chiria mai mare din Cluj rămâne principala obiecție la o mutare imediată.");
    expect(text).not.toContain("storyConfidence");
    expect(text).not.toContain(ro("public.story.download"));
    const empty = markup(storyFixture("UNAVAILABLE"), { ...STORY_FIXTURE_ANSWER, composed_text: [] });
    expect(empty).toContain(ro("public.story.unavailableEmpty"));
  });

  it("hides the download in a language the report cannot print yet, with a short note, and turns right to left", () => {
    const arabic = publicArabic as Record<string, string>;
    const text = markup(storyFixture("READY"), STORY_FIXTURE_ANSWER, arabic, "ar");
    expect(text).toContain('lang="ar" dir="rtl"');
    expect(actions(text)).toBeNull();
    expect(text).toContain(`<p class="storyPanelNote">${html(arabic["public.story.reportUnsupported"]!)}</p>`);
  });

  it("prints model text literally: a <script> headline is text, never markup", () => {
    const story = storyFixture("READY");
    story.story!.short.headline = "<script>alert(\"story\")</script>";
    story.story!.short.confidence = "<b>sure</b>";
    const text = markup(story);
    expect(text).toContain("&lt;script&gt;alert(&quot;story&quot;)&lt;/script&gt;");
    expect(text).toContain("&lt;b&gt;sure&lt;/b&gt;");
    expect(text).not.toMatch(/<script>|<b>/u);
  });

  it("prints every other model text literally too: path line, the note, the fallback", () => {
    const story = storyFixture("READY_WITH_RESERVATION");
    story.story!.short.paths[0]!.line = "<b>line</b>";
    story.story!.reviewer_note = { text: "<img src=x onerror=alert(1)>", node_refs: [] };
    const text = markup(story);
    expect(text).toContain("&lt;b&gt;line&lt;/b&gt;");
    expect(text).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(text).not.toMatch(/<b>|<img/u);
    const fallback = markup(storyFixture("UNAVAILABLE"), {
      ...STORY_FIXTURE_ANSWER,
      composed_text: [{ segment_id: "seg:1", text: "<script>x</script>", load_bearing: true, served_number_refs: [] }]
    });
    expect(fallback).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(fallback).not.toContain("<script>");
  });

  it("says how many positions the 8-line short version left out, as a Romanian plural", () => {
    const answer: Answer = {
      ...STORY_FIXTURE_ANSWER,
      nodes: Array.from({ length: 12 }, (_, index) => storyFixtureNode({
        id: `p-${index}`, claim: `Poziția ${index + 1}.`, way: "REASONING", base: 0.5, final: 0.5,
        maker: "OpenAI", review: null, locator: null, marks: []
      })),
      edges: []
    };
    const story = storyFixture("READY");
    story.story!.short.paths = Array.from({ length: 8 }, (_, index) => ({
      position_ref: `p-${index}`, fate: "HELD_UP" as const, line: `Poziția ${index + 1} a rezistat.`, node_refs: [`p-${index}`]
    }));
    expect(markup(story, answer)).toContain('<li class="storyPath storyPathMore">și încă 4 poziții</li>');
  });

  it("never renders model text as HTML", () => {
    for (const file of ["StoryPanel.tsx", "StoryShortBlocks.tsx"]) {
      expect(readFileSync(resolve(process.cwd(), "apps/ui/components", file), "utf8")).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
