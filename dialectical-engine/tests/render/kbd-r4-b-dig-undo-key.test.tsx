// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { V4DigPaths } from "../../apps/ui/components/v4/V4DigPaths.js";
import { digPathPlanOf } from "../../apps/ui/lib/v4/digPathPlan.js";
import { pathPlanReduce, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { suggestionPick } from "../../apps/ui/lib/v4/suggestions.js";
import type { DigSuggestion } from "../../packages/contract/src/index.js";

/*
 * Keyboard audit round 4 (2026-11-12), B7: Ctrl/Cmd+Z undoes the dig rows' last change only while focus is in the dig's
 * rows or the panel column that holds them, never in a text box there, and never from elsewhere on the map page (a map
 * card, the header, a note, the phone's Map sheet), where the change it undoes is out of sight. Made-up questions only.
 */

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const sug = (id: string, text: string): DigSuggestion => ({ suggestion_id: id, kind: "UNDOCUMENTED", side: null, text, places: ["path:b2"] });

let root: Root | null = null;
let page: HTMLDivElement | null = null;
let actions: PathPlanAction[] = [];

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })
  });
  actions = [];
});
afterEach(async () => {
  await act(async () => root?.unmount());
  page?.remove();
  root = null;
  page = null;
});

/** The map page in miniature: a map card, then the panel column with a text box and the dig's rows (one change to undo). */
async function mount(): Promise<Readonly<{ card: HTMLButtonElement; heading: HTMLElement; box: HTMLTextAreaElement; rows: HTMLElement }>> {
  const first = digPathPlanOf([suggestionPick("b2", sug("s-land", "How much land is needed?")), suggestionPick("b2", sug("s-cost", "What does storage cost?"))], false);
  const plan: PathPlan = pathPlanReduce(first, { type: "MOVE", key: first.paths[1]!.key, to: 0 }).plan;
  expect(plan.undo.length).toBeGreaterThan(0);
  page = document.createElement("div");
  document.body.append(page);
  root = createRoot(page);
  await act(async () => root!.render(
    <>
      <section className="v4DebMapCol"><button type="button" className="v4PathCardMain">A path</button></section>
      <section className="v4DebPanelCol">
        <h2 className="v4PanelH2" tabIndex={-1}>The path</h2>
        <textarea aria-label="Your own view" />
        <V4DigPaths plan={plan} overlap={null} writing={new Set()} onAction={(action) => {
          actions.push(action);
          return null;
        }} onKeepApart={() => undefined} catalog={CATALOG} locale="en" />
      </section>
    </>
  ));
  return {
    card: page.querySelector<HTMLButtonElement>(".v4DebMapCol button")!,
    heading: page.querySelector<HTMLElement>(".v4PanelH2")!,
    box: page.querySelector<HTMLTextAreaElement>("textarea")!,
    rows: page.querySelector<HTMLElement>(".v4DigPaths")!
  };
}

function ctrlZ(on: Element | Document): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
  act(() => {
    on.dispatchEvent(event);
  });
  return event;
}

const undos = (): number => actions.filter((action) => action.type === "UNDO").length;

describe("B7: Ctrl/Cmd+Z on the map page", () => {
  it("undoes the rows' last change with focus on a row", async () => {
    const { rows } = await mount();
    const button = rows.querySelector<HTMLElement>("button")!;
    act(() => button.focus());
    expect(ctrlZ(button).defaultPrevented).toBe(true);
    expect(undos()).toBe(1);
  });

  it("undoes it with focus elsewhere in the panel column that holds the rows (its heading)", async () => {
    const { heading } = await mount();
    act(() => heading.focus());
    ctrlZ(heading);
    expect(undos()).toBe(1);
  });

  it("does nothing from a map card or in a text box", async () => {
    const { card, box } = await mount();
    act(() => card.focus());
    expect(ctrlZ(card).defaultPrevented).toBe(false);
    act(() => box.focus());
    expect(ctrlZ(box).defaultPrevented).toBe(false);
    expect(undos()).toBe(0);
  });

  it("with nothing focused, or a part of the page that holds the panel (as after a mouse drag of a row), it still undoes (round 4 review)", async () => {
    const { card } = await mount();
    act(() => card.blur());
    expect(ctrlZ(document.body).defaultPrevented).toBe(true);
    expect(undos()).toBe(1);
    // The page's main area (a Tab stop of -1 that a press on plain text focuses) holds the panel column.
    const main = document.createElement("main");
    main.tabIndex = -1;
    page!.parentElement!.insertBefore(main, page);
    main.append(page!);
    act(() => main.focus());
    ctrlZ(main);
    expect(undos()).toBe(2);
    document.body.append(page!);
    main.remove();
  });
});


