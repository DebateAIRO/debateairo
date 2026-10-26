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
type ClientCase = Awaited<ReturnType<SupportAssistantClient["escalate"]>>;

let root: Root | null = null;
let uninstallFocusFixup: (() => void) | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

/** A client whose answer, and whose escalation, wait until the test releases them. */
function pendingClient(): Readonly<{ client: SupportAssistantClient; answer: () => void; open: () => void }> {
  let release: (reply: ClientReply) => void = () => undefined;
  const reply = new Promise<ClientReply>((resolve) => { release = resolve; });
  let releaseCase: (opened: ClientCase) => void = () => undefined;
  const opened = new Promise<ClientCase>((resolve) => { releaseCase = resolve; });
  const client: SupportAssistantClient = Object.freeze({
    createSession: vi.fn().mockResolvedValue(SESSION),
    sendMessage: vi.fn().mockReturnValue(reply),
    rate: vi.fn().mockResolvedValue(null),
    escalate: vi.fn().mockReturnValue(opened)
  });
  return {
    client,
    answer: () => release({ messageId: "kbd-answer", outcome: "NO_SOURCE", text: "No source." }),
    open: () => releaseCase({ token: "case", text: "Case opened." })
  };
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

/**
 * Keyboard-only check (2026-10-22 follow-up): Send and both "talk to a person" buttons are disabled while their
 * request runs, so the pressed one dropped keyboard focus to the page. Each now puts focus in the message field —
 * where the reply or the opened case is followed up — while the buttons stay disabled, so busy is still conveyed.
 */
describe("keyboard: Help's Send and Talk to a person", () => {
  it("pressing Send keeps focus in the message field while the answer is pending, and after it", async () => {
    const { client, answer } = pendingClient();
    await act(async () => root!.render(<Assistant fullPage client={client} />));
    await settle();
    const input = document.querySelector<HTMLInputElement>("#support-message")!;
    const send = document.querySelector<HTMLButtonElement>("button.supportSend")!;
    input.value = "How do I export my data?";

    await act(async () => send.focus());
    await act(async () => send.click());
    await settle();

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(send.disabled, "Send is busy while pending").toBe(true);
    expect(document.activeElement, "focus is not dropped to the page").not.toBe(document.body);
    expect(document.activeElement).toBe(input);

    await act(async () => answer());
    await settle();

    expect(send.disabled).toBe(false);
    expect(document.activeElement, "focus stays in the message field").toBe(input);
  });

  // synthesis-flag S05 (merged with origin/dev d78d58b4f, 2026-10-26): Help opens no case. The page's "Need a person"
  // card is the support address as a mail link, and the widget's Talk to a person shows that address in place; neither
  // is ever disabled, so neither can drop keyboard focus to the page while something is pending.
  it("the page's Need a person card is a mail link to the support address, and opens no case", async () => {
    const { client } = pendingClient();
    await act(async () => root!.render(<Assistant fullPage client={client} />));
    await settle();
    const card = document.querySelector<HTMLElement>(".supportEscalation")!;

    expect(card.querySelector("button"), "no case button").toBeNull();
    const mail = card.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!;
    expect(mail).not.toBeNull();
    await act(async () => mail.focus());
    expect(document.activeElement).toBe(mail);
    expect(client.escalate).not.toHaveBeenCalled();
  });

  it("pressing the widget's Talk to a person keeps focus on it and shows the support address, opening no case", async () => {
    const { client } = pendingClient();
    await act(async () => root!.render(<Assistant client={client} />));
    await settle();
    const human = document.querySelector<HTMLButtonElement>("button.supportEscalateCompact")!;

    await act(async () => human.focus());
    await act(async () => human.click());
    await settle();

    expect(human.disabled).toBe(false);
    expect(human.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement, "focus is not dropped to the page").toBe(human);
    expect(document.querySelector('.supportHumanAddress a[href^="mailto:"]')).not.toBeNull();
    expect(client.escalate).not.toHaveBeenCalled();
  });
});
