// @vitest-environment jsdom

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, PublicDebateSchema, type DebateMapView } from "@debateai/contract";

/**
 * Debate shape P2c (spec 2026-10-12 §3.3 step 8, ruling S2): the debate page lists what was raised
 * but not debated, and titles each opening position "The case for …, argued by …". Both are in the
 * question's language (the `public` catalogue of the story locale), and never say who raised a
 * point or how many did.
 */

/*
 * Pre-flight PF-C27: the page mounts with a settled answer, so it replays `readEvents` and never opens
 * `streamEvents`. The refresh under test is the mount refresh (`useEffect(() => { refresh(); })`), which
 * reads the run, the answer, and now the map view through `getDebateBundle`'s read client.
 */
const mocks = vi.hoisted(() => ({
  readAnswerStory: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  readAnswerMapView: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn(),
  readPublicationReview: vi.fn()
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  // The refresh's read client. It needs no readAnswerDisclosure: the fixture's answer is served, not components-only,
  // so readAnswerFloor never calls it.
  const readClient = {
    readRun: mocks.readRun,
    readRunAnswer: mocks.readRunAnswer,
    readAnswer: mocks.readAnswer,
    readAnswerMapView: mocks.readAnswerMapView
  };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      readAnswerStory: mocks.readAnswerStory,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility,
      readPublicationReview: mocks.readPublicationReview
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";
import { PublicDebatePageClient } from "../../apps/ui/app/public/debate/[id]/PublicDebatePageClient.js";
import { PublicDebateOverview } from "../../apps/ui/components/PublicDebateOverview.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import timeEnglish from "../../apps/ui/messages/en/time.json" with { type: "json" };
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import debateChromeEnglish from "../../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import debateDrawersEnglish from "../../apps/ui/messages/en/debateDrawers.json" with { type: "json" };
import miscEnglish from "../../apps/ui/messages/en/misc.json" with { type: "json" };
import composeEnglish from "../../apps/ui/messages/en/compose.json" with { type: "json" };
import homeEnglish from "../../apps/ui/messages/en/home.json" with { type: "json" };

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const RUN_REF = STORY_FIXTURE_ANSWER.run_ref;
const VIEW: DebateMapView = {
  positions: [{ node_id: "n-hybrid", answer: "Mutați-vă treptat" }, { node_id: "n-yes", answer: "Da, acum" }],
  also_raised: ["Merită întrebată școala despre mutarea la mijlocul anului.", "Chiria poate crește după un an."]
};
/** A stand-in for the question's catalogue: the English one with recognisable words for the three new keys. */
const QUESTION_WORDS: Record<string, string> = {
  ...publicEnglish,
  "public.alsoRaised.title": "RO Also raised",
  "public.alsoRaised.empty": "RO No other points came up.",
  "public.positionTitle": "RO Pentru {answer}, susținut de {ai}"
};
const PUBLIC_BASE = {
  public_ref: "22222222-2222-4222-8222-222222222222",
  author_pseudonym: "Stable Public Author",
  question: "Ar trebui să ne mutăm cu familia la Cluj?",
  published_at: "2026-10-12T10:00:00.000Z",
  answer: {
    terminal: "SERVED", verdict: "CONTESTED", verdict_available: true, confidence_band: "CAPPED",
    summary_segments: [{ text: "Mutați-vă treptat." }], badges: [], residual_objections: [],
    reversal_point: "O locuință mai ieftină în Cluj.", as_of: "2026-10-12T09:00:00.000Z"
  }
} as const;

/** storyFixture.ts: n-yes is OpenAI's GPT model, n-hybrid is xAI's Grok model (ruling C-NAMES: the family name). */
const TITLES = ["RO Pentru Da, acum, susținut de GPT", "RO Pentru Mutați-vă treptat, susținut de Grok"];

let root: Root | null = null;

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element));
  await flush();
  return container;
}

