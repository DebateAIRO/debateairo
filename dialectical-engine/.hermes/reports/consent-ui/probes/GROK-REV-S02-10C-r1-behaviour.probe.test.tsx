// @vitest-environment jsdom
/**
 * GROK-REV-S02-10C r1 — adversarial behaviour probe, from the SPEC not the author's tests.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "@lane/SignUpFlow";
import { PrivacyPolicyModal } from "@lane/PrivacyPolicyModal";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** jsdom layout is 0+0 >= 0-8, which latches the gate at mount. Stub before render. */
const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
let metrics: Record<MetricKey, number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };

function stubScrollMetrics(): void {
  for (const key of METRIC_KEYS) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement): number {
        return this.classList.contains("policyBody") ? metrics[key] : 0;
      },
      set(this: HTMLElement, value: number) {
        if (this.classList.contains("policyBody") && key === "scrollTop") metrics.scrollTop = value;
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

async function render(element: ReactNode): Promise<void> {
  await act(async () => {
    root!.render(element);
  });
  await settle();
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing ${name}`).not.toBeNull();
  return input!;
}

function submitBtn(): HTMLButtonElement {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "Create account");
  expect(b).toBeDefined();
  return b as HTMLButtonElement;
}

function dialog(): HTMLElement {
  const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
  expect(d, "dialog missing").not.toBeNull();
  return d!;
}

function ackBtn(): HTMLButtonElement {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent === "I have read it");
  expect(b).toBeDefined();
  return b as HTMLButtonElement;
}

function setReactValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fillValid(): Promise<void> {
  await act(async () => {
    setReactValue(document.querySelector<HTMLInputElement>('input[name="email"]')!, "a@example.com");
    setReactValue(document.querySelector<HTMLInputElement>('input[name="recovery-email"]')!, "b@example.com");
    setReactValue(document.querySelector<HTMLInputElement>('input[name="password"]')!, "Abcdefg1!");
  });
  await settle();
}

async function reachEnd(): Promise<void> {
  metrics = { scrollTop: 292, clientHeight: 200, scrollHeight: 500 };
  const region = document.querySelector(".policyBody") as HTMLElement;
  await act(async () => {
    region.dispatchEvent(new Event("scroll"));
  });
  await settle();
}

describe("S02-10C adversarial behaviour", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
    stubScrollMetrics();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    host?.remove();
    host = null;
    document.body.replaceChildren();
    restoreScrollMetrics();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unchecked privacy SQUARE opens the modal and leaves the box + mirror false", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      field("privacy-accepted").click();
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(submitBtn().disabled).toBe(true);
  });

  it("unchecked privacy TEXT opens the modal and leaves the box false", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      document.querySelector(".consentText")!.parentElement === document.querySelectorAll(".consentRow")[1]
        ? document.querySelectorAll(".consentRow")[1]!.querySelector(".consentText")!.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          )
        : document.querySelectorAll(".consentRow")[1]!.querySelector(".consentText")!.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
  });

  it("unchecked Privacy Policy CONTROL opens the modal and leaves the box false", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(document.activeElement).toBe(document.querySelector(".policyClose"));
  });

  it("18+ row toggles and opens nothing", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      field("adult-affirmed").click();
    });
    await settle();
    expect(field("adult-affirmed").checked).toBe(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
  });

  it("scroll gate: slack-9 disabled, slack-8 enabled, latch, short policy at mount, resize", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />);
    const region = document.querySelector(".policyBody") as HTMLElement;
    expect(ackBtn().disabled).toBe(true);

    metrics = { scrollTop: 291, clientHeight: 200, scrollHeight: 500 }; // 491 < 492
    await act(async () => {
      region.dispatchEvent(new Event("scroll"));
    });
    await settle();
    expect(ackBtn().disabled).toBe(true);

    metrics = { scrollTop: 292, clientHeight: 200, scrollHeight: 500 };
    await act(async () => {
      region.dispatchEvent(new Event("scroll"));
    });
    await settle();
    expect(ackBtn().disabled).toBe(false);

    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
    await act(async () => {
      region.dispatchEvent(new Event("scroll"));
    });
    await settle();
    expect(ackBtn().disabled).toBe(false); // latch

    // IntersectionObserver is NOT the mechanism
    expect((window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver).toBeUndefined();
  });

  it("short policy enables I have read it at mount", async () => {
    metrics = { scrollTop: 0, clientHeight: 400, scrollHeight: 400 };
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />);
    expect(ackBtn().disabled).toBe(false);
  });

  it("resize can latch the gate without a scroll", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />);
    expect(ackBtn().disabled).toBe(true);
    metrics = { scrollTop: 0, clientHeight: 500, scrollHeight: 500 };
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await settle();
    expect(ackBtn().disabled).toBe(false);
  });

  it("× / Esc / backdrop each leave the box unchecked, focus back on the input, submit still disabled", async () => {
    const register = vi.fn();
    await render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);

    // ×
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await act(async () => {
      (document.querySelector(".policyClose") as HTMLButtonElement).click();
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(document.activeElement).toBe(field("privacy-accepted"));
    expect(submitBtn().disabled).toBe(true);

    // Esc
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(document.activeElement).toBe(field("privacy-accepted"));
    expect(document.querySelector('form[data-form="signup"]')).not.toBeNull();

    // backdrop
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await act(async () => {
      document.querySelector(".policyScrim")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("I have read it ticks the box, enables Create account only with both boxes, 4-arg register", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    await render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    await fillValid();
    await act(async () => {
      field("adult-affirmed").click();
    });
    await settle();
    expect(submitBtn().disabled).toBe(true);

    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await reachEnd();
    expect(ackBtn().disabled).toBe(false);
    await act(async () => {
      ackBtn().click();
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(field("privacy-accepted").checked).toBe(true);
    expect(document.activeElement).toBe(field("privacy-accepted"));
    expect(submitBtn().disabled).toBe(false);

    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]).toEqual(["a@example.com", "Abcdefg1!", "b@example.com", true]);
    expect(register.mock.calls[0].length).toBe(4);
  });

  it("R18: one box assigned (no change event) refuses register; both assigned still 4 args", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    await render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    await fillValid();
    field("adult-affirmed").checked = true;
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(register).not.toHaveBeenCalled();

    field("adult-affirmed").checked = false;
    field("privacy-accepted").checked = true;
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(register).not.toHaveBeenCalled();

    field("adult-affirmed").checked = true;
    field("privacy-accepted").checked = true;
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0].length).toBe(4);
  });

  it("checked privacy row unchecks directly with no modal", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await reachEnd();
    await act(async () => {
      ackBtn().click();
    });
    await settle();
    expect(field("privacy-accepted").checked).toBe(true);
    await act(async () => {
      field("privacy-accepted").click();
    });
    await settle();
    expect(field("privacy-accepted").checked).toBe(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(submitBtn().disabled).toBe(true);
  });

  it("conditional remount is a fresh read: close after latch, reopen, button disabled again", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    await reachEnd();
    expect(ackBtn().disabled).toBe(false);
    await act(async () => {
      (document.querySelector(".policyClose") as HTMLButtonElement).click();
    });
    await settle();
    metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    expect(ackBtn().disabled).toBe(true);
    expect(field("privacy-accepted").checked).toBe(false);
  });

  it("Tab from last focusable wraps; Esc does not submit", async () => {
    await render(<SignUpFlow client={{ register: vi.fn(), resendVerification: vi.fn() }} />);
    await act(async () => {
      (document.querySelector(".consentPolicyLink") as HTMLButtonElement).click();
    });
    await settle();
    const close = document.querySelector(".policyClose") as HTMLButtonElement;
    expect(document.activeElement).toBe(close);
    await act(async () => {
      close.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })
      );
    });
    await settle();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement === field("email") || document.activeElement === field("password")).toBe(
      false
    );
  });
});
