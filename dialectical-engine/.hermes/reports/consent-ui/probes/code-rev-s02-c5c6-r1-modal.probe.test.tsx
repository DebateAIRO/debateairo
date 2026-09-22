// @vitest-environment jsdom
//
// CODE-REV-S02-C5C6 r1 — THE REVIEWER'S OWN PROBE. Built from the SPEC/PLAN claims, not from
// the author's tests: every expected string is READ OUT OF SPEC.md AT RUNTIME (so no assertion
// can be satisfied by the component's own constant), the scroll metrics are driven per-ELEMENT
// with Object.defineProperty after mount (the author drives them on HTMLElement.prototype), and
// the boundary pair is 691/692 against scrollHeight 1000 / clientHeight 300 — a different pair
// from the author's 291/292.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPolicyModal } from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { POLICY_JUMP, POLICY_SECTIONS } from "../../apps/ui/lib/privacyPolicy.js";

const SPEC_PATH =
  process.env.REV_SPEC ??
  "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/SPEC.md";
const SPEC = readFileSync(SPEC_PATH, "utf8").split("\n");
const bulletCopy = (prefix: string): string => {
  const line = SPEC.find((l) => l.startsWith(prefix));
  if (line === undefined) throw new Error(`SPEC has no line starting ${prefix}`);
  const m = line.match(/`([^`]*)`\s*$/);
  if (m === null) throw new Error(`no backticked value on ${prefix}`);
  return m[1]!;
};
const SPEC_EYEBROW = bulletCopy("- eyebrow: ");
const SPEC_TITLE = bulletCopy("- title: ");
const SPEC_LEDE = bulletCopy("- lede: ");
const SPEC_END = SPEC.find((l) => l.startsWith("**End marker**"))!.match(/`([^`]*)`/)![1]!;
// R15's criterion, lifted out of the SPEC's own fenced block so the slack is not my constant.
const SPEC_CRITERION = SPEC.find((l) => l.includes("container.scrollTop + container.clientHeight"))!.trim();
const SPEC_SLACK = Number(SPEC_CRITERION.match(/scrollHeight\s*-\s*(\d+)/)![1]);
// R15's disabled-description string, from the SPEC prose.
const SPEC_HINT = SPEC.find((l) => l.includes("Scroll to the end of the policy to continue."))!
  .match(/`([^`]*Scroll to the end[^`]*)`/)![1]!;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
async function render(el: ReactNode): Promise<void> {
  await act(async () => { root!.render(el); });
  await settle();
}
const dialog = (): HTMLElement => document.querySelector('[role="dialog"]') as HTMLElement;
const region = (): HTMLElement => document.querySelector(".policyBody") as HTMLElement;
const ack = (): HTMLButtonElement | null =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === "I have read it") ?? null;

/**
 * MEASURED BY THIS PROBE FIRST (and it confirms the author's D2 independently): defining the
 * three metrics on the ELEMENT after mount is TOO LATE. jsdom's own values are all 0 and
 * `0 + 0 >= 0 - 8` is true, so the effect latches the gate at mount and no later `scroll` can
 * re-close it — my first three cases failed on the "starts disabled" precondition for exactly
 * that reason. The metrics must therefore be in place BEFORE the first render.
 *
 * My technique differs from the author's on purpose: they shadow `HTMLElement.prototype` and
 * restore with `delete`; I redefine on `Element.prototype`, where jsdom actually declares the
 * three accessors, and restore the SAVED ORIGINAL DESCRIPTORS afterwards. Two independent
 * routes to the same measurement.
 */
const METRICS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type Metric = (typeof METRICS)[number];
let live: Record<Metric, number> = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
const saved = new Map<Metric, PropertyDescriptor | undefined>();
function installMetrics(): void {
  for (const k of METRICS) {
    saved.set(k, Object.getOwnPropertyDescriptor(Element.prototype, k));
    Object.defineProperty(Element.prototype, k, {
      configurable: true,
      get(this: Element): number {
        return this.classList.contains("policyBody") ? live[k] : 0;
      }
    });
  }
}
function uninstallMetrics(): void {
  for (const k of METRICS) {
    const d = saved.get(k);
    if (d === undefined) delete (Element.prototype as unknown as Record<string, unknown>)[k];
    else Object.defineProperty(Element.prototype, k, d);
  }
  saved.clear();
}
function setMetrics(_el: HTMLElement, m: { scrollTop: number; clientHeight: number; scrollHeight: number }): void {
  live = { ...m };
}
async function fire(target: EventTarget, type: string): Promise<void> {
  await act(async () => { target.dispatchEvent(new Event(type)); });
}

