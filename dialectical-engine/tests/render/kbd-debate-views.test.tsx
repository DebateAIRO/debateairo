// @vitest-environment jsdom
/*
 * Keyboard-only audit (2026-10-22), the debate views. Split moved focus to its heading whenever the
 * shown claim changed, including when a live run settled and renamed the root, so a reader typing
 * elsewhere lost their place. The Map was a Tab stop per wedge. The Tree's zoom cluster is hidden
 * (V, 2026-10-22: keep it hidden), so the keyboard had no way to zoom or fit the tree.
 */
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { DebateSplit } from "../../apps/ui/components/DebateSplit.js";
import { DebateMap } from "../../apps/ui/components/DebateMap.js";
import { CanvasViewport } from "../../apps/ui/components/CanvasViewport.js";

function node(id: string, claim: string, nodeType: DebateNode["node_type"], children: DebateNode[] = []): DebateNode {
  return {
    id,
    debate_id: "debate:kbd",
    parent_id: nodeType === "ROOT_CLAIM" ? null : "root",
    node_type: nodeType,
    label: null,
    lens: null,
    depth: nodeType === "ROOT_CLAIM" ? 0 : 1,
    position: 0,
    claim,
    status: "complete",
    materialized_path: "0",
    active_generation_id: null,
    active_generation: null,
    maker: null,
    children
  };
}

function tree(rootId: string): DebateNode {
  return node(rootId, "The root claim.", "ROOT_CLAIM", [
    node("node:pro", "A supporting claim.", "PRO", [node("node:pro-con", "A rebuttal.", "CON")]),
    node("node:con", "An opposing claim.", "CON")
  ]);
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML = '<input id="elsewhere" aria-label="elsewhere" />';
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => root!.render(element));
}

function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("Split moves focus only when the reader picks a claim", () => {
  function SplitPage({ rootId }: { rootId: string }) {
    const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
    return (
      <DebateSplit
        root={tree(rootId)}
        focusNodeId={focusNodeId}
        expanded={new Set()}
        onFocus={setFocusNodeId}
        onOpenNode={() => undefined}
        onToggleExpand={() => undefined}
      />
    );
  }

  it("leaves focus where the reader is when a settling run renames the root", async () => {
    const elsewhere = document.getElementById("elsewhere")!;
    await render(<SplitPage rootId="run:live" />);
    elsewhere.focus();
    await render(<SplitPage rootId="answer:settled" />);
    expect(host.querySelector(".splitFocusRootClaim")).not.toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("moves focus to the chosen claim's heading when the reader picks it", async () => {
    await render(<SplitPage rootId="run:live" />);
    const focusButton = [...host.querySelectorAll<HTMLButtonElement>("button.nodeCtrl.focus")][0]!;
    focusButton.focus();
    await act(async () => focusButton.click());
    const heading = host.querySelector<HTMLElement>(".splitFocusClaim")!;
    expect(heading.textContent).toBe("A supporting claim.");
    expect(document.activeElement).toBe(heading);
  });
});

describe("the Map is one Tab stop, walked with the arrow keys", () => {
  it("keeps one wedge in the tab order and moves it with the arrows, Home and End", async () => {
    const onOpenSplit = vi.fn();
    await render(<DebateMap root={tree("root")} onOpenSplit={onOpenSplit} />);
    const segments = [...host.querySelectorAll<SVGElement>('.mapStage [role="button"]')];
    const hub = host.querySelector<SVGElement>('circle[role="button"]')!;
    const tabStops = () => segments.filter((segment) => segment.getAttribute("tabindex") === "0");
    expect(tabStops()).toEqual([hub]);

    act(() => hub.focus());
    key(hub, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Pro: A supporting claim.");
    expect(tabStops()).toEqual([document.activeElement]);

    key(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Con: A rebuttal.");
    key(document.activeElement!, { key: "End" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Con: An opposing claim.");
    key(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(hub);
    key(hub, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Con: An opposing claim.");
    key(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(hub);

    key(hub, { key: "ArrowRight" });
    key(document.activeElement!, { key: "Enter" });
    expect(onOpenSplit).toHaveBeenCalledWith("node:pro");
  });
});

describe("the Tree zooms from the keyboard while its zoom cluster stays hidden", () => {
  function Canvas() {
    return (
      <CanvasViewport layoutWidth={2000} layoutHeight={800} stickyControl={null}>
        <div className="nodeWrap">
          <button type="button" data-card-button>Details</button>
          <input aria-label="note" data-card-input />
        </div>
      </CanvasViewport>
    );
  }

  const surface = () => host.querySelector<HTMLElement>(".canvas")!;

  it("is a named Tab stop that describes its zoom keys", async () => {
    await render(<Canvas />);
    expect(surface().tabIndex).toBe(0);
    expect(surface().getAttribute("role")).toBe("region");
    expect(surface().getAttribute("aria-label")).toBe("Tree");
    expect(surface().getAttribute("aria-keyshortcuts")).toBe("Plus - 0 1");
    expect(document.getElementById(surface().getAttribute("aria-describedby")!)?.textContent).toBe(
      "Zoom in +, Zoom out −, Fit whole tree (overview) 0, Reset zoom to 1:1 1"
    );
  });

  it("zooms in and out with + and -, resets with 1, fits with 0, and announces the level", async () => {
    await render(<Canvas />);
    const status = host.querySelector('[role="status"]')!;
    key(surface(), { key: "1" });
    expect(surface().dataset.zoom).toBe("1.0000");
    expect(status.textContent).toBe("100%");
    key(surface(), { key: "+" });
    expect(surface().dataset.zoom).toBe("1.1000");
    expect(status.textContent).toBe("110%");
    // From a card's own control too: the keys bubble to the canvas.
    key(host.querySelector("[data-card-button]")!, { key: "-" });
    expect(surface().dataset.zoom).toBe("1.0000");
    key(surface(), { key: "0" });
    expect(surface().dataset.fitPolicy).toBe("overview-auto");
  });

  it("leaves typing, modified keys and other keys alone", async () => {
    await render(<Canvas />);
    key(surface(), { key: "1" });
    const typing = key(host.querySelector("[data-card-input]")!, { key: "+" });
    expect(typing.defaultPrevented).toBe(false);
    const pageZoom = key(surface(), { key: "+", ctrlKey: true });
    expect(pageZoom.defaultPrevented).toBe(false);
    const other = key(surface(), { key: "a" });
    expect(other.defaultPrevented).toBe(false);
    expect(surface().dataset.zoom).toBe("1.0000");
  });

  it("lets Enter on a card's button activate it while the tree is fitted, instead of zooming", async () => {
    await render(<Canvas />);
    key(surface(), { key: "0" });
    const fitted = surface().dataset.zoom;
    expect(Number(fitted)).toBeLessThan(0.5);
    const onClick = vi.fn();
    const button = host.querySelector<HTMLButtonElement>("[data-card-button]")!;
    button.addEventListener("click", onClick);
    // A keyboard-made click carries detail 0; a pointer click carries 1 and still zooms to the card.
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(surface().dataset.zoom).toBe(fitted);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(surface().dataset.zoom).toBe("1.0000");
  });
});
