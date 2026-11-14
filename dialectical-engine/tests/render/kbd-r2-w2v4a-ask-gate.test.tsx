// @vitest-environment jsdom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (V4A-14, the V4AskGate side only): the ask page hides while the Terms are owed and
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

// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
let root: Root | null = null;
let stop: () => void = () => undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reads.status = null;
  accept.done = null;
  stop = guarded ? startFocusGuard() : installFocusFixup();
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
        <a id="brand" href="/v4">Brand</a>
        <h1>Ask</h1>
        <textarea id="question" aria-label="Your question" data-session={session} />
        <button id="next" type="button">Next</button>
      </div>
    )}</V4AskGate>
  ));
  await flush();
}

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

describe("the ask page's legal gate under the focus guard (V4A-14, V4AskGate's side)", () => {
  it("owed while the person types: the page hides; after Accept focus is back in the question box they were typing in", async () => {
    await mount();
    act(() => byId("question").focus());
    await act(async () => { reads.status!(true); });
    await flush();
    expect(byId("question").closest("[hidden]"), "the page is kept, hidden").not.toBeNull();
    pressByKeyboard(byId("accept"));
    await guardSettled();
    await act(async () => { accept.done!(); });
    await flush();
    await guardSettled();
    expect(byId("question").closest("[hidden]")).toBeNull();
    expect(document.activeElement).toBe(byId("question"));
  });

  it("owed before the person did anything: after Accept focus is in the page's question box, not on the page itself", async () => {
    await mount();
    await act(async () => { reads.status!(true); });
    await flush();
    pressByKeyboard(byId("accept"));
    await act(async () => { accept.done!(); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(byId("question"));
  });

  it("nothing owed: the page shows and no focus is moved", async () => {
    await mount();
    act(() => byId("next").focus());
    await act(async () => { reads.status!(false); });
    await flush();
    await guardSettled();
    expect(document.activeElement).toBe(byId("next"));
  });
});
