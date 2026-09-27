// @vitest-environment jsdom

import { act, StrictMode, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer, AnswerStory, ArgumentLanguage, RunEvent } from "@debateai/contract";
import { debateDetailFromAnswer, debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { LOCALE_COOKIE, type LocaleCode } from "../../apps/ui/lib/i18n/locales.js";
import { useStoryLocaleReady } from "../../apps/ui/lib/v3/useStoryLocaleReady.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };
import publicRomanian from "../../apps/ui/messages/ro/public.json" with { type: "json" };
import { readRefreshes, resetRefreshes } from "./stubs/next-navigation.js";

/**
 * Task 14 (spec 2026-09-26 §10, §14.3): the owner's debate page shows the
 * verdict story strip, keeps it fresh while the story is written, and speaks
 * the QUESTION's language, even straight after an ask, when the server's
 * render had no read to learn that language from.
 */

const mocks = vi.hoisted(() => ({
  readAnswerStory: vi.fn(),
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  emit: null as null | ((event: RunEvent) => void),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readLedgerDigest: vi.fn(),
  readRunVisibility: vi.fn(),
  getDebateServer: vi.fn(),
  locale: "en"
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const readClient = { readRun: mocks.readRun, readRunAnswer: mocks.readRunAnswer, readAnswer: mocks.readAnswer };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readAnswerStory: mocks.readAnswerStory,
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readLedgerDigest: mocks.readLedgerDigest,
      readRunVisibility: mocks.readRunVisibility
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});
vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  getDebateServer: mocks.getDebateServer
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => ReactNode }) => children("t".repeat(43))
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: name === LOCALE_COOKIE ? mocks.locale : "t".repeat(43) })
  }),
  headers: async () => new Headers({ "user-agent": "vitest-render-browser" })
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePage from "../../apps/ui/app/debate/[id]/page.js";
import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const ROMANIAN: ArgumentLanguage = Object.freeze({ tag: "ro", name: "Romanian" });
const RUN_REF = STORY_FIXTURE_ANSWER.run_ref;
const READY_HEADLINE = storyFixture("READY").story!.short.headline;

function runProjection(state: "RUNNING" | "SETTLED", language: ArgumentLanguage | null) {
  return {
    run_ref: RUN_REF,
    question_line: STORY_FIXTURE_ANSWER.question_line,
    state,
    terminal_reason: null,
    hold_until: null,
    argument_language: language
  };
}

function terminalEvent(): RunEvent {
  return {
    event_id: "event:terminal",
    event_type: "run.terminal",
    run_ref: RUN_REF,
    at_sequence: 1,
    payload: { state: "SERVED" }
  };
}

type OwnerProps = Readonly<{
  id?: string;
  answer?: Answer | null;
  publicMode?: boolean;
  questionLocale: LocaleCode | null;
  storyLocale: LocaleCode;
  storyCatalog: Record<string, string>;
}>;

let root: Root | null = null;

function element(props: OwnerProps): ReactElement {
  const answer = props.answer === undefined ? STORY_FIXTURE_ANSWER : props.answer;
  return (
    <DebatePageClient
      id={props.id ?? STORY_FIXTURE_DEBATE_ID}
      initialDebate={answer === null
        ? debateDetailFromRunProjection(runProjection("RUNNING", null))
        : debateDetailFromAnswer(answer)}
      initialAnswer={answer}
      initialPending={answer === null}
      timeCatalog={{}}
      publicMode={props.publicMode ?? false}
      questionLocale={props.questionLocale}
      storyLocale={props.storyLocale}
      storyCatalog={props.storyCatalog}
    />
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
  });
}

async function mount(props: OwnerProps): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(element(props)));
  await flush();
  return container;
}

/** The server component rendering again with new props (router.refresh()). */
async function rerender(props: OwnerProps): Promise<void> {
  await act(async () => root!.render(element(props)));
  await flush();
}

function panelOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("section.storyPanel");
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  resetRefreshes();
  mocks.emit = null;
  mocks.locale = "en";
  mocks.readAnswerStory.mockReset();
  mocks.readRun.mockReset().mockResolvedValue(runProjection("SETTLED", ROMANIAN));
  mocks.readRunAnswer.mockReset().mockResolvedValue(STORY_FIXTURE_ANSWER);
  mocks.readAnswer.mockReset();
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
  mocks.streamEvents.mockReset().mockImplementation(async (_runRef: string, emit: (event: RunEvent) => void) => {
    mocks.emit = emit;
    await new Promise<void>(() => {});
  });
  mocks.getDebateServer.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the story strip on the owner's debate page", () => {
  it("shows the READY story in the question's language, right after the language offer, with its download link", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    const panel = panelOf(container);
    expect(panel?.getAttribute("data-story-status")).toBe("READY");
    expect(panel?.getAttribute("lang")).toBe("ro");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe(publicRomanian["public.story.label.contested"]);
    expect(panel?.textContent).toContain(READY_HEADLINE);
    expect(panel?.querySelector("a.storyPanelDownload")?.getAttribute("href")).toBe(`/debate/${STORY_FIXTURE_DEBATE_ID}/report`);
    // Mounted right after the offer to show the page in the question's language.
    expect(panel?.previousElementSibling?.matches("section.languageOffer")).toBe(true);
    expect(mocks.readAnswerStory).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(readRefreshes()).toEqual([]);
  });

  it("shows no strip until the first reply, so a reload never announces a story being written", async () => {
    let reply: (story: AnswerStory) => void = () => {};
    mocks.readAnswerStory.mockReturnValue(new Promise<AnswerStory>((resolve) => { reply = resolve; }));
    const container = await mount({ questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    expect(mocks.readAnswerStory).toHaveBeenCalledTimes(1);
    expect(panelOf(container)).toBeNull();
    expect(container.textContent).not.toContain(publicRomanian["public.story.writing"]);
    await act(async () => reply(storyFixture("READY")));
    await flush();
    expect(panelOf(container)?.getAttribute("data-story-status")).toBe("READY");
  });

  it("shows today's composed text when the story is UNAVAILABLE, and reads it once", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("UNAVAILABLE"));
    const container = await mount({ questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    const panel = panelOf(container);
    expect(panel?.getAttribute("data-story-status")).toBe("UNAVAILABLE");
    expect(panel?.textContent).toContain("Chiria mai mare din Cluj rămâne principala obiecție");
    expect(panel?.querySelector("a.storyPanelDownload")).toBeNull();
    expect(mocks.readAnswerStory).toHaveBeenCalledTimes(1);
  });

  it("never reads or shows the owner's story on the public page", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ publicMode: true, questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    expect(panelOf(container)).toBeNull();
    expect(mocks.readAnswerStory).not.toHaveBeenCalled();
    expect(readRefreshes()).toEqual([]);
  });

  it("never asks the server to render again on the public page, even with no question locale", async () => {
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ publicMode: true, questionLocale: null, storyLocale: "en", storyCatalog: publicEnglish });
    expect(panelOf(container)).toBeNull();
    expect(mocks.readRun).not.toHaveBeenCalled();
    expect(readRefreshes()).toEqual([]);
  });
});

