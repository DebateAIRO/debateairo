// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): /new's Depth mode, Depth of scrutiny and
 * Answer length are real choices sent with the ask. Fixed and the scrutiny levels are Premium's;
 * Answer length is every plan's. Nothing on the page still says "not sent", and Max tokens is gone.
 * The three are offered only once the room read says the settings are in force (`shape_settings`);
 * otherwise the API would drop them silently, so the page shows and sends none of them.
 */

const mocks = vi.hoisted(() => ({ createDebate: vi.fn(), push: vi.fn(), readSession: vi.fn(), getAskRoom: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: {
    readSession: mocks.readSession,
    getAskRoom: mocks.getAskRoom,
    readSensitiveDataConsent: async () => ({ status: "given" as const })
  }
}));

/** A room read from an API whose debate shape row is in force (Contract deviation 7). */
const SHAPE_ROOM = { room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, shape_settings: true } as const;
/** The same room from an API with no row in force: the member is absent. */
const { shape_settings: _flag, ...PLAIN_ROOM } = SHAPE_ROOM;
const CHOICE_KEYS = ["depth_mode", "scrutiny", "answer_length"] as const;
/** LG-C Task 5 (spec 2026-10-15 §3.8): a room from an API with the length row alone, which names its answer words. */
const LENGTH_ROOM = { ...PLAIN_ROOM, answer_words: { short: 200, standard: 350, detailed: 1000 }, length_settings: true } as const;

import NewDebatePage from "../../apps/ui/app/new/NewDebatePageClient.js";
import { answerLengthHintVars } from "../../apps/ui/app/new/defaults.js";
import { t } from "../../apps/ui/lib/i18n/translate.js";
import homeCatalog from "../../apps/ui/messages/en/home.json" with { type: "json" };
import chromeCatalog from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import newDebateCatalog from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

