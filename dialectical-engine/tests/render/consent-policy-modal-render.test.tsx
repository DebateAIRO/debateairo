// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrivacyPolicyModal,
  type PrivacyPolicyModalProps
} from "../../apps/ui/components/consent/PrivacyPolicyModal.js";
import { POLICY_JUMP, POLICY_SECTIONS } from "../../apps/ui/lib/privacyPolicy.js";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

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

/** Every element inside the dialog whose own text is exactly `label`. */
function textControls(dialog: HTMLElement, label: string): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>("*")].filter(
    (element) => element.textContent === label
  );
}

describe("privacy policy modal — rendered", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // S02-S33 — the prop type has exactly four members and `open: false` renders nothing.
  it("renders nothing at all when open is false", async () => {
    await render(
      <PrivacyPolicyModal open={false} mode="consent" onClose={vi.fn()} onAcknowledge={vi.fn()} />
    );

    expect(container!.childNodes.length).toBe(0);
  });

  // S02-S34 — scrim, bezel, core, gold tab, and the three dialog ARIA attributes.
  it("announces itself as one dialog whose name resolves to its own title", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);

    const scrims = document.querySelectorAll(".policyScrim");
    expect(scrims.length).toBe(1);
    const dialogs = scrims[0]!.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBe(1);
    const dialog = dialogs[0] as HTMLElement;

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();
    const title = document.getElementById(labelledBy!);
    expect(title, `aria-labelledby="${labelledBy}" resolves to nothing`).not.toBeNull();
    expect(title!.textContent).toBe("What we store, and why");

    expect(dialog.querySelectorAll(".policyCore .policyTab").length).toBe(1);
  });

  // S02-S35 — header copy is byte-exact and `×` is labelled.
  it("shows the header copy byte-exact and labels the close control", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    expect(dialog.querySelector(".policyEyebrow")!.textContent).toBe(
      "PRIVACY POLICY · v2.1 · EFFECTIVE 12 AUG 2026"
    );
    expect(dialog.querySelector(".policyTitle")!.textContent).toBe("What we store, and why");
    expect(dialog.querySelector(".policyLede")!.textContent).toBe(
      "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Eleven sections — scroll to the end."
    );

    const closers = [...dialog.querySelectorAll("*")].filter(
      (element) => element.getAttribute("aria-label") === "Close"
    );
    expect(closers.length).toBe(1);
    expect(closers[0]!.textContent).toBe("×");
  });

  // S02-S36 — eight pills render in order and every `data-jump` resolves inside the modal.
  it("renders the eight jump pills in the design's order, each resolving to one section", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    const pills = [...dialog.querySelectorAll<HTMLButtonElement>("button[data-jump]")];
    expect(pills.length).toBe(8);
    expect(pills.map((pill) => pill.textContent)).toEqual(POLICY_JUMP.map((jump) => jump.label));

    for (const pill of pills) {
      expect(pill.getAttribute("type")).toBe("button");
      const target = pill.dataset.jump!;
      const resolved = [...dialog.querySelectorAll("*")].filter(
        (element) => element.id === target
      );
      expect(resolved.length, `data-jump="${target}" resolves to ${resolved.length} elements`).toBe(
        1
      );
    }
  });

  // S02-S37 — eleven sections with number, title, body, bullets and their accent.
  it("renders the eleven sections in order, with their bullets and their accent tokens", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    const sections = [...dialog.querySelectorAll<HTMLElement>('[id^="policy-section-"]')];
    expect(sections.length).toBe(11);
    expect(sections.map((section) => section.id)).toEqual([
      "policy-section-01",
      "policy-section-02",
      "policy-section-03",
      "policy-section-04",
      "policy-section-05",
      "policy-section-06",
      "policy-section-07",
      "policy-section-08",
      "policy-section-09",
      "policy-section-10",
      "policy-section-11"
    ]);

    expect(sections.map((section) => section.querySelector(".policySectionTitle")!.textContent)).toEqual(
      POLICY_SECTIONS.map((section) => section.title)
    );
    expect(sections.map((section) => section.querySelector(".policyNo")!.textContent)).toEqual(
      POLICY_SECTIONS.map((section) => section.no)
    );
    expect(sections.map((section) => section.querySelector(".policyText")!.textContent)).toEqual(
      POLICY_SECTIONS.map((section) => section.body)
    );

    // The expected bullet total is DERIVED from the data (3 + 4 + 5), and the data's own total is
    // then pinned at the SPEC's number, so neither a dropped bullet nor a dropped list passes.
    const expectedBullets = POLICY_SECTIONS.reduce((total, section) => total + section.items.length, 0);
    expect(expectedBullets).toBe(12);
    expect(dialog.querySelectorAll(".policyItem").length).toBe(expectedBullets);

    for (const [index, section] of sections.entries()) {
      const number = section.querySelector<HTMLElement>(".policyNo")!;
      const token = POLICY_SECTIONS[index]!.accent;
      expect(number.dataset.accent).toBe(token);
      expect(number.style.getPropertyValue("--accent")).toBe(`var(${token})`);
    }
  });

  // S02-S38 — footer contact line, end marker last in the scroll region, and NO `Download PDF`.
  it("ends the scroll region with the end marker, keeps the contact line, and offers no PDF", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    const contacts = [...dialog.querySelectorAll("*")].filter(
      (element) => element.textContent === "Questions: privacy@dezbatere.ro"
    );
    expect(contacts.length).toBeGreaterThanOrEqual(1);

    const scrollRegion = dialog.querySelector(".policyBody")!;
    const last = scrollRegion.lastElementChild!;
    expect(last.textContent).toBe("END OF POLICY · GDPR (EU) 2016/679 · v2.1");

    // The honesty rule: this repository generates no policy PDF, so no control claims one.
    const pdf = [...dialog.querySelectorAll("*")].filter(
      (element) => element.textContent?.trim() === "Download PDF"
    );
    expect(pdf.length).toBe(0);
  });

  // S02-S39 — `mode="read"` and `mode="consent"` differ in exactly the specified way.
  it("offers Close and no acknowledgement in read mode", async () => {
    const onAcknowledge = vi.fn();
    await render(
      <PrivacyPolicyModal open mode="read" onClose={vi.fn()} onAcknowledge={onAcknowledge} />
    );
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    expect(textControls(dialog, "I have read it").length).toBe(0);
    expect(textControls(dialog, "Close").length).toBe(1);
    expect(
      [...dialog.querySelectorAll("*")].filter(
        (element) => element.textContent === "Questions: privacy@dezbatere.ro"
      ).length
    ).toBeGreaterThanOrEqual(1);

    const footerControls = [
      ...dialog.querySelectorAll<HTMLElement>(".policyFoot button, .policyFoot [role='button']")
    ];
    expect(footerControls.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      for (const control of footerControls) control.click();
    });

    expect(onAcknowledge).toHaveBeenCalledTimes(0);
  });

  it("offers the acknowledgement and no Close control in consent mode", async () => {
    await render(<PrivacyPolicyModal open mode="consent" onClose={vi.fn()} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

    expect(textControls(dialog, "I have read it").length).toBe(1);
    expect(textControls(dialog, "Close").length).toBe(0);
  });
});

// S02-S33, the two type-level pins. `onAcknowledge` is OPTIONAL, so this assignment compiles:
const optionalAcknowledge: PrivacyPolicyModalProps = {
  open: true,
  mode: "read",
  onClose: () => {}
};

// ...and the type is CLOSED, so a fifth member does not. The `@ts-expect-error` itself becomes
// an error if the assignment ever starts compiling, which is what pins the closure.
const fifthMember: PrivacyPolicyModalProps = {
  open: true,
  mode: "read",
  onClose: () => {},
  // @ts-expect-error - the prop type is closed: exactly four members, no fifth
  downloadPdf: () => {}
};

void optionalAcknowledge;
void fifthMember;
