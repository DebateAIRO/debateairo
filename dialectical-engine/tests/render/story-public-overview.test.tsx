// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type PublicStoryShort } from "@debateai/contract";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { StoryShortBlocks, type StoryShortContent } from "../../apps/ui/components/StoryShortBlocks.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import publicRomanian from "../../apps/ui/messages/ro/public.json" with { type: "json" };

const ro = (key: string): string => {
  const value = (publicRomanian as Record<string, string>)[key];
  if (value === undefined) throw new Error(`ro/public lacks ${key}`);
  return value;
};

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

/** An English reader of a Romanian debate: the page's own copy is English, the story's fixed text Romanian. */
async function render(storyShort: PublicStoryShort | undefined): Promise<HTMLElement> {
  const debate = PublicDebateSchema.parse(storyShort === undefined ? BASE : { ...BASE, story_short: storyShort, language: "ro" });
  return mount(
    <PublicDebateOverview
      debate={debate}
      catalog={publicEnglish}
      storyCatalog={publicRomanian}
      storyLocale="ro"
      onDetails={() => undefined}
      onRead={() => undefined}
    />
  );
}

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("public page short story (spec §10, R2 §14.2-§14.3)", () => {
  it("shows the short story in the question's language in place of the summary paragraphs", async () => {
    const container = await render(STORY);
    const verdict = container.querySelector(".publicVerdictText")!;
    const text = verdict.textContent ?? "";
    expect(text).toContain(STORY.headline);
    expect(text).toContain(STORY.summary);
    expect(text).toContain(ro("public.story.fate.heldUp"));
    expect(text).toContain(ro("public.story.fate.partlyHeld"));
    expect(text).toContain(ro("public.story.fate.fell"));
    expect(text).toContain("Mutare treptată, cu lucru hibrid: cea mai bună variantă.");
    expect(text).toContain(ro("public.story.changeLead"));
    expect(text).toContain(ro("public.story.noteTitle"));
    expect(text).not.toContain("The old two-paragraph summary.");
    for (const english of ["Held up", "Partly held", "What would change the answer", "Worth knowing", "Reviewer"]) {
      expect(text).not.toContain(english);
    }
    const story = verdict.querySelector('.publicStory[data-ai-generated="true"]');
    expect(story?.getAttribute("lang")).toBe("ro");
    expect(story?.getAttribute("dir")).toBe("ltr");
  });

  it("shows the storyteller's confidence sentence instead of the generic confidence words", async () => {
    const container = await render(STORY);
    expect(container.querySelector(".publicStory .storyConfidence")?.textContent).toBe(STORY.confidence);
    expect(container.querySelector(".publicThresholdLabel")).toBeNull();
  });

  it("words the label in human words, in the question's language", async () => {
    const container = await render(STORY);
    const pill = container.querySelector("#public-verdict-label")!;
    expect(pill.textContent).toBe(ro("public.story.label.contested"));
    expect(pill.getAttribute("lang")).toBe("ro");
    expect(pill.getAttribute("data-verdict")).toBe("contested");
  });

  it("falls back to today's summary paragraphs, label and confidence for a snapshot without a story", async () => {
    const container = await render(undefined);
    const text = container.querySelector(".publicVerdictText")?.textContent ?? "";
    expect(text).toContain("The old two-paragraph summary.");
    expect(text).not.toContain(ro("public.story.changeLead"));
    expect(container.querySelector(".publicStory")).toBeNull();
    expect(container.querySelector("#public-verdict-label")?.textContent).toBe("CONTESTED");
    expect(container.querySelector(".publicThresholdLabel")?.textContent).toBe("confidence · capped");
  });

  it("leaves out the note box when the story has none, and never shows a reservation", async () => {
    const withNote = await render(STORY);
    expect(withNote.querySelector('.storyBox[data-box="note"]')).not.toBeNull();
    expect(withNote.querySelector('.storyBox[data-box="reservation"]')).toBeNull();
    expect(withNote.textContent).not.toContain(ro("public.story.reservation"));
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
    confidence: "Fairly sure, as long as the rent holds.",
    summary: "The plan held up.",
    paths: [{ fate: "SET_ASIDE", line: "Wait a year: set aside.", positionRef: "node:wait" }],
    morePaths: 2,
    change: "A cheaper flat would change it.",
    reviewerNote: null
  };

  it("counts the positions the short version left out, in the catalogue's plural", async () => {
    const container = await mount(<StoryShortBlocks story={CONTENT} catalog={publicEnglish} locale="en" className="ownerStory" />);
    expect(container.querySelector(".storyPathMore")?.textContent).toBe("and 2 more");
    expect(container.querySelector('.storyFate[data-fate="SET_ASIDE"]')?.textContent).toBe("Set aside");
  });

  it("shows the gentle reservation line only when the surface asks for it (the owner's panel)", async () => {
    const container = await mount(
      <StoryShortBlocks story={{ ...CONTENT, reservation: true }} catalog={publicEnglish} locale="en" className="ownerStory" />
    );
    expect(container.querySelector('.storyBox[data-box="reservation"]')?.textContent)
      .toBe("Parts of this summary could not be fully double-checked.");
  });

  it("shows no reservation box when it is absent or false", async () => {
    const container = await mount(
      <>
        <StoryShortBlocks story={CONTENT} catalog={publicEnglish} locale="en" className="absentReservation" />
        <StoryShortBlocks story={{ ...CONTENT, reservation: false }} catalog={publicEnglish} locale="en" className="falseReservation" />
      </>
    );
    expect(container.querySelectorAll(".storyBox")).toHaveLength(0);
  });

  it("makes the headline a heading when the surface asks for one, and omits the blocks it lacks", async () => {
    const container = await mount(
      <StoryShortBlocks
        story={{ ...CONTENT, confidence: null, summary: null, change: null, morePaths: 0 }}
        catalog={publicEnglish}
        locale="en"
        className="ownerStory"
        headlineAs="h2"
      />
    );
    const root = container.querySelector('.ownerStory[data-ai-generated="true"]')!;
    expect(root.querySelector("h2.storyHeadline")?.textContent).toBe(CONTENT.headline);
    expect(root.querySelector(".storyConfidence")).toBeNull();
    expect(root.querySelector(".storySummary")).toBeNull();
    expect(root.querySelector(".storyChange")).toBeNull();
    expect(root.querySelector(".storyPathMore")).toBeNull();
  });

  it("puts the confidence sentence right under the headline", async () => {
    const container = await mount(<StoryShortBlocks story={CONTENT} catalog={publicEnglish} locale="en" className="ownerStory" />);
    const children = [...container.querySelector(".ownerStory")!.children].map((child) => child.className);
    expect(children.slice(0, 3)).toEqual(["storyHeadline", "storyConfidence", "storySummary"]);
  });
});
