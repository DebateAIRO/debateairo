// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 3 fix round (A5 ii), on the stand-ins of kbd-r2-w2v4a-ask-gate.test.tsx. Since wave 3
 * the ask page marks where its content starts (`#page-content`, tabIndex -1, for the skip link), so a press on blank space
 * or the skip link leaves focus on that region as the gate hides the page. The region is the page as a whole, which is not
 * where focus is given back: after Accept it goes to the question box. Wave 2 (V4A-14, the V4AskGate side only): the ask page hides while the Terms are owed and
 * comes back once they are accepted. The gate is the real V4AskGate under the site's focus guard; the accept screen inside it
 * (LegalAcceptGate, another implementer's file) is stood in by its shape: a heading, and an Accept that is switched off while
 * it saves and then hands the page back (its children). The session and status reads are stood in; nothing is real data.
 */
const reads = vi.hoisted(() => ({ status: null as null | ((owed: boolean) => void) }));
vi.mock("@/lib/api", () => ({
  validateSession: async () => undefined,
  contractClient: {
    getLegalStatus: () => new Promise((resolveStatus) => {
      reads.status = (owed) => resolveStatus({ must_accept: owed ? [{ kind: "TERMS", version: "9", sha256: "x" }] : [] });
    })
  }
}));
vi.mock("@/lib/ageConfirmation", () => ({ ageConfirmationRequired: async () => false, ageConfirmationHref: () => "#age" }));
const accept = vi.hoisted(() => ({ done: null as null | (() => void) }));
vi.mock("@/components/billing/LegalAcceptGate", () => ({
  LegalAcceptGate: ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<"required" | "busy" | "clear">("required");
    if (state === "clear") return <>{children}</>;
    return (
      <div className="screen scroll">
        <div className="screenInner narrow" role="region" aria-labelledby="legal-gate-title">
          <h1 id="legal-gate-title">New terms</h1>
          <button id="accept" type="button" disabled={state === "busy"} onClick={() => {
            setState("busy");
            accept.done = () => setState("clear");
          }}>Accept and continue</button>
        </div>
      </div>
    );
  }
}));

import { V4AskGate } from "../../apps/ui/components/v4/V4AskGate.js";

let root: Root | null = null;
let stop: () => void = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reads.status = null;
  accept.done = null;
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

async function mount(): Promise<void> {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => root!.render(
    <V4AskGate catalog={{}} locale="en">{(session) => (
      <div className="v4Root">
        <header><a id="brand" href="/v4">Brand</a></header>
        <div id="page-content" tabIndex={-1}>
          <h1>Ask</h1>
          <textarea id="question" aria-label="Your question" data-session={session} />
          <button id="next" type="button">Next</button>
        </div>
      </div>
    )}</V4AskGate>
  ));
  await flush();
}

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

describe("A5 ii: the content's start is no place to give focus back to", () => {
  it("focus on #page-content as the page hides: after Accept focus is in the question box", async () => {
    await mount();
    act(() => byId("page-content").focus());
    expect(document.activeElement).toBe(byId("page-content"));
    await act(async () => { reads.status!(true); });
    await flush();
    pressByKeyboard(byId("accept"));
    await guardSettled();
    await act(async () => { accept.done!(); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(byId("question"));
  });

  it("a real control kept as the page hid still gets focus back (the button they were on)", async () => {
    await mount();
    act(() => byId("next").focus());
    await act(async () => { reads.status!(true); });
    await flush();
    pressByKeyboard(byId("accept"));
    await guardSettled();
    await act(async () => { accept.done!(); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(byId("next"));
  });
});
