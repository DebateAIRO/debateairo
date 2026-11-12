// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalAcceptGate } from "../../apps/ui/components/billing/LegalAcceptGate.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import newDebateEnglish from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };
import { guardSettled, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit 2026-11-12, wave 3: the updated-Terms screen's first focus. When the screen comes up over a page the person
 * was using (the ask page hides under it, V4AskGate), focus was left on nothing, or on the hidden page behind it, and nothing
 * said where it was. Now it goes to the screen's heading, which says what this is; the next Tab is its first control. On a
 * fresh page load it moves nothing (the page starts at its top, as every page does), and focus somewhere real stays.
 * The gate is the real one, with its status read stood in; the page around it is a stand-in. Made-up words only.
 */

const OWED = { must_accept: [{ kind: "TERMS", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }] };

let root: Root | null = null;
let stop: () => void = () => undefined;
let answer: (status: typeof OWED | { must_accept: [] }) => void = () => undefined;

function client() {
  return {
    getLegalStatus: vi.fn(() => new Promise<typeof OWED | { must_accept: [] }>((resolve) => { answer = resolve; })),
    acceptLegal: vi.fn(),
    logout: vi.fn()
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stop = startFocusGuard();
});
afterEach(async () => {
  stop();
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 10; turn += 1) await Promise.resolve(); });
}

/** The shape of V4AskGate: the page, kept and hidden while the screen shows beside it. */
let owe: () => void = () => undefined;
function AskPage({ gateClient }: Readonly<{ gateClient: ReturnType<typeof client> }>) {
  const [owed, setOwed] = useState(false);
  owe = () => setOwed(true);
  return (
    <>
      <div hidden={owed}>
        <textarea id="question" aria-label="Your question" />
      </div>
      {owed ? <LegalAcceptGate catalog={newDebateEnglish} client={gateClient}><p>cleared</p></LegalAcceptGate> : null}
    </>
  );
}

async function mount(node: React.ReactNode): Promise<void> {
  const main = document.createElement("main");
  main.id = "main-content";
  main.tabIndex = -1;
  document.body.append(main);
  root = createRoot(main);
  await act(async () => root!.render(node));
  await flush();
}

const heading = (): HTMLElement => document.getElementById("legal-gate-title")!;

describe("the updated-Terms screen's first focus", () => {
  it("comes up over the page the person was typing in: focus is on its heading, and the next Tab is Read the Terms", async () => {
    const gateClient = client();
    await mount(<AskPage gateClient={gateClient} />);
    act(() => document.getElementById("question")!.focus());
    act(() => owe());
    await flush();
    await act(async () => { answer(OWED); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(heading());
    expect(heading().getAttribute("tabindex")).toBe("-1");
    // The heading is not a Tab stop of its own: the first control follows it.
    const first = document.querySelector<HTMLElement>(".screenInner button:not([disabled]), .screenInner a[href]");
    expect(first?.textContent).toBe(newDebateEnglish["newDebate.legalGate.readTerms"]);
  });

  it("the browser already took focus from the hidden page (focus on nothing): focus is on its heading", async () => {
    const gateClient = client();
    await mount(<AskPage gateClient={gateClient} />);
    act(() => document.getElementById("question")!.focus());
    act(() => owe());
    await flush();
    // What a browser does to a focused control whose page is hidden (jsdom does not).
    act(() => document.getElementById("question")!.blur());
    await act(async () => { answer(OWED); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(heading());
  });

  it("a fresh page load (nothing used yet): no focus is moved", async () => {
    await mount(<LegalAcceptGate catalog={newDebateEnglish} client={client()}><p>cleared</p></LegalAcceptGate>);
    await act(async () => { answer(OWED); });
    await flush();
    await guardSettled();
    expect(heading()).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("focus on something real that the screen does not cover (the skip link, say): it stays there", async () => {
    const outside = document.createElement("a");
    outside.href = "#main-content";
    outside.textContent = "Skip";
    document.body.append(outside);
    const gateClient = client();
    await mount(<AskPage gateClient={gateClient} />);
    act(() => document.getElementById("question")!.focus());
    act(() => owe());
    await flush();
    act(() => outside.focus());
    await act(async () => { answer(OWED); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(outside);
  });

  it("nothing owed: the page shows and no focus is moved", async () => {
    const gateClient = client();
    await mount(<AskPage gateClient={gateClient} />);
    act(() => document.getElementById("question")!.focus());
    act(() => owe());
    await flush();
    await act(async () => { answer({ must_accept: [] }); });
    await flush();
    expect(document.body.textContent).toContain("cleared");
    expect(document.activeElement).not.toBe(heading());
  });
});