describe("the starting flow learns the question's language from its own run read (mechanism (a))", () => {
  it("asks the server once to render again with a real read, and shows no panel until the Romanian catalogue arrives", async () => {
    window.history.replaceState(null, "", `/debate/${RUN_REF}?starting=1`);
    mocks.readRun.mockResolvedValue(runProjection("RUNNING", ROMANIAN));
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ id: RUN_REF, answer: null, questionLocale: null, storyLocale: "en", storyCatalog: publicEnglish });
    // Once, and only after "?starting=1" left the URL: that render skips the server's read.
    expect(readRefreshes()).toEqual([""]);
    expect(window.location.pathname).toBe(`/debate/${RUN_REF}`);

    // The server's second render hands over the question's locale and its catalogue.
    await rerender({ id: RUN_REF, answer: null, questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    // The offer to switch the page to Romanian comes with it.
    expect(container.querySelector("section.languageOffer")).not.toBeNull();

    // The run settles and the answer arrives: the strip shows, in Romanian, with no further refresh.
    mocks.readRun.mockResolvedValue(runProjection("SETTLED", ROMANIAN));
    expect(mocks.emit).toBeTypeOf("function");
    await act(async () => {
      mocks.emit!(terminalEvent());
      await Promise.resolve();
    });
    await flush();
    expect(mocks.readRunAnswer).toHaveBeenCalled();
    expect(mocks.readAnswerStory).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    const panel = panelOf(container);
    expect(panel?.getAttribute("lang")).toBe("ro");
    expect(panel?.getAttribute("data-story-status")).toBe("READY");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe(publicRomanian["public.story.label.contested"]);
    expect(readRefreshes()).toHaveLength(1);
  });

  it("asks once more when the answer arrives with the question's catalogue still missing, and never a third time", async () => {
    window.history.replaceState(null, "", `/debate/${RUN_REF}?starting=1`);
    mocks.readRun.mockResolvedValue(runProjection("RUNNING", ROMANIAN));
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const starting = { id: RUN_REF, answer: null, questionLocale: null, storyLocale: "en", storyCatalog: publicEnglish } as const;
    const container = await mount(starting);
    expect(readRefreshes()).toEqual([""]);
    // That render's own read came back pending: the server still learned no language.
    await rerender(starting);
    expect(readRefreshes()).toHaveLength(1);

    // The answer arrives, still without the Romanian catalogue: one more try, and no English-framed strip.
    mocks.readRun.mockResolvedValue(runProjection("SETTLED", ROMANIAN));
    await act(async () => {
      mocks.emit!(terminalEvent());
      await Promise.resolve();
    });
    await flush();
    expect(mocks.readAnswerStory).toHaveBeenCalledWith(STORY_FIXTURE_ANSWER.answer_id);
    expect(readRefreshes()).toEqual(["", ""]);
    expect(panelOf(container)).toBeNull();

    // Further client reads and server renders that still learn nothing never ask a third time.
    await act(async () => {
      mocks.emit!({ ...terminalEvent(), event_id: "event:terminal-again", at_sequence: 2 });
      await Promise.resolve();
    });
    await flush();
    await rerender(starting);
    expect(readRefreshes()).toHaveLength(2);
    expect(panelOf(container)).toBeNull();

    // The second try's render brings the catalogue: the strip shows.
    await rerender({ id: RUN_REF, answer: null, questionLocale: "ro", storyLocale: "ro", storyCatalog: publicRomanian });
    expect(panelOf(container)?.getAttribute("lang")).toBe("ro");
    expect(readRefreshes()).toHaveLength(2);
  });

  it.each([
    ["in the interface's own language", { tag: "en", name: "English" }],
    ["und (detection was not confident)", { tag: "und", name: "the same language as the question" }],
    ["not recorded", null]
  ] as const)("never refreshes for a question %s, and shows the panel in the interface's language", async (_case, language) => {
    mocks.readRun.mockResolvedValue(runProjection("SETTLED", language));
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ questionLocale: null, storyLocale: "en", storyCatalog: publicEnglish });
    const panel = panelOf(container);
    expect(panel?.getAttribute("lang")).toBe("en");
    expect(panel?.querySelector(".storyPanelLabel")?.textContent).toBe(publicEnglish["public.story.label.contested"]);
    expect(readRefreshes()).toEqual([]);
  });

  describe("useStoryLocaleReady asks at most twice, even when React runs its effects twice (StrictMode)", () => {
    type ProbeProps = Readonly<{ questionLocale: LocaleCode | null; storyLocale: LocaleCode; hasAnswer: boolean }>;
    function Probe(props: ProbeProps) {
      return <p data-ready={String(useStoryLocaleReady({ ...props, readQuestionLocale: "ro" }))} />;
    }
    async function render(container: HTMLElement | null, props: ProbeProps): Promise<HTMLElement> {
      let host = container;
      if (host === null) {
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
      }
      await act(async () => root!.render(<StrictMode><Probe {...props} /></StrictMode>));
      return host;
    }

    it("once while the debate runs, once more when the answer first arrives, then never again", async () => {
      window.history.replaceState(null, "", `/debate/${RUN_REF}?starting=1`);
      const container = await render(null, { questionLocale: null, storyLocale: "en", hasAnswer: false });
      expect(readRefreshes()).toEqual([""]);
      expect(container.querySelector("p")?.dataset.ready).toBe("false");
      await render(container, { questionLocale: null, storyLocale: "en", hasAnswer: true });
      expect(readRefreshes()).toEqual(["", ""]);
      await render(container, { questionLocale: null, storyLocale: "en", hasAnswer: false });
      await render(container, { questionLocale: null, storyLocale: "en", hasAnswer: true });
      expect(readRefreshes()).toHaveLength(2);
      await render(container, { questionLocale: "ro", storyLocale: "ro", hasAnswer: true });
      expect(container.querySelector("p")?.dataset.ready).toBe("true");
      expect(readRefreshes()).toHaveLength(2);
    });

    it("only once when the answer is already there at the first try", async () => {
      const container = await render(null, { questionLocale: null, storyLocale: "en", hasAnswer: true });
      expect(readRefreshes()).toEqual([""]);
      await render(container, { questionLocale: null, storyLocale: "en", hasAnswer: false });
      await render(container, { questionLocale: null, storyLocale: "en", hasAnswer: true });
      expect(readRefreshes()).toHaveLength(1);
    });
  });

  it("shows no panel while its own run read has not answered", async () => {
    mocks.readRun.mockReturnValue(new Promise(() => {}));
    mocks.readAnswerStory.mockResolvedValue(storyFixture("READY"));
    const container = await mount({ questionLocale: null, storyLocale: "en", storyCatalog: publicEnglish });
    expect(panelOf(container)).toBeNull();
    expect(readRefreshes()).toEqual([]);
  });
});

