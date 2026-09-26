// @vitest-environment jsdom

/**
 * S02-C7 — wiring the policy modal into the sign-up card.
 *
 * Steps pinned here: S02-S49 … S02-S58, S02-S71, and R17's cases 4 and 5
 * (S02-S28 / S02-S29), which live here rather than in `consent-signup-gate.test.tsx`
 * because after this cluster the modal's acknowledgement is the only route that ticks
 * `privacy-accepted` (ARCH-REV-S02-r2 B3; V-DECISIONS row V-18).
 *
 * THE ONE IDIOM for every assertion about the `Create account` BUTTON is
 * `field(name).click()` wrapped in `await act(async () => { … })`.
 * `field(x).checked = true` fires no React change event and can never move that button;
 * `dispatchEvent(new Event("change"|"click", …))` are measured dead (SPEC.md R17 hook).
 * `.click()` TOGGLES.
 *
 * THE MIRROR ARM, stated once here and used by every open-or-dismiss route: after the
 * route under test, click `adult-affirmed` and assert `Create account` is STILL disabled.
 * `disabled` is computed from BOTH mirrors, so with `adult-affirmed` false the button is
 * disabled whatever the privacy mirror says; ticking `adult-affirmed` is what makes the
 * privacy mirror the only remaining term, so a desynced `true` shows up as an ENABLED
 * button. Without that click the route asserts nothing about the mirror at all.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * The policy scroll region's metrics, driven by the test.
 *
 * jsdom's own `scrollTop`/`clientHeight`/`scrollHeight` are all `0`, and `0 + 0 >= 0 - 8` is
 * TRUE — so a modal mounted with jsdom's defaults latches its read gate AT MOUNT and
 * `I have read it` is enabled before anything is read. The metrics therefore have to be in
 * place BEFORE the mount evaluation runs, which rules out `Object.defineProperty(element, …)`:
 * the element does not exist until React has rendered it. Shadowing the three accessors on
 * `HTMLElement.prototype` (jsdom defines them on `Element.prototype`, so these are new own
 * properties and `delete` restores the originals exactly) puts them in place before the first
 * render, and reading them from a mutable object lets one definition serve every case.
 * The idiom is CODE-S02-C5C6's, reused rather than re-derived
 * (`tests/render/consent-policy-modal-behaviour.test.tsx`; PLAN defect D2 is the `element`
 * form the plan's prose still prescribes).
 */
const TOP: Record<MetricKey, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
let metrics: Record<MetricKey, number> = { ...TOP };

function stubScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? metrics[key] : 0;
      }
    });
  }
}

function restoreScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(client?: {
  register: ReturnType<typeof vi.fn>;
}): Promise<void> {
  const stub = client ?? { register: vi.fn() };
  await act(async () => {
    root!.render((<SignUpFlow client={stub} />) as ReactNode);
  });
  await settle();
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

function createAccountButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("button.authPrimary");
  expect(button, "missing the Create account button").not.toBeNull();
  return button!;
}

function privacyRow(): HTMLElement {
  const rows = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")];
  expect(rows.length, "expected three consent rows").toBe(3);
  return rows[1]!;
}

/** The row-2 sentence element — the entry point S02-S50 drives. */
function privacyText(): HTMLElement {
  const text = privacyRow().querySelector<HTMLElement>(".consentText");
  expect(text, "missing the privacy row's sentence").not.toBeNull();
  return text!;
}

