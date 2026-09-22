// @vitest-environment jsdom
/**
 * GROK-REV-S01-10B r1 — S02 signup-gate behaviour the packet ordered as part of
 * judging the 10b element (Privacy notice shares the same modal).
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "../../apps/ui/components/SignUpFlow.js";

let host: HTMLDivElement;
let root: Root;

function input(name: string): HTMLInputElement {
  const el = host.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  if (!el) throw new Error(`missing input ${name}`);
  return el;
}

function privacyBox(): HTMLInputElement {
  return input("privacy-accepted");
}

function adultBox(): HTMLInputElement {
  return input("adult-affirmed");
}

function submitBtn(): HTMLButtonElement {
  return [...host.querySelectorAll("button")].find((b) =>
    /Create account|Creating/.test(b.textContent ?? "")
  ) as HTMLButtonElement;
}

function setField(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillForm(): void {
  act(() => {
    setField(host.querySelector("#signup-email") as HTMLInputElement, "a@b.co");
    setField(host.querySelector('input[name="recovery-email"]') as HTMLInputElement, "c@d.co");
    setField(host.querySelector('input[name="password"]') as HTMLInputElement, "Abcdef1!");
  });
}

function openByBox(): void {
  act(() => {
    privacyBox().click();
  });
}

function reachEnd(): void {
  const region = host.querySelector(".policyBody") as HTMLElement;
  (region as HTMLElement & { scrollTop: number }).scrollTop = 292;
  act(() => {
    region.dispatchEvent(new Event("scroll"));
  });
}

const proto = HTMLElement.prototype as HTMLElement & {
  __clientHeight?: number;
  __scrollHeight?: number;
};
const ORIGINAL = {
  scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTop"),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight")
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    writable: true,
    value: 0
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return proto.__clientHeight ?? 200;
    },
    set(v: number) {
      proto.__clientHeight = v;
    }
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return proto.__scrollHeight ?? 500;
    },
    set(v: number) {
      proto.__scrollHeight = v;
    }
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (ORIGINAL.scrollTop) Object.defineProperty(HTMLElement.prototype, "scrollTop", ORIGINAL.scrollTop);
  if (ORIGINAL.clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", ORIGINAL.clientHeight);
  if (ORIGINAL.scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", ORIGINAL.scrollHeight);
});

describe("8a + 10c from the 10b element's sibling slice", () => {
  it("unchecked box click AND Privacy Policy link both open the modal without ticking", () => {
    const register = vi.fn();
    act(() => {
      root.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    });
    expect(privacyBox().checked).toBe(false);
    openByBox();
    expect(host.querySelector(".policyBezel")).not.toBeNull();
    expect(privacyBox().checked).toBe(false);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(host.querySelector(".policyBezel")).toBeNull();
    const link = host.querySelector(".consentPolicyLink") as HTMLButtonElement;
    act(() => {
      link.click();
    });
    expect(host.querySelector(".policyBezel")).not.toBeNull();
    expect(privacyBox().checked).toBe(false);
  });

  it("× / Esc / backdrop leave the box unchecked", () => {
    const register = vi.fn();
    act(() => {
      root.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    });
    openByBox();
    const closeGlyph = host.querySelector(".policyClose") as HTMLButtonElement;
    act(() => {
      closeGlyph.click();
    });
    expect(privacyBox().checked).toBe(false);
    openByBox();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(privacyBox().checked).toBe(false);
    openByBox();
    const scrim = host.querySelector(".policyScrim") as HTMLElement;
    act(() => {
      scrim.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(privacyBox().checked).toBe(false);
    expect(host.querySelector(".policyBezel")).toBeNull();
  });

  it("I have read it is disabled until the end is reached via the SPEC's scroll metrics", () => {
    const register = vi.fn();
    act(() => {
      root.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    });
    openByBox();
    const readIt = [...host.querySelectorAll("button")].find((b) => b.textContent === "I have read it") as HTMLButtonElement;
    expect(readIt.disabled).toBe(true);
    reachEnd();
    const enabled = [...host.querySelectorAll("button")].find((b) => b.textContent === "I have read it") as HTMLButtonElement;
    expect(enabled.disabled).toBe(false);
    act(() => {
      enabled.click();
    });
    expect(privacyBox().checked).toBe(true);
    expect(host.querySelector(".policyBezel")).toBeNull();
  });

  it("submit with only the adult box is refused; register() keeps email, password, recovery, adult_affirmed", async () => {
    const register = vi.fn().mockResolvedValue({ message: "ok" });
    act(() => {
      root.render(<SignUpFlow client={{ register, resendVerification: vi.fn() }} />);
    });
    fillForm();
    act(() => {
      adultBox().click();
    });
    const form = host.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(register).not.toHaveBeenCalled();
    expect(submitBtn().disabled).toBe(true);
    openByBox();
    reachEnd();
    const readIt = [...host.querySelectorAll("button")].find((b) => b.textContent === "I have read it") as HTMLButtonElement;
    act(() => {
      readIt.click();
    });
    expect(submitBtn().disabled).toBe(false);
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]).toEqual(["a@b.co", "Abcdef1!", "c@d.co", true]);
  });
});
