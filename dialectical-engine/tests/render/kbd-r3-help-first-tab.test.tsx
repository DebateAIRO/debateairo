// @vitest-environment jsdom
/*
 * Keyboard audit round 3 (2026-11-12), seen in a real browser: on /help the first Tab after the page loaded landed in
 * the message box. The skip link, the page's header and the whole "Browse by topic" list were stepped over, and could
 * only be reached backwards. The cause: the page called `scrollIntoView()` on the end of the conversation as it
 * loaded, and Chrome starts Tab from the last place a page scrolled to when nothing has focus. At load nothing has
 * been added to the conversation, so there is nothing to follow: the page no longer scrolls then. jsdom has no
 * `scrollIntoView` and no such rule, so the call itself is what is pinned here.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assistant, type SupportAssistantClient } from "../../apps/ui/components/support/Assistant.js";

const SESSION = Object.freeze({ sessionId: "first-tab-session", token: "first-tab-token", identityBound: false });
let root: Root | null = null;
const scrollIntoView = vi.fn();

function client(): SupportAssistantClient {
  return Object.freeze({
    createSession: vi.fn().mockResolvedValue(SESSION),
    sendMessage: vi.fn().mockResolvedValue({
      messageId: "answer", outcome: "ANSWER_GROUNDED", text: "A grounded reply.",
      sources: [{ id: "app-navigation", label: "Navigate Dialectical Engine" }], actions: []
    }),
    rate: vi.fn().mockResolvedValue(null),
    escalate: vi.fn().mockResolvedValue({ token: "case", text: "Case opened." })
  });
}

async function settle(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
}

describe("/help: the page does not scroll to the conversation's end as it loads", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    scrollIntoView.mockClear();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    vi.unstubAllGlobals();
  });

  it("nothing is scrolled to at load, so Tab starts from the top of the page", async () => {
    await act(async () => root!.render(<Assistant fullPage client={client()} />));
    await settle();
    expect(document.querySelector("[data-support-conversation-end]")).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a reply that is added is still followed", async () => {
    await act(async () => root!.render(<Assistant fullPage client={client()} />));
    await settle();
    const input = document.querySelector<HTMLInputElement>('input[name="support-message"]')!;
    input.value = "Where is Help?";
    await act(async () => { document.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await settle();
    expect(document.body.textContent).toContain("A grounded reply.");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "end", behavior: "smooth" });
  });
});
