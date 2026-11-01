// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { V4PublicFlag } from "../../apps/ui/components/v4/V4PublicFlag.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => <a href={href} className={className}>{children as never}</a> }));
/** Decision 35, the button: signed out it offers sign-in and the address; signed in, a bound report and one line back. */
const V4 = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const REF = "11111111-1111-4111-8111-111111111111";
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
async function mount(signedIn: boolean, send = vi.fn(async () => ({ state: "NOT_FOUND" as const }))) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => { root!.render(<V4PublicFlag publicRef={REF} catalog={V4} send={send as never} readSession={async () => { if (!signedIn) throw new Error("out"); }} />); });
  await act(async () => { host!.querySelector<HTMLButtonElement>("[data-public-report]")!.click(); });
  return send;
}
async function fill(where: string, claim: string) {
  host!.querySelector<HTMLInputElement>("input[name=where]")!.value = where;
  host!.querySelector<HTMLTextAreaElement>("textarea[name=claim]")!.value = claim;
  await act(async () => { host!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

describe("Report on a public page", () => {
  it("signed out: sign-in back to this page and the address; no form, and nothing is sent", async () => {
    const send = await mount(false);
    const line = host!.querySelector("[data-public-flag-signed-out]")!;
    expect(line.textContent).toContain("support@dezbatere.ro");
    expect(line.querySelector("a")!.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/public/debate/${REF}`)}`);
    expect(host!.querySelector("form")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([["NOT_FOUND", "An automatic check didn't find this. You can report again with more details, and a person will read it."], ["HIDDEN", V4["v4.public.flag.HIDDEN"]], ["WITH_A_PERSON", V4["v4.public.flag.WITH_A_PERSON"]]] as const)("signed in, %s: its one line, word for word", async (state, words) => {
    const send = await mount(true, vi.fn(async () => ({ state })) as never);
    await fill("The first path", "It names a private person's home.");
    expect(send).toHaveBeenCalledWith(REF, { where: "The first path", claim: "It names a private person's home." });
    expect(host!.querySelector("[data-public-flag-line]")!.textContent).toBe(words);
  });
  it("a claim too short sends nothing; a failed send says so, with the address", async () => {
    const send = await mount(true, vi.fn(async () => { throw new Error("down"); }) as never);
    await fill("Here", "short");
    expect(send).not.toHaveBeenCalled();
    await fill("Here", "A long enough claim.");
    expect(host!.querySelector("[data-public-flag-line]")!.textContent).toContain("support@dezbatere.ro");
  });
});
