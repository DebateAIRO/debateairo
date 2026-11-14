/*
 * The focus guard (keyboard audit, 12 Nov 2026).
 *
 * The audit's most common fault, on almost every screen: a person using the keyboard presses a control, the control is
 * switched off for the wait (`disabled={busy}`) or taken off the page (a step, a row, a note, a whole screen swapped), and
 * the browser drops focus to the page itself. Nothing is focused any more, no ring shows, and in Safari the next Tab
 * starts again from the top of the page. Round 1 (22 Oct) fixed this place by place; every panel written since brought it
 * back. This guard is the one rule under all of them, for the whole site:
 *
 *   1. The control is still there but cannot hold focus (switched off, hidden, inert): focus is OWED to it. When it can
 *      hold focus again, it gets it back. (Sign in, wrong password: focus is back in the password box.) A key pressed
 *      during the wait on a control that keys PRESS (a button, a link, a tick box) means the person has moved on: it is
 *      never given focus back then, so a later Space cannot press it a second time. A text box is different: what is
 *      typed ahead is lost either way, and the caret coming back is what the person is waiting for.
 *   2. The control is gone: focus is PARKED on the nearest part of the page around it that is still there (the main area
 *      when that part wraps the whole page), so focus is never on nothing. A parked part is not a control: it only keeps
 *      the place, wears the `data-focus-parked` mark while it does, and is left exactly as it was once focus moves on.
 *   3. Tab carries on from where the control WAS, not from the start of the part focus rests on: the place itself is
 *      remembered (the gap the control left, or the control while it is off), and the next Tab or Shift+Tab goes to the
 *      control after or before that place. This is what Chrome does by itself for a removed control; here every browser
 *      does it, and a parked part never changes it. When no control lies that way, Tab leaves the page, as it does from
 *      the last control: an empty marker at that end of the page holds focus for the length of the key press.
 *
 * A place that knows better still decides: every `.focus()` a screen makes itself wins, because the guard waits a moment
 * before it acts and only ever acts while NO element holds focus. `focusIsLost()` is that test, for the screens' own rules
 * ("only if nothing has focus"): a parked part counts as nothing.
 *
 * A dialog or panel asked over the page fences all of this in while it is open: what was owed before it opened waits
 * for it to close, a loss inside it rests inside it, and in a dialog that holds the keyboard Tab goes round inside it.
 *
 * What it never does: take focus from an element that has it; act for a person using a pointer (a click on plain text
 * drops focus on purpose); act while the page itself is not focused (the person tabbed into the browser's own bar); put
 * focus behind an open dialog; move focus by itself after a long wait (the person has read on: only their next key
 * press does); scroll the page when it parks or gives focus back; or follow a move to another page (the new page
 * starts at its top, as a fresh load does).
 */

/**
 * The mark a parked part wears: "added" when the guard had to make it focusable, "kept" when it already was, "edge" on
 * the guard's own empty marker at the start or end of the page.
 */
export const FOCUS_PARKED_ATTRIBUTE = "data-focus-parked";

/** How long a screen has to place focus itself before the guard does. */
export const FOCUS_GUARD_SETTLE_MS = 80;

/**
 * How long a switched-off control is given focus back by itself. After that the person has read on, and pulling them
 * back would be rude: nothing moves until their next key press (Tab carries on from it; another key rests focus on the
 * part around it).
 */
export const FOCUS_GUARD_OWED_MS = 10_000;

/** Focus inside one of these is a detour (a dialog asked over the page), not the person moving on. */
const DETOUR = '[aria-modal="true"], [role="dialog"], [role="alertdialog"]';

/** A dialog that holds the keyboard: focus is never moved to anything outside the one on top. */
const MODAL = '[aria-modal="true"]';

/** What keeps a part, and everything in it, out of reach. */
const OUT_OF_REACH = '[inert], [aria-hidden="true"]';

/** The attributes that switch a control off or hide it without taking it off the page. */
const SWITCHES = ["disabled", "hidden", "inert", "open"];

/** Keys that are held or locked, not pressed: they are not the person acting. */
const NOT_A_PRESS = new Set([
  "Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock", "ScrollLock", "Fn", "FnLock", "Hyper", "Super",
  "Symbol", "SymbolLock", "OS"
]);

