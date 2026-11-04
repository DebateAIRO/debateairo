// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { V4PublicFlag } from "../../apps/ui/components/v4/V4PublicFlag.js";
import { V4PublicSessionProvider } from "../../apps/ui/components/v4/V4PublicSession.js";
import { V4PublicTopMenu } from "../../apps/ui/components/v4/V4PublicPage.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));
/**
 * Decision 35, the button: signed out it offers sign-in and the address; signed in, a bound report and one line back. Owner screen review (3 Nov):
 * the label is "Report a problem" (r2-14); the form closes at once with a thank-you and the answer replaces it later in the same quiet line (public-f5);
 * a box left too short asks for a little more; focus goes into the form and back to the link; the "didn't find this" line gives the address (r2-15).
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
async function fill(where: string, claim: string) {
  await act(async () => {
    set(host!.querySelector<HTMLInputElement>("input[name=where]")!, where);
    set(host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!, claim);
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
    ["NOT_FOUND", "An automatic check didn't find this. You can report again with more details, and a person will read it. You can also write to support@dezbatere.ro."],
    ["HIDDEN", V4["v4.public.flag.HIDDEN"]],
    ["WITH_A_PERSON", V4["v4.public.flag.WITH_A_PERSON"]]
  ] as const)("signed in, %s: its one line, word for word", async (state, words) => {
    const send = await mount(true, vi.fn(async () => ({ state })) as never);
    await fill("The first path", "It names a private person's home.");
    expect(send).toHaveBeenCalledWith(REF, { where: "The first path", claim: "It names a private person's home." });
    expect(line()).toBe(words);
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
    await act(async () => { set(host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!, "It names a private person's home."); });
    await act(async () => { host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(send).toHaveBeenCalledWith(REF, { where: "Better service first", claim: "It names a private person's home." });
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
