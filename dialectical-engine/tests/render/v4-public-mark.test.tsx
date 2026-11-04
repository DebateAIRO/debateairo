// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buttonNamed, CATALOG, click, harness, mountMap, openPath, page, panel, PATHS, resetHarness, settle, tray, typeInto, unmountMap
} from "./v4-debate-harness.js";

/*
 * V4 screen review (owner picks 3 Nov 2026): a debate with a public page says so under its question, in one small grey line with a globe mark:
 * "Public · See its page · Copy link" (journey-f20, public-f26; on a phone the share sheet), or the stage before or after the check once the server says
 * it; and before the person's own words go on that page, "This will be public." under the own-view box and "This adds to your public debate." in the tray.
 * A private debate (PRIVATE, or a read that fails) shows none of it: the page never guesses Free or paid.
 */
const visibility = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/api", async (original) => {
  const real = await original<Record<string, unknown> & { contractClient: Record<string, unknown> }>();
  return { ...real, contractClient: { ...real.contractClient, readRunVisibility: (...args: unknown[]) => visibility.read(...args) } };
});
vi.mock("@/components/AuthGate", async () => (await import("./v4-debate-harness.js")).authGateMock);
vi.mock("@/components/v4/V4Header", async () => (await import("./v4-debate-harness.js")).headerMock);
vi.mock("@/components/billing/RoomNotice", async () => (await import("./v4-debate-harness.js")).roomNoticeMock);
vi.mock("@/lib/v4/useV4Ask", async () => (await import("./v4-debate-harness.js")).useV4AskMock);
vi.mock("@/lib/v4/load", async (original) => (await import("./v4-debate-harness.js")).loadMock(await original()));
vi.mock("@/lib/v4/digIndex", async (original) => (await import("./v4-debate-harness.js")).digIndexMock(await original()));
vi.mock("@/lib/v4/accountMemory", async (original) => (await import("./v4-debate-harness.js")).accountMemoryMock(await original()));
vi.mock("@/lib/v4/money", async (original) => (await import("./v4-debate-harness.js")).moneyMock(await original()));

import { V4PublicMark, V4PublicMarkFor } from "../../apps/ui/components/v4/V4PublicMark.js";
import type { PublicStage } from "../../apps/ui/lib/v4/publicState.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REF = "f1000000-0000-4000-8000-000000000001";
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const flush = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); };
async function show(stage: PublicStage | null): Promise<HTMLDivElement> {
  if (host === null) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(<V4PublicMark stage={stage} catalog={CATALOG} />));
  return host;
}
const line = (): HTMLElement | null => host!.querySelector(".v4PublicMark");
const clipboard = { writeText: vi.fn() };