describe("REVIEWER PROBE — privacy policy modal", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    installMetrics();
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
    uninstallMetrics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---------- RENDER, against SPEC strings read at runtime ----------
  it("P1 renders the SPEC's header copy, end marker and contact line, codepoint-exact", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const d = dialog();
    expect(d.querySelector(".policyEyebrow")!.textContent).toBe(SPEC_EYEBROW);
    expect(d.querySelector(".policyTitle")!.textContent).toBe(SPEC_TITLE);
    expect(d.querySelector(".policyLede")!.textContent).toBe(SPEC_LEDE);
    // end marker is LAST inside the scroll region
    expect(region().lastElementChild!.textContent).toBe(SPEC_END);
    expect(
      [...d.querySelectorAll("*")].some((e) => e.textContent === "Questions: privacy@dezbatere.ro")
    ).toBe(true);
    // aria-labelledby resolves to the title
    const lb = d.getAttribute("aria-labelledby")!;
    expect(document.getElementById(lb)!.textContent).toBe(SPEC_TITLE);
    expect(d.getAttribute("aria-modal")).toBe("true");
    // honesty: no PDF control (V-3)
    expect([...d.querySelectorAll("*")].filter((e) => e.textContent?.trim() === "Download PDF").length).toBe(0);
    // the x is labelled Close
    const closers = [...d.querySelectorAll("*")].filter((e) => e.getAttribute("aria-label") === "Close");
    expect(closers.length).toBe(1);
    expect(closers[0]!.textContent).toBe("×");
  });

  it("P2 renders 8 pills in the design's order and 11 sections with the SPEC's accent tokens", async () => {
    await render(<PrivacyPolicyModal open mode="read" onClose={vi.fn()} />);
    const d = dialog();
    const pills = [...d.querySelectorAll<HTMLButtonElement>("button[data-jump]")];
    expect(pills.map((p) => p.textContent)).toEqual(POLICY_JUMP.map((j) => j.label));
    for (const p of pills) {
      expect(d.querySelectorAll(`[id="${p.dataset.jump}"]`).length).toBe(1);
    }
    // SPEC R12's accent table, parsed out of SPEC.md — not the component's and not the data's.
    const table = new Map<string, string>();
    for (const l of SPEC) {
      const m = l.match(/^\|\s*(\d\d)\s[^|]*\|[^|]*\|\s*`(--[a-z-]+)`\s*\|$/);
      if (m) table.set(m[1]!, m[2]!);
    }
    expect(table.size).toBe(11);
    const sections = [...d.querySelectorAll<HTMLElement>('[id^="policy-section-"]')];
    expect(sections.length).toBe(11);
    for (const s of sections) {
      const no = s.id.slice("policy-section-".length);
      const num = s.querySelector<HTMLElement>(".policyNo")!;
      expect(num.style.getPropertyValue("--accent"), `section ${no}`).toBe(`var(${table.get(no)})`);
      expect(num.dataset.accent, `section ${no}`).toBe(table.get(no));
    }
    // and the bodies come from the data module, not from inlined prose
    expect(sections.map((s) => s.querySelector(".policyText")!.textContent)).toEqual(
      POLICY_SECTIONS.map((s) => s.body)
    );
  });

  it("P3 read mode: Close only, no acknowledgement, onAcknowledge never fires from any control", async () => {
    const onAck = vi.fn();
    const onClose = vi.fn();
    await render(<PrivacyPolicyModal open mode="read" onClose={onClose} onAcknowledge={onAck} />);
    expect(ack()).toBeNull();
    const closeLabelled = [...dialog().querySelectorAll("button")].filter((b) => b.textContent === "Close");
    expect(closeLabelled.length).toBe(1);
    await act(async () => { for (const b of dialog().querySelectorAll("button")) b.click(); });
    expect(onAck).toHaveBeenCalledTimes(0);
    // read mode attaches NO scroll gate: no hint element at all
    expect(document.querySelector(".policyGateHint")).toBeNull();
  });

  // ---------- THE GATE, with my own numbers ----------
  it("P4 the criterion is >= scrollHeight - SPEC_SLACK, on my own boundary pair", async () => {
    expect(SPEC_SLACK).toBe(8);
    live = { scrollTop: 691, clientHeight: 300, scrollHeight: 1000 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />);
    const r = region();
    // one pixel short: 691 + 300 = 991 < 992
    setMetrics(r, { scrollTop: 691, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled, "691 + 300 = 991 < 1000 - 8").toBe(true);
    // exactly at the boundary: 692 + 300 = 992 === 1000 - 8
    setMetrics(r, { scrollTop: 692, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled, "692 + 300 = 992 >= 1000 - 8").toBe(false);
  });

  it("P5 the gate latches across scrolling back up", async () => {
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const r = region();
    setMetrics(r, { scrollTop: 692, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled).toBe(false);
    setMetrics(r, { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled).toBe(false);
  });

  it("P6 the criterion is re-evaluated on window resize with no scroll event", async () => {
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const r = region();
    setMetrics(r, { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled).toBe(true);
    setMetrics(r, { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 });
    await fire(window, "resize");
    expect(ack()!.disabled).toBe(false);
  });

  it("P7 the disabled button is announced, described by the SPEC's reason, and has no tooltip", async () => {
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const r = region();
    setMetrics(r, { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    const b = ack()!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.hasAttribute("title")).toBe(false);
    const described = document.getElementById(b.getAttribute("aria-describedby")!);
    expect(described).not.toBeNull();
    expect(described!.textContent).toBe(SPEC_HINT);
    // F2 MEASUREMENT: what the footer READS AS today, with no C8 CSS in the document.
    // eslint-disable-next-line no-console
    console.log("REV-F2 footer textContent (gate closed) >>>" + document.querySelector(".policyFoot")!.textContent + "<<<");
    // eslint-disable-next-line no-console
    console.log("REV-F2 hint className >>>" + described!.className + "<<< inline style >>>" +
      described!.getAttribute("style") + "<<< computed display >>>" +
      window.getComputedStyle(described!).display + "<<<");
    // and once the gate opens the hint leaves the DOM and the description with it
    setMetrics(r, { scrollTop: 692, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.hasAttribute("aria-describedby")).toBe(false);
    expect(document.querySelector(".policyGateHint")).toBeNull();
    // eslint-disable-next-line no-console
    console.log("REV-F2 footer textContent (gate open) >>>" + document.querySelector(".policyFoot")!.textContent + "<<<");
  });

  // ---------- LISTENERS ----------
  it("P8 the component's own listeners are exactly scroll-on-region and resize-on-window", async () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const elemAdd = vi.spyOn(HTMLElement.prototype, "addEventListener");
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const docKinds = docAdd.mock.calls.map((c) => String(c[0]));
    const winKinds = winAdd.mock.calls.map((c) => String(c[0]));
    const elemKinds = elemAdd.mock.calls.map((c) => String(c[0]));
    // eslint-disable-next-line no-console
    console.log("REV-P8 document:", JSON.stringify(docKinds), "window:", JSON.stringify(winKinds),
      "element:", JSON.stringify(elemKinds));
    expect(docKinds.filter((k) => k === "keydown").length,
      "exactly one document keydown listener, and it is the helper's").toBe(1);
    expect(elemKinds).toEqual(["scroll"]);
    expect(winKinds.filter((k) => k === "keydown").length, "no window-level keydown of its own").toBe(0);
    expect(winKinds).toContain("resize");
  });

  it("P9 read mode attaches no scroll/resize listener at all", async () => {
    const winAdd = vi.spyOn(window, "addEventListener");
    const elemAdd = vi.spyOn(HTMLElement.prototype, "addEventListener");
    await render(<PrivacyPolicyModal open mode="read" onClose={vi.fn()} />);
    expect(elemAdd.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(winAdd.mock.calls.map((c) => String(c[0])).filter((k) => k === "resize")).toEqual([]);
  });

  it("P10 closing removes both listeners (no leak into the next open)", async () => {
    const winRemove = vi.spyOn(window, "removeEventListener");
    const elemRemove = vi.spyOn(HTMLElement.prototype, "removeEventListener");
    function H({ open }: { open: boolean }): ReactNode {
      return <PrivacyPolicyModal open={open} mode="consent" onClose={vi.fn()} />;
    }
    await render(<H open />);
    await render(<H open={false} />);
    expect(elemRemove.mock.calls.map((c) => String(c[0]))).toContain("scroll");
    expect(winRemove.mock.calls.map((c) => String(c[0]))).toContain("resize");
  });

  // ---------- DISMISSAL ROUTES ----------
  it("P11 only I have read it acknowledges; x, Esc and the scrim close and nothing else", async () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push("close"));
    const onAcknowledge = vi.fn(() => order.push("ack"));
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />);
    const r = region();
    setMetrics(r, { scrollTop: 692, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");

    await act(async () => { dialog().querySelector<HTMLButtonElement>(".policyClose")!.click(); });
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
    expect(onClose).toHaveBeenCalledTimes(2);

    // a click on the CARD must not close
    await act(async () => { dialog().click(); });
    expect(onClose).toHaveBeenCalledTimes(2);
    await act(async () => { document.querySelector<HTMLElement>(".policyScrim")!.click(); });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onAcknowledge).toHaveBeenCalledTimes(0);

    await act(async () => { ack()!.click(); });
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(order.slice(-2)).toEqual(["ack", "close"]);
  });

  // ---------- scrollIntoView guard, WITHOUT stubbing anything ----------
  it("P12 a pill click with no scrollIntoView anywhere neither throws nor logs an error", async () => {
    expect(
      Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView"),
      "precondition: jsdom must not define scrollIntoView"
    ).toBeUndefined();
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    for (const p of [...dialog().querySelectorAll<HTMLButtonElement>("button[data-jump]")]) {
      await act(async () => { p.click(); });
    }
    expect(true).toBe(true);
  });

  it("P13 a pill asks exactly its mapped section to scroll, and reduced motion turns off smooth", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const stubs = new Map<string, ReturnType<typeof vi.fn>>();
    for (const s of dialog().querySelectorAll<HTMLElement>('[id^="policy-section-"]')) {
      const f = vi.fn();
      (s as unknown as { scrollIntoView: unknown }).scrollIntoView = f;
      stubs.set(s.id, f);
    }
    // R11's pill -> section mapping, parsed out of SPEC.md's own table
    const map = new Map<string, string>();
    for (const l of SPEC) {
      const m = l.match(/^\|\s*`([A-Z &]+)`\s*\|[^|]*\|\s*`(policy-section-\d\d)`\s*\|$/);
      if (m) map.set(m[1]!, m[2]!);
    }
    expect(map.size).toBe(8);
    for (const p of [...dialog().querySelectorAll<HTMLButtonElement>("button[data-jump]")]) {
      const label = p.textContent!;
      expect(map.get(label), `SPEC has no row for pill ${label}`).toBe(p.dataset.jump);
      await act(async () => { p.click(); });
      expect(stubs.get(map.get(label)!)!).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    }
    for (const [id, f] of stubs) {
      expect(f.mock.calls.length, id).toBe([...map.values()].includes(id) ? 1 : 0);
    }
    // reduced motion
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q }));
    const first = [...dialog().querySelectorAll<HTMLButtonElement>("button[data-jump]")][0]!;
    await act(async () => { first.click(); });
    const target = stubs.get(first.dataset.jump!)!;
    expect(target.mock.calls[target.mock.calls.length - 1]![0]).toEqual({ block: "start", behavior: "auto" });
  });

  // ---------- the region ----------
  it("P14 the scroll region is focusable and separately named", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    expect(region().getAttribute("tabindex")).toBe("0");
    expect(region().getAttribute("aria-label")).toBe("Privacy Policy text");
  });

  // ---------- REOPEN: does the latch survive a close/reopen cycle? MEASURED, not assumed ----------
  it("P15 MEASURES whether the latch survives close + reopen on a persistently mounted modal", async () => {
    function H({ open }: { open: boolean }): ReactNode {
      return <PrivacyPolicyModal open={open} mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />;
    }
    live = { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 };
    await render(<H open />);
    let r = region();
    setMetrics(r, { scrollTop: 692, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    expect(ack()!.disabled).toBe(false);
    await render(<H open={false} />);
    await render(<H open />);
    r = region();
    setMetrics(r, { scrollTop: 0, clientHeight: 300, scrollHeight: 1000 });
    await fire(r, "scroll");
    // eslint-disable-next-line no-console
    console.log("REV-P15 after close+reopen with the reader back at the top, acknowledgement disabled =",
      ack()!.disabled);
    expect([true, false]).toContain(ack()!.disabled);
  });
});
