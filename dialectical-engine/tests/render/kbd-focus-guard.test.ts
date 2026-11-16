// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_GUARD_OWED_MS,
  FOCUS_GUARD_SETTLE_MS,
  FOCUS_PARKED_ATTRIBUTE,
  focusIsLost,
  installFocusGuard,
  resetFocusGuard
} from "../../apps/ui/lib/focusGuard.js";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/*
 * Keyboard audit, 12 Nov 2026. The guard's whole contract, on plain DOM: a control that is switched off or taken away
 * under a keyboard user's focus never leaves focus on the page's body, Tab carries on from where that control was, and
 * focus that is somewhere real is never touched.
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

/** The page: a main area with one card holding two buttons, and one button after the card. */
function page(): { main: HTMLElement; card: HTMLElement; first: HTMLButtonElement; second: HTMLButtonElement; after: HTMLButtonElement } {
  document.body.innerHTML =
    '<main id="main-content" tabindex="-1"><section id="card"><button id="first">First</button><button id="second">Second</button></section><button id="after">After</button></main>';
  return { main: pick("main-content"), card: pick("card"), first: pick("first"), second: pick("second"), after: pick("after") };
}

/** A sign-in card: a text box and its button. */
function form(): { card: HTMLElement; field: HTMLInputElement; go: HTMLButtonElement } {
  document.body.innerHTML =
    '<main id="main-content" tabindex="-1"><form id="card"><input id="field" type="password" /><button id="go">Go</button></form></main>';
  return { card: pick("card"), field: pick("field"), go: pick("go") };
}

