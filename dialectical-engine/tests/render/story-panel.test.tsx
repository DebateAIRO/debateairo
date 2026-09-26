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

function markup(story: AnswerStory | null, answer: Answer = STORY_FIXTURE_ANSWER): string {
  return renderToStaticMarkup(<StoryPanel view={toStoryView(answer, story, STORY_FIXTURE_DEBATE_ID)} />);
}

/** The actions paragraph: the PDF link and, when the reservation names a point number, the note beside it. */
function actions(html: string): string | null {
  return /<p class="storyPanelActions">([\s\S]*?)<\/p>/u.exec(html)?.[1] ?? null;
}

const POINT_NUMBER_NOTE = "refer to the numbered points in the appendix of the full report";

describe("StoryPanel (spec §10)", () => {
  it("WRITING: says the story is being written, with no story text and no download", () => {
    const html = markup(storyFixture("WRITING"));
    expect(html).toContain('data-story-status="WRITING"');
    expect(html).toContain("Writing the full story of this debate…");
    expect(html).toContain('role="status"');
    expect(html).toContain("Contested");
    expect(html).not.toContain("Download full report (PDF)");
    expect(html).not.toContain("storyPanelFallback");
  });

  it("READY: shows headline, summary, paths with fates, what would change it, the note and the download", () => {
    const html = markup(storyFixture("READY"));
    expect(html).toContain('data-story-status="READY"');
    expect(html).toContain("<details class=\"storyPanelDetails\" open=\"\">");
    expect(html).toContain("Mutarea poate merita, dar nu dintr-odată: totul depinde de lucrul hibrid.");
    expect(html).toContain("Held up");
    expect(html).toContain("Partly held");
    expect(html).toContain("Fell");
    expect(html).toContain("What would change the answer:");
    expect(html).toContain("Reviewer&#x27;s note");
    expect(html).toContain(`href="/debate/${STORY_FIXTURE_DEBATE_ID}/report"`);
    expect(html).toContain("Download full report (PDF)");
    expect(html).toContain('data-ai-generated="true"');
    expect(html).toContain('<div class="storyPanelStory" data-ai-generated="true"><h2 class="storyHeadline">');
    expect(html).not.toContain("Our checker&#x27;s reservation");
    expect(html).not.toContain(POINT_NUMBER_NOTE);
  });

  it("puts the download above the story, where it shows without scrolling", () => {
    const html = markup(storyFixture("READY"));
    const download = html.indexOf('<p class="storyPanelActions">');
    expect(download).toBeGreaterThan(html.indexOf('<p class="storyPanelSentence">'));
    expect(download).toBeLessThan(html.indexOf('<div class="storyPanelStory"'));
  });

  it("colours the label from the arithmetic state, whatever the label's words say", () => {
    const view = toStoryView(STORY_FIXTURE_ANSWER, storyFixture("READY"), STORY_FIXTURE_DEBATE_ID);
    const html = renderToStaticMarkup(<StoryPanel view={{ ...view, labelWords: "Disputed" }} />);
    expect(html).toContain('<span class="storyPanelLabel" data-verdict="contested">Disputed</span>');
    const none = markup(storyFixture("READY"), { ...STORY_FIXTURE_ANSWER, verdict_state: null });
    expect(none).toContain('<span class="storyPanelLabel" data-verdict="none">No verdict</span>');
  });

  it("is a plain section, never a section.card the debate view clips", () => {
    expect(markup(storyFixture("READY"))).toMatch(/^<section class="storyPanel" aria-label="The story of this debate"/u);
  });

  it("READY_WITH_RESERVATION: adds the checker's reservation box", () => {
    const html = markup(storyFixture("READY_WITH_RESERVATION"));
    expect(html).toContain('data-story-status="READY_WITH_RESERVATION"');
    expect(html).toContain('<span class="storyBoxTitle">Our checker&#x27;s reservation</span><p>Rezumatul prezintă');
    expect(html).toContain("o singură comparație de anunțuri");
    expect(html).not.toContain("still had a reservation");
  });

  it("READY_WITH_RESERVATION: says where the reservation's point numbers are explained, beside the PDF link", () => {
    const row = actions(markup(storyFixture("READY_WITH_RESERVATION")));
    expect(row).toContain("Download full report (PDF)");
    expect(row).toContain(`Point numbers such as P5 ${POINT_NUMBER_NOTE}.`);
  });

  it("leaves the point-number note out when the reservation names no point number", () => {
    const story = { ...storyFixture("READY_WITH_RESERVATION"), reservation: "Cifra de 30% vine dintr-o singură comparație." };
    const html = markup(story);
    expect(html).toContain("Our checker&#x27;s reservation");
    expect(actions(html)).toContain("Download full report (PDF)");
    expect(html).not.toContain(POINT_NUMBER_NOTE);
  });

  it("UNAVAILABLE: shows today's composed text instead, with no download", () => {
    const html = markup(storyFixture("UNAVAILABLE"));
    expect(html).toContain('data-story-status="UNAVAILABLE"');
    expect(html).toContain("The full story is not available for this debate.");
    expect(html).toContain("Chiria mai mare din Cluj rămâne principala obiecție la o mutare imediată.");
    expect(html).not.toContain("Download full report (PDF)");
  });

  it("UNAVAILABLE with no composed text says so plainly", () => {
    const html = markup(storyFixture("UNAVAILABLE"), { ...STORY_FIXTURE_ANSWER, composed_text: [] });
    expect(html).toContain("no short answer was served");
  });

  it("prints model text literally: a <script> headline is text, never markup", () => {
    const story = storyFixture("READY");
    story.story!.short.headline = "<script>alert(\"story\")</script>";
    const html = markup(story);
    expect(html).toContain("&lt;script&gt;alert(&quot;story&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("prints every other model text literally too: path line, reviewer's note, reservation, fallback", () => {
    const story = storyFixture("READY_WITH_RESERVATION");
    story.story!.short.paths[0]!.line = "<b>line</b>";
    story.story!.reviewer_note = { text: "<img src=x onerror=alert(1)>", node_refs: [] };
    story.reservation = "<a href=\"/x\">P5</a>";
    const html = markup(story);
    expect(html).toContain("&lt;b&gt;line&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;a href=&quot;/x&quot;&gt;P5&lt;/a&gt;");
    expect(html).not.toMatch(/<b>|<img|<a href="\/x"/u);
    const fallback = markup(storyFixture("UNAVAILABLE"), {
      ...STORY_FIXTURE_ANSWER,
      composed_text: [{ segment_id: "seg:1", text: "<script>x</script>", load_bearing: true, served_number_refs: [] }]
    });
    expect(fallback).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(fallback).not.toContain("<script>");
  });

  it("says how many positions the 8-line short version left out", () => {
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
    expect(markup(story, answer)).toContain("and 4 more positions");
  });

  it("never renders model text as HTML", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/ui/components/StoryPanel.tsx"), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});
