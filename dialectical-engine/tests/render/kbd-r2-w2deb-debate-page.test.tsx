// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Answer } from "@debateai/contract";
import { QuestionLanguageOffer } from "../../apps/ui/components/QuestionLanguageOffer.js";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { DebateCanvas } from "../../apps/ui/components/DebateCanvas.js";
import { contractNodesById, debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import type { DebateNode } from "../../apps/ui/lib/types.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import chromeEnglish from "../../apps/ui/messages/en/chrome.json" with { type: "json" };
import { installFocusFixup } from "./kbd-focus-fixup";
import { guardSettled, pressByKeyboard, startFocusGuard } from "./kbd-guard-harness";

/*
 * Keyboard audit, 12 Nov 2026, wave 2 (DEB2-7, DEB2-13, DEB1-6): three things on the debate page that take the focused
 * control away, under the site's focus guard. The components are the real ones, inside the page's own wrapper
 * (`.debateView`, which wraps the whole debate page); the debate is a made-up one (buildFairShapedAnswer).
 */
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const MESSAGES = resolve(import.meta.dirname, "../../apps/ui/messages/en");
const misc = JSON.parse(readFileSync(resolve(MESSAGES, "misc.json"), "utf8")) as Record<string, string>;
const debateChrome = JSON.parse(readFileSync(resolve(MESSAGES, "debateChrome.json"), "utf8")) as Record<string, string>;

let root: Root | null = null;
let stop: () => void = () => undefined;
// KBD_NO_GUARD=1 runs the same steps without the guard, to see the loss the audit found.
const guarded = process.env.KBD_NO_GUARD !== "1";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  stop = guarded ? startFocusGuard() : installFocusFixup();
});
afterEach(async () => {
  stop();
  stop = () => undefined;
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
async function settle() { await act(async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }); }
/** The page as the layout and DebatePageClient wrap it: the main area, then the whole debate view. */
async function mount(element: ReactElement) {
  const main = document.createElement("main");
  main.id = "main-content";
  document.body.append(main);
  root = createRoot(main);
  await act(async () => { root!.render(<div className="debateView">{element}</div>); });
  await settle();
}
async function rerender(element: ReactElement) {
  await act(async () => { root!.render(<div className="debateView">{element}</div>); });
  await settle();
}

describe("DEB2-7: No, thanks on the language offer", () => {
  it("lands on what follows the strip on the page (the story strip), not on the whole debate view", async () => {
    await mount(<>
      <QuestionLanguageOffer questionLocale="ro" interfaceLocale="en" catalog={chromeEnglish} />
      <details className="storyPanel"><summary className="storyPanelSummary">Made-up story</summary></details>
    </>);
    const dismiss = document.querySelector<HTMLButtonElement>(".languageOfferDismiss")!;
    pressByKeyboard(dismiss);
    await settle();
    await guardSettled();
    expect(document.querySelector(".languageOffer")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector(".storyPanelSummary"));
  });

  it("with nothing focusable after it, it leaves the place to the guard", async () => {
    await mount(<QuestionLanguageOffer questionLocale="de" interfaceLocale="en" catalog={chromeEnglish} />);
    pressByKeyboard(document.querySelector<HTMLButtonElement>(".languageOfferDismiss")!);
    await settle();
    await guardSettled();
    expect(document.activeElement).toBe(document.querySelector(".debateView"));
  });
});

describe("DEB2-13: Unlink prior answer goes with the refresh it caused", () => {
  const disclosure = (available: boolean): NonNullable<Answer["memory_disclosure"]> => ({
    matched: true, memory_link_id: "link:made-up", tier: "EXACT_QUESTION", relation: "REPEATS", decided_by: null, prior: null,
    agreed_fields: [], disagreed_fields: [], not_compared_fields: [], pulls: [], candidates_not_linked: [],
    unlink: { available, memory_link_id: available ? "link:made-up" : null }
  });
  const drawer = (available: boolean, actionState: string | null) => <AnswerHonestyDrawer
    answer={{ ...buildFairShapedAnswer(), memory_disclosure: disclosure(available) }}
    live={createLiveRunState()} ledgerDigest={null} ledgerError={null} inspection={null} inspectionError={null}
    onShowInspection={() => undefined} onUnlinkMemory={() => undefined} actionState={actionState}
    investigationInput={{}} onInvestigationInput={() => undefined} onRecordInvestigation={() => undefined}
    answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Made-up export pending." }}
    token={null} onClose={() => undefined} catalog={misc} debateChromeCatalog={debateChrome} floorShown={false} />;

  it("lands on its answer, the status line at the drawer's foot", async () => {
    await mount(drawer(true, null));
    const unlink = [...document.querySelectorAll("button")].find((node) => node.textContent === misc["misc.answerHonesty.unlinkPriorAnswer"])!;
    pressByKeyboard(unlink);
    await rerender(drawer(true, "MEMORY_UNLINKED"));
    expect(document.activeElement).toBe(unlink);
    await rerender(drawer(false, "MEMORY_UNLINKED"));
    await guardSettled();
    expect(document.activeElement).not.toBe(document.body);
    const status = document.querySelector<HTMLElement>('.drawerBody > [role="status"]')!;
    expect(status.textContent).toBe("MEMORY_UNLINKED");
    expect(document.activeElement).toBe(status);
  });

  // The guard and the modal trap together: a part parked inside the drawer is not a Tab candidate, and the trap carries
  // on from where it is (modalSemantics.ts trapTab), so the person goes on from the section they were in.
  it("guard + modal trap: Tab from a part parked inside the drawer goes on to the next control after it", async () => {
    await mount(drawer(true, null));
    const unlink = [...document.querySelectorAll("button")].find((node) => node.textContent === misc["misc.answerHonesty.unlinkPriorAnswer"])!;
    pressByKeyboard(unlink);
    await rerender(drawer(false, null));
    await guardSettled();
    const parked = document.activeElement as HTMLElement;
    expect(parked.hasAttribute("data-focus-parked")).toBe(true);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => { parked.dispatchEvent(tab); });
    const showWhy = [...document.querySelectorAll("button")].find((node) => node.textContent === misc["misc.answerHonesty.showMeWhy"]);
    expect(document.activeElement).toBe(showWhy);
  });
});

describe("DEB1-6: a set-aside card leaves the Tree under focus when the run settles", () => {
  const answer = buildFairShapedAnswer();
  const tree = debateDetailFromAnswer(answer).tree!;
  const canvas = (root: DebateNode) => <DebateCanvas root={root} expanded={new Set()} selectedNodeId={null} v3NodesById={contractNodesById(answer)}
    meta={{ claims: 3, depth: 1, judged: 1, derivedStanding: 1, setAside: 1 }} onOpenNode={() => undefined} onChallengeNode={() => undefined} onToggleExpand={() => undefined} />;

  it("lands on the Tree region (the canvas Tab stop), not on the scaled inner layer", async () => {
    const leaving = tree.children[0]!;
    await mount(canvas(tree));
    const card = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(leaving.id)}"]`)!;
    const control = card.querySelector<HTMLButtonElement>("button")!;
    pressByKeyboard(control);
    await settle();
    const setAside: DebateNode = { ...tree, children: tree.children.map((child) => child.id === leaving.id ? { ...child, path_status: "abandoned" } : child) };
    await rerender(canvas(setAside));
    await guardSettled();
    expect(document.querySelector(`[data-node-id="${CSS.escape(leaving.id)}"]`)).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(document.querySelector(".canvas"));
  });
});
