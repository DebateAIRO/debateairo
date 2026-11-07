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

/*
 * The owner's screen review of 3 Nov 2026 rebuilt the public page answer-first in V4's look (public-d1 A). The short story still reads in the question's
 * language (spec §14.3): its headline and summary lead the answer card, its reservation line and "Worth knowing" note keep the question's words, and each
 * path is a row. What the page no longer shows (public-f1, r2-20 A): the verdict's label pill, the generic "confidence · …" words, and the outcome tags
 * ("Held up", "Partly held", "Fell") on the paths.
 */
describe("public page short story (spec §10, R2 §14.2-§14.3; public-d1 A)", () => {
  it("shows the short story in the question's language in place of the summary paragraphs, its paths as rows", async () => {
    const container = await render(STORY);
    const card = container.querySelector(".v4PubAnswer")!;
    const text = card.textContent ?? "";
    expect(text).toContain(STORY.headline);
    expect(text).toContain(STORY.summary);
    expect(text).not.toContain("The old two-paragraph summary.");
    const story = card.querySelector('[data-public-story][data-ai-generated="true"]');
    expect(story?.getAttribute("lang")).toBe("ro");
    expect(story?.getAttribute("dir")).toBe("auto");
    // Each path is a row, its words as the AIs wrote them, in the question's language.
    const rows = [...container.querySelectorAll("[data-public-path]")];
    expect(rows.map((row) => row.getAttribute("data-public-path"))).toEqual(["n-hybrid", "n-yes", "n-not-now"]);
    expect(rows[0]!.querySelector(".v4PubRowTitle")!.getAttribute("lang")).toBe("ro");
    expect(rows[0]!.textContent).toContain("Mutare treptată, cu lucru hibrid");
    // What would change the answer is an open question under the question itself, in the question's words.
    expect(text).toContain("Răspunsul s-ar schimba dacă angajatorul refuză lucrul hibrid.");
    expect(container.querySelector(".storyFate, .publicStory")).toBeNull();
  });

  it("shows no outcome tags: a path that fell says \"Didn't hold\", the others carry no word without a published tree", async () => {
    const container = await render(STORY);
    const text = container.textContent ?? "";
    for (const fate of ["heldUp", "partlyHeld", "fell", "setAside"]) {
      expect(container.querySelector(`[data-fate]`)).toBeNull();
      expect(text).not.toContain(publicEnglish[`public.story.fate.${fate}` as keyof typeof publicEnglish]);
    }
    const fell = container.querySelector('[data-public-path="n-not-now"]')!;
    expect(fell.querySelector(".v4MapTrust")!.textContent).toBe("Didn't hold");
    expect(container.querySelector('[data-public-path="n-hybrid"] .v4MapTrust')).toBeNull();
  });

  it("shows the storyteller's confidence sentence, never the generic confidence words", async () => {
    const container = await render(STORY);
    expect(container.querySelector(".v4PubAnswer")!.textContent).toContain(STORY.confidence);
    expect(container.querySelector(".publicThresholdLabel")).toBeNull();
    expect(container.textContent).not.toMatch(/confidence ·/u);
  });

  it("shows no verdict label pill and never the state's code (public-f1)", async () => {
    for (const storyShort of [STORY, undefined]) {
      const container = await render(storyShort);
      expect(container.querySelector("#public-verdict-label")).toBeNull();
      expect(container.textContent).not.toContain(ro("public.story.label.contested"));
      expect(container.textContent).not.toContain(publicEnglish["public.story.label.contested"]);
      expect(container.textContent).not.toContain("CONTESTED");
      expect(container.textContent).not.toContain("CAPPED");
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });

  it("falls back to today's summary paragraphs for a snapshot without a story, with no label and no confidence words", async () => {
    const container = await render(undefined);
    const text = container.querySelector(".v4PubAnswer")?.textContent ?? "";
    expect(text).toContain("The old two-paragraph summary.");
    expect(container.querySelector("[data-public-story]")).toBeNull();
    expect(container.querySelectorAll("[data-public-path]")).toHaveLength(0);
    // The reversal point is what could change the answer.
    expect(text).toContain("O locuință mai ieftină în Cluj.");
    expect(container.textContent).not.toMatch(/confidence ·|capped/iu);
  });

  it("words no state at all, in either interface language (R2 B8 fix 1, public-f1)", async () => {
    for (const interfaceCatalog of [publicEnglish, publicRomanian]) for (const [state, key] of [
      ["SUPPORTED", "public.story.label.supported"], ["CONTESTED", "public.story.label.contested"],
      ["UNSUPPORTED", "public.story.label.unsupported"], ["SPLIT", "public.story.label.split"]
    ] as const) {
      const words = interfaceCatalog as Record<string, string>;
      const debate = PublicDebateSchema.parse({ ...BASE, answer: { ...BASE.answer, verdict: state } });
      const container = await mount(
        <PublicDebateOverview debate={debate} catalog={interfaceCatalog} storyCatalog={publicRomanian} storyLocale="ro"
          onDetails={() => undefined} onRead={() => undefined} />
      );
      expect(container.querySelector("#public-verdict-label")).toBeNull();
      expect(container.textContent).not.toContain(words[key]);
      expect(container.textContent).not.toContain(state);
      await act(async () => root!.unmount());
      root = null;
      document.body.replaceChildren();
    }
  });

  it("shows the reviewer's note in the question's words, and leaves it out when the story has none", async () => {
    const withNote = await render(STORY);
    const note = withNote.querySelector("[data-public-note]")!;
    expect(note.textContent).toContain(ro("public.story.noteTitle"));
    expect(note.textContent).toContain("Chiria poate fi mai mică într-un cartier mai ieftin.");
    expect(note.querySelector(".v4PubWorthTitle")!.getAttribute("lang")).toBe("ro");
    expect(withNote.querySelector("[data-public-reservation]")).toBeNull();
    expect(withNote.textContent).not.toContain(ro("public.story.reservation"));
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const container = await render({ ...STORY, reviewer_note: null });
    expect(container.querySelector("[data-public-note]")).toBeNull();
    expect(container.querySelector("[data-public-reservation]")).toBeNull();
  });

  /**
   * Final review, Important 2: a story the checker was not fully satisfied with
   * carries `double_checked: false`, and the public page shows the same gentle
   * catalogue line as the owner's page and the PDF (spec §14.2), in the
   * question's language. The checker's own text never reaches the snapshot.
   */
  it("shows the gentle reservation line, in the question's language, for a story that was not fully double-checked", async () => {
    const container = await render({ ...STORY, double_checked: false });
    const line = container.querySelector("[data-public-reservation]");
    expect(line?.textContent).toBe(ro("public.story.reservation"));
    expect(line?.getAttribute("lang")).toBe("ro");
    expect(container.textContent).not.toContain("Parts of this summary could not be fully double-checked.");
    // The reviewer's note is still its own line.
    expect(container.querySelector("[data-public-note]")).not.toBeNull();
  });

  it("shows no reservation line for a story marked double-checked", async () => {
    const container = await render({ ...STORY, double_checked: true });
    expect(container.querySelector("[data-public-reservation]")).toBeNull();
    expect(container.textContent).not.toContain(ro("public.story.reservation"));
  });

  it("prints model text literally, never as markup", async () => {
    const container = await render({ ...STORY, headline: "<script>alert(\"story\")</script>" });
    expect(container.querySelector("[data-public-story] .v4AnswerHeadline")?.textContent).toBe("<script>alert(\"story\")</script>");
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
