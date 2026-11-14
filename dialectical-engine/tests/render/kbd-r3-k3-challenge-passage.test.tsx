// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@debateai/contract";
import { debateDetailFromRunProjection } from "../../apps/ui/lib/v3/adapter.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import publicEnglish from "../../apps/ui/messages/en/public.json" with { type: "json" };

/**
 * Keyboard audit round 3 (2026-11-12), K3: challenging one passage by keyboard (DEB1-9 / CSS-11).
 * Mounted as kbd-r2-deb-page mounts it (that file's mocks, copied).
 */
const RUN = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  readRunAnswer: vi.fn(),
  readAnswer: vi.fn(),
  streamEvents: vi.fn(),
  readEvents: vi.fn(),
  readDeployment: vi.fn(),
  readLedgerDigest: vi.fn(),
  readPublicationReview: vi.fn(),
  readRunVisibility: vi.fn(),
  takeRemovalNotice: vi.fn(),
  collapse: false
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/api.js")>();
  const readClient = { readRun: mocks.readRun, readRunAnswer: mocks.readRunAnswer, readAnswer: mocks.readAnswer };
  return {
    ...actual,
    COOKIE_SESSION_MARKER: "cookie-session",
    validateSession: vi.fn().mockResolvedValue(undefined),
    contractClient: {
      readSession: vi.fn(async () => ({
        asker_id: "owner:33333333-3333-4333-8333-333333333333", session_id: "44444444-4444-4444-8444-444444444444",
        caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
      })),
      streamEvents: mocks.streamEvents,
      readEvents: mocks.readEvents,
      readDeployment: mocks.readDeployment,
      readLedgerDigest: mocks.readLedgerDigest,
      readPublicationReview: mocks.readPublicationReview,
      readRunVisibility: mocks.readRunVisibility,
      takeRemovalNotice: mocks.takeRemovalNotice
    },
    getDebateBundle: (id: string, token: string, _client?: unknown, options?: unknown) =>
      actual.getDebateBundle(id, token, readClient as never, options as never)
  };
});

// The header's fit is measured from layout jsdom does not do; the test decides it.
vi.mock("@/lib/debateHeaderOverflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/debateHeaderOverflow.js")>();
  return { ...actual, measureDebateHeaderCollapse: () => ({ collapse: mocks.collapse }) };
});

// The publication card's own flows are kbd-publication-control's; here it only reports a finished
// deletion or a removal by the check, the two ways it swaps the page.
vi.mock("@/components/PublicationControl", () => ({
  PublicationControl: ({ onPrivateDeletion, onRemovedByCheck }: { onPrivateDeletion: (status: "CLEANED" | "PENDING") => void; onRemovedByCheck: () => void }) => (
    <div>
      <button type="button" data-stub-delete onClick={() => onPrivateDeletion("CLEANED")}>Delete</button>
      <button type="button" data-stub-pending onClick={() => onPrivateDeletion("PENDING")}>Delete later</button>
      <button type="button" data-stub-removed onClick={onRemovedByCheck}>Removed</button>
    </div>
  )
}));

// V3 answers carry no argument prose (only claims), so the selection route has nothing to select
// on a settled V3 debate. These tests give every argument a paragraph, as a V2 debate had.
vi.mock("@/lib/v3/adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/ui/lib/v3/adapter.js")>();
  type Tree = { claim: string; active_generation?: unknown; children?: Tree[] };
  const withProse = (node: Tree): Tree => ({
    ...node,
    active_generation: { ...(node.active_generation as object | null ?? { model_id: "m" }), argument: `Prose of ${node.claim} with several plain words in it.` },
    children: (node.children ?? []).map(withProse)
  });
  return {
    ...actual,
    debateDetailFromAnswer: (...args: Parameters<typeof actual.debateDetailFromAnswer>) => {
      const detail = actual.debateDetailFromAnswer(...args);
      return detail.tree ? { ...detail, tree: withProse(detail.tree as unknown as Tree) as never } : detail;
    }
  };
});

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a>
}));

import DebatePageClient from "../../apps/ui/app/debate/[id]/DebatePageClient.js";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const run = {
  run_ref: RUN,
  question_line: "Should cities make public transport free at the point of use?",
  state: "QUEUED" as const,
  terminal_reason: null,
  hold_until: null
};

let root: Root | null = null;

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

async function mount(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <DebatePageClient
        id={RUN}
        initialDebate={debateDetailFromRunProjection(run)}
        initialAnswer={null}
        initialPending
        storyLocale="en"
        storyCatalog={publicEnglish}
      />
    );
  });
  await settle();
  return container;
}

