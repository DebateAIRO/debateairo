// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { V4PublicFlag } from "../../apps/ui/components/v4/V4PublicFlag.js";
import { V4PublicSessionProvider } from "../../apps/ui/components/v4/V4PublicSession.js";

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