function overview(mapView: DebateMapView | undefined): ReactElement {
  const debate = PublicDebateSchema.parse(mapView === undefined ? PUBLIC_BASE : { ...PUBLIC_BASE, map_view: mapView });
  return (
    <PublicDebateOverview debate={debate} catalog={publicEnglish} storyCatalog={QUESTION_WORDS} storyLocale="ro"
      onDetails={() => undefined} onRead={() => undefined} />
  );
}

function owner(initialMapView: DebateMapView | null): ReactElement {
  return (
    <DebatePageClient
      id={STORY_FIXTURE_DEBATE_ID}
      initialDebate={debateDetailFromAnswer(STORY_FIXTURE_ANSWER)}
      initialAnswer={STORY_FIXTURE_ANSWER}
      timeCatalog={{}}
      questionLocale="ro"
      storyLocale="ro"
      storyCatalog={QUESTION_WORDS}
      initialMapView={initialMapView}
    />
  );
}

/**
 * Review M-4: the published page. The snapshot's own nodes (the owner's, as a publication carries them: public lineage,
 * no review) and its map view; the page has no owner answer, so titles can come only from `publicMapView` and the
 * public nodes.
 */
function publicPage(): ReactElement {
  const nodes = STORY_FIXTURE_ANSWER.nodes.map((node) => ({
    ...node, disagreement: null, review: null,
    maker_lineage: node.maker_lineage === null ? null : { maker: node.maker_lineage.maker, model_id: node.maker_lineage.model_id }
  }));
  const debate = PublicDebateSchema.parse({
    ...PUBLIC_BASE,
    answer: { ...PUBLIC_BASE.answer, nodes, edges: STORY_FIXTURE_ANSWER.edges, tree_included: true },
    map_view: VIEW
  });
  return (
    <PublicDebatePageClient debate={debate} locale="en" storyLocale="ro" storyCatalog={QUESTION_WORDS}
      publicCatalog={publicEnglish} timeCatalog={timeEnglish} debateChromeCatalog={debateChromeEnglish}
      debateDrawersCatalog={debateDrawersEnglish} miscCatalog={miscEnglish} composeCatalog={composeEnglish}
      homeCatalog={homeEnglish} />
  );
}

/** Open one of the page's reading views by its button (the published page lands on the overview). */
async function openView(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll<HTMLButtonElement>(
    `[role="group"][aria-label="${chromeEnglish["chrome.view"]}"] > button`
  )].find((candidate) => candidate.textContent === label);
  expect(button, label).not.toBeUndefined();
  await act(async () => button!.click());
  await flush();
}

/** Who raised a point, how many did, or a position's number: none of it may reach the list. */
const WHO_OR_HOW_MANY = ["OpenAI", "Anthropic", "xAI", "Google", "raised by", "raised_by", "P1", "P2"];
function expectNoWhoOrHowMany(text: string): void {
  for (const forbidden of WHO_OR_HOW_MANY) expect(text, forbidden).not.toContain(forbidden);
  expect(text, "a count").not.toMatch(/[0-9]/u);
}

