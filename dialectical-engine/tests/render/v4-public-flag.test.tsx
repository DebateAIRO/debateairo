// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { V4PublicFlag } from "../../apps/ui/components/v4/V4PublicFlag.js";
import { V4PublicSessionProvider } from "../../apps/ui/components/v4/V4PublicSession.js";
import { V4PublicTopMenu } from "../../apps/ui/components/v4/V4PublicPage.js";
import { V4CopyLink } from "../../apps/ui/components/v4/V4PublicMark.js";
import { pressPublicFlag, type PublicFlagPorts } from "../../apps/api/src/public-flag.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));
/**
 * Decision 35, the button: signed out it offers sign-in and the address; signed in, a bound report and one line back. Owner screen review (3 Nov):
 * the label is "Report a problem" (r2-14); the form closes at once with a thank-you and the answer replaces it later in the same quiet line (public-f5);
 * a box left too short asks for a little more; focus goes into the form and back to the link; the line for a refusal gives the addresses and the routes, and is true whatever stopped the report (the DSA notices, D5).
 */
const V4 = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const REF = "11111111-1111-4111-8111-111111111111";
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
const toggle = (): HTMLButtonElement => host!.querySelector<HTMLButtonElement>("[data-public-report]")!;
const line = (): string => host!.querySelector("[data-public-flag-line]")!.textContent ?? "";
async function mount(signedIn: boolean, send = vi.fn(async () => ({ state: "NOT_FOUND" as const }))) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => { root!.render(<V4PublicFlag publicRef={REF} catalog={V4} send={send as never} readSession={async () => { if (!signedIn) throw new Error("out"); }} />); });
  await act(async () => { toggle().click(); });
  return send;
}
function set(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const goodFaith = (): HTMLInputElement => host!.querySelector<HTMLInputElement>("input[name=goodFaith]")!;
async function fill(where: string, claim: string, inGoodFaith = true) {
  await act(async () => {
    set(host!.querySelector<HTMLInputElement>("input[name=where]")!, where);
    set(host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!, claim);
    if (goodFaith().checked !== inGoodFaith) goodFaith().click();
  });
  await act(async () => { host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

describe("Report a problem on a public page", () => {
  it("the link reads \"Report a problem\" (r2-14)", async () => {
    await mount(true);
    expect(toggle().textContent).toBe("Report a problem");
  });
  it("signed out: sign-in back to this page and the address; no form, and nothing is sent", async () => {
    const send = await mount(false);
    const signedOut = host!.querySelector("[data-public-flag-signed-out]")!;
    expect(signedOut.textContent).toContain("support@dezbatere.ro");
    expect(signedOut.querySelector("a")!.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/public/debate/${REF}`)}`);
    expect(host!.querySelector("form")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    ["NOT_FOUND", "We have not acted on this report: it was stopped automatically, and no person has read it. If you think that is wrong, write to support@dezbatere.ro and a person will read it, or complain to office@dezbatere.ro within six months; you can also go to a certified out-of-court body or to court."],
    ["HIDDEN", "Thank you. An automatic check agreed with your report and hid this debate, with no person involved. A person will now review it."],
    ["WITH_A_PERSON", V4["v4.public.flag.WITH_A_PERSON"]]
  ] as const)("signed in, %s: its one line, word for word", async (state, words) => {
    const send = await mount(true, vi.fn(async () => ({ state })) as never);
    await fill("The first path", "It names a private person's home.");
    expect(send).toHaveBeenCalledWith(REF, { where: "The first path", claim: "It names a private person's home.", good_faith: true });
    expect(line()).toBe(words);
  });
  it("the good-faith box is required (DSA Art 16(2)(d)): left empty, a line under it asks for it, focus goes to it, and nothing is sent", async () => {
    const send = await mount(true);
    expect(goodFaith().required).toBe(true);
    expect(host!.querySelector(`label[for="${goodFaith().id}"]`)!.textContent).toBe("I believe in good faith that this report is accurate and complete.");
    await fill("Here", "A long enough claim.", false);
    expect(send).not.toHaveBeenCalled();
    expect([...host!.querySelectorAll("[data-public-flag-more]")].map((one) => one.textContent)).toEqual([V4["v4.public.flag.goodFaithMore"]]);
    expect(goodFaith().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(goodFaith());
    await fill("Here", "A long enough claim.");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("focus goes into the form when it opens, and back to the link when it closes", async () => {
    await mount(true);
    expect(document.activeElement).toBe(host!.querySelector("input[name=where]"));
    await act(async () => { [...host!.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.flag.cancel"])!.click(); });
    expect(host!.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });
  it("Send closes the form at once with a thank-you by the link; the check's answer replaces it when it comes", async () => {
    let answer: (value: { state: "WITH_A_PERSON" }) => void = () => undefined;
    const send = vi.fn(() => new Promise<{ state: "WITH_A_PERSON" }>((settle) => { answer = settle; }));
    await mount(true, send as never);
    await fill("The second path", "It names a private person's home.");
    expect(send).toHaveBeenCalledTimes(1);
    expect(host!.querySelector("form")).toBeNull();
    expect(line()).toBe(V4["v4.public.flag.thanks"]);
    expect(document.activeElement).toBe(toggle());
    await act(async () => { answer({ state: "WITH_A_PERSON" }); });
    expect(line()).toBe(V4["v4.public.flag.WITH_A_PERSON"]);
  });
  it("spaces only, or a claim too short: a short line under that box asks for more, and nothing is sent", async () => {
    const send = await mount(true);
    await fill("   ", "A long enough claim.");
    expect(send).not.toHaveBeenCalled();
    expect(host!.querySelector("[data-public-flag-more]")!.textContent).toBe(V4["v4.public.flag.whereMore"]);
    expect(document.activeElement).toBe(host!.querySelector("input[name=where]"));
    await fill("Here", "short     ");
    expect(send).not.toHaveBeenCalled();
    const more = [...host!.querySelectorAll("[data-public-flag-more]")].map((one) => one.textContent);
    expect(more).toEqual([V4["v4.public.flag.claimMore"]]);
    expect(host!.querySelector("textarea[name=claim]")!.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(host!.querySelector("textarea[name=claim]"));
  });
  it("a failed send says so, with the address, and keeps the words for another try", async () => {
    await mount(true, vi.fn(async () => { throw new Error("down"); }) as never);
    await fill("Here", "A long enough claim.");
    expect(line()).toContain("support@dezbatere.ro");
    await act(async () => { toggle().click(); });
    expect(host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!.value).toBe("A long enough claim.");
  });
  it("on the page, the one session read of the page decides: the flag reads no session of its own (public-f13)", async () => {
    const own = vi.fn(async () => undefined);
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => {
      root!.render(<V4PublicSessionProvider readSession={async () => { throw new Error("out"); }}><V4PublicFlag publicRef={REF} catalog={V4} readSession={own} /></V4PublicSessionProvider>);
    });
    await act(async () => { toggle().click(); });
    expect(own).not.toHaveBeenCalled();
    expect(host!.querySelector("[data-public-flag-signed-out]")).not.toBeNull();
  });
});

/*
 * public-f4 (owner screen review, 3 Nov): the link sits in the page's top bar (on a phone, in the bar's menu) and at the foot of each path, where the
 * form already names the path; the form opens as a small window on a computer and as a sheet from the bottom on a phone, never as loose lines.
 */
/*
 * Gap 4 of the DSA notices (Art 16(5)-(6)): what the reporter reads must be true whatever stopped the report. The server answers every refusal with
 * one state, so nothing about the limits leaks; each case below goes through the real press, and the line it ends on says that no person has read
 * the report and gives the routes, and never that a person will read it or that a check ran.
 */
describe("Report a problem: the reporter's line is true in each case (DSA Art 16(5)-(6))", () => {
  const debate = { question: "Should fares be free?" } as never;
  const judge = (verdict: string) => () => ({ providerRef: "provider-a", modelId: "model-a", complete: async () => ({
    text: JSON.stringify(verdict === "AGREE" ? { verdict, reason: "PERSONAL", quote: "Should fares be free?" } : { verdict, reason: null, quote: null }), usage: null }) }) as never;
  const ports = (opened: string, settled: string | null, verdict = "NOT_FOUND"): PublicFlagPorts => ({
    repository: { readTarget: async () => (opened === "NOT_PUBLIC" ? null : "22222222-2222-4222-8222-222222222222"), open: async () => opened as never },
    settlement: { settle: async () => settled as never },
    judge: judge(verdict), seal: async () => ({}) as never, readPublicDebate: async () => debate, limits: {} as never
  });
  const shared = "We have not acted on this report: it was stopped automatically, and no person has read it. If you think that is wrong, write to support@dezbatere.ro and a person will read it, or complain to office@dezbatere.ro within six months; you can also go to a certified out-of-court body or to court.";
  it.each([
    ["LIMITED (over the limit: nothing is stored, no check ran)", ports("LIMITED", null), shared],
    ["NOT_PUBLIC (a guessed or private debate)", ports("NOT_PUBLIC", null), shared],
    ["the check's NOT_FOUND", ports("CHECK", "NOT_FOUND"), shared],
    ["HIDDEN (the check agreed; no person was involved)", ports("CHECK", "HIDDEN", "AGREE"), "Thank you. An automatic check agreed with your report and hid this debate, with no person involved. A person will now review it."]
  ])("%s", async (_case, given, words) => {
    const send = vi.fn(async (publicRef: string, body: { where: string; claim: string }) => ({
      state: await pressPublicFlag({ ownerRef: "33333333-3333-4333-8333-333333333333", publicationRef: publicRef, flagId: "44444444-4444-4444-8444-444444444444", ...body }, given) }));
    await mount(true, send as never);
    await fill("The question", "It names a private person in its words.");
    expect(line()).toBe(words);
    expect(line()).not.toMatch(/limit|report again/iu);
    if (words === shared) expect(line()).not.toMatch(/a person will read this|didn't find/iu);
  });
});

describe("Report a problem: where it sits and how its form opens (public-f4)", () => {
  const css = readFileSync(resolve(process.cwd(), "apps/ui/app/public/debate/[id]/public-lane.css"), "utf8");
  it("at the foot of a path, the form already names that path, and the person can still change it", async () => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    const send = vi.fn(async () => ({ state: "WITH_A_PERSON" as const }));
    await act(async () => { root!.render(<V4PublicFlag publicRef={REF} catalog={V4} where="Better service first" placement="foot" send={send as never} readSession={async () => undefined} />); });
    expect(host.querySelector("[data-public-flag]")!.getAttribute("data-placement")).toBe("foot");
    await act(async () => { toggle().click(); });
    const where = host.querySelector<HTMLInputElement>("input[name=where]")!;
    expect(where.value).toBe("Better service first");
    expect(toggle().getAttribute("aria-controls")).toBe(host.querySelector(".v4PubFlagPanel")!.id);
    await act(async () => { set(host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!, "It names a private person's home."); goodFaith().click(); });
    await act(async () => { host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(send).toHaveBeenCalledWith(REF, { where: "Better service first", claim: "It names a private person's home.", good_faith: true });
    // After sending, the next report on this path starts from the path's name again.
    await act(async () => { toggle().click(); });
    expect(host.querySelector<HTMLInputElement>("input[name=where]")!.value).toBe("Better service first");
  });

  it("the form is a window held to its link on a computer and a sheet from the bottom on a phone, styled, never loose lines", async () => {
    await mount(true);
    const panel = host!.querySelector(".v4PubFlagPanel")!;
    // ACCESS-12: a dialog, named, with the page behind covered (its own test is below).
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.querySelector("form.v4PubFlagForm")).not.toBeNull();
    expect(panel.querySelectorAll(".v4PubText")).toHaveLength(2);
    expect(css).toMatch(/\.v4PubFlagPanel \{[^}]*position: absolute;[^}]*box-shadow: var\(--shadow-pop\);/u);
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/\.v4PubFlagPanel, \.v4PubFlag-foot \.v4PubFlagPanel \{[^}]*position: fixed;[^}]*bottom: 0;/u);
    // Nothing moves: the window and the sheet appear at once.
    expect(css.slice(css.indexOf("public-f4: \"Report a problem\" in the top bar"))).not.toMatch(/animation|transition|@keyframes/u);
  });

  it("in the top bar, a phone folds the link into the bar's menu; Escape closes an open form first, then the menu", async () => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => {
      root!.render(<V4PublicTopMenu catalog={V4}><V4PublicFlag publicRef={REF} catalog={V4} placement="top" readSession={async () => undefined} /></V4PublicTopMenu>);
    });
    const menu = host.querySelector("[data-public-top-menu]")!;
    const button = menu.querySelector<HTMLButtonElement>(".v4PubTopMenuButton")!;
    expect(button.textContent).toContain(V4["v4.public.menu"]);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(menu.querySelector(`#${CSS.escape(button.getAttribute("aria-controls")!)}`)!.contains(toggle())).toBe(true);
    await act(async () => { button.click(); });
    expect(menu.getAttribute("data-open")).toBe("true");
    await act(async () => { toggle().click(); });
    const field = host.querySelector<HTMLInputElement>("input[name=where]")!;
    await act(async () => { field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(host.querySelector("form")).toBeNull();
    expect(menu.getAttribute("data-open")).toBe("true");
    expect(document.activeElement).toBe(toggle());
    await act(async () => { toggle().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(menu.getAttribute("data-open")).toBe("false");
    expect(document.activeElement).toBe(button);
    // On a computer the button is hidden and the link sits in the bar; on a phone the link waits in the menu.
    expect(css).toMatch(/\.v4PubTopMenuButton \{ display: none; \}/u);
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/\.v4PubTopMenuItems \{ display: none; \}/u);
    expect(phone).toMatch(/\.v4PubTopMenu\[data-open="true"\] \.v4PubTopMenuItems \{/u);
  });

  describe("ACCESS-12 (the wave-2 checks): the form is a dialog, in the top bar's menu and at the foot of a question", () => {
    const cases = [
      ["top", (flag: React.ReactElement) => <V4PublicTopMenu catalog={V4}>{flag}</V4PublicTopMenu>],
      ["foot", (flag: React.ReactElement) => <div className="v4PubFoot">{flag}</div>]
    ] as const;
    async function open(placement: "top" | "foot"): Promise<HTMLElement> {
      host = document.body.appendChild(document.createElement("div"));
      root = createRoot(host);
      const wrap = cases.find(([name]) => name === placement)![1];
      await act(async () => {
        root!.render(<>
          <button type="button" data-before="">Before</button>
          {wrap(<V4PublicFlag publicRef={REF} catalog={V4} placement={placement} where="The first path" readSession={async () => undefined} />)}
          <button type="button" data-after="">After</button>
        </>);
      });
      const menuButton = host.querySelector<HTMLButtonElement>(".v4PubTopMenuButton");
      if (menuButton !== null) await act(async () => { menuButton.click(); });
      toggle().focus();
      await act(async () => { toggle().click(); });
      await act(async () => { for (let turn = 0; turn < 4; turn += 1) await Promise.resolve(); });
      return host.querySelector<HTMLElement>(".v4PubFlagPanel")!;
    }
    const tab = async (shift = false): Promise<void> => {
      await act(async () => {
        (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));
      });
    };

    for (const [placement] of cases) {
      it(`${placement}: named, modal, focus inside; Tab and Shift+Tab wrap; the page behind is hidden from screen readers`, async () => {
        const panel = await open(placement);
        expect(panel.getAttribute("role")).toBe("dialog");
        expect(panel.getAttribute("aria-modal")).toBe("true");
        expect(panel.getAttribute("aria-label")).toBe(V4["v4.public.report"]);
        const where = panel.querySelector<HTMLInputElement>("input[name=where]")!;
        expect(document.activeElement).toBe(where);
        // The page behind is hidden from screen readers while it is open.
        expect(host!.querySelector("[data-before]")!.getAttribute("aria-hidden")).toBe("true");
        expect(host!.querySelector("[data-after]")!.getAttribute("aria-hidden")).toBe("true");
        // Tab past Cancel comes back to the first box; Shift+Tab from it goes to Cancel: focus never leaves the form.
        const cancel = [...panel.querySelectorAll("button")].find((one) => one.textContent === V4["v4.public.flag.cancel"])!;
        cancel.focus();
        await tab();
        expect(document.activeElement).toBe(where);
        await tab(true);
        expect(document.activeElement).toBe(cancel);
        expect(panel.contains(document.activeElement)).toBe(true);
      });

      it(`${placement}: Escape, Cancel or a click on the cover beside it closes it and gives focus back to the link; the page comes back`, async () => {
        let panel = await open(placement);
        await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
        expect(host!.querySelector(".v4PubFlagPanel")).toBeNull();
        expect(document.activeElement).toBe(toggle());
        expect(toggle().getAttribute("aria-expanded")).toBe("false");
        expect(host!.querySelector("[data-before]")!.hasAttribute("aria-hidden")).toBe(false);
        // A click on the cover beside it (the page behind cannot be pressed while it is open).
        toggle().focus();
        await act(async () => { toggle().click(); });
        panel = host!.querySelector<HTMLElement>(".v4PubFlagPanel")!;
        expect(panel).not.toBeNull();
        const scrim = host!.querySelector<HTMLElement>("[data-public-flag-scrim]")!;
        await act(async () => { scrim.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); scrim.click(); });
        expect(host!.querySelector(".v4PubFlagPanel")).toBeNull();
        expect(document.activeElement).toBe(toggle());
        // In the top bar's menu the cover is inside the menu, so the menu stays open with focus on the link.
        const menu = host!.querySelector("[data-public-top-menu]");
        if (menu !== null) expect(menu.getAttribute("data-open")).toBe("true");
      });
    }

    it("the second browser check: a press on the cover keeps focus in the form until the click, and focus going to the page's <main> keeps the menu open", async () => {
      await open("top");
      const scrim = host!.querySelector<HTMLElement>("[data-public-flag-scrim]")!;
      const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => { scrim.dispatchEvent(press); });
      expect(press.defaultPrevented).toBe(true);
      const menu = host!.querySelector<HTMLElement>("[data-public-top-menu]")!;
      await act(async () => { scrim.click(); });
      expect(document.activeElement).toBe(toggle());
      // A click on plain text gives focus to the page's <main> (it can take focus for the skip link), which holds the menu.
      const main = host!;
      main.tabIndex = -1;
      await act(async () => { main.focus(); });
      expect(menu.getAttribute("data-open")).toBe("true");
    });

    it("the cover dims the page behind the phone's sheet and is clear beside the computer's window; nothing moves", () => {
      expect(css).toMatch(/\.v4PubFlagScrim \{ position: fixed; inset: 0; z-index: 59; background: transparent; \}/u);
      const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
      expect(phone).toMatch(/\.v4PubFlagScrim \{ background: var\(--scrim\); \}/u);
    });
  });

  it("ACCESS-12 (the wave-2 checks): the bar's menu also closes on a click outside it and when focus moves out of it", async () => {
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    const outside = document.body.appendChild(document.createElement("button"));
    try {
      await act(async () => {
        root!.render(<V4PublicTopMenu catalog={V4}><V4PublicFlag publicRef={REF} catalog={V4} placement="top" readSession={async () => undefined} /></V4PublicTopMenu>);
      });
      const menu = host.querySelector("[data-public-top-menu]")!;
      const button = menu.querySelector<HTMLButtonElement>(".v4PubTopMenuButton")!;
      await act(async () => { button.click(); });
      expect(menu.getAttribute("data-open")).toBe("true");
      // A click inside keeps it open; one outside closes it.
      await act(async () => { toggle().dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
      expect(menu.getAttribute("data-open")).toBe("true");
      await act(async () => { outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
      expect(menu.getAttribute("data-open")).toBe("false");
      // Focus moving out of it closes it too.
      await act(async () => { button.click(); });
      button.focus();
      await act(async () => { outside.focus(); });
      expect(menu.getAttribute("data-open")).toBe("false");
    } finally {
      outside.remove();
    }
  });
});

/*
 * RC-1 and RC-2 (the checks of the last fixes, 4 Nov): a small box that opens from a control in the public page's top bar
 * stays on screen wherever the header has put that control. The phone's menu: the Menu button sits at the start of the
 * bar's second row at about 467 px and below, but beside the brand, near the end side, from about 468 to 767 px (landscape
 * phones, small tablets), where a box held to its start edge ran about 60 px off the screen. The computer bar's "Link
 * copied." line also says "We couldn't copy the link…" (57 characters), which ran past the window's edge on one line.
 * The page measures which half of the window the control sits in and holds the box to the edge that opens it toward
 * the room (lib/v4/useOpenSide.ts), in both reading directions.
 */
describe("RC-1 / RC-2: the top bar's menu and Copy link's line open toward the room, at every width and in both directions", () => {
  const css = readFileSync(resolve(process.cwd(), "apps/ui/app/public/debate/[id]/public-lane.css"), "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
  const innerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  afterEach(() => { Object.defineProperty(window, "innerWidth", innerWidth); });
  const rect = (left: number, width: number): DOMRect =>
    ({ left, right: left + width, width, top: 70, bottom: 114, height: 44, x: left, y: 70, toJSON: () => ({}) }) as DOMRect;
  /** A window `width` wide, laid out in `dir`. */
  function windowOf(width: number, dir: "ltr" | "rtl"): HTMLDivElement {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    host = document.body.appendChild(document.createElement("div"));
    host.setAttribute("dir", dir);
    root = createRoot(host);
    return host;
  }

  it.each([
    // [window width, the Menu button's left edge, direction, the edge the open box is held to]
    // Two rows (about 467 px and below): Menu starts the second row, so the box opens toward the end side.
    [375, 16, "ltr", "start"],
    [430, 16, "ltr", "start"],
    [375, 275, "rtl", "start"],
    // One row (about 468 to 767 px): Menu sits near the end side, so the box opens toward the start side (it ran ~60 px off).
    [600, 440, "ltr", "end"],
    [767, 607, "ltr", "end"],
    [600, 76, "rtl", "end"],
    [767, 76, "rtl", "end"]
  ] as const)("%i px, Menu at x %i (%s): the box is held to the button's %s edge", async (width, left, dir, side) => {
    windowOf(width, dir);
    await act(async () => { root!.render(<V4PublicTopMenu catalog={V4}><span>Copy link</span></V4PublicTopMenu>); });
    const menu = host!.querySelector<HTMLElement>("[data-public-top-menu]")!;
    const button = menu.querySelector<HTMLButtonElement>(".v4PubTopMenuButton")!;
    button.getBoundingClientRect = () => rect(left, 84);
    await act(async () => { button.click(); });
    expect(menu.getAttribute("data-open")).toBe("true");
    expect(menu.getAttribute("data-side")).toBe(side);
  });

  it("a window that changes size while the menu is open (a phone turned) is measured again", async () => {
    windowOf(375, "ltr");
    await act(async () => { root!.render(<V4PublicTopMenu catalog={V4}><span>Copy link</span></V4PublicTopMenu>); });
    const menu = host!.querySelector<HTMLElement>("[data-public-top-menu]")!;
    const button = menu.querySelector<HTMLButtonElement>(".v4PubTopMenuButton")!;
    button.getBoundingClientRect = () => rect(16, 84);
    await act(async () => { button.click(); });
    expect(menu.getAttribute("data-side")).toBe("start");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 667 });
    button.getBoundingClientRect = () => rect(507, 84);
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    expect(menu.getAttribute("data-side")).toBe("end");
  });

  it("the phone's open box has no fixed side of its own: it takes the measured one, within the window's gutters", () => {
    const open = /\.v4PubTopMenu\[data-open="true"\] \.v4PubTopMenuItems \{([^}]*)\}/u.exec(phone)![1]!;
    expect(open).toMatch(/position: absolute;/u);
    expect(open).not.toMatch(/inset-inline-(?:start|end)/u);
    expect(open).toMatch(/max-width: calc\(100vw - 2 \* var\(--v4-gutter\)\);/u);
    expect(phone).toMatch(/\.v4PubTopMenu\[data-side="start"\] \.v4PubTopMenuItems \{ inset-inline-start: 0; \}/u);
    expect(phone).toMatch(/\.v4PubTopMenu\[data-side="end"\] \.v4PubTopMenuItems \{ inset-inline-end: 0; \}/u);
  });

  it.each([
    // [window width, Copy link's left edge, direction, the edge its line is held to]
    [1280, 982, "ltr", "end"],
    [768, 460, "ltr", "end"],
    [1280, 228, "rtl", "end"],
    // The header wrapped (the flag's thank-you line beside its link on a narrow computer): Copy link starts the second row.
    [800, 32, "ltr", "start"],
    [800, 698, "rtl", "start"]
  ] as const)("Copy link's line at %i px, the link at x %i (%s): held to the link's %s edge", async (width, left, dir, side) => {
    windowOf(width, dir);
    const writeText = vi.fn(async () => { throw new Error("denied"); });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await act(async () => { root!.render(<span className="v4PubCopyLink"><V4CopyLink href={`/public/debate/${REF}`} catalog={V4} /></span>); });
    const link = host!.querySelector<HTMLButtonElement>("[data-public-copy-link]")!;
    link.getBoundingClientRect = () => rect(left, 70);
    await act(async () => { link.click(); });
    await act(async () => { for (let turn = 0; turn < 4; turn += 1) await Promise.resolve(); });
    const said = host!.querySelector<HTMLElement>(".v4PublicMarkCopied")!;
    expect(said.textContent).toBe(V4["v4.publicMark.copyFailed"]);
    expect(said.getAttribute("data-side")).toBe(side);
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("on a computer the line sits under the link and wraps within the window: never one long line past its edge", () => {
    const wide = css.slice(css.indexOf("@media (min-width: 768px)"), css.indexOf("@media (max-width: 767px)"));
    const said = /\.v4PubCopyLink > \.v4PublicMarkCopied \{([^}]*)\}/u.exec(wide)![1]!;
    expect(said).toMatch(/position: absolute;/u);
    expect(said).not.toMatch(/nowrap|inset-inline-(?:start|end)/u);
    expect(said).toMatch(/width: max-content;/u);
    expect(said).toMatch(/max-width: min\(26rem, calc\(100vw - 2 \* var\(--v4-gutter\)\)\);/u);
    // It lies over the header's foot only: a click there still reaches what is under it.
    expect(said).toMatch(/pointer-events: none;/u);
    expect(wide).toMatch(/\.v4PubCopyLink > \.v4PublicMarkCopied\[data-side="start"\] \{ inset-inline-start: 0; \}/u);
    expect(wide).toMatch(/\.v4PubCopyLink > \.v4PublicMarkCopied\[data-side="end"\] \{ inset-inline-end: 0; \}/u);
  });
});