/** Everything Tab can stop on, before the checks in `tabStops`. */
const TAB_STOPS = "a[href], button, input, select, textarea, summary, iframe, [tabindex]";

/** Anything that can take focus: the Map's wedges are SVG shapes. */
type Focusable = HTMLElement | SVGElement;

type Place = Readonly<{ el: Focusable; around: readonly HTMLElement[] }>;

/**
 * Where the lost control was, for Tab: the control itself while it is still on the page, or the gap it left (the part
 * it was taken out of, and what stood just before it and just after it).
 */
type Spot = Readonly<{ at: Focusable }> | Readonly<{ parent: Node; prev: Node | null; next: Node | null }>;

type Guard = {
  /** The element that last took focus, with the parts around it as they were then (nearest first). */
  held: Place | null;
  /** A control that lost focus without the person leaving it, and when; it gets focus back once it can hold it. */
  owed: (Place & Readonly<{ since: number }>) | null;
  /** The parts that were around a control that is gone, waiting for a part to park on. */
  gone: readonly HTMLElement[] | null;
  /** Where the lost control was, for the next Tab. */
  spot: Spot | null;
  /** The part focus is parked on. */
  parked: Focusable | null;
  /** The dialog or panel the person's focus was last in, if any. */
  detour: Element | null;
  /** A control owed focus on the page behind a dialog or panel that is open: it waits there until that has closed. */
  outer: Place | null;
  /** The page the loss happened on. */
  path: string;
  /** True while the person's last input came from the keyboard. */
  keyboard: boolean;
  /** True while the guard itself moves focus. */
  moving: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

let live: Guard | null = null;

/**
 * True when no element holds focus: the page's body has it, or a part the guard parked it on. For a screen's own rule of
 * the form "put focus here, but only if the person's focus is not somewhere real".
 */
export function focusIsLost(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return active === null || active === document.body || active.hasAttribute(FOCUS_PARKED_ATTRIBUTE);
}

/** True when `element` is only holding the place for the guard (so it is not an opener to give focus back to). */
export function isFocusParked(element: Element | null): boolean {
  return element !== null && element.hasAttribute(FOCUS_PARKED_ATTRIBUTE);
}

/** A move to another page: nothing is owed across it. */
export function resetFocusGuard(): void {
  if (live === null) return;
  live.owed = null;
  live.outer = null;
  live.gone = null;
  live.spot = null;
  if (live.held !== null && !live.held.el.isConnected) live.held = null;
}

function placeOf(el: Focusable): Place {
  const around: HTMLElement[] = [];
  for (let up = el.parentElement; up !== null; up = up.parentElement) around.push(up);
  return { el, around };
}

/**
 * jsdom has no layout and no `checkVisibility`; there every connected element counts as shown. An element that only
 * lends its children to the layout (`display: contents`) has no box of its own but can still be focused, so it counts
 * as shown: a real place is never taken for a lost one.
 */
function shown(el: Element): boolean {
  if (typeof el.checkVisibility !== "function") return true;
  return el.checkVisibility({ visibilityProperty: true }) || getComputedStyle(el).display === "contents";
}

function canHoldFocus(el: Focusable): boolean {
  return el.isConnected && !el.matches(":disabled") && el.closest("[inert]") === null && shown(el);
}

function unpark(el: Focusable): void {
  const mark = el.getAttribute(FOCUS_PARKED_ATTRIBUTE);
  if (mark === "edge") {
    el.remove();
    return;
  }
  if (mark === "added") el.removeAttribute("tabindex");
  el.removeAttribute(FOCUS_PARKED_ATTRIBUTE);
}

/** The kinds of `<input>` a person types text into. A key pressed there writes; it does not press anything. */
const TYPED = new Set(["text", "search", "email", "password", "tel", "url", "number"]);

function takesTyping(el: Focusable): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TYPED.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable === true;
}

/** In a group of radio buttons with one chosen, Tab stops on the chosen one only. */
function radioPassedOver(el: Element): boolean {
  if (!(el instanceof HTMLInputElement) || el.type !== "radio" || el.checked || el.name === "") return false;
  const scope: ParentNode = el.form ?? document;
  for (const other of scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    if (other.checked && other.name === el.name && other.form === el.form) return true;
  }
  return false;
}