function titlesIn(container: HTMLElement): string[] {
  return [...new Set([...container.querySelectorAll(".positionTitle")].map((title) => title.textContent ?? ""))];
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  mocks.readAnswerStory.mockReset().mockResolvedValue(storyFixture("READY"));
  mocks.readRun.mockReset().mockResolvedValue({
    run_ref: RUN_REF, question_line: STORY_FIXTURE_ANSWER.question_line, state: "SETTLED",
    terminal_reason: null, hold_until: null, argument_language: null
  });
  mocks.readRunAnswer.mockReset().mockResolvedValue(STORY_FIXTURE_ANSWER);
  mocks.readAnswer.mockReset();
  // By default the page's own refresh cannot read the map view (pre-flight PF-C27).
  mocks.readAnswerMapView.mockReset().mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 500, "boom"));
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
    mocks.readPublicationReview.mockReset().mockResolvedValue({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null });
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("debate shape P2c — the public overview's also-raised list", () => {
  it("lists what was raised but not debated, in the question's language, with only the claims", async () => {
    const container = await mount(overview(VIEW));
    const section = container.querySelector<HTMLElement>("section.alsoRaised");
    expect(section?.getAttribute("lang")).toBe("ro");
    expect(section?.querySelector(".alsoRaisedTitle")?.textContent).toBe("RO Also raised");
    expect([...section!.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    // Review M-4: the section holds its title and the claims and nothing else, so a count, a maker or a number the
    // component added would show here. The fixture's claims themselves name no one and hold no number.
    expect(section!.textContent).toBe(["RO Also raised", ...VIEW.also_raised].join(""));
    expectNoWhoOrHowMany(section!.textContent ?? "");
  });

  it("the who-or-how-many check fails on text that says who or how many (its control)", () => {
    expect(() => expectNoWhoOrHowMany("Chiria poate crește, raised by OpenAI.")).toThrow();
    expect(() => expectNoWhoOrHowMany("Chiria poate crește (3)")).toThrow();
    expect(() => expectNoWhoOrHowMany("P1: Chiria poate crește")).toThrow();
    expect(() => expectNoWhoOrHowMany(["RO Also raised", ...VIEW.also_raised].join(""))).not.toThrow();
  });

  it("says every point was debated when nothing was left over", async () => {
    const container = await mount(overview({ positions: [], also_raised: [] }));
    expect(container.querySelector(".alsoRaisedEmpty")?.textContent).toBe("RO No other points came up.");
    expect(container.querySelector(".alsoRaisedItem")).toBeNull();
  });

  it("shows nothing for a snapshot without a map", async () => {
    const container = await mount(overview(undefined));
    expect(container.querySelector(".alsoRaised")).toBeNull();
  });
});

describe("debate shape P2c — the published debate page", () => {
  it("titles each position from the snapshot's map view and nodes, in the question's language", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = await mount(publicPage());
    for (const view of [chromeEnglish["chrome.thread"], chromeEnglish["chrome.tree"]]) {
      await openView(container, view);
      expect(titlesIn(container).sort(), view).toEqual([...TITLES].sort());
      for (const title of container.querySelectorAll(".positionTitle")) expect(title.getAttribute("lang"), view).toBe("ro");
    }
  });
});

describe("debate shape P2c — the owner's debate page", () => {
  it("titles each position in the question's language, and only the positions the view names", async () => {
    const container = await mount(owner(VIEW));
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    for (const title of container.querySelectorAll(".positionTitle")) expect(title.getAttribute("lang")).toBe("ro");
  });

  it("keeps the titles when a refresh cannot read the map", async () => {
    // beforeEach: readAnswerMapView rejects with a 500, so the mount refresh's map read FAILED (pre-flight PF-C27).
    const container = await mount(owner(VIEW));
    await flush();
    await flush();
    expect(mocks.readRunAnswer).toHaveBeenCalled();
    expect(mocks.readAnswerMapView).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    expect(container.querySelectorAll("section.alsoRaised .alsoRaisedItem")).toHaveLength(2);
  });

  it("learns the map view from its own refresh when the server read none", async () => {
    mocks.readAnswerMapView.mockReset().mockResolvedValue(VIEW);
    const container = await mount(owner(null));
    await flush();
    await flush();
    expect(mocks.readAnswerMapView).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(titlesIn(container).sort()).toEqual([...TITLES].sort());
    expect([...container.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
  });

  it("lists the also-raised points on the owner's page too, and nothing without a map", async () => {
    const withMap = await mount(owner(VIEW));
    expect([...withMap.querySelectorAll(".alsoRaisedItem")].map((item) => item.textContent)).toEqual(VIEW.also_raised);
    await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    const without = await mount(owner(null));
    expect(without.querySelector(".alsoRaised")).toBeNull();
    expect(without.querySelector(".positionTitle")).toBeNull();
  });
});