const words = newDebateCatalog as Record<string, string>;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("debate shape P2c — the /new controls", () => {
  let root: Root | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-shape" });
    mocks.push.mockReset();
    mocks.readSession.mockReset().mockRejectedValue(new Error("session unavailable in render test"));
    mocks.getAskRoom.mockReset().mockResolvedValue(SHAPE_ROOM);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  async function renderPage(): Promise<void> {
    await act(async () => root!.render(
      <NewDebatePage catalog={newDebateCatalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />
    ));
    // Two settles: the first room read resolves, then the flag shows the controls and the room is read again.
    await settle();
    await settle();
  }

  /** Every room query the page sent, in order. */
  function roomQueries(): Record<string, unknown>[] {
    return mocks.getAskRoom.mock.calls.map((call) => call[0] as Record<string, unknown>);
  }

  async function click(selector: string): Promise<void> {
    await act(async () => document.querySelector<HTMLElement>(selector)!.click());
    await settle();
  }

  async function inputValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
  }

  async function selectValue(selector: string, value: string): Promise<void> {
    const field = document.querySelector<HTMLSelectElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    await act(async () => {
      setter!.call(field, value);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
  }

  async function submitForm(): Promise<void> {
    await act(async () => {
      document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
  }

  it("opens on Adaptive, Standard scrutiny and a Standard answer, with no notice and no Max tokens", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.value).toBe("adaptive");
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.value).toBe("standard");
    expect(document.querySelector("#answerLength-standard")?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".ndLegacyNotice")).toBeNull();
    expect(document.querySelector("#maxTokens")).toBeNull();
    const panel = document.querySelector<HTMLElement>("#additionalRunOptions")!.textContent ?? "";
    expect(panel).not.toMatch(/not sent|Max tokens|Selection strategy|Manual|Recommended/);
  });

  it("offers Fixed only on Premium, and keeps Answer length open on Free (S6, S8)", async () => {
    await renderPage();
    await click(".ndOptionsToggle");
    const fixed = () => document.querySelector<HTMLOptionElement>('#depthMode option[value="fixed"]')!;
    expect([...document.querySelectorAll<HTMLOptionElement>("#depthMode option")].map((option) => option.value))
      .toEqual(["adaptive", "fixed"]);
    expect(fixed().disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(true);
    expect(document.querySelector<HTMLSelectElement>("#scrutinyDepth")?.disabled).toBe(true);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].map((pill) => pill.disabled))
      .toEqual([false, false, false]);
    await click("#planTier-premium");
    expect(fixed().disabled).toBe(false);
    expect(document.querySelector<HTMLSelectElement>("#depthMode")?.disabled).toBe(false);
  });

  it("explains the chosen value under each control", async () => {
    await renderPage();
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeAdaptiveHelp"]);
    await selectValue("#depthMode", "fixed");
    expect(document.querySelector("#depthMode-hint")?.textContent).toBe(words["newDebate.depthModeFixedHelp"]);
    await selectValue("#scrutinyDepth", "exhaustive");
    expect(document.querySelector("#scrutinyDepth-hint")?.textContent).toBe(words["newDebate.scrutinyExhaustiveHelp"]);
    // LG-C Task 16 (pre-flight PF-C6.4): the hint carries the three numbers; no room words here, so the start values.
    expect(document.querySelector("#answerLength-hint")?.textContent)
      .toBe(t(words, "newDebate.answerLengthHint", answerLengthHintVars(null, "en")));
    // Accessibility (pre-flight PF-C34): SegmentedRow names its radiogroup by `${field}-label` and points every
    // pill at `${field}-hint`, so a screen reader hears "Answer length" and the hint on each pill.
    const group = document.querySelector<HTMLElement>('[role="radiogroup"][aria-labelledby="answerLength-label"]');
    expect(group).not.toBeNull();
    expect(document.getElementById(group!.getAttribute("aria-labelledby")!)?.textContent).toBe(words["newDebate.answerLength"]);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-field="answerLength"]')].map((pill) => pill.getAttribute("aria-describedby")))
      .toEqual(["answerLength-hint", "answerLength-hint", "answerLength-hint"]);
  });

  it("the answer-length hint names the room read's words (LG-C Task 16)", async () => {
    mocks.getAskRoom.mockResolvedValue({ ...SHAPE_ROOM, answer_words: { short: 250, standard: 800, detailed: 2000 } });
    await renderPage();
    await click(".ndOptionsToggle");
    expect(document.querySelector("#answerLength-hint")?.textContent)
      .toBe("About 250, 800 or 2,000 words: a target, not a hard limit.");
  });

  it("sends Premium's choices with the ask", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "deep");
    await click("#answerLength-detailed");
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "premium", depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed"
    });
  });

  it("sends Free's fixed gauges and the answer length Free chose, even after Premium choices", async () => {
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    await selectValue("#depthMode", "fixed");
    await selectValue("#scrutinyDepth", "exhaustive");
    await click("#answerLength-short");
    await click("#planTier-free");
    await submitForm();
    expect(mocks.createDebate.mock.calls[0]?.[1]).toMatchObject({
      plan_tier: "free", depth_mode: "adaptive", scrutiny: "standard", answer_length: "short"
    });
  });

  it.each([
    ["the room has no shape_settings (no row in force)", () => mocks.getAskRoom.mockResolvedValue(PLAIN_ROOM)],
    ["the room read fails", () => mocks.getAskRoom.mockRejectedValue(new Error("room unavailable in render test"))]
  ])("shows none of the three controls and sends none of them when the room does not say they are in force: %s", async (_state, arrange) => {
    arrange();
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode")).toBeNull();
    expect(document.querySelector("#scrutinyDepth")).toBeNull();
    expect(document.querySelectorAll('[data-field="answerLength"]')).toHaveLength(0);
    // The retired controls are gone either way: they were never sent.
    expect(document.querySelector(".ndLegacyNotice")).toBeNull();
    expect(document.querySelector("#maxTokens")).toBeNull();
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    for (const key of CHOICE_KEYS) expect(mocks.createDebate.mock.calls[0]?.[1]).not.toHaveProperty(key);
    // The room is read for today's query only.
    expect(roomQueries().length).toBeGreaterThan(0);
    for (const query of roomQueries()) for (const key of CHOICE_KEYS) expect(query).not.toHaveProperty(key);
  });

  it("with the length row alone: shows only the answer length, and sends and reads the room with answer_length alone", async () => {
    mocks.getAskRoom.mockResolvedValue(LENGTH_ROOM);
    await renderPage();
    await inputValue("#topic", "Should the city fund the tram extension?");
    await click("#planTier-premium");
    await click(".ndOptionsToggle");
    expect(document.querySelector("#depthMode")).toBeNull();
    expect(document.querySelector("#scrutinyDepth")).toBeNull();
    expect(document.querySelectorAll('[data-field="answerLength"]')).toHaveLength(3);
    await click("#answerLength-detailed");
    expect(roomQueries().at(-1)).toMatchObject({ answer_length: "detailed" });
    for (const query of roomQueries()) {
      expect(query).not.toHaveProperty("depth_mode");
      expect(query).not.toHaveProperty("scrutiny");
    }
    await submitForm();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    const sent = mocks.createDebate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).toMatchObject({ answer_length: "detailed" });
    expect(sent).not.toHaveProperty("depth_mode");
    expect(sent).not.toHaveProperty("scrutiny");
  });

  it("reads the room with the three choices only once it says they are in force, and keeps them shown when a later read fails", async () => {
    await renderPage();
    expect(Object.keys(roomQueries()[0]!).sort()).toEqual(["composition_budget_tier", "depth", "plan_tier"]);
    expect(roomQueries().at(-1)).toMatchObject({ depth_mode: "adaptive", scrutiny: "standard", answer_length: "standard" });
    // A later read fails (advisory: null), or is refused: the flag already seen is kept.
    mocks.getAskRoom.mockRejectedValue(new Error("room unavailable in render test"));
    await click(".ndOptionsToggle");
    await click("#answerLength-detailed");
    expect(roomQueries().at(-1)).toMatchObject({ answer_length: "detailed" });
    expect(document.querySelector("#depthMode")).not.toBeNull();
    expect(document.querySelector("#answerLength-detailed")?.getAttribute("aria-checked")).toBe("true");
  });
});
