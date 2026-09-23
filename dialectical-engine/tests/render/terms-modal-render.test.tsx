// @vitest-environment jsdom

/**
 * The Terms of Service modal — a twin of the privacy policy modal (design 10c), rendering the
 * Terms draft as data. It shares the chrome, the scroll-to-end consent gate and the modal
 * semantics with the privacy modal through one shared component, so what is pinned here is the
 * Terms-specific surface: its own chrome strings, its own DOM ids (the two modals must be
 * distinguishable by an assistive technology and by a test), its sections, and that the gate
 * behaves identically.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TermsOfServiceModal,
  type TermsOfServiceModalProps
} from "../../apps/ui/components/consent/TermsOfServiceModal.js";
import { TERMS_JUMP, TERMS_SECTIONS } from "../../apps/ui/lib/termsOfService.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];

/** The scroll region's metrics, driven by the test — the privacy suites' idiom, reused. */
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

/** Every element inside the dialog whose own text is exactly `label`. */
function textControls(label: string): HTMLElement[] {
  return [...dialog().querySelectorAll<HTMLElement>("*")].filter(
    (element) => element.textContent === label
  );
}

function acknowledgeButton(): HTMLButtonElement {
  const found = textControls("I have read it").filter((element) => element.tagName === "BUTTON");
  expect(found.length, "exactly one `I have read it` control").toBe(1);
  return found[0] as HTMLButtonElement;
}