async function mountSettled(): Promise<HTMLElement> {
  mocks.readRun.mockResolvedValue({ ...run, state: "SETTLED" as const });
  mocks.readRunAnswer.mockResolvedValue({ ...buildFairShapedAnswer(), run_ref: RUN });
  return mount();
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
}

async function resize(collapse: boolean): Promise<void> {
  mocks.collapse = collapse;
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
}

function key(target: Element, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

const inline = (page: HTMLElement) => page.querySelector<HTMLElement>(".debateUtilityActions")!;
const overflow = (page: HTMLElement) => page.querySelector<HTMLDetailsElement>("details.debateUtilityOverflow")!;
const summary = (page: HTMLElement) => overflow(page).querySelector<HTMLElement>("summary")!;
const action = (scope: HTMLElement, label: string) => scope.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.collapse = false;
  mocks.readRun.mockReset().mockResolvedValue(run);
  mocks.readRunAnswer.mockReset();
  mocks.readAnswer.mockReset();
  mocks.readEvents.mockReset().mockResolvedValue([]);
  mocks.readDeployment.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readLedgerDigest.mockReset().mockRejectedValue(new Error("not needed by this render test"));
  mocks.readRunVisibility.mockReset().mockResolvedValue({ state: "PRIVATE", public_ref: null });
  mocks.readPublicationReview.mockReset().mockResolvedValue({ flagged: false, state: "NONE", categories: [], asks_used: 0, may_ask: false, refusal: null });
  mocks.takeRemovalNotice.mockReset().mockRejectedValue(new Error("offline"));
  mocks.streamEvents.mockReset().mockImplementation(async (_runRef: string, _emit: (event: RunEvent) => void) => {
    await new Promise<void>(() => {});
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root!.unmount());
    root = null;
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});


/*
 * Keyboard audit round 3 (2026-11-12), DEB1-9 / CSS-11: challenging ONE passage of an argument
 * used to need a text selection, which a keyboard can make only with caret browsing (Safari has
 * none). The Challenge button now asks "Which part?" in a box, pre-filled with a selection that
 * lies inside the same argument's prose; a keyboard selection never opens the popover by itself;
 * and closing it never leaves focus on nothing after a key press.
 */

// jsdom has no layout: a Range has no getBoundingClientRect.
function stubRangeRects(): void {
  if (typeof Range.prototype.getBoundingClientRect !== "function") {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 100, top: 300, right: 200, bottom: 320, width: 100, height: 20, x: 100, y: 300, toJSON() {} })
    });
  }
}