/** The dialog on top, if one holds the keyboard now. A dialog under another is out of reach while that one is open. */
function openModal(): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(MODAL);
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const modal = all[index]!;
    if (modal.closest(OUT_OF_REACH) === null && shown(modal)) return modal;
  }
  return null;
}

/** Every control Tab stops on, in the order of the page; only those inside `within` when a dialog holds the keyboard. */
function tabStops(within: ParentNode | null): Focusable[] {
  return [...(within ?? document).querySelectorAll<HTMLElement>(TAB_STOPS)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el instanceof HTMLInputElement && el.type === "hidden") &&
      !radioPassedOver(el) &&
      canHoldFocus(el)
  );
}

const follows = (anchor: Node, other: Node): boolean =>
  (anchor.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const precedes = (anchor: Node, other: Node): boolean =>
  (anchor.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;

/**
 * The control Tab (or Shift+Tab) reaches from `spot`, or null when there is none that way or the place is no longer on
 * the page. Whatever the page drew INTO the gap since (the next step, an error) comes after the place, as it does for
 * Chrome's own bookmark: Tab enters it.
 */
function stopFrom(spot: Spot, backwards: boolean, stops: readonly Focusable[]): Focusable | null {
  let after: (stop: Focusable) => boolean;
  let before: (stop: Focusable) => boolean;
  if ("at" in spot) {
    const at = spot.at;
    if (!at.isConnected) return null;
    after = (stop) => follows(at, stop) && !at.contains(stop);
    before = (stop) => precedes(at, stop);
  } else {
    const { parent, prev, next } = spot;
    if (!parent.isConnected) return null;
    if (prev !== null && prev.parentNode === parent) {
      after = (stop) => follows(prev, stop) && !prev.contains(stop);
      before = (stop) => stop === prev || prev.contains(stop) || precedes(prev, stop);
    } else if (prev !== null && next !== null && next.parentNode === parent) {
      // What stood before it went too: what stood after it still marks the place.
      after = (stop) => stop === next || next.contains(stop) || follows(next, stop);
      before = (stop) => precedes(next, stop);
    } else {
      // It was the first thing in its part (or nothing beside it is left): the place is the part's start.
      after = (stop) => stop !== parent && (parent.contains(stop) || follows(parent, stop));
      before = (stop) => stop === parent || precedes(parent, stop);
    }
  }
  if (!backwards) return stops.find(after) ?? null;
  for (let index = stops.length - 1; index >= 0; index -= 1) if (before(stops[index]!)) return stops[index]!;
  return null;
}

/** Starts the guard for this document and returns the way to stop it. One guard at a time. */
export function installFocusGuard(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => undefined;
  const guard: Guard = {
    held: null, owed: null, gone: null, spot: null, parked: null, detour: null, outer: null, path: "", keyboard: false,
    moving: false, timer: null
  };
  live = guard;

  const forget = (): void => {
    guard.owed = null;
    guard.outer = null;
    guard.gone = null;
    guard.spot = null;
  };

  /**
   * `deep` also asks whether the browser still names, as the focused element, a control it can no longer focus. Chrome
   * lets go of it at its next update of the page (never, while the page is in the background); other browsers keep
   * naming it. Either way the person's keys reach nothing. Only worth the style check when a switch was just flipped,
   * or a key is pressed.
   */
  const lost = (deep: boolean): boolean => {
    if (focusIsLost()) return true;
    if (!deep) return false;
    const active = document.activeElement;
    return (active instanceof HTMLElement || active instanceof SVGElement) && !canHoldFocus(active);
  };

  /** The element that has focus now, when no focus event told the guard (it started after the page focused a field). */
  const seed = (): void => {
    const active = document.activeElement;
    if (guard.held !== null || active === document.body || isFocusParked(active)) return;
    if ((active instanceof HTMLElement || active instanceof SVGElement) && canHoldFocus(active)) guard.held = placeOf(active);
  };

  /** Focus rests on the part the guard put it on (a part that is a Tab stop of its own wears no mark). */
  const rests = (): boolean => guard.parked !== null && document.activeElement === guard.parked;

  const move = (el: Focusable): void => {
    guard.moving = true;
    try {
      el.focus({ preventScroll: true });
    } finally {
      guard.moving = false;
    }
  };

  const takes = (el: Focusable): boolean => {
    const added = !el.hasAttribute("tabindex") && el.tabIndex < 0;
    if (added) el.setAttribute("tabindex", "-1");
    // A part that is a Tab stop of its own (a scrolling region, the map) is a real place to be, not a parked one: it
    // wears no mark, and a screen's own "only if nothing has focus" rule leaves it alone. Tab still carries on from
    // the place the control was.
    const parked = el.tabIndex < 0;
    if (parked) el.setAttribute(FOCUS_PARKED_ATTRIBUTE, added ? "added" : "kept");
    move(el);
    if (document.activeElement === el) {
      guard.parked = el;
      return true;
    }
    unpark(el);
    return false;
  };

  /** A wait that has run out stays run out: a dialog that comes and goes later does not bring the control back. */
  const waitedLong = (owed: Readonly<{ since: number }>): boolean => Date.now() - owed.since > FOCUS_GUARD_OWED_MS;

  /** The dialog or panel the person's focus was last in, while it is still open. */
  const openDetour = (): Element | null => {
    const detour = guard.detour;
    return detour !== null && detour.isConnected && detour.closest(OUT_OF_REACH) === null && shown(detour) ? detour : null;
  };

  /**
   * The dialog or panel that fences things in now, with what is owed sorted against it: a control owed focus on the page
   * behind it waits (`outer`) and is owed again, its wait starting afresh, once that dialog or panel has closed. A loss
   * inside what has closed is over by then.
   */
  const fenceNow = (): Element | null => {
    const fence = openModal() ?? openDetour();
    if (guard.owed !== null && fence !== null && !fence.contains(guard.owed.el)) {
      if (!waitedLong(guard.owed)) guard.outer = guard.outer ?? guard.owed;
      guard.owed = null;
    }
    const outer = guard.outer;
    if (outer !== null && (fence === null || fence.contains(outer.el))) {
      guard.outer = null;
      if (fence === null || guard.owed === null) guard.owed = { ...outer, since: Date.now() };
    }
    return fence;
  };

  /** Parks on the nearest part of `around` that takes focus; inside `fence` when a dialog or panel is open. */
  const park = (around: readonly HTMLElement[], fence: Element | null): void => {
    if (isFocusParked(document.activeElement)) return;
    const main = document.getElementById("main-content") ?? document.querySelector<HTMLElement>("main");
    for (const el of around) {
      // A part that wraps the whole page (the app shell, the body) keeps no place at all: the main area does.
      if (el === document.body || el === document.documentElement || (main !== null && el !== main && el.contains(main))) break;
      if (fence !== null && !fence.contains(el)) break;
      if (!el.isConnected || el.closest(OUT_OF_REACH) !== null) continue;
      if (takes(el)) return;
    }
    const last = fence ?? main;
    if ((last instanceof HTMLElement || last instanceof SVGElement) && last.closest(OUT_OF_REACH) === null) takes(last);
  };

  /**
   * Sorts out what happened to the element that had focus. `touched` says the page just changed that element or a part
   * around it: took it out and put it back (a list re-ordered under focus), or switched it off and on again in one go.
   */
  const classify = (touched: boolean, deep: boolean): void => {
    if (!lost(deep)) {
      if (rests()) return;
      guard.gone = null;
      guard.spot = null;
      // The browser never let go of the control that was owed focus, and it is usable again: it simply has it.
      if (guard.owed !== null && guard.owed.el === document.activeElement) {
        guard.held = { el: guard.owed.el, around: guard.owed.around };
        guard.owed = null;
      }
      return;
    }
    const held = guard.held;
    if (held === null) return;
    const wasParked = held.el === guard.parked || isFocusParked(held.el);
    // Still resting on the part it was parked on: nothing new has happened.
    if (wasParked && document.activeElement === held.el && canHoldFocus(held.el)) return;
    guard.held = null;
    // Focus left the page from the guard's own marker: that is the person leaving, not a loss.
    if (held.el.getAttribute(FOCUS_PARKED_ATTRIBUTE) === "edge") return;
    if (!guard.keyboard) {
      // A person using a pointer: focus on the page is theirs to leave there, now and at their next key press.
      forget();
      return;
    }
    guard.path = location.pathname;
    // A part focus was only parked on is never owed focus: when it goes, the next part around it takes over.
    if (!held.el.isConnected || wasParked) {
      guard.gone = guard.gone ?? held.around;
      return;
    }
    if (!canHoldFocus(held.el) || touched) guard.owed = { ...held, since: Date.now() };
    // Otherwise: still there, still focusable, and the page did not touch it. The person let go of it themselves.
  };

  /** `now` is a key press: the person is acting, so a control that keys press is not waited for any longer. */
  const act = (now: boolean): void => {
    if (!guard.keyboard || !lost(true)) return;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return;
    if (guard.path !== location.pathname) {
      forget();
      return;
    }
    const fence = fenceNow();
    const owed = guard.owed;
    if (owed !== null) {
      const long = waitedLong(owed);
      if (!owed.el.isConnected) {
        // Taken off the page. After a long wait nothing moves by itself for that either: it is kept until the
        // person's next key, which rests focus on the part around it (Tab carries on from the gap it left).
        if (!long || now) {
          guard.owed = null;
          guard.gone = guard.gone ?? owed.around;
        }
      } else if (now && (long || !takesTyping(owed.el))) {
        // The person pressed a key before a control that keys press came back, or after a long wait: they have moved
        // on. Its place is kept for Tab and focus rests on the part around it; it is never given focus back behind
        // their back.
        guard.owed = null;
        guard.spot = { at: owed.el };
        guard.gone = guard.gone ?? owed.around;
      } else if (!long && canHoldFocus(owed.el)) {
        guard.owed = null;
        move(owed.el);
        if (document.activeElement === owed.el) {
          guard.gone = null;
          guard.spot = null;
          return;
        }
        // The browser would not focus it after all: its surroundings keep the place.
        guard.spot = guard.spot ?? { at: owed.el };
        guard.gone = guard.gone ?? owed.around;
      }
      // Otherwise it is still off (a text box is waited for, whatever is typed meanwhile), or the wait has been long:
      // nothing moves by itself then.
    }
    if (guard.gone === null) return;
    const around = guard.gone;
    guard.gone = null;
    park(around, fence);
  };

  /**
   * Tab with nothing focused: carries on from where the lost control was. True when the guard answered the key itself.
   * In a dialog that holds the keyboard it goes round inside the dialog, and the key is kept from the dialog's own trap,
   * which would otherwise step once more.
   */
  const tabOn = (event: KeyboardEvent): boolean => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!(lost(true) || rests()) || guard.path !== location.pathname) return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    const modal = openModal();
    // What is owed behind an open dialog or panel is not where the person is: the newer place inside it is.
    fenceNow();
    const owed = guard.owed;
    const spot: Spot | null = owed !== null && owed.el.isConnected ? { at: owed.el } : guard.spot;
    if (spot === null) return false;
    const place = "at" in spot ? spot.at : spot.parent;
    if (!place.isConnected || (modal !== null && !modal.contains(place))) return false;
    const stops = tabStops(modal);
    let stop = stopFrom(spot, event.shiftKey, stops);
    if (modal !== null) {
      if (stops.length === 0) return false;
      stop = stop ?? (event.shiftKey ? stops[stops.length - 1]! : stops[0]!);
    }
    guard.gone = null;
    guard.spot = null;
    guard.owed = null;
    if (stop !== null) {
      event.preventDefault();
      if (modal !== null) event.stopPropagation();
      stop.focus();
      return true;
    }
    // No control lies that way: the browser's own Tab leaves the page from the marker, as it does from the last control.
    const marker = document.createElement("span");
    marker.tabIndex = -1;
    marker.setAttribute(FOCUS_PARKED_ATTRIBUTE, "edge");
    marker.style.cssText = "position:fixed;width:0;height:0;outline:none";
    if (event.shiftKey) document.body.prepend(marker);
    else document.body.append(marker);
    marker.focus({ preventScroll: true });
    if (document.activeElement === marker) guard.parked = marker;
    else marker.remove();
    return true;
  };

  const settle = (): void => {
    if (guard.timer !== null) return;
    guard.timer = setTimeout(() => {
      guard.timer = null;
      classify(false, true);
      act(false);
    }, FOCUS_GUARD_SETTLE_MS);
  };

  const onMutation = (records: MutationRecord[]): void => {
    const held = guard.held;
    let touched = false;
    let switched = false;
    for (const record of records) {
      if (record.type === "attributes") {
        switched = true;
        if (held !== null && record.target.contains(held.el)) touched = true;
        continue;
      }
      if (held === null && guard.owed === null && guard.spot === null) continue;
      for (const node of record.removedNodes) {
        if (node instanceof Element && node.getAttribute(FOCUS_PARKED_ATTRIBUTE) === "edge") continue;
        const spot = guard.spot;
        const tookHeld = held !== null && node.contains(held.el);
        const tookOwed = guard.owed !== null && node.contains(guard.owed.el);
        const tookSpot = spot !== null && node.contains("at" in spot ? spot.at : spot.parent);
        if (tookHeld) touched = true;
        // The gap is where Tab carries on from. A part taken out with the gap inside it moves the gap out to its own.
        if (tookHeld || tookOwed || tookSpot) {
          guard.spot = { parent: record.target, prev: record.previousSibling, next: record.nextSibling };
        }
      }
    }
    classify(touched, switched);
    if (guard.owed !== null || guard.gone !== null || guard.outer !== null) settle();
  };

  const onFocusIn = (event: FocusEvent): void => {
    const el = event.target;
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return;
    const before = guard.held;
    guard.held = placeOf(el);
    guard.gone = null;
    guard.detour = el.closest(DETOUR);
    // A part left parked without a blur (hidden or made inert under focus) is tidied as soon as focus is anywhere else.
    if (guard.parked !== null && guard.parked !== el) {
      const stale = guard.parked;
      guard.parked = null;
      unpark(stale);
    }
    if (guard.moving) return;
    guard.spot = null;
    // The person (or the screen) moved on to another control: nothing is owed any more. A dialog or panel over the page
    // is a detour: what was owed on the page before it waits for it to close, however long the person stays in there.
    const owed = guard.owed;
    guard.owed = null;
    if (guard.detour === null) guard.outer = null;
    else if (owed !== null && !guard.detour.contains(owed.el)) guard.outer = guard.outer ?? (waitedLong(owed) ? null : owed);
    // A dialog that takes focus in the same breath as the control that opened it is switched off: focus never fell to
    // the page, so no loss was seen, but that control is owed focus all the same once the dialog has closed.
    else if (
      guard.outer === null && owed === null && guard.keyboard && before !== null && before.el !== el &&
      before.el.isConnected && !guard.detour.contains(before.el) && !canHoldFocus(before.el)
    ) guard.outer = before;
  };

  const onFocusOut = (event: FocusEvent): void => {
    const el = event.target;
    if (!(el instanceof HTMLElement || el instanceof SVGElement) || !isFocusParked(el)) return;
    // Looked at once the browser has settled: a window that loses focus blurs the element and gives it back later.
    setTimeout(() => {
      if (document.activeElement === el) return;
      // The guard's own marker is not a control the page took away: nothing is owed for it.
      if (el.getAttribute(FOCUS_PARKED_ATTRIBUTE) === "edge" && guard.held?.el === el) guard.held = null;
      unpark(el);
      if (guard.parked === el) guard.parked = null;
    }, 0);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    guard.keyboard = true;
    if (NOT_A_PRESS.has(event.key)) return;
    // What the page changed just before this key is looked at first, so the key acts on the page as it is now.
    const pending = observer.takeRecords();
    if (pending.length > 0) onMutation(pending);
    seed();
    classify(false, true);
    // A key held down is one press, not the person acting again; a shortcut (Ctrl+F) is for the browser or the page.
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (tabOn(event)) return;
    act(true);
  };

  // A press with a pointer is the person choosing a new place themselves: nothing from before it is owed.
  const onPointer = (): void => {
    guard.keyboard = false;
    forget();
  };

  seed();
  const observer = new MutationObserver(onMutation);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: SWITCHES });
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onPointer, true);
  document.addEventListener("mousedown", onPointer, true);
  document.addEventListener("touchstart", onPointer, true);

  return () => {
    observer.disconnect();
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointer, true);
    document.removeEventListener("mousedown", onPointer, true);
    document.removeEventListener("touchstart", onPointer, true);
    if (guard.timer !== null) clearTimeout(guard.timer);
    if (guard.parked !== null) unpark(guard.parked);
    if (live === guard) live = null;
  };
}