describe("the owner page's server render loads the question's catalogue (page.tsx)", () => {
  const html = (text: string): string => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

  type PageElement = ReactElement<{ storyLocale: string; storyCatalog: unknown; publicCatalog: unknown; questionLocale?: string | null }>;

  async function ownerPage(language: ArgumentLanguage | null, searchParams: { starting?: string } = {}): Promise<PageElement> {
    mocks.getDebateServer.mockResolvedValue({
      ok: true,
      debate: debateDetailFromAnswer(STORY_FIXTURE_ANSWER),
      answer: STORY_FIXTURE_ANSWER,
      questionLanguage: language
    });
    return await DebatePage({
      params: Promise.resolve({ id: STORY_FIXTURE_DEBATE_ID }),
      searchParams: Promise.resolve(searchParams)
    }) as PageElement;
  }

  it("hands a Romanian question under an English interface the Romanian public catalogue, and renders no strip on the server", async () => {
    const page = await ownerPage(ROMANIAN);
    expect(page.props.storyLocale).toBe("ro");
    expect(page.props.storyCatalog).toEqual(publicRomanian);
    expect(page.props.publicCatalog).toEqual(publicEnglish);
    // The server reads no story, so it shows no strip: never "being written" before the first reply.
    const markup = renderToStaticMarkup(page);
    // The page body itself did render (a page that rendered nothing would pass every absence below).
    expect(markup).toContain("debateAiDisclosure");
    expect(markup).not.toContain("storyPanel");
    expect(markup).not.toContain(html(publicRomanian["public.story.writing"]));
    expect(markup).not.toContain(html(publicEnglish["public.story.writing"]));
  });

  it("hands an und question the interface's own public catalogue", async () => {
    const page = await ownerPage({ tag: "und", name: "the same language as the question" });
    expect(page.props.storyLocale).toBe("en");
    expect(page.props.storyCatalog).toBe(page.props.publicCatalog);
    expect(page.props.storyCatalog).toEqual(publicEnglish);
    const markup = renderToStaticMarkup(page);
    expect(markup).toContain("debateAiDisclosure");
    expect(markup).not.toContain("storyPanel");
  });

  it("reuses the interface's public catalogue when the question speaks the interface's language", async () => {
    mocks.locale = "ro";
    const page = await ownerPage(ROMANIAN);
    expect(page.props.storyLocale).toBe("ro");
    expect(page.props.storyCatalog).toBe(page.props.publicCatalog);
  });

  it("hands the starting render the interface's catalogue and no question locale, and reads nothing", async () => {
    const page = await ownerPage(ROMANIAN, { starting: "1" });
    expect(mocks.getDebateServer).not.toHaveBeenCalled();
    expect(page.props.storyLocale).toBe("en");
    expect(page.props.storyCatalog).toBe(page.props.publicCatalog);
    expect(page.props.questionLocale ?? null).toBeNull();
    const markup = renderToStaticMarkup(page);
    // The starting render is the waiting line (nothing is read yet), and it did render.
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("storyPanel");
  });
});