function pressKey(key = "Enter", init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

/** Lets the mutation observers run, then the guard's wait. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(FOCUS_GUARD_SETTLE_MS + 20);
}

/** A dialog that holds the keyboard, put on the page without taking focus. */
function modal(html: string, into: HTMLElement = document.body): HTMLElement {
  const dialog = document.createElement("div");
  dialog.id = "dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = html;
  into.append(dialog);
  return dialog;
}

describe("a control switched off under focus", () => {
  it("gets focus back the moment it is switched on again", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    expect(document.activeElement).toBe(document.body);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("gets focus back when a fieldset around it is switched off and on", async () => {
    document.body.innerHTML = '<main id="main-content"><fieldset id="set"><input id="field" /></fieldset></main>';
    const set = pick<HTMLFieldSetElement>("set");
    const field = pick<HTMLInputElement>("field");
    field.focus();
    pressKey();
    set.disabled = true;
    await settle();
    set.disabled = false;
    await settle();
    expect(document.activeElement).toBe(field);
  });

  it("gets focus back when it was switched off and on again before the guard looked", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await Promise.resolve();
    expect(document.activeElement).toBe(document.body);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("is left alone when the screen put focus somewhere itself", async () => {
    const { first, after } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    after.focus();
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(after);
  });

  it("is never given focus back once the person pressed a key during the wait, so a later Space cannot press it again", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    pressKey("ArrowDown");
    expect(document.activeElement, "focus rests on the part around it").toBe(card);
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    expect(focusIsLost()).toBe(true);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(card);
    pressKey(" ");
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("is not given focus back for a key pressed in the moment before it would have been", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    first.disabled = false;
    await Promise.resolve();
    pressKey(" ");
    expect(document.activeElement).toBe(card);
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("a text box still gets the caret back after keys typed ahead, and nothing is parked meanwhile", async () => {
    const { card, field } = form();
    field.focus();
    pressKey();
    field.disabled = true;
    await settle();
    pressKey("a");
    pressKey("Enter");
    expect(document.activeElement).toBe(document.body);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    field.disabled = false;
    await settle();
    expect(document.activeElement).toBe(field);
  });

  it("a text box that is usable again takes the very next key", async () => {
    const { field } = form();
    field.focus();
    pressKey();
    field.disabled = true;
    await settle();
    field.disabled = false;
    await Promise.resolve();
    pressKey("a");
    expect(document.activeElement).toBe(field);
  });

  it("counts a key held down as one press", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    pressKey("Enter", { repeat: true });
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("does not count Shift, Control, Alt or the command key as a press", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    for (const key of ["Shift", "Control", "Alt", "Meta"]) pressKey(key);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("after a long wait nothing moves by itself: not when it comes back, not at a later change on the page", async () => {
    const { first, card, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 60_000);
    // The page ticks on (a counter, a poll) while the person reads elsewhere.
    main.append(document.createTextNode("tick"));
    await settle();
    expect(document.activeElement).toBe(document.body);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("after a long wait the person's next key rests focus on the part around it, and it is not given focus back", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 1000);
    first.disabled = false;
    await settle();
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(card);
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("after a long wait nothing moves by itself when it is then taken off the page; the next key rests focus near it", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 60_000);
    first.remove();
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(card);
  });

  it("after a long wait and its removal, Tab carries on from the gap it left", async () => {
    const { first, second } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 60_000);
    first.remove();
    await settle();
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(second);
    expect(tab.defaultPrevented).toBe(true);
  });

  it("a wait that ran out stays run out: a dialog that comes and goes later does not bring the control back", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 60_000);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(document.body);
    // A notice opens and takes focus by itself, then closes without placing focus.
    const notice = document.createElement("div");
    notice.setAttribute("role", "dialog");
    notice.innerHTML = '<button id="ok">OK</button>';
    main.append(notice);
    pick("ok").focus();
    await settle();
    notice.remove();
    await settle();
    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement).toBe(main);
  });

  it("after a long wait Tab still carries on from it", async () => {
    const { first, second } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 1000);
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(second);
    expect(tab.defaultPrevented).toBe(true);
  });

  it("a text box waited for too long is not given the caret back either", async () => {
    const { field } = form();
    field.focus();
    pressKey();
    field.disabled = true;
    await settle();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 1000);
    field.disabled = false;
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("does not count a locked or held key, or a shortcut, as the person moving on", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    pressKey("CapsLock");
    pressKey("AltGraph");
    pressKey("f", { ctrlKey: true });
    pressKey("f", { metaKey: true });
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("gets focus back after a dialog asked over the page has closed", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<button id="inside">Back</button>';
    main.append(dialog);
    (dialog.firstElementChild as HTMLElement).focus();
    await settle();
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(dialog.firstElementChild);
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("gets focus back however long the person stayed in the dialog it opened", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<button id="inside">Back</button>';
    main.append(dialog);
    pick("inside").focus();
    await vi.advanceTimersByTimeAsync(FOCUS_GUARD_OWED_MS + 30_000);
    first.disabled = false;
    pressKey();
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("gets focus back from a dialog that took focus in the same breath as it was switched off", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    // One press does all three at once, as a screen's own code does: no moment with focus on the page in between.
    first.disabled = true;
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<button id="inside">Back</button>';
    main.append(dialog);
    pick("inside").focus();
    await settle();
    expect(document.activeElement).toBe(pick("inside"));
    pressKey();
    first.disabled = false;
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("a control the person simply left for a dialog is not given focus when the dialog closes", async () => {
    const { first, card, main } = page();
    first.focus();
    pressKey();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = '<button id="inside">Back</button>';
    main.append(dialog);
    pick("inside").focus();
    await settle();
    pressKey();
    dialog.remove();
    await settle();
    // Nothing was owed: focus rests where the dialog was, on the main area.
    expect(document.activeElement).toBe(main);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("parks on the part around it when it is then taken away", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("parks on the part around it when the browser will not focus it after all", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    first.focus = () => undefined;
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(card);
  });
});

describe("a control taken away under focus", () => {
  it("parks focus on the nearest part still there, marked, and tidies up once focus moves on", async () => {
    const { first, card, after } = page();
    first.focus();
    pressKey();
    first.remove();
    expect(document.activeElement).toBe(document.body);
    await settle();
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute("tabindex")).toBe("-1");
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    expect(focusIsLost()).toBe(true);
    after.focus();
    await settle();
    expect(card.hasAttribute("tabindex")).toBe(false);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(focusIsLost()).toBe(false);
  });

  it("parks before the key acts when the person presses a key first", () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.remove();
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(card);
  });

  it("does nothing when the screen placed focus itself", async () => {
    const { first, second, card } = page();
    first.focus();
    pressKey();
    first.remove();
    second.focus();
    await settle();
    expect(document.activeElement).toBe(second);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("falls back to the main area when the part around it went too", async () => {
    const { first, card, main } = page();
    first.focus();
    pressKey();
    card.remove();
    await settle();
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("kept");
    main.blur();
    await settle();
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("goes to the main area, not to a part that wraps the whole page (the cookie bar's OK)", async () => {
    document.body.innerHTML =
      '<div id="shell"><a href="#main-content">Skip</a><main id="main-content" tabindex="-1"><button>In main</button></main><div id="bar"><button id="ok">OK</button></div></div>';
    const ok = pick<HTMLButtonElement>("ok");
    ok.focus();
    pressKey();
    pick("bar").remove();
    await settle();
    expect(document.activeElement).toBe(pick("main-content"));
    expect(pick("shell").hasAttribute("tabindex")).toBe(false);
  });

  it("uses a part that is a Tab stop of its own as a real place, not a parked one", async () => {
    const { first, card } = page();
    card.tabIndex = 0;
    first.focus();
    pressKey();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(card);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(focusIsLost()).toBe(false);
  });

  it("parks again when the part it parked on goes as well", async () => {
    const { first, card, main } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(card);
    card.remove();
    await settle();
    expect(document.activeElement).toBe(main);
  });

  it("gets focus back when the list it sits in is re-ordered under it", async () => {
    const { first, second, card } = page();
    first.focus();
    pressKey();
    card.insertBefore(second, first);
    card.append(first);
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("a part focus was parked on is never treated as a control that is owed focus", async () => {
    document.body.innerHTML =
      '<main id="main-content" tabindex="-1"><fieldset id="set"><section id="card"><button id="first">First</button></section></fieldset></main>';
    const set = pick<HTMLFieldSetElement>("set");
    const card = pick("card");
    pick("first").focus();
    pressKey();
    pick("first").remove();
    await settle();
    expect(document.activeElement).toBe(card);
    set.disabled = true;
    await settle();
    set.disabled = false;
    await settle();
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    // The page lets go of it; nothing brings focus back to a part that was only keeping the place.
    card.blur();
    await settle();
    document.body.append(document.createElement("p"));
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(card.hasAttribute("tabindex")).toBe(false);
  });

  it("a part left parked without a blur is tidied as soon as focus is anywhere else", async () => {
    const { first, card, after } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    after.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(card.hasAttribute("tabindex")).toBe(false);
  });
});

describe("Tab carries on from where the control was", () => {
  it("goes to the control after the gap, not to the first control of the part focus rests on", async () => {
    const { first, second, card } = page();
    second.focus();
    pressKey();
    second.remove();
    await settle();
    expect(document.activeElement).toBe(card);
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(pick("after"));
    expect(tab.defaultPrevented, "the browser's own Tab would start from the card").toBe(true);
    expect(card.hasAttribute("tabindex")).toBe(false);
    expect(first.isConnected).toBe(true);
  });

  it("goes backwards to the control before the gap", async () => {
    const { first, second } = page();
    second.focus();
    pressKey();
    second.remove();
    await settle();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(first);
  });

  it("works for a Tab pressed before the guard has parked anything", () => {
    const { first, second, card } = page();
    first.focus();
    pressKey();
    first.remove();
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(second);
    expect(tab.defaultPrevented).toBe(true);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("enters what the page drew into the gap", async () => {
    const { first, second, card } = page();
    second.focus();
    pressKey();
    second.remove();
    const drawn = document.createElement("a");
    drawn.href = "/next";
    card.append(drawn);
    await settle();
    pressKey("Tab");
    expect(document.activeElement).toBe(drawn);
    drawn.blur();
    expect(first.isConnected).toBe(true);
  });

  it("enters a step drawn where the first control of a part was", async () => {
    const { first, second, card } = page();
    first.focus();
    pressKey();
    first.remove();
    const drawn = document.createElement("input");
    card.insertBefore(drawn, second);
    await settle();
    pressKey("Tab");
    expect(document.activeElement).toBe(drawn);
  });

  it("follows the gap out when the part it was in goes too", async () => {
    const { first, card, after } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    card.remove();
    await settle();
    pressKey("Tab");
    expect(document.activeElement).toBe(after);
  });

  it("carries on from a control that is still switched off, and does not pull focus back to it after", async () => {
    const { first, second, after } = page();
    second.focus();
    pressKey();
    second.disabled = true;
    await settle();
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(after);
    expect(tab.defaultPrevented).toBe(true);
    after.blur();
    second.disabled = false;
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(first.isConnected).toBe(true);
  });

  it("goes backwards from a control that is still switched off", async () => {
    const { first, second } = page();
    second.focus();
    pressKey();
    second.disabled = true;
    await settle();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(first);
  });

  it("carries on from the gap when focus rests on a part that is a Tab stop of its own", async () => {
    const { second, card } = page();
    card.tabIndex = 0;
    second.focus();
    pressKey();
    second.remove();
    await settle();
    expect(document.activeElement).toBe(card);
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(pick("after"));
    expect(tab.defaultPrevented).toBe(true);
  });

  it("stops on the chosen radio button of a group, as the browser does", async () => {
    document.body.innerHTML =
      '<main id="main-content" tabindex="-1"><form id="card"><button id="gone">Go</button><input type="radio" name="pick" id="a" /><input type="radio" name="pick" id="b" checked /><input type="radio" name="pick" id="c" /></form></main>';
    pick("gone").focus();
    pressKey();
    pick("gone").remove();
    await settle();
    pressKey("Tab");
    expect(document.activeElement).toBe(pick("b"));
  });

  it("skips what Tab cannot stop on: switched off, hidden fields, parts that are not Tab stops", async () => {
    document.body.innerHTML =
      '<main id="main-content" tabindex="-1"><section id="card"><button id="gone">Go</button><button disabled>Off</button><input type="hidden" /><div tabindex="-1">Not a stop</div><div inert><button>Inert</button></div><a>No address</a><a id="link" href="/x">Link</a></section></main>';
    pick("gone").focus();
    pressKey();
    pick("gone").remove();
    await settle();
    pressKey("Tab");
    expect(document.activeElement).toBe(pick("link"));
  });

  it("leaves the page as the browser does from the last control, when no control lies that way", async () => {
    const { first, after, main } = page();
    after.focus();
    pressKey();
    after.remove();
    await settle();
    expect(document.activeElement).toBe(main);
    const tab = pressKey("Tab");
    const marker = document.activeElement as HTMLElement;
    expect(marker.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("edge");
    expect(document.body.lastElementChild, "the browser's Tab starts from the end of the page").toBe(marker);
    expect(tab.defaultPrevented, "the browser's own Tab does the leaving").toBe(false);
    expect(main.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(focusIsLost()).toBe(true);
    // Focus has left the page: the marker goes, and nothing is parked for it.
    marker.blur();
    await settle();
    expect(marker.isConnected).toBe(false);
    document.body.append(document.createElement("p"));
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(main.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(first.isConnected).toBe(true);
  });

  it("leaves the page backwards from its start", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    const tab = pressKey("Tab", { shiftKey: true });
    const marker = document.activeElement as HTMLElement;
    expect(marker.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("edge");
    expect(document.body.firstElementChild).toBe(marker);
    expect(tab.defaultPrevented).toBe(false);
  });

  it("leaves Tab with a modifier, and Tab when focus is somewhere real, to the browser", async () => {
    const { first, second } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    expect(pressKey("Tab", { ctrlKey: true }).defaultPrevented).toBe(false);
    second.focus();
    expect(pressKey("Tab").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(second);
  });
});

describe("while a dialog holds the keyboard", () => {
  it("a control behind it is not given focus until the dialog has closed", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    const dialog = modal('<button id="inside">Back</button>');
    first.disabled = false;
    await settle();
    expect(document.activeElement).not.toBe(first);
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("a control that goes inside it leaves focus on the part of the dialog it was in", async () => {
    const { main } = page();
    modal('<div id="step"><button id="inside">Next</button></div><button id="close">Close</button>', main);
    pick("inside").focus();
    pressKey();
    pick("inside").remove();
    await settle();
    expect(document.activeElement).toBe(pick("step"));
  });

  it("a part that goes inside it leaves focus on the dialog, never on the page behind", async () => {
    const { main } = page();
    const dialog = modal('<div id="step"><button id="inside">Next</button></div><button id="close">Close</button>', main);
    pick("inside").focus();
    pressKey();
    pick("step").remove();
    await settle();
    expect(document.activeElement).toBe(dialog);
  });

  it("a control lost on the page behind it leaves focus on the dialog", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    const dialog = modal('<button id="inside">Back</button>');
    first.remove();
    await settle();
    expect(document.activeElement).toBe(dialog);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  const LIST = '<button id="close">Close</button><section id="list"><button id="a">A</button><button id="b">B</button><button id="c">C</button></section><button id="done">Done</button>';

  /** The dialog's own Tab trap, which listens on the document as the site's shared one does. */
  function trapSpy(): { calls: number; stop: () => void } {
    const spy = { calls: 0, stop: () => document.removeEventListener("keydown", count) };
    const count = (event: KeyboardEvent): void => {
      if (event.key === "Tab") spy.calls += 1;
    };
    document.addEventListener("keydown", count);
    return spy;
  }

  it("Tab carries on inside the dialog from the place the control was, and the dialog's trap does not step again", async () => {
    const { main } = page();
    modal(LIST, main);
    const trap = trapSpy();
    pick("b").focus();
    pressKey();
    pick("b").remove();
    await settle();
    expect(document.activeElement).toBe(pick("list"));
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(pick("c"));
    expect(tab.defaultPrevented).toBe(true);
    expect(trap.calls, "the key is kept from the trap").toBe(0);
    trap.stop();
  });

  it("Shift+Tab goes back inside the dialog from that place", async () => {
    const { main } = page();
    modal(LIST, main);
    pick("b").focus();
    pressKey();
    pick("b").remove();
    await settle();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(pick("a"));
  });

  it("Tab goes round to the dialog's first control when the place was after its last one, never out to the page", async () => {
    const { main, first } = page();
    modal(LIST, main);
    pick("done").focus();
    pressKey();
    pick("done").remove();
    await settle();
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(pick("close"));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.querySelector(`[${FOCUS_PARKED_ATTRIBUTE}="edge"]`)).toBeNull();
    expect(first.isConnected).toBe(true);
  });

  it("Shift+Tab goes round to the dialog's last control when the place was before its first one", async () => {
    const { main } = page();
    modal(LIST, main);
    pick("close").focus();
    pressKey();
    pick("close").remove();
    await settle();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(pick("done"));
  });

  it("Tab is left to the dialog's own trap when the place the guard remembers is on the page behind it", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    const dialog = modal('<button id="inside">Back</button>');
    const trap = trapSpy();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(dialog);
    const tab = pressKey("Tab");
    expect(tab.defaultPrevented).toBe(false);
    expect(trap.calls).toBe(1);
    trap.stop();
  });

  it("a button that goes busy inside the dialog gets focus back there, and the page's own is still given back after", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    const dialog = modal('<button id="save">Save</button><button id="back">Back</button>', main);
    const save = pick<HTMLButtonElement>("save");
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    expect(document.activeElement).toBe(document.body);
    save.disabled = false;
    await settle();
    expect(document.activeElement).toBe(save);
    first.disabled = false;
    pick("back").focus();
    pressKey();
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("a key pressed inside the dialog does not drop what is owed on the page behind it", async () => {
    const { first, main } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    const dialog = modal('<div id="step"><button id="inside">Next</button></div><button id="back">Back</button>', main);
    pick("inside").focus();
    pressKey();
    pick("inside").remove();
    await settle();
    expect(document.activeElement).toBe(pick("step"));
    pressKey("ArrowDown");
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(pick("step"));
    dialog.remove();
    await settle();
    expect(document.activeElement).toBe(first);
  });

  it("a dialog under another one is out of reach", async () => {
    const { main } = page();
    const under = modal('<div id="step"><button id="inside">Next</button></div>', main);
    under.id = "under";
    pick("inside").focus();
    pressKey();
    under.setAttribute("aria-hidden", "true");
    const top = modal('<p id="text">Sure?</p>');
    pick("inside").remove();
    await settle();
    expect(document.activeElement).toBe(top);
  });
});

describe("while the person is in a panel that does not hold the keyboard (role dialog, not modal)", () => {
  const PANEL =
    '<main id="main-content" tabindex="-1"><section id="card"><button id="x">Generate</button><button id="afterX">After X</button></section><div id="panel" role="dialog" aria-modal="false"><div id="step"><button id="d">Pick</button><button id="nextD">Next in panel</button></div><button id="save">Save</button></div></main>';

  it("a control that goes inside the panel rests focus in the panel, and Tab carries on in the panel, not on the page", async () => {
    document.body.innerHTML = PANEL;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    pick("d").focus();
    pressKey();
    pick("d").remove();
    await settle();
    expect(document.activeElement).toBe(pick("step"));
    pressKey("Tab");
    expect(document.activeElement).toBe(pick("nextD"));
  });

  it("a control on the page that comes back on does not pull focus out of the panel", async () => {
    document.body.innerHTML = PANEL;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    pick("d").focus();
    await settle();
    x.disabled = false;
    await settle();
    pressKey();
    pick("d").remove();
    await settle();
    expect(document.activeElement).toBe(pick("step"));
    // Once the panel has closed, what was owed on the page before it is given back.
    pick("panel").remove();
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("a panel shut by inert or aria-hidden while it stays on the page fences nothing any more", async () => {
    document.body.innerHTML = PANEL;
    const x = pick<HTMLButtonElement>("x");
    x.focus();
    pressKey();
    x.disabled = true;
    await settle();
    pick("d").focus();
    pick("panel").setAttribute("inert", "");
    pick("d").blur();
    x.disabled = false;
    await settle();
    expect(document.activeElement).toBe(x);
  });

  it("moving on inside the panel drops what was owed inside it", async () => {
    document.body.innerHTML = PANEL;
    const save = pick<HTMLButtonElement>("save");
    save.focus();
    pressKey();
    save.disabled = true;
    await settle();
    pick("d").focus();
    save.disabled = false;
    pressKey();
    pick("d").remove();
    await settle();
    expect(document.activeElement).toBe(pick("step"));
  });
});

describe("where the browser keeps naming a switched-off control as the focused element", () => {
  // Chrome lets go of it at its next update of the page, never while the page is in the background; other browsers keep
  // naming it. jsdom keeps naming it too, so these run without the helper that plays Chrome's rule.
  beforeEach(() => stopFixup());

  it("a key pressed during the wait still rests focus on the part around a button, which never gets it back", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    expect(document.activeElement).toBe(first);
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(card);
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("a button that comes back with no key pressed simply has focus, and is looked after again", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.disabled = true;
    await settle();
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(first);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    first.remove();
    await settle();
    expect(document.activeElement).toBe(card);
  });

  it("a text box is waited for through keys typed ahead", async () => {
    const { card, field } = form();
    field.focus();
    pressKey();
    field.disabled = true;
    await settle();
    pressKey("a");
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    field.disabled = false;
    await settle();
    expect(document.activeElement).toBe(field);
  });

  it("Tab carries on from the control that is off", async () => {
    const { second, after } = page();
    second.focus();
    pressKey();
    second.disabled = true;
    await settle();
    const tab = pressKey("Tab");
    expect(document.activeElement).toBe(after);
    expect(tab.defaultPrevented).toBe(true);
  });
});

describe("a guard that starts after the page has put focus in a field", () => {
  it("looks after that field from the first key on", async () => {
    stopGuard();
    const { first, card } = page();
    first.focus();
    stopGuard = installFocusGuard();
    pressKey();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(card);
  });
});

describe("what the guard never does", () => {
  it("acts for a person using a pointer", async () => {
    const { first } = page();
    first.focus();
    first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    first.remove();
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("acts at a later key press on what a pointer press took away", async () => {
    const { first, card } = page();
    first.focus();
    first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    first.remove();
    await settle();
    const tab = pressKey("Tab");
    expect(tab.defaultPrevented).toBe(false);
    pressKey("ArrowDown");
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
  });

  it("gives focus back at a later key press to what a pointer press switched off", async () => {
    const { first } = page();
    first.focus();
    first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    first.disabled = true;
    await settle();
    pressKey("Shift");
    first.disabled = false;
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("takes focus from an element that has it while the page changes around it", async () => {
    const { first, second, card } = page();
    second.focus();
    pressKey();
    first.remove();
    card.append(document.createElement("p"));
    await settle();
    expect(document.activeElement).toBe(second);
  });

  it("pulls focus back into a page the person has tabbed out of", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    first.remove();
    await settle();
    expect(document.activeElement).toBe(document.body);
    expect(pressKey("Tab").defaultPrevented).toBe(false);
  });

  it("gives focus back to a control the person left themselves", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.blur();
    document.body.append(document.createElement("p"));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("follows a move to another page", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    first.remove();
    resetFocusGuard();
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("acts on a page the address has already moved on from", async () => {
    const { first } = page();
    const before = location.pathname;
    try {
      first.focus();
      pressKey();
      first.disabled = true;
      await settle();
      history.pushState({}, "", "/elsewhere");
      first.disabled = false;
      await settle();
      expect(document.activeElement).toBe(document.body);
      expect(pressKey("Tab").defaultPrevented).toBe(false);
    } finally {
      history.pushState({}, "", before);
    }
  });

  it("acts once it is stopped", async () => {
    const { first } = page();
    first.focus();
    pressKey();
    stopGuard();
    first.remove();
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves its mark on the page when it is stopped while focus is parked", async () => {
    const { first, card } = page();
    first.focus();
    pressKey();
    first.remove();
    await settle();
    expect(card.getAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe("added");
    stopGuard();
    expect(card.hasAttribute(FOCUS_PARKED_ATTRIBUTE)).toBe(false);
    expect(card.hasAttribute("tabindex")).toBe(false);
  });
});
