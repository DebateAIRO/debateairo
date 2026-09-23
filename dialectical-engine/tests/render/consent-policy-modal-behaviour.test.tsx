// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacyPolicyModal } from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { POLICY_JUMP, POLICY_SECTIONS } from "../../apps/ui/lib/privacyPolicy.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * The scroll metrics of the policy scroll region, driven by the test.
 *
 * jsdom's own `scrollTop` / `clientHeight` / `scrollHeight` are all `0`, and `0 + 0 >= 0 - 8` is
 * TRUE — so a modal mounted with jsdom's defaults latches its gate at mount and no later
 * `scroll` event can ever close it again. The metrics therefore have to be in place BEFORE the
 * mount evaluation runs, which rules out `Object.defineProperty(element, …)`: the element does
 * not exist until React has rendered it. Shadowing the three accessors on `HTMLElement.prototype`
 * (jsdom defines them on `Element.prototype`, so these are new own properties and `delete`
 * restores the originals exactly) puts them in place before the first render, and reading them
 * from a mutable object means a single definition serves every case, including the latch case
 * that has to scroll back up.
 */
let metrics: Record<MetricKey, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };

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
  });
}

async function render(element: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(element);
  });
  await settle();
}

function dialog(): HTMLElement {
  return document.querySelector('[role="dialog"]') as HTMLElement;
}

function scrollRegion(): HTMLElement {
  return document.querySelector(".policyBody") as HTMLElement;
}

/** The single control whose own text is exactly `label`. */
function control(label: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent === label
  );
  expect(found.length, `expected exactly one control labelled ${label}`).toBe(1);
  return found[0]!;
}

function acknowledgeButton(): HTMLButtonElement {
  return control("I have read it");
}

/**
 * jsdom 30.0.1 has no `Element.prototype.scrollIntoView` at all — the property does not exist —
 * so the component calls it optionally and this supplies one stub per section. Stubbing per
 * element turns "scrolling cannot be tested in jsdom" into a real assertion about WHICH target
 * the handler resolved and with what arguments.
 */
function stubScrollIntoView(): Map<string, ReturnType<typeof vi.fn>> {
  const stubs = new Map<string, ReturnType<typeof vi.fn>>();
  for (const section of dialog().querySelectorAll<HTMLElement>('[id^="policy-section-"]')) {
    const stub = vi.fn();
    (section as unknown as { scrollIntoView: unknown }).scrollIntoView = stub;
    stubs.set(section.id, stub);
  }
  expect(stubs.size).toBe(POLICY_SECTIONS.length);
  expect(stubs.size).toBe(25);
  return stubs;
}

async function dispatchOn(target: EventTarget, type: string): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new Event(type, { bubbles: false }));
  });
}

