// PROBE — REV(S01) pass 1, lens product-truth. Written against slice head db4758da.
// What the EXISTING UI (unchanged by this slice, I-4) does with an auto-published
// Free debate: the owner's two remaining affordances. Copy into <worktree>/tests/render/
// and run: pnpm exec vitest run tests/render/rev-s01-p1-product-truth-ui.test.tsx
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PublicationControl } from "../../apps/ui/components/PublicationControl.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_REF = "22222222-2222-4222-8222-222222222222";

let dom: JSDOM;
let root: Root | null = null;

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: `https://app.debateai.test/debate/${RUN_ID}`
  });
  Object.assign(globalThis, {
    window: dom.window, self: dom.window, document: dom.window.document,
    requestIdleCallback: (callback: () => void) => setTimeout(callback, 0),
    cancelIdleCallback: (handle: number) => clearTimeout(handle),
    IntersectionObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): readonly unknown[] { return []; }
    },
    HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true
  });
});

afterEach(async () => {
  if (root !== null) await act(async () => { root?.unmount(); });
  root = null;
  dom.window.close();
});

function client(overrides: Record<string, unknown> = {}) {
  return {
    readRunVisibility: async () => ({ state: "PUBLISHED", public_ref: PUBLIC_REF }),
    stepUp: async () => ({
      status: "step_up_complete",
      step_up_grant: {
        token: "g".repeat(43), action: "UNPUBLISH", target_run_id: RUN_ID,
        expires_at: "2026-09-21T00:05:00.000Z"
      }
    }),
    publishRun: async () => ({ state: "PUBLISHED", public_ref: PUBLIC_REF }),
    unpublishRun: async () => { throw new Error("409 FREE_DEBATE_CANNOT_BE_UNPUBLISHED"); },
    deletePrivateDebate: async () => ({ status: "CLEANED" }),
    ...overrides
  } as never;
}

async function mount(visibilityState: "PRIVATE" | "PUBLISHED"): Promise<void> {
  const container = document.getElementById("root")!;
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <PublicationControl
        runId={RUN_ID}
        client={client({
          readRunVisibility: async () => visibilityState === "PUBLISHED"
            ? { state: "PUBLISHED", public_ref: PUBLIC_REF }
            : { state: "PRIVATE", public_ref: null }
        })}
      />
    );
  });
  await act(async () => { await Promise.resolve(); });
}

function buttonLabels(): readonly string[] {
  return [...document.querySelectorAll("button")].map((node) => node.textContent ?? "");
}

describe("REV(S01) p1 product-truth — the owner's affordances on an auto-published Free debate", () => {
  it("UI-1 offers a delete control while PRIVATE", async () => {
    await mount("PRIVATE");
    expect(buttonLabels().some((label) => label.includes("Delete private debate"))).toBe(true);
  });

  it("UI-2 offers NO delete control once the debate is PUBLISHED", async () => {
    await mount("PUBLISHED");
    const labels = buttonLabels();
    expect(labels.some((label) => label.includes("Delete"))).toBe(false);
    expect(labels.some((label) => label.includes("Unpublish"))).toBe(true);
    expect(document.body.textContent).not.toContain("Delete this private debate");
  });

  it("UI-3 renders the 409 refusal as a credentials error", async () => {
    const container = document.getElementById("root")!;
    root = createRoot(container);
    await act(async () => { root!.render(<PublicationControl runId={RUN_ID} client={client()} />); });
    await act(async () => { await Promise.resolve(); });
    const open = [...document.querySelectorAll("button")]
      .find((node) => node.textContent?.includes("Unpublish…"))!;
    await act(async () => {
      open.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const checkbox = document.querySelector("input[type=checkbox]") as HTMLInputElement;
    await act(async () => {
      checkbox.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    const form = document.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).toContain(
      "Publication change was not authorized. Recheck your password and authenticator code."
    );
    expect(document.body.textContent).not.toContain("Free");
  });
});