beforeEach(() => {
  clipboard.writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  visibility.read = vi.fn(async () => ({ state: "PRIVATE", public_ref: null }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(window, "matchMedia");
});

describe("the globe line", () => {
  it("nothing for a private debate", async () => {
    await show(null);
    expect(line()).toBeNull();
  });

  it("public: \"Public · See its page · Copy link\"; Copy link copies the page's own address and says so", async () => {
    await show({ kind: "PUBLIC", publicRef: REF });
    expect(line()!.textContent).toBe("Public · See its page · Copy link");
    expect(line()!.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(line()!.querySelector("a")!.getAttribute("href")).toBe(`/public/debate/${REF}`);
    await act(async () => { buttonNamed(CATALOG["v4.publicMark.copyLink"]!, host!).click(); });
    await flush();
    expect(clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/public/debate/${REF}`);
    expect(line()!.querySelector("[role=status]")!.textContent).toBe(CATALOG["v4.publicMark.linkCopied"]);
    clipboard.writeText = vi.fn(async () => { throw new Error("denied"); });
    await act(async () => { buttonNamed(CATALOG["v4.publicMark.copyLink"]!, host!).click(); });
    await flush();
    expect(line()!.querySelector("[role=status]")!.textContent).toBe(CATALOG["v4.publicMark.copyFailed"]);
  });

  it("on a phone, Copy link opens the phone's own share sheet; closing the sheet says nothing", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(window, "matchMedia", { value: (query: string) => ({ matches: query === "(pointer: coarse)" }), configurable: true });
    await show({ kind: "PUBLIC", publicRef: REF });
    await act(async () => { buttonNamed(CATALOG["v4.publicMark.copyLink"]!, host!).click(); });
    await flush();
    expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/public/debate/${REF}` });
    expect(clipboard.writeText).not.toHaveBeenCalled();
    const closed = Object.assign(new Error("closed"), { name: "AbortError" });
    Object.defineProperty(navigator, "share", { value: vi.fn(async () => { throw closed; }), configurable: true });
    await act(async () => { buttonNamed(CATALOG["v4.publicMark.copyLink"]!, host!).click(); });
    await flush();
    expect(line()!.querySelector("[role=status]")!.textContent).toBe("");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("the stages before and after the check, once the server says them; a change shows at once with the 1-second highlight", async () => {
    await show({ kind: "WILL_BE_PUBLIC" });
    expect(line()!.textContent).toBe(CATALOG["v4.publicMark.WILL_BE_PUBLIC"]);
    expect(line()!.getAttribute("role")).toBe("status");
    expect(line()!.classList.contains("v4Highlight")).toBe(false);
    await show({ kind: "BEING_CHECKED" });
    expect(line()!.textContent).toBe(CATALOG["v4.publicMark.BEING_CHECKED"]);
    expect(line()!.classList.contains("v4Highlight")).toBe(true);
    await show({ kind: "KEPT_PRIVATE" });
    expect(line()!.textContent).toBe(CATALOG["v4.publicMark.KEPT_PRIVATE"]);
  });

  it("a page that only knows the debate (the report) reads its state itself", async () => {
    visibility.read = vi.fn(async () => ({ state: "PUBLISHED", public_ref: REF }));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<V4PublicMarkFor runId="11111111-1111-4111-8111-111111111111" catalog={CATALOG} />));
    await flush();
    expect(visibility.read).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(line()!.getAttribute("data-public-stage")).toBe("PUBLIC");
    await act(async () => root!.render(<V4PublicMarkFor runId={null} catalog={CATALOG} />));
    expect(line()).toBeNull();
  });
});

describe("on the map", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetHarness();
  });
  afterEach(async () => {
    await unmountMap();
    vi.useRealTimers();
  });

  it("a public debate: the line under the question, \"This will be public.\" under the own-view box, the tray says it adds to the public debate", async () => {
    visibility.read = vi.fn(async () => ({ state: "PUBLISHED", public_ref: REF }));
    const runId = await mountMap();
    await settle();
    expect(visibility.read).toHaveBeenCalledWith(runId);
    const mark = page().querySelector(".v4PublicMark")!;
    expect(mark.textContent).toBe("Public · See its page · Copy link");
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    expect(panel().querySelector("[data-public-will-be]")!.textContent).toBe("This will be public.");
    await typeInto(panel().querySelector<HTMLTextAreaElement>(".v4SugEditor textarea")!, "Pumped hydro could carry a windless week.");
    await click(buttonNamed(CATALOG["v4.suggest.ownViewAdd"]!, panel()));
    // dig-f4: the tray shows from the second pick; with two it says the dig adds to the public debate (public-f26).
    await click(panel().querySelector<HTMLInputElement>(".v4Sugs input[type=checkbox]")!);
    expect(tray()!.textContent).toContain("This adds to your public debate.");
  });

  it("a private debate, or a read that fails: no line, nothing said about going public", async () => {
    await mountMap();
    await settle();
    expect(page().querySelector(".v4PublicMark")).toBeNull();
    await unmountMap();
    visibility.read = vi.fn(async () => { throw new Error("offline"); });
    await mountMap();
    await settle();
    expect(page().querySelector(".v4PublicMark")).toBeNull();
    await openPath(PATHS.renew);
    await click(buttonNamed(CATALOG["v4.suggest.ownView"]!, panel()));
    expect(panel().querySelector("[data-public-will-be]")).toBeNull();
    expect(harness.submit).not.toHaveBeenCalled();
  });
});