describe("privacy policy modal — behaviour", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
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

  // S02-S40 — the boundary: `scrollHeight - 9` is not reached, `scrollHeight - 8` is. The two
  // cases are the 291/292 pair: 291 + 200 = 491 < 492, and 292 + 200 = 492 >= 500 - 8. Together
  // they discriminate `>=` from `>`, and both from any other slack.
  it("keeps the acknowledgement disabled one pixel short of the end", async () => {
    metrics = { scrollTop: 291, clientHeight: 200, scrollHeight: 500 };
    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );

    await dispatchOn(scrollRegion(), "scroll");

    expect(acknowledgeButton().disabled).toBe(true);
  });

  it("opens the gate at exactly scrollHeight - 8", async () => {
    metrics = { scrollTop: 291, clientHeight: 200, scrollHeight: 500 };
    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );
    expect(acknowledgeButton().disabled).toBe(true);

    metrics.scrollTop = 292;
    await dispatchOn(scrollRegion(), "scroll");

    expect(acknowledgeButton().disabled).toBe(false);
  });

  // S02-S41 — the gate latches: scrolling back to the top leaves it enabled.
  it("keeps the gate open after the reader scrolls back to the top", async () => {
    metrics = { scrollTop: 291, clientHeight: 200, scrollHeight: 500 };
    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );
    metrics.scrollTop = 292;
    await dispatchOn(scrollRegion(), "scroll");
    expect(acknowledgeButton().disabled).toBe(false);

    metrics.scrollTop = 0;
    await dispatchOn(scrollRegion(), "scroll");

    expect(acknowledgeButton().disabled).toBe(false);
  });

  // S02-S42 — a policy short enough to need no scrolling enables the button at mount.
  it("enables the acknowledgement at mount when the policy needs no scrolling", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };

    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );

    // No event of any kind is dispatched: the criterion is evaluated once at mount and no
    // special case is written for a short policy.
    expect(acknowledgeButton().disabled).toBe(false);
  });

  // S02-S43 — the criterion is re-evaluated on `resize`.
  it("re-evaluates the criterion on a window resize, with no scroll event", async () => {
    metrics = { scrollTop: 291, clientHeight: 200, scrollHeight: 500 };
    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );
    expect(acknowledgeButton().disabled).toBe(true);

    // A wider window shows more of the policy at once: the same scrollTop now reaches the end.
    metrics.clientHeight = 300;
    await dispatchOn(window, "resize");

    expect(acknowledgeButton().disabled).toBe(false);
  });

  // S02-S44 — while disabled the button is announced as disabled and says why; no tooltip.
  it("announces the disabled acknowledgement and describes why, without a tooltip", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
    await render(
      <PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );

    const button = acknowledgeButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("title")).toBe(false);

    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const description = document.getElementById(describedBy!);
    expect(description, `aria-describedby="${describedBy}" resolves to nothing`).not.toBeNull();
    expect(description!.textContent).toBe("Scroll to the end of the policy to continue.");
  });

  // S02-S45 — the scroll region is keyboard-reachable and named.
  it("makes the scroll region focusable and gives it its own accessible name", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);

    const region = scrollRegion();
    // A keyboard-only reader can only satisfy the scroll gate by focusing this region and
    // paging it, and the name says what is INSIDE it — the dialog's own name is already its
    // title, `What we store, and why`.
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("aria-label")).toBe("Privacy Policy text");
  });

  // S02-S46 — the modal takes its focus behaviour from the helper, and only from it.
  it("takes initial focus, the Tab cycle, focus return and its one listener from the helper", async () => {
    // A short policy, so the acknowledgement is enabled and is therefore the LAST focusable.
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };
    const added = vi.spyOn(document, "addEventListener");
    const keydownRegistrations = (): number =>
      added.mock.calls.filter((call) => call[0] === "keydown").length;

    function Harness({ open }: { open: boolean }): ReactNode {
      return (
        <>
          <button type="button" id="opener">
            open the policy
          </button>
          <PrivacyPolicyModal open={open} mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
        </>
      );
    }

    await render(<Harness open={false} />);
    const opener = document.querySelector<HTMLButtonElement>("#opener")!;
    await act(async () => {
      opener.focus();
    });
    expect(document.activeElement).toBe(opener);

    await render(<Harness open />);
    const close = dialog().querySelector<HTMLButtonElement>(".policyClose")!;
    expect(document.activeElement).toBe(close);

    // Exactly ONE document-level keydown listener exists for this surface: the helper's. A modal
    // that installed its own Esc handler as well would register a second.
    expect(keydownRegistrations()).toBe(1);

    const last = acknowledgeButton();
    expect(last.disabled).toBe(false);
    await act(async () => {
      last.focus();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });
    expect(document.activeElement).toBe(close);

    await render(<Harness open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  // S02-S47 — `I have read it` acknowledges; `×`, Esc and backdrop only close. Four cases: the
  // box can be ticked by the acknowledgement path and by nothing else.
  it("acknowledges and then closes when I have read it is clicked", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push("close"));
    const onAcknowledge = vi.fn(() => calls.push("acknowledge"));

    await render(
      <PrivacyPolicyModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />
    );
    expect(acknowledgeButton().disabled).toBe(false);

    await act(async () => {
      acknowledgeButton().click();
    });

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["acknowledge", "close"]);
  });

  it("closes without acknowledging when the × is clicked", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };
    const onClose = vi.fn();
    const onAcknowledge = vi.fn();

    await render(
      <PrivacyPolicyModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />
    );
    await act(async () => {
      dialog().querySelector<HTMLButtonElement>(".policyClose")!.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
  });

  it("closes without acknowledging when Escape is pressed", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };
    const onClose = vi.fn();
    const onAcknowledge = vi.fn();

    await render(
      <PrivacyPolicyModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />
    );
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
  });

  it("closes without acknowledging when the backdrop itself is clicked", async () => {
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 200 };
    const onClose = vi.fn();
    const onAcknowledge = vi.fn();

    await render(
      <PrivacyPolicyModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />
    );
    const scrim = document.querySelector<HTMLElement>(".policyScrim")!;

    // A click that lands on the CARD must not close: the backdrop route is the scrim itself.
    await act(async () => {
      dialog().click();
    });
    expect(onClose).toHaveBeenCalledTimes(0);

    await act(async () => {
      scrim.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
  });

  // S02-S48 — a pill click resolves its target and asks it to scroll, honouring reduced motion.
  // `Element.prototype.scrollIntoView` does not exist in jsdom 30.0.1, so the component calls it
  // optionally and the test supplies the stub. This asserts the CALL — which target was resolved
  // and with what arguments — and never that anything scrolled; the scroll is V's step 12.
  it("asks exactly the mapped section to scroll, smoothly, and asks no other section", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);

    // FIRST, with NO stub in place: a pill click must not throw. This is the arm that pins the
    // `?.` guard — every other assertion in this case installs a stub, and an UNGUARDED
    // `section.scrollIntoView(…)` passes them all while throwing a TypeError in any consumer
    // that has not stubbed it (C7's wiring tests, for one).
    await act(async () => {
      dialog().querySelector<HTMLButtonElement>('button[data-jump="policy-section-01"]')!.click();
    });

    const stubs = stubScrollIntoView();

    await act(async () => {
      for (const pill of [...dialog().querySelectorAll<HTMLButtonElement>("button[data-jump]")]) {
        pill.click();
      }
    });

    const targets = new Set(POLICY_JUMP.map((jump) => jump.target));
    for (const [id, stub] of stubs) {
      expect(stub.mock.calls.length, `${id} was asked to scroll the wrong number of times`).toBe(
        targets.has(id) ? 1 : 0
      );
      for (const call of stub.mock.calls) {
        expect(call[0]).toEqual({ block: "start", behavior: "smooth" });
      }
    }
    // The seventeen sections with no pill (the summary, 03, 08, 09, 11, 12, 14, the annex and
    // its nine parts) are the zero half of that assertion.
    expect(stubs.size - targets.size).toBe(17);
  });

  it("asks for no animation when the reader has asked for reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const stubs = stubScrollIntoView();

    await act(async () => {
      dialog().querySelector<HTMLButtonElement>('button[data-jump="policy-section-05"]')!.click();
    });

    expect(stubs.get("policy-section-05")!.mock.calls[0]![0]).toEqual({
      block: "start",
      behavior: "auto"
    });
  });
});
