// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { V4StartMore } from "../../apps/ui/components/v4/V4StartMore.js";
import { pathPlanFromMenu, pathPlanReduce, type PathPlan, type PathPlanAction } from "../../apps/ui/lib/v4/pathPlan.js";
import { NUCLEAR_MENU } from "../support/v4-start-menu.js";

/*
 * Keyboard audit round 4 (2026-11-12), A3: after "+ Look into this" in the "+ N more" drawer the pressed button goes with its
 * idea. Focus went to the drawer itself (no ring; the next Tab began again at "Done"). Wanted: the next idea's
 * "+ Look into this" (the one before when the last was used; "Done" when none is left), so the person carries on from there.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../apps/ui/messages/en/v4.json"), "utf8")) as Record<string, string>;
const LOOK = CATALOG["v4.start.lookInto"]!;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function Holder({ initial }: Readonly<{ initial: PathPlan }>) {
  const [plan, setPlan] = useState(initial);
  const now = useRef(initial);
  const dispatch = (action: PathPlanAction) => {
    const result = pathPlanReduce(now.current, action);
    now.current = result.plan;
    setPlan(result.plan);
    return result.refusal;
  };
  return (
    <V4StartMore plan={plan} catalog={CATALOG} locale="en" dispatch={dispatch} onRefusal={() => undefined} share={null} narrow={false}
      angles={NUCLEAR_MENU.angles} />
  );
}

/** A list with room for every idea: the widest plan, its paths all removed but one. */
function roomy(): PathPlan {
  let plan = pathPlanFromMenu(NUCLEAR_MENU, 7, false);
  while (plan.paths.length > 1) plan = pathPlanReduce(plan, { type: "REMOVE", key: plan.paths.at(-1)!.key }).plan;
  return plan;
}

async function mount(plan: PathPlan): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Holder initial={plan} />));
  await act(async () => host!.querySelector<HTMLButtonElement>(".v4StartMoreOpen")!.click());
}

const drawer = (): HTMLElement => host!.querySelector<HTMLElement>(".v4StartMore")!;
const looks = (): HTMLButtonElement[] => [...drawer().querySelectorAll<HTMLButtonElement>(".v4StartMoreAdd")];
const titleOf = (button: Element | null): string =>
  button?.closest(".v4StartMoreIdea")?.querySelector(".v4StartMoreIdeaTitle")?.textContent ?? "";
async function press(button: HTMLButtonElement): Promise<void> {
  button.focus();
  await act(async () => button.click());
}

describe("A3: after '+ Look into this' focus stays where the person was in the drawer", () => {
  it("the next idea's '+ Look into this' takes focus; the status line still says where the idea went", async () => {
    await mount(roomy());
    const all = looks();
    expect(all.length).toBeGreaterThan(2);
    const nextTitle = titleOf(all[1]!);
    await press(all[0]!);
    expect(drawer().querySelector(".v4StartMoreStatus")?.textContent).not.toBe("");
    expect(document.activeElement, "not the drawer itself").not.toBe(drawer());
    expect(document.activeElement?.classList.contains("v4StartMoreAdd")).toBe(true);
    expect(titleOf(document.activeElement)).toBe(nextTitle);
  });

  it("the last one used: the nearest one before it still in the drawer", async () => {
    await mount(roomy());
    const all = looks();
    const last = all.at(-1)!;
    const title = titleOf(last);
    await press(last);
    expect(last.isConnected, "the idea was added").toBe(false);
    // The same idea in another section goes with it, and an "Other directions" idea goes once its area is on the list.
    const before = [...all].reverse().find((one) => one.isConnected && titleOf(one) !== title)!;
    expect(document.activeElement).toBe(before);
  });

  it("the tenth of 'Most useful first' used: the idea that moves up into its place takes focus (round 4 review)", async () => {
    const plan = roomy();
    // Made-up extra ideas (copies under new keys), so that more than ten wait and an eleventh moves up.
    const copies = plan.more.slice(0, 4).map((idea, n) => ({
      ...idea,
      key: `${idea.key}-copy${n}`,
      title: `Copy ${n} of ${idea.title}`,
      viewpoints: idea.viewpoints.map((viewpoint) => ({ ...viewpoint, key: `${viewpoint.key}-copy${n}` }))
    }));
    await mount({ ...plan, more: [...plan.more, ...copies] as PathPlan["more"] });
    const useful = (): HTMLButtonElement[] =>
      [...drawer().querySelectorAll<HTMLButtonElement>(".v4StartMoreSection")][0]!.querySelectorAll<HTMLButtonElement>(".v4StartMoreAdd") as unknown as HTMLButtonElement[];
    expect([...useful()]).toHaveLength(10);
    const eleventh = plan.more.length + copies.length > 10 ? [...plan.more, ...copies][10]!.key : null;
    expect(eleventh).not.toBeNull();
    await press([...useful()][9]!);
    expect((document.activeElement as HTMLElement | null)?.dataset.idea).toBe(eleventh);
    expect([...useful()][9]).toBe(document.activeElement);
  });

  it("none left: Done", async () => {
    const plan = roomy();
    // A made-up plan with one idea left in "+ N more" (it shows in more than one section).
    await mount({ ...plan, more: plan.more.slice(0, 1) });
    expect(looks().length).toBeGreaterThan(0);
    await press(looks()[0]!);
    expect(looks()).toHaveLength(0);
    expect(document.activeElement).toBe(drawer().querySelector(".v4StartMoreDone"));
  });
});