function selectWords(prose: HTMLElement, words: string): void {
  const textNode = [...prose.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").includes(words))
    ?? prose.firstChild!;
  const start = (textNode.textContent ?? "").indexOf(words);
  const range = document.createRange();
  range.setStart(textNode, Math.max(start, 0));
  range.setEnd(textNode, Math.max(start, 0) + words.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  // Browsers fire this by themselves; jsdom does not.
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

async function waitPastSelectionTimer(): Promise<void> {
  await act(async () => {
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise((resolve) => setTimeout(resolve, 760));
  });
  await settle();
}

async function openThread(page: HTMLElement): Promise<void> {
  await click([...page.querySelectorAll<HTMLElement>('.segment[aria-label="View"] button')].find((b) => b.textContent === "Thread")!);
}

const proses = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>("[data-challenge-prose]")];
const challengeOf = (prose: HTMLElement) => document.getElementById(`thread-challenge-${prose.getAttribute("data-challenge-prose")}`);
const partBox = () => document.querySelector<HTMLInputElement>(".popCard input");
const firstWords = (prose: HTMLElement) => (prose.textContent ?? "").trim().split(/\s+/).slice(0, 4).join(" ");

async function chooseFirstAction(): Promise<void> {
  const choice = document.querySelector<HTMLElement>(".popCard .popAction")!;
  choice.focus();
  await click(choice);
}

describe("DEB1-9 (a): the Challenge button asks which part, pre-filled from a selection in the same argument", () => {
  beforeEach(stubRangeRects);

  it("carries a selection inside the same argument's prose into the box, and on into the investigation", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    expect(prose).toBeDefined();
    const words = firstWords(prose);
    selectWords(prose, words);
    const challenge = challengeOf(prose)!;
    expect(challenge).not.toBeNull();
    // Focus moving to the button collapses the selection there (jsdom does it, and so does caret
    // browsing on Tab): the words selected before still reach the box.
    challenge.focus();
    await click(challenge);
    const box = partBox();
    expect(box).not.toBeNull();
    expect(box!.value).toBe(words);
    // The box has a visible name.
    expect(box!.labels?.[0]?.textContent).toContain("Which part?");
    await chooseFirstAction();
    const investigation = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Investigation"]')!;
    expect(investigation.querySelector(".invFlaggedSpan")?.textContent).toContain(words);
  });

  it("leaves the box empty when the selection is in another argument, and then flags the whole claim", async () => {
    const page = await mountSettled();
    await openThread(page);
    const [first, second] = proses(page);
    expect(second).toBeDefined();
    selectWords(second!, firstWords(second!));
    const challenge = challengeOf(first!)!;
    challenge.focus();
    await click(challenge);
    expect(partBox()!.value).toBe("");
    await chooseFirstAction();
    const investigation = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Investigation"]')!;
    expect(investigation.querySelector(".invFlaggedSpan")).toBeNull();
  });

  it("flags the words a person types or pastes into the box (no selection needed: Safari)", async () => {
    const page = await mountSettled();
    await openThread(page);
    window.getSelection()!.removeAllRanges();
    const challenge = challengeOf(proses(page)[0]!)!;
    challenge.focus();
    await click(challenge);
    const box = partBox()!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(box, "  the exact words  ");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await chooseFirstAction();
    const investigation = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Investigation"]')!;
    expect(investigation.querySelector(".invFlaggedSpan")?.textContent).toContain("“the exact words”");
  });

  it("shows no box for a pointer selection: the quote is the part, as before", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    const words = firstWords(prose);
    selectWords(prose, words);
    await act(async () => {
      prose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await settle();
    expect(document.querySelector(".popCard")).not.toBeNull();
    expect(partBox()).toBeNull();
    expect(document.querySelector(".popQuote")?.textContent).toContain(words);
  });
});

describe("DEB1-9 (b): a keyboard selection never opens the popover by itself", () => {
  beforeEach(stubRangeRects);

  it("Shift+Arrow then a pause leaves the popover shut and focus where it was", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    const challenge = challengeOf(prose)!;
    challenge.focus();
    key(prose, { key: "ArrowRight", shiftKey: true });
    selectWords(prose, firstWords(prose));
    await waitPastSelectionTimer();
    expect(document.querySelector(".popCard")).toBeNull();
    expect(document.activeElement).toBe(challenge);
  });

  // Fix round (B4): the pause route is touch and pen's only (a mouse selection opens it through the view's onMouseUp).
  it("a selection made by touch still opens it after the pause", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    await act(async () => {
      prose.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
      prose.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
    });
    selectWords(prose, firstWords(prose));
    await waitPastSelectionTimer();
    expect(document.querySelector(".popCard")).not.toBeNull();
  });
});

describe("DEB1-9 (b), fix round B2/B4: the mouse", () => {
  beforeEach(stubRangeRects);

  it("a mouse press, then a selection with no key and no mouseup, opens nothing after the pause", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
      document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    });
    selectWords(prose, firstWords(prose));
    await waitPastSelectionTimer();
    expect(document.querySelector(".popCard")).toBeNull();
  });

  it("a mouse selection's popover, closed, then a click elsewhere: the Challenge box later starts empty", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    await act(async () => {
      prose.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    });
    selectWords(prose, firstWords(prose));
    await act(async () => {
      prose.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
      prose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await settle();
    expect(document.querySelector(".popCard")).not.toBeNull();
    key(document.activeElement ?? document.body, { key: "Escape" });
    await settle();
    expect(document.querySelector(".popCard")).toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    });
    window.getSelection()!.removeAllRanges();
    act(() => { document.dispatchEvent(new Event("selectionchange")); });
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    });
    const challenge = challengeOf(prose)!;
    challenge.focus();
    await click(challenge);
    expect(partBox()!.value).toBe("");
  });
});

