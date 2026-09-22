// @vitest-environment jsdom
/**
 * CODE-REV-S02-C7 r1 — reviewer's OWN probe kit. Built from the SPEC/PLAN claims, not from the
 * author's test file. Copied into tests/render/ under a scratch name for the run, then deleted.
 *
 * P1  a SPEC-CONFORMANT legacy-canceled-activation (SAVE/RESTORE, not jsdom's re-TOGGLE)
 * P2  ordering: React commit vs. legacy-canceled-activation vs. the queueMicrotask resync
 * P3  the F2 route t_d9ccb5d3 feared: cancelled -> x -> cancelled -> acknowledge -> uncheck,
 *     with React's private value TRACKER read at every step
 * P4  the re-entrancy guard under a dispatch that does NOT set the spec's click-in-progress flag
 * P5  document order: the policy modal vs. the auth card (the narrowed :29-37 comment's premise)
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
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

/* ---- the SPEC-CONFORMANT canceled-activation shim (P1) ------------------------------ */
/* jsdom 30.0.1 HTMLInputElement-impl.js:179-182 re-TOGGLES on cancel. The HTML standard says
   "set this element's checkedness ... back to the values they had before the
   legacy-pre-activation behavior was run" — a SAVE/RESTORE. The two agree unless something
   writes .checked between the two steps, which is exactly what the packet's literal placement
   does. This shim makes jsdom conformant so the packet's placement can be judged for a BROWSER. */
type InputImpl = {
  type: string; checked: boolean; indeterminate: boolean;
  _legacyPreActivationBehavior(): void; _legacyCanceledActivationBehavior(): void;
  __savedChecked?: boolean; __savedIndeterminate?: boolean;
};
let implProto: InputImpl | null = null;
let originals: { pre: () => void; cancel: () => void } | null = null;

function implPrototypeOf(el: HTMLInputElement): InputImpl {
  const sym = Object.getOwnPropertySymbols(el).find((s) => String(s).includes("impl"));
  if (sym === undefined) throw new Error("jsdom impl symbol not found on the wrapper");
  const impl = (el as unknown as Record<symbol, unknown>)[sym] as InputImpl;
  return Object.getPrototypeOf(impl) as InputImpl;
}

function installConformantCancel(): void {
  const probe = document.createElement("input");
  probe.type = "checkbox";
  implProto = implPrototypeOf(probe);
  originals = {
    pre: implProto._legacyPreActivationBehavior,
    cancel: implProto._legacyCanceledActivationBehavior
  };
  const origPre = originals.pre;
  const origCancel = originals.cancel;
  implProto._legacyPreActivationBehavior = function (this: InputImpl): void {
    if (this.type === "checkbox") {
      this.__savedChecked = this.checked;
      this.__savedIndeterminate = this.indeterminate;
      this.checked = !this.checked;
      this.indeterminate = false;
      return;
    }
    origPre.call(this);
  };
  implProto._legacyCanceledActivationBehavior = function (this: InputImpl): void {
    if (this.type === "checkbox") {
      this.checked = this.__savedChecked as boolean; // RESTORE — the spec's wording
      this.indeterminate = this.__savedIndeterminate as boolean;
      return;
    }
    origCancel.call(this);
  };
}
function restoreCancel(): void {
  if (implProto === null || originals === null) return;
  implProto._legacyPreActivationBehavior = originals.pre;
  implProto._legacyCanceledActivationBehavior = originals.cancel;
  implProto = null;
  originals = null;
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
async function mount(): Promise<void> {
  const stub = { register: vi.fn(), resendVerification: vi.fn() };
  await act(async () => { root!.render((<SignUpFlow client={stub} />) as ReactNode); });
  await settle();
}
function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}
function dialog(): HTMLElement | null { return document.querySelector<HTMLElement>('[role="dialog"]'); }
function createAccountButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>("button.authPrimary")!;
}
function privacyText(): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")][1]!
    .querySelector<HTMLElement>(".consentText")!;
}
function policyButton(label: string): HTMLButtonElement {
  return [...dialog()!.querySelectorAll<HTMLButtonElement>("button")]
    .filter((b) => b.textContent === label)[0]!;
}
async function clickElement(el: HTMLElement): Promise<void> {
  await act(async () => { el.click(); });
  await settle();
}
async function driveScrollToEnd(): Promise<void> {
  metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
  await act(async () => {
    document.querySelector<HTMLElement>(".policyBody")!.dispatchEvent(new Event("scroll", { bubbles: false }));
  });
  await settle();
}
async function acknowledge(): Promise<void> {
  await driveScrollToEnd();
  await clickElement(policyButton("I have read it"));
}
/** React's PRIVATE value tracker — the thing the resync exists to fix. Read, never written. */
function trackerValue(el: HTMLInputElement): string | undefined {
  const t = (el as unknown as { _valueTracker?: { getValue(): string } })._valueTracker;
  return t === undefined ? "NO-TRACKER" : t.getValue();
}

