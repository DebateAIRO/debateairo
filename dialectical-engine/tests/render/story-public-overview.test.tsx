// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type PublicStoryShort } from "@debateai/contract";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { StoryShortBlocks, type StoryShortContent } from "../../apps/ui/components/StoryShortBlocks.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

const BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Ar trebui să ne mutăm cu familia la Cluj?",
  published_at: "2026-09-26T10:00:00.000Z",
  answer: {
    terminal: "SERVED",
    verdict: "CONTESTED",
    verdict_available: true,
    confidence_band: "CAPPED",
    summary_segments: [{ text: "The old two-paragraph summary." }],
    badges: [],
    residual_objections: [],
    reversal_point: "O locuință mai ieftină în Cluj.",
    as_of: "2026-09-26T09:00:00.000Z"
  }
} as const;

const STORY: PublicStoryShort = {
  headline: "Răspunsul nostru: mutați-vă treptat, cu lucru hibrid.",
  summary: "Răspunsul nostru: da, dar treptat. E o decizie strânsă, pentru că și mutarea imediată are argumente bune.",
  confidence: "Destul de siguri, dar totul depinde de acceptul angajatorului pentru lucrul hibrid.",
  paths: [
    { position_ref: "n-hybrid", fate: "HELD_UP", line: "Mutare treptată, cu lucru hibrid: cea mai bună variantă.", node_refs: ["n-hybrid"] },
    { position_ref: "n-yes", fate: "PARTLY_HELD", line: "Mutare imediată: chiria îi taie din avantaj.", node_refs: ["n-yes"] },
    { position_ref: "n-not-now", fate: "FELL", line: "Nu acum: nu a rezistat.", node_refs: ["n-not-now"] }
  ],
  change: { text: "Răspunsul s-ar schimba dacă angajatorul refuză lucrul hibrid.", node_refs: ["n-hybrid"] },
  reviewer_note: { text: "Chiria poate fi mai mică într-un cartier mai ieftin.", node_refs: [] }
};

let root: Root | null = null;

async function mount(element: ReactElement): Promise<HTMLElement> {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  return container;
}

async function render(storyShort: PublicStoryShort | undefined): Promise<HTMLElement> {
  const debate = PublicDebateSchema.parse(storyShort === undefined ? BASE : { ...BASE, story_short: storyShort });
  return mount(<PublicDebateOverview debate={debate} catalog={publicEnglish} onDetails={() => undefined} onRead={() => undefined} />);
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("public page short story (spec §10)", () => {
  it("shows the short story in place of the summary paragraphs", async () => {
    const container = await render(STORY);
    const verdict = container.querySelector(".publicVerdictText")!;
    const text = verdict.textContent ?? "";
    expect(text).toContain(STORY.headline);
    expect(text).toContain(STORY.summary);
    expect(text).toContain("Held up");
    expect(text).toContain("Partly held");
    expect(text).toContain("Fell");
    expect(text).toContain("Mutare treptată, cu lucru hibrid: cea mai bună variantă.");
    expect(text).toContain("What would change the answer:");
    expect(text).toContain("Reviewer's note");
    expect(text).toContain("It does not change the verdict.");
    expect(text).not.toContain("The old two-paragraph summary.");
    expect(verdict.querySelector('.publicStory[data-ai-generated="true"]')).not.toBeNull();
  });

  it("falls back to today's summary paragraphs for a snapshot without a story", async () => {
    const container = await render(undefined);
    const text = container.querySelector(".publicVerdictText")?.textContent ?? "";
    expect(text).toContain("The old two-paragraph summary.");
    expect(text).not.toContain("What would change the answer:");
    expect(container.querySelector(".publicStory")).toBeNull();
  });

  it("leaves out the note box when the story has none, and never shows a checker's reservation", async () => {
    const withNote = await render(STORY);
    expect(withNote.querySelector('.storyBox[data-box="note"]')).not.toBeNull();
    expect(withNote.querySelector('.storyBox[data-box="reservation"]')).toBeNull();
    expect(withNote.textContent).not.toContain("Our checker's reservation");
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const container = await render({ ...STORY, reviewer_note: null });
    expect(container.querySelector('.storyBox[data-box="note"]')).toBeNull();
    expect(container.querySelector('.storyBox[data-box="reservation"]')).toBeNull();
  });

  it("prints model text literally, never as markup", async () => {
    const container = await render({ ...STORY, headline: "<script>alert(\"story\")</script>" });
    expect(container.querySelector(".publicStory .storyHeadline")?.textContent).toBe("<script>alert(\"story\")</script>");
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("shared short-story blocks (StoryShortBlocks)", () => {
  const CONTENT: StoryShortContent = {
    headline: "Keep the plan, but check the rent first.",
    summary: "The plan held up.",
    paths: [{ fate: "SET_ASIDE", line: "Wait a year: set aside.", positionRef: "node:wait" }],
    morePaths: 2,
    change: "A cheaper flat would change it.",
    reviewerNote: null
  };

  it("counts the positions the short version left out", async () => {
    const container = await mount(<StoryShortBlocks story={CONTENT} className="ownerStory" />);
    expect(container.querySelector(".storyPathMore")?.textContent).toBe("and 2 more positions");
    expect(container.querySelector('.storyFate[data-fate="SET_ASIDE"]')?.textContent).toBe("Set aside");
  });

  it("shows the checker's reservation only when the surface passes one (the owner's panel)", async () => {
    const container = await mount(
      <StoryShortBlocks story={{ ...CONTENT, reservation: "P7 comes from one source." }} className="ownerStory" />
    );
    expect(container.querySelector('.storyBox[data-box="reservation"]')?.textContent)
      .toBe("Our checker's reservationP7 comes from one source.");
  });

  it("shows no reservation box for a null or absent reservation", async () => {
    const container = await mount(
      <>
        <StoryShortBlocks story={CONTENT} className="absentReservation" />
        <StoryShortBlocks story={{ ...CONTENT, reservation: null }} className="nullReservation" />
      </>
    );
    expect(container.querySelectorAll(".storyBox")).toHaveLength(0);
  });

  it("makes the headline a heading when the surface asks for one, and omits the blocks it lacks", async () => {
    const container = await mount(
      <StoryShortBlocks
        story={{ ...CONTENT, summary: null, change: null, morePaths: 0 }}
        className="ownerStory"
        headlineAs="h2"
      />
    );
    const root = container.querySelector('.ownerStory[data-ai-generated="true"]')!;
    expect(root.querySelector("h2.storyHeadline")?.textContent).toBe(CONTENT.headline);
    expect(root.querySelector(".storySummary")).toBeNull();
    expect(root.querySelector(".storyChange")).toBeNull();
    expect(root.querySelector(".storyPathMore")).toBeNull();
  });
});
