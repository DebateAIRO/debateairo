// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup.js";

import {
  Assistant, type SupportAssistantClient
} from "../../apps/ui/components/support/Assistant.js";

/**
 * Keyboard-only check (2026-10-17, re-checked 2026-10-22): pressing one of Help's suggested
 * questions sends it, and every suggestion is disabled until the answer arrives. The pressed one
 * held keyboard focus, so the browser dropped focus to the page and the next Tab started from the
 * top of the document. Pressing a suggestion now puts focus in the message field — where the
 * conversation goes on, and where a topic already puts it — while the suggestions and Send stay
 * disabled, so the pending state is still conveyed.
 */

const SESSION = Object.freeze({ sessionId: "kbd-session", token: "kbd-token", identityBound: false });
type ClientReply = Awaited<ReturnType<SupportAssistantClient["sendMessage"]>>;

let root: Root | null = null;
let uninstallFocusFixup: (() => void) | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

/** A client whose answer waits until the test releases it. */
function pendingClient(): Readonly<{ client: SupportAssistantClient; answer: () => void }> {
  let release: (reply: ClientReply) => void = () => undefined;
  const reply = new Promise<ClientReply>((resolve) => { release = resolve; });
  const client: SupportAssistantClient = Object.freeze({
    createSession: vi.fn().mockResolvedValue(SESSION),
    sendMessage: vi.fn().mockReturnValue(reply),
    rate: vi.fn().mockResolvedValue(null),
    escalate: vi.fn().mockResolvedValue({ token: "case", text: "Case opened." })
  });
  return { client, answer: () => release({ messageId: "kbd-answer", outcome: "NO_SOURCE", text: "No source." }) };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uninstallFocusFixup = installFocusFixup();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  uninstallFocusFixup?.();
  uninstallFocusFixup = null;
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("keyboard: Help's suggested questions", () => {
  it("pressing a suggestion keeps focus off the page while the answer is pending, and after it", async () => {
    const { client, answer } = pendingClient();
    await act(async () => root!.render(<Assistant fullPage client={client} />));
    await settle();
    const input = document.querySelector<HTMLInputElement>("#support-message")!;
    const suggestions = () => [...document.querySelectorAll<HTMLButtonElement>(".supportSuggestions button")];
    expect(suggestions().length).toBeGreaterThan(0);
    const pressed = suggestions()[1]!;

    await act(async () => pressed.focus());
    await act(async () => pressed.click());
    await settle();

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(suggestions().every((button) => button.disabled), "the suggestions are busy while pending").toBe(true);
    expect(document.querySelector<HTMLButtonElement>("button.supportSend")!.disabled, "Send is busy too").toBe(true);
    expect(document.activeElement, "focus is not dropped to the page").not.toBe(document.body);
    expect(document.activeElement).toBe(input);
    expect(input.value, "the composer is not primed with the suggestion").toBe("");

    await act(async () => answer());
    await settle();

    expect(suggestions().every((button) => !button.disabled)).toBe(true);
    expect(document.activeElement, "focus stays in the message field").toBe(input);
  });
});