describe("CODE-REV-S02-C7 probes", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    metrics = { ...TOP };
    stubScrollMetrics();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    restoreCancel();
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    restoreScrollMetrics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* ---------------- P0: the shim itself discriminates (known-GOOD / known-BAD) ---------- */
  it("P0 the conformant shim differs from jsdom's toggle ONLY when .checked is written mid-click", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    document.body.append(box);
    // jsdom default, nothing written mid-click: cancel restores false either way.
    box.addEventListener("click", (e) => e.preventDefault(), { once: true });
    box.click();
    const jsdomPlain = box.checked;
    // jsdom default, .checked written mid-click: the TOGGLE inverts the write.
    box.addEventListener("click", (e) => { e.preventDefault(); box.checked = false; }, { once: true });
    box.click();
    const jsdomWritten = box.checked;
    box.checked = false;
    // conformant shim, .checked written mid-click: the RESTORE ignores the write.
    installConformantCancel();
    box.addEventListener("click", (e) => { e.preventDefault(); box.checked = false; }, { once: true });
    box.click();
    const conformantWritten = box.checked;
    restoreCancel();
    box.remove();
    // eslint-disable-next-line no-console
    console.log(`P0 jsdomPlain=${jsdomPlain} jsdomWritten=${jsdomWritten} conformantWritten=${conformantWritten}`);
    expect(jsdomPlain, "jsdom, no mid-click write: cancel leaves it false").toBe(false);
    expect(jsdomWritten, "jsdom, mid-click write false: the TOGGLE ships it CHECKED").toBe(true);
    expect(conformantWritten, "conformant, mid-click write false: the RESTORE ships it false").toBe(false);
  });

  /* ---------------- P1: the shipped component under a CONFORMANT cancel ----------------- */
  it("P1 under a spec-conformant canceled-activation the empty box still opens the policy and stays false", async () => {
    installConformantCancel();
    await mount();
    await clickElement(field("privacy-accepted"));
    console.log(`P1 dialog=${dialog() !== null} domChecked=${field("privacy-accepted").checked} tracker=${trackerValue(field("privacy-accepted"))}`);
    expect(dialog(), "the policy must open under a conformant cancel").not.toBeNull();
    expect(field("privacy-accepted").checked, "the box must stay unticked").toBe(false);
    await clickElement(field("adult-affirmed"));
    expect(createAccountButton().disabled, "mirror arm under a conformant cancel").toBe(true);
  });

  /* ---------------- P2: ordering ------------------------------------------------------- */
  it("P2 records the order of React's commit, the canceled-activation restore and the microtask", async () => {
    await mount();
    const input = field("privacy-accepted");
    const order: string[] = [];
    // A capture listener on document runs BEFORE React's delegated root listener.
    document.addEventListener("click", () => {
      order.push(`capture(dom=${input.checked},dialog=${dialog() !== null})`);
    }, { capture: true, once: true });
    // A bubble listener on document runs AFTER React's root listener (React 19 attaches to the
    // root container, which is a descendant of document) but still INSIDE the dispatch, i.e.
    // BEFORE the legacy-canceled-activation steps.
    document.addEventListener("click", () => {
      order.push(`bubble-doc(dom=${input.checked},dialog=${dialog() !== null})`);
    }, { once: true });
    queueMicrotask(() => order.push("microtask-registered-before-the-click"));
    await act(async () => {
      input.click();
      order.push(`after-dispatch-returns(dom=${input.checked},dialog=${dialog() !== null})`);
      queueMicrotask(() => order.push(`microtask-after(dom=${input.checked},dialog=${dialog() !== null},tracker=${trackerValue(input)})`));
    });
    await settle();
    console.log("P2 ORDER: " + order.join("  ->  "));
    expect(field("privacy-accepted").checked, "after everything the box is false").toBe(false);
  });

  /* ---------------- P3: the F2 route, with the tracker read at every step --------------- */
  it("P3 cancelled -> x -> cancelled -> acknowledge -> uncheck, tracker read at every step", async () => {
    await mount();
    const input = field("privacy-accepted");
    const log: string[] = [];
    const snap = (label: string) =>
      log.push(`${label}: dom=${input.checked} tracker=${trackerValue(input)} dialog=${dialog() !== null} btnDisabled=${createAccountButton().disabled}`);

    snap("00 mount");
    await clickElement(input);            // cancelled click 1
    snap("01 cancelled-click-1");
    await clickElement(policyButton("×"));
    snap("02 dismissed-by-close");
    await clickElement(input);            // cancelled click 2 — the one the stale tracker could swallow
    snap("03 cancelled-click-2");
    await acknowledge();                  // the only lawful tick
    snap("04 acknowledged");
    await clickElement(field("adult-affirmed"));
    snap("05 adult-ticked");
    await clickElement(privacyText());    // uncheck through the row (synthesised .click())
    snap("06 unchecked-via-row");
    console.log("P3\n  " + log.join("\n  "));

    expect(input.checked, "after the uncheck the box is empty").toBe(false);
    expect(createAccountButton().disabled, "and Create account is disabled again").toBe(true);
  });

  /* ---------------- P4: the re-entrancy guard, under a NON-click()-method dispatch ------- */
  it("P4 counts row-handler re-entries for a dispatched MouseEvent (no click-in-progress flag)", async () => {
    await mount();
    const input = field("privacy-accepted");
    // reach the checked state lawfully
    await clickElement(input);
    await acknowledge();
    expect(input.checked, "precondition: the box is ticked").toBe(true);

    let handlerRuns = 0;
    const row = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")][1]!;
    row.addEventListener("click", () => { handlerRuns += 1; }, { capture: true });

    await act(async () => {
      // A DISPATCHED event, not the click() METHOD: the spec's "click in progress" flag is not
      // set, so nothing in the platform stops a nested input.click() from re-entering.
      input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await settle();
    console.log(`P4 handlerRuns=${handlerRuns} dom=${input.checked} tracker=${trackerValue(input)} btnDisabled=${createAccountButton().disabled}`);
    expect(handlerRuns, "the row handler must run exactly once per user click").toBe(1);
    expect(input.checked, "a click on the ticked box unchecks it").toBe(false);
  });

  /* ---------------- P5: document order — the premise of the narrowed comment ------------ */
  it("P5 the policy modal follows the auth card in document order", async () => {
    await mount();
    await clickElement(field("privacy-accepted"));
    const modal = dialog()!;
    const card = document.querySelector<HTMLElement>(".authCard") ?? document.querySelector<HTMLElement>("form")!;
    const rel = card.compareDocumentPosition(modal);
    console.log(
      `P5 cardSelector=${document.querySelector(".authCard") !== null ? ".authCard" : "form"} ` +
      `relation=${rel} FOLLOWING=${(rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0} ` +
      `CONTAINED_BY=${(rel & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0} ` +
      `scrimClass=${document.querySelector(".policyScrim") !== null}`
    );
    expect((rel & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, "modal is later in document order than the card").toBe(true);
  });
  /* ---------------- P6: the SPEC's verbatim copy, asserted from a real render ----------- */
  it("P6 renders the SPEC's byte-exact consent copy", async () => {
    await mount();
    const rows = [...document.querySelectorAll<HTMLElement>(".consentGroup .consentRow")];
    const ROW1 = "I am 18 or over.";
    const ROW2 = "I agree to the Privacy Policy, including that my debates may be published publicly.";
    console.log(`P6 row1=${JSON.stringify(rows[0]!.textContent?.trim())}`);
    console.log(`P6 row2=${JSON.stringify(rows[1]!.textContent?.trim())}`);
    console.log(`P6 control=${JSON.stringify(rows[1]!.querySelector(".consentPolicyLink")?.textContent)} type=${rows[1]!.querySelector(".consentPolicyLink")?.getAttribute("type")}`);
    expect(rows[0]!.textContent?.trim()).toBe(ROW1);
    expect(rows[1]!.textContent?.trim()).toBe(ROW2);
    expect(rows[1]!.querySelector(".consentPolicyLink")!.textContent).toBe("Privacy Policy");
    expect(rows[1]!.querySelector(".consentPolicyLink")!.getAttribute("type")).toBe("button");
  });

  /* ---------------- P7: V-16 — no keydown handler of the card's own -------------------- */
  it("P7 a Space keystroke produces no activation in jsdom; the click path is the browser's", async () => {
    await mount();
    const input = field("privacy-accepted");
    input.focus();
    let clicks = 0;
    input.addEventListener("click", () => { clicks += 1; });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    });
    await settle();
    console.log(`P7 clickEventsSeenFromSpace=${clicks} dialogAfterSpace=${dialog() !== null} domChecked=${input.checked}`);
    expect(clicks, "jsdom 30 turns no Space keystroke into activation").toBe(0);
    expect(dialog(), "so nothing opens from Space in jsdom — V acceptance step 14 is V's").toBeNull();
    expect(input.checked, "and Space ticks nothing here either").toBe(false);
    // the activation a browser WOULD run:
    await clickElement(input);
    expect(dialog(), "the activation path opens the policy").not.toBeNull();
    expect(input.checked, "and never ticks the box").toBe(false);
  });
  /* ---------------- P8: constant (5) — focus return from EVERY entry point ------------- */
  it("P8 focus returns to the input after a dismissal from each of the three entry points", async () => {
    const results: string[] = [];
    for (const entry of ["square", "text", "control"] as const) {
      await mount();
      const opener =
        entry === "square" ? field("privacy-accepted")
        : entry === "text" ? privacyText()
        : document.querySelector<HTMLElement>(".consentPolicyLink")!;
      await clickElement(opener);
      const focusAtOpen = (document.activeElement as HTMLElement | null)?.className ?? "none";
      await clickElement(policyButton("×"));
      const back = document.activeElement === field("privacy-accepted");
      results.push(`${entry}: focusAtOpen=${focusAtOpen} returnsToInput=${back}`);
      await act(async () => { root!.unmount(); });
      container!.remove();
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    }
    console.log("P8 " + results.join(" | "));
    for (const r of results) expect(r, `focus return: ${r}`).toContain("returnsToInput=true");
  });
});