describe("DEB1-9 (c): closing the popover never leaves focus on nothing after a key press", () => {
  beforeEach(stubRangeRects);

  it("Escape returns focus to the Challenge button that opened it", async () => {
    const page = await mountSettled();
    await openThread(page);
    const challenge = challengeOf(proses(page)[0]!)!;
    challenge.focus();
    await click(challenge);
    key(document.activeElement ?? document.body, { key: "Escape" });
    await settle();
    expect(document.querySelector(".popCard")).toBeNull();
    expect(document.activeElement).toBe(challenge);
  });

  it("Escape after a pointer selection lands on the argument's control, not on the page", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    const nodeId = prose.getAttribute("data-challenge-prose")!;
    (document.activeElement as HTMLElement | null)?.blur?.();
    selectWords(prose, firstWords(prose));
    await act(async () => {
      prose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await settle();
    expect(document.querySelector(".popCard")).not.toBeNull();
    key(document.activeElement ?? document.body, { key: "Escape" });
    await settle();
    expect(document.querySelector(".popCard")).toBeNull();
    expect(document.activeElement).toBe(document.getElementById(`thread-details-${nodeId}`));
  });

  it("a click on the scrim after a pointer selection leaves the page as it was", async () => {
    const page = await mountSettled();
    await openThread(page);
    const prose = proses(page)[0]!;
    (document.activeElement as HTMLElement | null)?.blur?.();
    selectWords(prose, firstWords(prose));
    await act(async () => {
      prose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await settle();
    await click(document.querySelector<HTMLElement>(".popScrim")!);
    expect(document.querySelector(".popCard")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("DEB1-9 (d): Split's side cards have the Challenge button too", () => {
  beforeEach(stubRangeRects);

  it("each side card offers Challenge, which asks which part", async () => {
    const page = await mountSettled();
    await click([...page.querySelectorAll<HTMLElement>('.segment[aria-label="View"] button')].find((b) => b.textContent === "Split")!);
    const cards = [...page.querySelectorAll<HTMLElement>(".splitCard")].filter((card) => card.querySelector(".splitCardClaim"));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card.querySelector("button.nodeCtrl.challenge")).not.toBeNull();
    const challenge = cards[0]!.querySelector<HTMLElement>("button.nodeCtrl.challenge")!;
    // Named with its claim, as Thread's is: many cards, one word.
    const claim = cards[0]!.querySelector<HTMLElement>(".splitCardClaim")!;
    const names = (challenge.getAttribute("aria-labelledby") ?? "").split(" ").map((id) => document.getElementById(id));
    expect(names).toContain(challenge);
    expect(names).toContain(claim);
    challenge.focus();
    await click(challenge);
    expect(partBox()).not.toBeNull();
  });
});

describe("Skip-link contract: the classic debate page marks where its content starts", () => {
  it("one #page-content, after the page's own header, focusable by script only", async () => {
    const page = await mountSettled();
    const marks = document.querySelectorAll("#page-content");
    expect(marks).toHaveLength(1);
    const mark = marks[0] as HTMLElement;
    expect(mark.getAttribute("tabindex")).toBe("-1");
    const header = page.querySelector("header.debateTopBar")!;
    expect(header.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mark.previousElementSibling).toBe(header);
  });

  it("the loading screen marks it too", async () => {
    mocks.readRun.mockReset().mockImplementation(() => new Promise(() => {}));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<DebatePageClient id={RUN} initialDebate={null} initialAnswer={null} initialPending storyLocale="en" storyCatalog={publicEnglish} />);
    });
    await settle();
    expect(document.querySelectorAll("#page-content")).toHaveLength(1);
    expect(document.getElementById("page-content")!.getAttribute("tabindex")).toBe("-1");
  });

  it("the deleted-debate screen marks it too", async () => {
    const page = await mount();
    await click(page.querySelector<HTMLElement>("[data-stub-delete]")!);
    expect(document.querySelectorAll("#page-content")).toHaveLength(1);
  });

  it("the held-for-the-check screen marks it after its header", async () => {
    mocks.readRun.mockReset().mockImplementation(() => new Promise(() => {}));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const heldDebate = { ...debateDetailFromRunProjection({ ...run, state: "SETTLED" as const }), synthesis_check: "CHECKING" as const };
    await act(async () => {
      root!.render(<DebatePageClient id={RUN} initialDebate={heldDebate} initialAnswer={null} initialPending storyLocale="en" storyCatalog={publicEnglish} />);
    });
    await settle();
    expect(document.querySelector(".checkingNotice")).not.toBeNull();
    const marks = document.querySelectorAll("#page-content");
    expect(marks).toHaveLength(1);
    expect((marks[0] as HTMLElement).previousElementSibling?.matches("header.debateTopBar")).toBe(true);
  });

  it("the could-not-load screen marks it too", async () => {
    const page = await mount();
    await click(page.querySelector<HTMLElement>("[data-stub-removed]")!);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.querySelectorAll("#page-content")).toHaveLength(1);
  });
});
