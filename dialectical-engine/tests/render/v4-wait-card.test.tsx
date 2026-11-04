// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { V4WaitCard, type V4WaitCardProps } from "../../apps/ui/components/v4/V4WaitCard.js";
import type { WaitState } from "../../apps/ui/lib/v4/stateWords.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a>
}));

/*
 * Owner's screen review, 3 Nov 2026 (journey-d2 A): the one waiting card, its parts in their order, and the fixes it
 * carries: clock times and nothing ticking (journey-f16), the shared state words (journey-f22), chips and no counts
 * (journey-f23), "taking longer" only past a measured time (wait-f8), the back link and level trail (wait-f12), the
 * reduced-motion line (wait-f17), [Try now] (wait-f19) and the classic link once at the bottom (wait-f23).
 */
const V4 = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const word = (key: string, values: Record<string, string> = {}): string =>
  Object.entries(values).reduce((line, [name, value]) => line.replace(`{${name}}`, value), V4[key]!);
const clock = (at: number | string): string => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
const STARTED = "2026-11-04T09:31:00.000Z";
const STARTED_MS = Date.parse(STARTED);
const LOOKING: WaitState = { kind: "LOOKING" };

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let reduced = false;
const listeners = new Set<() => void>();

function stubMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches() { return query.includes("prefers-reduced-motion") && reduced; },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
    })
  });
}

async function mount(props: Partial<V4WaitCardProps> = {}): Promise<HTMLDivElement> {
  host ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(host);
  await act(async () => { root!.render(<V4WaitCard state={LOOKING} catalog={V4} locale="en" {...props} />); });
  return host;
}
const card = (): HTMLElement => host!.querySelector<HTMLElement>("[data-wait-state]")!;
const stateLine = (): HTMLElement => host!.querySelector<HTMLElement>("[data-wait-word]")!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-04T09:40:00.000Z"));
  reduced = false;
  listeners.clear();
  stubMatchMedia();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