describe("terms of service modal — rendered", () => {
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

  it("renders nothing at all when open is false", async () => {
    await render(
      <TermsOfServiceModal open={false} mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );

    expect(container!.childNodes.length).toBe(0);
  });

  it("announces itself as one dialog named by its own title, with its own ids", async () => {
    await render(<TermsOfServiceModal open mode="consent" onClose={vi.fn()} />);

    const scrims = document.querySelectorAll(".policyScrim");
    expect(scrims.length).toBe(1);
    const dialogs = scrims[0]!.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBe(1);

    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().getAttribute("aria-labelledby")).toBe("terms-modal-title");
    expect(document.getElementById("terms-modal-title")!.textContent).toBe("What you agree to");
    expect(document.getElementById("policy-modal-title")).toBeNull();
    expect(dialog().querySelector(".policyBody")!.getAttribute("aria-label")).toBe(
      "Terms of Service text"
    );
    expect(dialog().querySelectorAll(".policyCore .policyTab").length).toBe(1);
  });

  it("shows the Terms chrome derived from the draft's version line", async () => {
    await render(<TermsOfServiceModal open mode="consent" onClose={vi.fn()} />);

    expect(dialog().querySelector(".policyEyebrow")!.textContent).toBe(
      "TERMS OF SERVICE · v2.0 · EFFECTIVE [DATE]"
    );
    expect(dialog().querySelector(".policyTitle")!.textContent).toBe("What you agree to");
    expect(dialog().querySelector(".policyLede")!.textContent).toBe(
      "The contract between you and DebateAIRO S.R.L., in plain language. Nineteen sections and Annex A — scroll to the end."
    );

    const closers = [...dialog().querySelectorAll("*")].filter(
      (element) => element.getAttribute("aria-label") === "Close"
    );
    expect(closers.length).toBe(1);
    expect(closers[0]!.textContent).toBe("×");

    const contacts = [...dialog().querySelectorAll("*")].filter(
      (element) => element.textContent === "Questions: [legal@dezbatere.ro]"
    );
    expect(contacts.length).toBeGreaterThanOrEqual(1);

    const last = dialog().querySelector(".policyBody")!.lastElementChild!;
    expect(last.textContent).toBe("END OF TERMS · v2.0");

    const pdf = [...dialog().querySelectorAll("*")].filter(
      (element) => element.textContent?.trim() === "Download PDF"
    );
    expect(pdf.length).toBe(0);
  });

  it("renders the ten jump pills in order, each resolving to one section", async () => {
    await render(<TermsOfServiceModal open mode="consent" onClose={vi.fn()} />);

    const pills = [...dialog().querySelectorAll<HTMLButtonElement>("button[data-jump]")];
    expect(pills.length).toBe(10);
    expect(pills.map((pill) => pill.textContent)).toEqual(TERMS_JUMP.map((jump) => jump.label));
    for (const pill of pills) {
      expect(pill.getAttribute("type")).toBe("button");
      const target = pill.dataset.jump!;
      const resolved = [...dialog().querySelectorAll("*")].filter(
        (element) => element.id === target
      );
      expect(resolved.length, `data-jump="${target}" resolves to ${resolved.length} elements`).toBe(1);
    }
  });

  it("renders the thirty sections in order, with their paragraphs, bullets and accent tokens", async () => {
    await render(<TermsOfServiceModal open mode="consent" onClose={vi.fn()} />);

    const sections = [...dialog().querySelectorAll<HTMLElement>('[id^="terms-section-"]')];
    expect(TERMS_SECTIONS.length).toBe(30);
    expect(sections.map((section) => section.id)).toEqual(
      TERMS_SECTIONS.map((section) => `terms-section-${section.no}`)
    );
    expect(dialog().querySelectorAll('[id^="policy-section-"]').length).toBe(0);

    expect(sections.map((section) => section.querySelector(".policySectionTitle")!.textContent)).toEqual(
      TERMS_SECTIONS.map((section) => section.title)
    );
    expect(sections.map((section) => section.querySelector(".policyNo")!.textContent)).toEqual(
      TERMS_SECTIONS.map((section) => section.no)
    );

    for (const [index, section] of sections.entries()) {
      const blocks = TERMS_SECTIONS[index]!.blocks;
      expect(
        [...section.querySelectorAll(".policyText")].map((element) => element.textContent),
        `section ${TERMS_SECTIONS[index]!.no} paragraphs`
      ).toEqual(blocks.filter((block) => block.kind === "p").map((block) => block.text));
      expect(
        [...section.querySelectorAll(".policyItemText")].map((element) => element.textContent),
        `section ${TERMS_SECTIONS[index]!.no} bullets`
      ).toEqual(blocks.flatMap((block) => (block.kind === "list" ? [...block.items] : [])));

      const number = section.querySelector<HTMLElement>(".policyNo")!;
      const token = TERMS_SECTIONS[index]!.accent;
      expect(number.dataset.accent).toBe(token);
      expect(number.style.getPropertyValue("--accent")).toBe(`var(${token})`);
    }
    expect(dialog().querySelectorAll(".policyText").length).toBe(104);
    expect(dialog().querySelectorAll(".policyItem").length).toBe(12);
  });

  it("offers Close and no acknowledgement in read mode", async () => {
    const onAcknowledge = vi.fn();
    await render(
      <TermsOfServiceModal open mode="read" onClose={vi.fn()} onAcknowledge={onAcknowledge} />
    );

    expect(textControls("I have read it").length).toBe(0);
    expect(textControls("Close").length).toBe(1);
    const footerControls = [...dialog().querySelectorAll<HTMLElement>(".policyFoot button")];
    await act(async () => {
      for (const control of footerControls) control.click();
    });
    expect(onAcknowledge).toHaveBeenCalledTimes(0);
  });

  it("gates the acknowledgement on reaching the end, then acknowledges before closing", async () => {
    const calls: string[] = [];
    const onClose = vi.fn(() => calls.push("close"));
    const onAcknowledge = vi.fn(() => calls.push("acknowledge"));
    await render(
      <TermsOfServiceModal open mode="consent" onClose={onClose} onAcknowledge={onAcknowledge} />
    );

    expect(textControls("Close").length).toBe(0);
    const button = acknowledgeButton();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("terms-modal-gate-hint");
    expect(document.getElementById("terms-modal-gate-hint")!.textContent).toBe(
      "Scroll to the end of the policy to continue."
    );
    expect(document.getElementById("policy-modal-gate-hint")).toBeNull();

    metrics = { scrollTop: 292, clientHeight: 200, scrollHeight: 500 };
    await act(async () => {
      dialog().querySelector(".policyBody")!.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(acknowledgeButton().disabled).toBe(false);
    expect(document.getElementById("terms-modal-gate-hint")).toBeNull();

    await act(async () => {
      acknowledgeButton().click();
    });
    expect(calls).toEqual(["acknowledge", "close"]);
  });
});

// The prop type is the privacy modal's, member for member: `onAcknowledge` is OPTIONAL…
const optionalAcknowledge: TermsOfServiceModalProps = {
  open: true,
  mode: "read",
  onClose: () => {}
};

// …and the type is CLOSED, so a fifth member does not compile.
const fifthMember: TermsOfServiceModalProps = {
  open: true,
  mode: "read",
  onClose: () => {},
  // @ts-expect-error - the prop type is closed: exactly four members, no fifth
  downloadPdf: () => {}
};

void optionalAcknowledge;
void fifthMember;
