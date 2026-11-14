// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_GUARD_OWED_MS, FOCUS_GUARD_SETTLE_MS, installFocusGuard } from "../../apps/ui/lib/focusGuard.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/*
 * Keyboard audit, round 3 (12 Nov 2026). The guard keeps the places owed focus behind a dialog or panel in layers: a
 * control on the page waits behind a panel, a control inside that panel waits behind a dialog opened over it. When the
 * dialog closes, the control inside the panel is owed focus again; when the panel closes, the control on the page is.
 */

let stopGuard: () => void;
let stopFixup: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  stopFixup = installFocusFixup();
  stopGuard = installFocusGuard();
});

afterEach(() => {
  stopGuard();
  stopFixup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const pick = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function pressKey(key = "Enter", init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
}

/** The page: a card with a button on it, and a panel open over it (role dialog, not modal) with a Save button. */
const PAGE =
  '<main id="main-content" tabindex="-1"><section id="card"><button id="x">Generate</button><button id="afterX">After</button></section><div id="panel" role="dialog" aria-modal="false"><button id="pick">Pick</button><button id="save">Save</button></div></main>';

/** A dialog that holds the keyboard, put on the page without taking focus. */
function modal(): HTMLElement {
  const dialog = document.createElement("div");
  dialog.id = "sure";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = '<p id="text">Sure?</p>';
  document.body.append(dialog);
  return dialog;
}

/** A dialog that holds the keyboard and takes focus on its first button, as most do. */
function focusedModal(id: string, button: string, more = ""): HTMLElement {
  const dialog = document.createElement("div");
  dialog.id = id;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `<button id="${button}">OK</button>${more}`;
  document.body.append(dialog);
  pick(button).focus();
  return dialog;
}

/** The page's button goes busy under focus, then the person moves into the panel. */
async function pageOwedBehindPanel(): Promise<{ x: HTMLButtonElement; save: HTMLButtonElement }> {
  document.body.innerHTML = PAGE;
  const x = pick<HTMLButtonElement>("x");
  x.focus();
  pressKey();
  x.disabled = true;
  await settle();
  pick("pick").focus();
  await settle();
  return { x, save: pick<HTMLButtonElement>("save") };
}

describe("places owed focus wait in layers", () => {
  it("the control inside the panel gets focus back when the dialog over it closes, then the page's own when the panel closes", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    expect(document.activeElement).toBe(document.body);
    const sure = modal();
    await settle();
    save.disabled = false;
    x.disabled = false;
    await settle();
    expect(document.activeElement, "never behind an open dialog").toBe(document.body);
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(save);
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("the same, when the panel's button comes back on only after the dialog has closed", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = modal();
    await settle();
    sure.remove();
    await settle();
    save.disabled = false;
    await settle();
    expect(document.activeElement).toBe(save);
    x.disabled = false;
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("one layer is as before: a page control owed behind one dialog gets focus back when it closes", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    const sure = modal();
    x.disabled = false;
    await settle();
    expect(document.activeElement).not.toBe(x);
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a wait that ran out inside the panel is not revived when the dialog closes; the page's own still is when the panel closes", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 1000);
    const sure = modal();
    await settle();
    sure.remove();
    save.disabled = false;
    await settle();
    expect(document.activeElement).not.toBe(save);
    x.disabled = false;
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a wait that ran out on the page is not revived when the panel closes; the panel's own still is when the dialog closes", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    const save = pick<HTMLButtonElement>("save");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 1000);
    pick("pick").focus();
    await settle();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = modal();
    await settle();
    save.disabled = false;
    x.disabled = false;
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(save);
    pick("panel").remove();
    await settle();
    expect(document.activeElement).not.toBe(x);
    expect(document.activeElement).toBe(pick("main-content"));
  });

  it("a dialog that takes focus over the panel: when it closes, the panel's control gets focus back, not the page's", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = focusedModal("sure", "ok");
    await settle();
    expect(document.activeElement).toBe(pick("ok"));
    save.disabled = false;
    x.disabled = false;
    pressKey();
    sure.remove();
    await settle();
    expect(document.activeElement, "never on the page behind the open panel").toBe(save);
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("the same while the page's control stays off: focus never parks behind the open panel, and Save comes back", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = focusedModal("sure", "ok");
    await settle();
    pressKey();
    sure.remove();
    await settle();
    expect(document.activeElement).not.toBe(pick("main-content"));
    save.disabled = false;
    await settle();
    expect(document.activeElement).toBe(save);
    x.disabled = false;
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a panel control switched off in the same breath as a dialog over the panel takes focus gets it back when that dialog closes", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    // One press does it all at once, as a screen's own code does.
    save.disabled = true;
    const sure = focusedModal("sure", "ok");
    await settle();
    expect(document.activeElement).toBe(pick("ok"));
    pressKey();
    save.disabled = false;
    x.disabled = false;
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(save);
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("only a panel control waits, and the panel is shut but left on the page: it is not given focus inside the shut panel", async () => {
    document.body.innerHTML = PAGE;
    const save = pick<HTMLButtonElement>("save");
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = modal();
    await settle();
    sure.remove();
    pick("panel").setAttribute("aria-hidden", "true");
    save.disabled = false;
    await settle();
    expect(document.activeElement).not.toBe(save);
  });

  it("when nothing fences any more, the page's own is owed and the deeper places are dropped, not given focus one after another", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = modal();
    await settle();
    // The dialog and the panel close in one go; the panel stays on the page, shut.
    sure.remove();
    pick("panel").setAttribute("aria-hidden", "true");
    save.disabled = false;
    x.disabled = false;
    await settle();
    expect(document.activeElement).toBe(x);
    // The panel opens again, and the page's button is taken away under focus: focus rests on its card, never on Save.
    pick("panel").removeAttribute("aria-hidden");
    pressKey();
    x.remove();
    await settle();
    expect(document.activeElement).not.toBe(save);
    expect(document.activeElement).toBe(pick("card"));
  });
});

describe("dialogs stacked over dialogs", () => {
  /** The page's button goes busy under focus, then modal B opens over the page and takes focus. */
  async function pageOwedBehindModal(): Promise<{ x: HTMLButtonElement; b: HTMLElement }> {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    const b = focusedModal("b", "b0", '<button id="b1">Delete</button>');
    await settle();
    return { x, b };
  }

  it("a control in B switched off in the same breath as dialog C over it takes focus gets it back when C closes, while the page's waits", async () => {
    const { x, b } = await pageOwedBehindModal();
    const b1 = pick<HTMLButtonElement>("b1");
    b1.focus();
    pressKey();
    b1.disabled = true;
    const c = focusedModal("c", "c1");
    await settle();
    expect(document.activeElement).toBe(pick("c1"));
    pressKey();
    b1.disabled = false;
    c.remove();
    await settle();
    expect(document.activeElement).toBe(b1);
    x.disabled = false;
    pressKey();
    b.remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("the same with nothing waiting on the page", async () => {
    document.body.innerHTML = PAGE;
    focusedModal("b", "b0", '<button id="b1">Delete</button>');
    const b1 = pick<HTMLButtonElement>("b1");
    b1.focus();
    pressKey();
    b1.disabled = true;
    const c = focusedModal("c", "c1");
    await settle();
    pressKey();
    b1.disabled = false;
    c.remove();
    await settle();
    expect(document.activeElement).toBe(b1);
  });

  it("three layers, each with a control switched off: closing C then B gives each focus back in turn", async () => {
    const { x, b } = await pageOwedBehindModal();
    const b1 = pick<HTMLButtonElement>("b1");
    b1.focus();
    pressKey();
    b1.disabled = true;
    await settle();
    const c = focusedModal("c", "c1", '<button id="c2">Send</button>');
    await settle();
    const c2 = pick<HTMLButtonElement>("c2");
    c2.focus();
    pressKey();
    c2.disabled = true;
    await settle();
    c2.disabled = false;
    await settle();
    expect(document.activeElement).toBe(c2);
    b1.disabled = false;
    x.disabled = false;
    pressKey();
    c.remove();
    await settle();
    expect(document.activeElement).toBe(b1);
    pressKey();
    b.remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a middle layer whose control is taken away while it waits is never given focus; the page's still is", async () => {
    const { x, b } = await pageOwedBehindModal();
    const b1 = pick<HTMLButtonElement>("b1");
    b1.focus();
    pressKey();
    b1.disabled = true;
    await settle();
    const c = focusedModal("c", "c1");
    await settle();
    b1.remove();
    await settle();
    pressKey();
    c.remove();
    await settle();
    expect(document.activeElement).toBe(b);
    x.disabled = false;
    pressKey();
    b.remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });
});

describe("what the layers keep (second review)", () => {
  it("a page control switched off by inert waits behind a dialog that took focus, and gets focus back once its card comes back on", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    pick("card").setAttribute("inert", "");
    await settle();
    const b = focusedModal("b", "b0");
    await settle();
    pressKey();
    b.remove();
    await settle();
    expect(document.activeElement).not.toBe(x);
    pick("card").removeAttribute("inert");
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("the same with no dialog at all", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    pick("card").setAttribute("inert", "");
    await settle();
    pick("card").removeAttribute("inert");
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a page control taken away while it waits behind a dialog: when the dialog closes, focus parks on its card, never on nothing", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    const sure = modal();
    await settle();
    x.remove();
    await settle();
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(pick("card"));
  });

  it("the panel's Save taken away while a dialog over the panel holds focus: when it closes, focus stays in the panel, not on the page", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = focusedModal("sure", "ok");
    await settle();
    save.remove();
    x.disabled = false;
    await settle();
    pressKey();
    sure.remove();
    await settle();
    expect(document.activeElement).not.toBe(x);
    expect(pick("panel").contains(document.activeElement)).toBe(true);
  });

  it("a sibling panel D takes focus while Save waits in panel A; when D closes, Save gets focus back, not the page", async () => {
    const { x, save } = await pageOwedBehindPanel();
    const d = document.createElement("div");
    d.id = "d";
    d.setAttribute("role", "dialog");
    d.innerHTML = '<button id="dOk">OK</button>';
    pick("main-content").append(d);
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    pick("dOk").focus();
    await settle();
    save.disabled = false;
    x.disabled = false;
    pressKey();
    d.remove();
    await settle();
    expect(document.activeElement).toBe(save);
  });

  it("the person leaves panel A for the page on purpose: nothing later pulls focus back into A", async () => {
    const { save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const afterX = pick<HTMLButtonElement>("afterX");
    afterX.focus();
    save.disabled = false;
    await settle();
    expect(document.activeElement).toBe(afterX);
    pressKey();
    afterX.remove();
    await settle();
    expect(document.activeElement).not.toBe(save);
    expect(document.activeElement).toBe(pick("card"));
  });

  it("a dialog E nested inside panel A closes: focus goes back to Save in A", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const e = document.createElement("div");
    e.setAttribute("role", "dialog");
    e.innerHTML = '<button id="eOk">OK</button>';
    pick("panel").append(e);
    pick("eOk").focus();
    await settle();
    save.disabled = false;
    pressKey();
    e.remove();
    await settle();
    expect(document.activeElement).toBe(save);
    x.disabled = false;
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("the person moves to another control in A after the dialog closes; when A closes, the page's control still comes back", async () => {
    const { x, save } = await pageOwedBehindPanel();
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    const sure = focusedModal("sure", "ok");
    await settle();
    save.disabled = false;
    pressKey();
    sure.remove();
    await settle();
    expect(document.activeElement).toBe(save);
    pick("pick").focus();
    x.disabled = false;
    pressKey();
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });
});

describe("a waiting control that was moved, not removed (third review)", () => {
  it("a control moved out of dialog B to the page behind it is not given focus there when the dialog over B closes", async () => {
    document.body.innerHTML = PAGE;
    const b = focusedModal("b", "b0", '<button id="b1">Delete</button>');
    await settle();
    const b1 = pick<HTMLButtonElement>("b1");
    b1.focus();
    pressKey();
    b1.disabled = true;
    await settle();
    const c = modal();
    await settle();
    pick("card").append(b1);
    b1.disabled = false;
    pressKey();
    c.remove();
    await settle();
    expect(document.activeElement).not.toBe(b1);
    expect(b.contains(document.activeElement) || document.activeElement === document.body).toBe(true);
  });
});

describe("the dialog's own lost button does not decide where the page's place is (third review)", () => {
  it("a page control taken away behind a dialog that took focus: when the dialog and its focused button go, focus parks on the control's card", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    const b = focusedModal("b", "b0");
    await settle();
    x.remove();
    pressKey();
    b.remove();
    await settle();
    expect(document.activeElement).toBe(pick("card"));
  });
});

describe("places the person has come back to are not owed any more (round 4 review)", () => {
  it("focus given back to Save by the dialog's own code: a later loss in the panel parks there, never pulls focus back to Save", async () => {
    const { save } = await pageOwedBehindPanel();
    const row = document.createElement("div");
    row.id = "row";
    row.innerHTML = '<button id="del">Delete row</button>';
    pick("panel").append(row);
    save.focus();
    pressKey();
    save.disabled = true;
    const sure = focusedModal("sure", "ok");
    await settle();
    save.disabled = false;
    sure.remove();
    save.focus();
    await settle();
    expect(document.activeElement).toBe(save);
    const del = pick<HTMLButtonElement>("del");
    del.focus();
    await settle();
    pressKey();
    row.remove();
    await settle();
    pressKey("Shift");
    await settle();
    expect(document.activeElement).not.toBe(save);
    expect(pick("panel").contains(document.activeElement)).toBe(true);
  });

  it("a page control taken away behind a dialog drawn inside the page (not at the end of body): focus parks on its card", async () => {
    document.body.innerHTML = PAGE;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    const dialog = document.createElement("div");
    dialog.id = "b";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = '<button id="b0">OK</button>';
    pick("main-content").append(dialog);
    pick("b0").focus();
    await settle();
    x.remove();
    pressKey();
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(pick("card"));
  });
});