describe("the one waiting card", () => {
  it("shows its parts in the owner's order: question, the true state, Started, the choices, the page's part, leave, the classic link last", async () => {
    await mount({
      question: "Should Romania build new nuclear plants?",
      startedAt: STARTED,
      choices: ["Romania", "Up to 2050", "To decide how I vote"],
      children: <p data-page-part="">The page's own part</p>,
      notify: <button type="button" data-notify="">Tell me when it's ready</button>,
      classicHref: "/debate/r-1"
    });
    const section = card();
    expect(section.getAttribute("data-wait-state")).toBe("LOOKING");
    expect(section.querySelector("h1")!.textContent).toBe("Should Romania build new nuclear plants?");
    expect(stateLine().getAttribute("role")).toBe("status");
    expect(stateLine().textContent).toBe("Looking into it");
    const order = [
      "h1", "[data-wait-word]", "[data-wait-started]", ".v4ChoiceChips", "[data-page-part]", "[data-wait-leave]", ".v4WaitClassic"
    ].map((selector) => section.querySelector(selector)!);
    for (let at = 1; at < order.length; at += 1) {
      expect(order[at - 1]!.compareDocumentPosition(order[at]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${String(at)}`).toBeTruthy();
    }
    // "You can leave this page. It keeps going." with the account-wide notify offer beside it.
    const leave = section.querySelector("[data-wait-leave]")!;
    expect(leave.textContent).toContain("You can leave this page. It keeps going.");
    expect(leave.querySelector("[data-notify]")).not.toBeNull();
    // The classic link once, at the very bottom.
    expect(section.querySelectorAll("a[href='/debate/r-1']")).toHaveLength(1);
    expect(section.lastElementChild!.classList.contains("v4WaitClassic")).toBe(true);
  });

  it("says when it started as a clock time, and nothing ticks: no 'minutes ago', the same words an hour later", async () => {
    await mount({ startedAt: STARTED });
    const started = (): string => host!.querySelector("[data-wait-started]")!.textContent!;
    expect(started()).toBe(`Started ${clock(STARTED)}`);
    await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
    expect(started()).toBe(`Started ${clock(STARTED)}`);
    expect(host!.textContent).not.toMatch(/ago|minute|usually/iu);
  });

  it("names the day of a start that was not today; no start time, no line", async () => {
    await mount({ startedAt: "2026-11-02T09:31:00.000Z", checkedAt: Date.parse("2026-11-04T09:40:00.000Z") });
    expect(host!.querySelector("[data-wait-started]")!.textContent).toMatch(/^Started Nov [1-3], /u);
    await mount({ startedAt: null });
    expect(host!.querySelector("[data-wait-started]")).toBeNull();
  });

  it("shows the person's choices as chips, never as a count", async () => {
    await mount({ choices: ["Romania", " ", "Up to 2050"] });
    const chips = host!.querySelector<HTMLElement>(".v4ChoiceChips")!;
    expect(chips.getAttribute("aria-label")).toBe(V4["v4.wait.choices"]);
    expect([...chips.querySelectorAll("li")].map((chip) => chip.textContent)).toEqual(["Romania", "Up to 2050"]);
    expect(host!.textContent).not.toMatch(/\bpicked\b|\d+ (?:of|chosen|choices)/iu);
    await mount({ choices: [] });
    expect(host!.querySelector(".v4ChoiceChips")).toBeNull();
  });

  it("every state reads its shared word, and the leave line shows only while it goes on", async () => {
    const cases: ReadonlyArray<readonly [WaitState, string, boolean]> = [
      [{ kind: "LOOKING" }, word("v4.state.LOOKING"), true],
      [{ kind: "WAITING", startsAfter: "2026-11-04T10:00:00.000Z" }, word("v4.state.WAITING", { time: clock("2026-11-04T10:00:00.000Z") }), true],
      [{ kind: "WAITING_OWN" }, word("v4.state.WAITING_OWN"), true],
      [{ kind: "SHORT_BREAK", continuesAbout: null }, word("v4.state.SHORT_BREAK.noTime"), true],
      [{ kind: "PAUSED", until: "2026-12-01T12:00:00.000Z", canContinue: false }, "Paused until December 1", false],
      [{ kind: "READY" }, word("v4.state.READY"), false],
      [{ kind: "DIDNT_FINISH" }, word("v4.state.DIDNT_FINISH"), false],
      [{ kind: "BEING_WRITTEN" }, word("v4.state.BEING_WRITTEN"), true]
    ];
    for (const [state, text, leave] of cases) {
      await mount({ state });
      expect(stateLine().textContent, state.kind).toBe(text);
      expect(host!.querySelector("[data-wait-leave]") !== null, state.kind).toBe(leave);
    }
  });

  it("the dot pulses only while working; it is hollow while paused and gone when it didn't finish", async () => {
    await mount();
    expect(host!.querySelector(".v4WaitDot")!.getAttribute("data-dot")).toBe("PULSE");
    await mount({ state: { kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: false } });
    expect(host!.querySelector(".v4WaitDot")!.getAttribute("data-dot")).toBe("HOLLOW");
    await mount({ state: { kind: "DIDNT_FINISH" } });
    expect(host!.querySelector(".v4WaitDot")).toBeNull();
  });

  it("a changed state line gets the shared 1-second highlight (v4-base.css .v4Highlight), and the first one does not", async () => {
    await mount({ state: { kind: "WAITING", startsAfter: null } });
    expect(stateLine().classList.contains("v4Highlight")).toBe(false);
    await mount({ state: LOOKING });
    expect(stateLine().classList.contains("v4Highlight")).toBe(true);
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(stateLine().classList.contains("v4Highlight")).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(stateLine().classList.contains("v4Highlight")).toBe(false);
    // The same words again: no highlight.
    await mount({ state: LOOKING, checkedAt: Date.now() });
    expect(stateLine().classList.contains("v4Highlight")).toBe(false);
  });
});

describe("taking longer than usual (wait-f8)", () => {
  const longer = (): Element | null => host!.querySelector("[data-wait-longer]");
  it("never shows without a measured time, however long it runs", async () => {
    await mount({ startedAt: STARTED, checkedAt: STARTED_MS + 59 * 60_000 });
    expect(longer()).toBeNull();
    await mount({ startedAt: STARTED, checkedAt: STARTED_MS + 59 * 60_000, usualTopMinutes: null });
    expect(longer()).toBeNull();
  });

  it("shows once a check past the measured top answers, with something to do, and never names the time", async () => {
    const action = <button type="button" data-longer-action="">Try again</button>;
    await mount({ startedAt: STARTED, checkedAt: STARTED_MS + 20 * 60_000, usualTopMinutes: 20, longerAction: action });
    expect(longer()).toBeNull();
    await mount({ startedAt: STARTED, checkedAt: STARTED_MS + 20 * 60_000 + 1, usualTopMinutes: 20, longerAction: action });
    expect(longer()!.textContent).toContain("This one is taking longer than usual. It is still working, and nothing is lost if you leave.");
    expect(longer()!.querySelector("[data-longer-action]")).not.toBeNull();
    expect(longer()!.textContent).not.toMatch(/\d/u);
  });

  it("is about work going on: not while waiting to start or paused, and not without a start time", async () => {
    const past = { checkedAt: STARTED_MS + 90 * 60_000, usualTopMinutes: 20 };
    await mount({ ...past, startedAt: STARTED, state: { kind: "WAITING", startsAfter: null } });
    expect(longer()).toBeNull();
    await mount({ ...past, startedAt: STARTED, state: { kind: "PAUSED", until: "2026-12-01T00:00:00.000Z", canContinue: false } });
    expect(longer()).toBeNull();
    await mount({ ...past, startedAt: null });
    expect(longer()).toBeNull();
  });
});

describe("reduced motion (wait-f17)", () => {
  it("a still dot and one quiet line that follows each check", async () => {
    reduced = true;
    const first = Date.parse("2026-11-04T09:39:00.000Z");
    await mount({ checkedAt: first });
    expect(host!.querySelector(".v4WaitDot")!.getAttribute("data-dot")).toBe("STILL");
    expect(host!.querySelector(".v4WaitDot")!.classList.contains("v4WaitDotStill")).toBe(true);
    expect(host!.querySelector("[data-wait-checked]")!.textContent).toBe(`Still working · checked ${clock(first)}`);
    const next = first + 5 * 60_000;
    await mount({ checkedAt: next });
    expect(host!.querySelector("[data-wait-checked]")!.textContent).toBe(`Still working · checked ${clock(next)}`);
  });

  it("without reduced motion, no checked line; while waiting or paused, none either", async () => {
    await mount({ checkedAt: Date.now() });
    expect(host!.querySelector("[data-wait-checked]")).toBeNull();
    reduced = true;
    await act(async () => { for (const listener of listeners) listener(); });
    expect(host!.querySelector("[data-wait-checked]")).not.toBeNull();
    await mount({ checkedAt: Date.now(), state: { kind: "WAITING", startsAfter: null } });
    expect(host!.querySelector("[data-wait-checked]")).toBeNull();
  });
});

describe("lost touch, the way back and the classic link", () => {
  it("'Trying again…' carries [Try now] (wait-f19)", async () => {
    const onTryNow = vi.fn();
    await mount({ reconnecting: true, onTryNow });
    const line = host!.querySelector("[data-wait-reconnecting]")!;
    expect(line.textContent).toContain(V4["v4.debate.reconnecting"]);
    const button = line.querySelector<HTMLButtonElement>("button")!;
    expect(button.textContent).toBe("Try now");
    await act(async () => { button.click(); });
    expect(onTryNow).toHaveBeenCalledTimes(1);
    await mount({ reconnecting: false, onTryNow });
    expect(host!.querySelector("[data-wait-reconnecting]")).toBeNull();
  });

  it("a running dig's own page: 'Back to: …' and the level trail above the card (wait-f12)", async () => {
    await mount({
      back: { href: "/v4/debate/parent-1?path=n-mix", question: "Should Romania build new nuclear plants?" },
      levelTrail: { level: 2, trail: null, linkLevel: null }
    });
    const block = host!.querySelector<HTMLElement>("[data-wait-block]")!;
    const back = block.querySelector<HTMLAnchorElement>("a.v4DebBack")!;
    expect(back.getAttribute("href")).toBe("/v4/debate/parent-1?path=n-mix");
    expect(back.textContent).toBe(`‹ ${V4["v4.debate.backTo"]!} Should Romania build new nuclear plants?`);
    const trail = block.querySelector("nav.v4Trail")!;
    expect(trail.textContent).toContain(word("v4.nest.level", { n: "2" }));
    // Both sit above the card, outside it.
    expect(card().contains(back)).toBe(false);
    expect(back.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trail.compareDocumentPosition(card()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await mount({ back: { href: "/v4/debate/parent-1", question: "" } });
    expect(host!.querySelector("a.v4DebBack")!.textContent).toBe(`‹ ${V4["v4.debate.backToEarlier"]!}`);
  });

  it("inline, inside another card: no card border, no eyebrow, the heading level the page asks for", async () => {
    await mount({ variant: "inline", question: "Should Romania build new nuclear plants?", headingLevel: 3 });
    expect(card().classList.contains("v4Card")).toBe(false);
    expect(card().querySelector(".v4Eyebrow")).toBeNull();
    expect(card().querySelector("h3")!.textContent).toBe("Should Romania build new nuclear plants?");
    await mount({ variant: "page" });
    expect(card().querySelector("h1, h2, h3")).toBeNull();
  });

  it("no classic link unless the page passes one, and never two", async () => {
    await mount();
    expect(host!.querySelector(".v4WaitClassic")).toBeNull();
    await mount({ classicHref: "/debate/r-1" });
    expect(host!.querySelectorAll("a").length).toBe(1);
    expect(host!.querySelector(".v4WaitClassic a")!.textContent).toBe(V4["v4.common.classicView"]);
  });
});