/** The `Privacy Policy` control — the entry point S02-S51 drives. */
function policyControl(): HTMLElement {
  const control = privacyRow().querySelector<HTMLElement>(".consentPolicyLink");
  expect(control, "missing the Privacy Policy control").not.toBeNull();
  return control!;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

/**
 * React's PRIVATE value tracker, READ and never written.
 *
 * ACCEPTED REACT-INTERNAL COUPLING (orchestrator ruling 2026-09-07 on
 * `CODE-REV-S02-C7 r1 N2`, recorded in `slices/S02/DECISIONS.md`). `_valueTracker` is not part
 * of React's public surface and a React upgrade may rename it — that is the price of the pin
 * and it was paid deliberately. The alternative on the table was DELETING the resync at
 * `SignUpFlow.tsx:150-153`; the ruling kept it as declared defence in depth, and
 * `heartbeat-protocol` §2.2 forbids leaving shipped code both unpinned and unexplained. The
 * tracker is the ONLY observable this property has: the reviewer measured that removing the
 * resync changes no DOM value, no button state and no route outcome anywhere in the slice
 * (mutant M11, `Tests 14 passed (14)`), because `acknowledgePolicy`'s instance assignment
 * re-syncs the tracker before any later uncheck can be swallowed. The helper degrades to the
 * string `"NO-TRACKER"` rather than throwing, so a React version that drops the field fails
 * on an assertion that NAMES the coupling instead of on a `TypeError`.
 */
function trackerValue(input: HTMLInputElement): string {
  const tracker = (input as unknown as { _valueTracker?: { getValue(): string } })._valueTracker;
  return tracker === undefined ? "NO-TRACKER" : tracker.getValue();
}

function scrollRegion(): HTMLElement {
  const region = document.querySelector<HTMLElement>(".policyBody");
  expect(region, "missing the policy scroll region").not.toBeNull();
  return region!;
}

/** The single control inside the dialog whose own text is exactly `label`. */
function policyButton(label: string): HTMLButtonElement {
  const open = dialog();
  expect(open, `expected an open dialog to find ${label} in`).not.toBeNull();
  const found = [...open!.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent === label
  );
  expect(found.length, `expected exactly one control labelled ${label}`).toBe(1);
  return found[0]!;
}

/**
 * Type into one of the card's CONTROLLED text inputs, the way React sees it.
 *
 * A plain `input.value = x` goes through React's own instance setter, which updates the value
 * TRACKER as well as the DOM — so the `input` event that follows finds no change and React's
 * `onChange` never runs, the state stays `""`, and the next render wipes what was "typed".
 * The PROTOTYPE setter bypasses the instance descriptor, leaving the tracker stale, which is
 * exactly what makes the change observable. (For a checkbox the same trick is measured NOT to
 * re-sync a tracker — that is the other direction, and it is why `.click()` is the one idiom
 * for the boxes.)
 */
async function type(name: string, value: string): Promise<void> {
  const input = field(name);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function clickElement(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
  await settle();
}

/**
 * Drive the scroll region to its end and let the gate see it. The region's metrics start at
 * `TOP` (200 of 500 visible, `0 + 200 >= 500 - 8` false), so `I have read it` is disabled on
 * arrival and this is what opens it.
 */
async function driveScrollToEnd(): Promise<void> {
  metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
  await act(async () => {
    scrollRegion().dispatchEvent(new Event("scroll", { bubbles: false }));
  });
  await settle();
}

/**
 * THE ACKNOWLEDGEMENT ROUTE, written out once. It is the ONLY route that ticks
 * `privacy-accepted` after this cluster, so every case that needs a ticked box comes through
 * here — including R17's cases 4 and 5 (V-DECISIONS row V-18). It uses the one button idiom
 * throughout, never an assignment.
 */
async function acknowledgePolicy(): Promise<void> {
  await clickElement(field("privacy-accepted"));
  expect(dialog(), "the acknowledgement route needs the policy open").not.toBeNull();
  expect(policyButton("I have read it").disabled, "disabled before the end is reached").toBe(true);

  await driveScrollToEnd();
  expect(policyButton("I have read it").disabled, "enabled once the end is reached").toBe(false);

  await clickElement(policyButton("I have read it"));

  expect(field("privacy-accepted").checked, "acknowledging must tick the box").toBe(true);
  expect(dialog(), "acknowledging must close the policy").toBeNull();
}

/**
 * THE TERMS ROUTE — the third row's own acknowledgement, the same shape as the privacy one.
 * It is what makes the terms mirror `true`, so the mirror arm below still discriminates a
 * desynced privacy mirror now that a third term sits in the button's `disabled`.
 */
async function acknowledgeTerms(): Promise<void> {
  metrics.scrollTop = TOP.scrollTop;
  await clickElement(field("terms-accepted"));
  expect(dialog(), "the terms route needs the Terms open").not.toBeNull();
  expect(dialog()!.getAttribute("aria-labelledby"), "the Terms, not the policy").toBe(
    "terms-modal-title"
  );
  expect(policyButton("I have read it").disabled, "disabled before the end is reached").toBe(true);
  await driveScrollToEnd();
  await clickElement(policyButton("I have read it"));
  expect(field("terms-accepted").checked, "acknowledging must tick the terms box").toBe(true);
  expect(dialog(), "acknowledging must close the Terms").toBeNull();
  // Back to the top for whichever document opens next: `acknowledgePolicy` asserts the
  // gate is closed at mount, and the metrics are shared.
  metrics.scrollTop = TOP.scrollTop;
}

/**
 * THE MIRROR ARM. With `terms-accepted` already ticked (through its own acknowledgement,
 * BEFORE the route under test — the arm may run while the policy is open and may be followed
 * by a dismissal of that policy, so it must open nothing itself), ticking `adult-affirmed`
 * makes the privacy mirror the only remaining term in the button's `disabled`, so a mirror
 * left `true` by an open-or-dismiss route shows up here as an ENABLED button. The
 * precondition is asserted, so a case that forgot the terms route fails loudly instead of
 * passing on a button that is disabled for the wrong reason. Uses the one button idiom, never
 * an assignment.
 */
async function mirrorArm(): Promise<void> {
  expect(
    field("terms-accepted").checked,
    "the mirror arm needs the terms box ticked first — call acknowledgeTerms() before the route"
  ).toBe(true);
  await clickElement(field("adult-affirmed"));
  expect(field("adult-affirmed").checked, "the mirror arm's own click must land").toBe(true);
  expect(createAccountButton().disabled, "Create account after the mirror arm").toBe(true);
}

/**
 * THE FOCUS-RETURN ARM, for an entry point that is not the check square.
 *
 * `SPEC.md` constant (5) quantifies over ALL THREE entry points — *focus return lands on the
 * input whatever the entry point* — and the mechanism is one line, `input.focus()` at
 * `SignUpFlow.tsx:134`, which runs before the surface opens so that `modalSemantics`
 * remembers the input as the element to restore. Until this arm existed the constant was
 * pinned for the SQUARE only: `S02-S53`/`S02-S54`/`S02-S55`/`S02-S56` all open from the
 * square, and `S02-S50`/`S02-S51` opened from the text and the control and never dismissed,
 * so they asserted nothing about focus. Measured by `CODE-REV-S02-C7 r1 N1`: the mutant
 * `if (event.target === input) input.focus();` — focus only when the click started on the
 * square — survived the whole file, `R9 | exit=0 | Tests 14 passed (14)`. A keyboard or
 * screen-reader user who activates the `Privacy Policy` control and then dismisses the policy
 * lands on `<body>` instead of the box they were filling in, and the mouse path is unaffected,
 * so nothing shows it without this assertion.
 *
 * Placed AFTER each case's existing assertions and after `mirrorArm()`, so no existing
 * assertion is reordered or weakened; the dismissal is the `×` control, the same route
 * `S02-S54` uses, and the element `modalSemantics` restores was captured at OPEN, which is
 * why the intervening `adult-affirmed` click cannot influence it.
 */
async function dismissAndExpectFocusReturn(entry: "text" | "control"): Promise<void> {
  expect(dialog(), `the ${entry} route must still have the policy open`).not.toBeNull();

  await clickElement(policyButton("×"));

  expect(dialog(), `the close control must close the policy opened from the ${entry}`).toBeNull();
  expect(
    document.activeElement,
    `constant (5): focus returns to the privacy input from the ${entry} entry point`
  ).toBe(field("privacy-accepted"));
  expect(field("privacy-accepted").checked, "and the dismissal ticks nothing").toBe(false);
}

describe("sign-up card ↔ privacy policy modal", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    metrics = { ...TOP };
    stubScrollMetrics();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    restoreScrollMetrics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* S02-S49 — R05, and R17's mirror invariant. */
  it("opens the policy from the unchecked check square, leaving box and mirror false", async () => {
    await mount();
    await acknowledgeTerms();

    await clickElement(field("privacy-accepted"));

    expect(dialog(), "the policy modal must be open").not.toBeNull();
    expect(field("privacy-accepted").checked, "the box must stay unticked").toBe(false);
    await mirrorArm();
  });

  /* S02-S50 — R05, and R17's mirror invariant. The second of the three entry points; each is
     a separate case because a preventDefault covering only one of them fails exactly one. */
  it("opens the policy from the row's text, leaving box and mirror false", async () => {
    await mount();
    await acknowledgeTerms();

    await clickElement(privacyText());

    expect(dialog(), "the policy modal must be open").not.toBeNull();
    expect(field("privacy-accepted").checked, "the box must stay unticked").toBe(false);
    await mirrorArm();

    await dismissAndExpectFocusReturn("text");
  });

  /* S02-S51 — R05, R17. The third entry point, and SPEC.md R05 calls this the single most
     likely implementation slip in the slice. */
  it("opens the policy from the Privacy Policy control, leaving box and mirror false", async () => {
    await mount();
    await acknowledgeTerms();

    await clickElement(policyControl());

    expect(dialog(), "the policy modal must be open").not.toBeNull();
    expect(field("privacy-accepted").checked, "the box must stay unticked").toBe(false);
    await mirrorArm();

    await dismissAndExpectFocusReturn("control");
  });

  /* CODE-REV-S02-C7 r1 N2, the tracker resync (`SignUpFlow.tsx:150-153`), pinned directly.
     Orchestrator ruling 2026-09-07 (`t_c0fd0601`), recorded in `slices/S02/DECISIONS.md`: the
     `queueMicrotask` block is KEPT as declared defence in depth, and it must therefore stop
     being both unpinned and unexplained (`heartbeat-protocol` §2.2).

     PROPERTY. After ONE cancelled click on the empty privacy box, React's value tracker for
     that input agrees with the DOM — both `"false"`. The cancelled click is the whole
     mechanism: the pre-click activation steps flip `checked` to `true`, React's change
     extraction records `"true"` in the tracker, and the canceled-activation steps then revert
     the DOM to `false` AFTER dispatch — leaving tracker `"true"` over DOM `false`, a state in
     which a later genuine change can go unannounced.

     WHY THE TRACKER AND NOT AN OUTCOME. The reviewer measured that no route in the slice turns
     that desync into an observable outcome today (mutant M11, the block deleted:
     `Tests 14 passed (14)`, and all nine of the reviewer's probes still green), because
     `acknowledgePolicy`'s plain instance assignment re-syncs the tracker before any uncheck
     could be swallowed. So an outcome-level assertion here would pin nothing; this one is the
     only one that discriminates. `trackerValue`'s doc-comment states the accepted coupling. */
  it("re-syncs React's value tracker after a cancelled click on the empty box", async () => {
    await mount();
    const input = field("privacy-accepted");
    expect(trackerValue(input), "React tracks this input's value at all").not.toBe("NO-TRACKER");
    expect(trackerValue(input), "the tracker starts in step with the empty box").toBe("false");

    await clickElement(input);

    expect(dialog(), "the cancelled click opens the policy").not.toBeNull();
    expect(input.checked, "and leaves the DOM box empty").toBe(false);
    expect(
      trackerValue(input),
      "the tracker must be back in step with the DOM after the cancelled click"
    ).toBe("false");
  });

  /* CODE-REV-S02-C7 r1 N6, the re-entrancy guard (`SignUpFlow.tsx:128`,
     `if (event.target !== input) input.click();`), pinned with a DISPATCHED event (`t_086c1d78`).

     PROPERTY. One user click on the TICKED privacy box runs the row handler exactly once and
     leaves the box unticked.

     WHY A DISPATCH AND NOT `.click()`. Every other case in this file reaches the DOM through
     `HTMLElement.click()`, and the HTML spec's "click in progress" flag — set by the click
     METHOD — makes the handler's synthesised `input.click()` a no-op, so the guard is
     unobservable through that path: the reviewer measured mutant R1 (the guard dropped, the
     `.click()` unconditional) as `Tests 14 passed (14)`. A real user click sets no such flag,
     and neither does `dispatchEvent(new MouseEvent("click"))`, which is why this is the one
     idiom that can see it: `HEAD -> handlerRuns=1 dom=false`, `R1 -> handlerRuns=2 dom=TRUE`
     (probe P4). With the guard gone a user clicking a ticked privacy box in a browser fails to
     untick it — two toggles instead of one — and no other test in the slice would say so.
     The `capture: true` listener counts arrivals at the row element itself, which is where the
     component's own `onClick` lives, so a re-entry is one extra count and nothing else is. */
  it("runs the row handler once for a dispatched click on the ticked box, and unticks it", async () => {
    await mount();
    await acknowledgePolicy();
    const input = field("privacy-accepted");
    expect(input.checked, "precondition: the acknowledgement ticked the box").toBe(true);

    let handlerRuns = 0;
    privacyRow().addEventListener("click", () => { handlerRuns += 1; }, { capture: true });

    await act(async () => {
      input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();

    expect(handlerRuns, "the row handler must run exactly once per user click").toBe(1);
    expect(input.checked, "a click on the ticked box unticks it").toBe(false);
    expect(dialog(), "and unticking opens no dialog").toBeNull();
  });

  /* S02-S52 — R06. The checked row unchecks directly, with no modal. The mirror arm is folded
     in from CODE-REV-S02-C3C4 r1 N1's recovery oracle: the uncheck has to travel the path
     React listens to, or the mirror stays `true` while the box is empty and `Create account`
     comes back enabled with nothing ticked. */
  it("unchecks the checked privacy row directly, with no modal and no stale mirror", async () => {
    await mount();
    await acknowledgeTerms();
    await acknowledgePolicy();

    await clickElement(privacyText());

    expect(field("privacy-accepted").checked, "the box must uncheck").toBe(false);
    expect(dialog(), "unchecking must open no dialog").toBeNull();
    await mirrorArm();
  });

  /* S02-S53 — R07 and its R17 interaction. The acknowledgement must set BOTH the DOM box and
     the R17 mirror: the DOM alone leaves Create account disabled with both boxes visibly
     ticked (V acceptance step 8), the mirror alone sends an empty box to FormData and R18
     refuses the registration. The button assertion is reached by the one idiom on
     `adult-affirmed` and by the component's own state update on `privacy-accepted` — never
     by a `.checked` assignment. */
  it("ticks the box, closes, returns focus to the input, and enables Create account", async () => {
    await mount();

    await acknowledgePolicy();

    expect(document.activeElement, "focus returns to the privacy input").toBe(
      field("privacy-accepted")
    );

    await clickElement(field("adult-affirmed"));
    expect(createAccountButton().disabled, "still disabled with the Terms box empty").toBe(true);
    await acknowledgeTerms();
    expect(createAccountButton().disabled, "Create account with all three boxes ticked").toBe(false);
  });

  /* S02-S54 — R08, R17. Against the pre-B1 rule this step's mirror arm is the one that fails
     (measured `after x: Create account .disabled false`), which is what V acceptance step 7
     forbids. */
  it("closes on the close control, leaving the box unchecked and the mirror false", async () => {
    await mount();
    await acknowledgeTerms();
    await clickElement(field("privacy-accepted"));
    expect(dialog(), "the policy modal must be open").not.toBeNull();

    await clickElement(policyButton("×"));

    expect(dialog(), "the close control must close the policy").toBeNull();
    expect(field("privacy-accepted").checked, "dismissing must not tick the box").toBe(false);
    expect(document.activeElement, "focus returns to the privacy input").toBe(
      field("privacy-accepted")
    );
    await mirrorArm();
  });

  /* S02-S55 — R08, R17. A click on the scrim ITSELF, never on a descendant of it. */
  it("closes on a backdrop click, leaving the box unchecked and the mirror false", async () => {
    await mount();
    await acknowledgeTerms();
    await clickElement(field("privacy-accepted"));
    const scrim = document.querySelector<HTMLElement>(".policyScrim");
    expect(scrim, "missing the policy scrim").not.toBeNull();

    await clickElement(scrim!);

    expect(dialog(), "a backdrop click must close the policy").toBeNull();
    expect(field("privacy-accepted").checked, "dismissing must not tick the box").toBe(false);
    expect(document.activeElement, "focus returns to the privacy input").toBe(
      field("privacy-accepted")
    );
    await mirrorArm();
  });

  /* S02-S56 — R08, R14, R17: the B3 pin, all six properties in ONE case. This is the
     consumer half of the Esc stack (the mechanism half is S02-S01): the topmost open surface
     consumes Escape and NO other surface acts on the same event. The sign-up card is what a
     second listener would damage, so the case asserts the card is untouched rather than
     counting listeners. The mirror arm needs no extra click here — `adult-affirmed` and
     `terms-accepted` are already ticked, so the privacy mirror is the only remaining term in
     `disabled`. */
  it("closes on one Escape and nothing else acts on that event", async () => {
    await mount();
    await type("email", "person@example.test");
    await type("recovery-email", "recovery@example.test");
    await type("password", "correct horse battery staple");
    await clickElement(field("adult-affirmed"));
    await acknowledgeTerms();
    await clickElement(field("privacy-accepted"));
    expect(dialog(), "the policy modal must be open").not.toBeNull();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    await settle();

    // (a) the dialog is gone
    expect(dialog(), "Escape must close the policy").toBeNull();
    // (b) the form and both checkbox inputs are still in the document
    expect(document.querySelectorAll("form"), "the sign-up form survives").toHaveLength(1);
    expect(document.body.contains(field("adult-affirmed"))).toBe(true);
    expect(document.body.contains(field("privacy-accepted"))).toBe(true);
    expect(document.body.contains(field("terms-accepted"))).toBe(true);
    // (c) the three text fields still hold what was typed
    expect(field("email").value).toBe("person@example.test");
    expect(field("recovery-email").value).toBe("recovery@example.test");
    expect(field("password").value).toBe("correct horse battery staple");
    // (d) the boxes are untouched
    expect(field("adult-affirmed").checked, "the 18+ box stays ticked").toBe(true);
    expect(field("privacy-accepted").checked, "the privacy box stays empty").toBe(false);
    expect(field("terms-accepted").checked, "the terms box stays ticked").toBe(true);
    // (e) focus is back on the privacy input
    expect(document.activeElement, "focus returns to the privacy input").toBe(
      field("privacy-accepted")
    );
    // (f) the mirror arm
    expect(createAccountButton().disabled, "Create account after Escape").toBe(true);
  });

  /* S02-S57 — R14 and the ARCH placement decision. No control inside the policy can submit
     the registration, whatever its `type` says, and Enter inside it cannot register. */
  it("renders the policy OUTSIDE the sign-up form", async () => {
    await mount();
    await clickElement(field("privacy-accepted"));

    const form = document.querySelector<HTMLFormElement>("form");
    expect(form, "missing the sign-up form").not.toBeNull();
    const open = dialog();
    expect(open, "the policy modal must be open").not.toBeNull();
    expect(form!.contains(open!), "the dialog must not be inside the form").toBe(false);

    // …and the parent chain reaches <body> without passing through the form.
    const chain: HTMLElement[] = [];
    for (let node = open!.parentElement; node !== null; node = node.parentElement) {
      chain.push(node);
    }
    expect(chain, "the dialog's parent chain must reach body").toContain(document.body);
    expect(chain, "the dialog's parent chain must not pass through the form").not.toContain(form!);
  });

  /* S02-S58 — R14. The read-only mode belongs to S01's card, not to this one. */
  it("opens the policy in consent mode, not in read mode", async () => {
    await mount();
    await clickElement(field("privacy-accepted"));

    const open = dialog();
    expect(open, "the policy modal must be open").not.toBeNull();
    const labels = [...open!.querySelectorAll("button")].map((button) => button.textContent);
    expect(labels, "consent mode renders I have read it").toContain("I have read it");
    expect(labels, "consent mode renders no Close button").not.toContain("Close");
  });

  /* S02-S71 — R05, R03, R17: the keyboard route goes THROUGH the read gate, not around it.
     jsdom 30.0.1 does not turn a `Space` keystroke into activation (`clickEventsSeen=0`), so
     the case drives the activation a browser would run and the keystroke itself is V's
     (V acceptance step 14, the observation that settles the contested row at DECISIONS:99).

     PLAN DEFECT, measured, and this case carries the corrected property. The step's third
     assertion reads "`document.activeElement` is still that input", with
     "Measured … activeElement=privacy-accepted". Against the SHIPPED modal that is
     unsatisfiable and must not be made true: `SPEC.md` R16 puts INITIAL FOCUS on the `×`
     control, `modalSemantics.useModalSurface` implements it, and
     `consent-policy-modal-behaviour.test.tsx:256` already pins it — the ARCH figure was taken
     against a stand-in with no modal focus management. Written the step's way this file fails
     with `expected <button type="button" …> to be <input class="consentBox" …>`. What the
     step exists to establish is the keyboard ROUND TRIP, and that is what is asserted here:
     activation moves focus INTO the policy, and dismissing it returns focus to the input the
     reader started from — strictly more than the original wording, and true. */
  it("opens the policy from an activation of the focused empty box, and returns focus", async () => {
    await mount();
    await acknowledgeTerms();
    field("privacy-accepted").focus();
    expect(document.activeElement, "the box must be focusable").toBe(field("privacy-accepted"));

    await clickElement(field("privacy-accepted"));

    expect(dialog(), "the policy modal must be open").not.toBeNull();
    expect(field("privacy-accepted").checked, "the box must stay unticked").toBe(false);
    expect(document.activeElement, "R16: initial focus is the close control").toBe(
      policyButton("×")
    );

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });
    await settle();

    expect(dialog(), "Escape must close the policy").toBeNull();
    expect(document.activeElement, "focus returns to the box the reader started from").toBe(
      field("privacy-accepted")
    );
    expect(field("privacy-accepted").checked, "the round trip ticks nothing").toBe(false);
    await mirrorArm();
  });

  /* S02-S28 — R17 case 4, reached the only lawful way (ARCH-REV-S02-r2 B3; V-18 default (a)).
     It is the positive control for cases 1-3 in `consent-signup-gate.test.tsx`, and it is the
     control that stops a `disabled` hard-coded `true` — the mutant C4's command lost when
     this case moved here. "Enabled" is asserted together with the box actually being ticked,
     so it can never be reached with an empty box. */
  it("enables Create account with both boxes checked, the privacy one via the policy", async () => {
    await mount();

    await acknowledgePolicy();
    await clickElement(field("adult-affirmed"));
    await acknowledgeTerms();

    expect(field("privacy-accepted").checked, "the privacy box is genuinely ticked").toBe(true);
    expect(field("adult-affirmed").checked, "the 18+ box is genuinely ticked").toBe(true);
    expect(field("terms-accepted").checked, "the terms box is genuinely ticked").toBe(true);
    expect(createAccountButton().disabled, "Create account with all three boxes ticked").toBe(false);
  });

  /* S02-S29 — R17 case 5 (REQ-REV-01 B5), in R17's order with only the last movement
     re-routed. The reset is load-bearing on `adult-affirmed`: `.click()` TOGGLES, so clicking
     a box already assigned `true` drives it to `false`, `onChange` fires with `false`, and the
     button correctly stays disabled. It is no longer load-bearing on `privacy-accepted`,
     whose half now goes through the acknowledgement — which SETS the box rather than toggling
     it. This case documents the toggle; the controlled-inputs guarantee is S02-S30's. */
  it("announces nothing on assignment, and enables only after real activations", async () => {
    await mount();

    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    field("terms-accepted").checked = true;
    expect(createAccountButton().disabled, "assignment announces nothing to React").toBe(true);

    field("adult-affirmed").checked = false;
    field("privacy-accepted").checked = false;
    field("terms-accepted").checked = false;

    await clickElement(field("adult-affirmed"));
    await acknowledgePolicy();
    await acknowledgeTerms();

    expect(createAccountButton().disabled, "Create account after three real activations")
      .toBe(false);
  });

  /* The conditional-mount pin (orchestrator ruling 2026-09-07, CODE-REV-S02-C5C6 r1 N7).
     The card mounts the modal as `{policyOpen && <PrivacyPolicyModal …/>}`, so every open is
     a FRESH read: the scroll gate resets, the reader starts at the top, and `I have read it`
     is disabled again until they reach the end. A persistently mounted modal — one that only
     flips its `open` prop — keeps `reachedEnd` across the close and shows an ENABLED
     acknowledgement over an unread top-of-policy view. That is the mutant this case catches,
     and it is the only case in the slice that can. */
  it("resets the read gate on every reopen, because the policy is mounted per open", async () => {
    await mount();
    await clickElement(field("privacy-accepted"));
    await driveScrollToEnd();
    expect(policyButton("I have read it").disabled, "enabled at the end of the first read")
      .toBe(false);

    await clickElement(policyButton("×"));
    expect(dialog(), "the close control must close the policy").toBeNull();

    // A fresh render starts at the top of the policy, so the metrics go back to the top too.
    metrics.scrollTop = TOP.scrollTop;
    await clickElement(field("privacy-accepted"));

    expect(dialog(), "the policy must reopen").not.toBeNull();
    expect(policyButton("I have read it").disabled, "disabled again on a fresh read").toBe(true);
    expect(field("privacy-accepted").checked, "reopening ticks nothing").toBe(false);
  });
});
