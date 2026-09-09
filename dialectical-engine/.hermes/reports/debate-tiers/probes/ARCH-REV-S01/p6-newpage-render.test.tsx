// @vitest-environment jsdom
//
// ARCH-REV-S01 probe — REFUTATION ATTEMPT against PLAN.md F1's remedy.
// CLAIM under test (PLAN.md:57-62, :356-359): the `sup-04-widget` idiom
// (jsdom + real React + createRoot + act + IS_REACT_ACT_ENVIRONMENT), mocking
// only next/navigation, @/components/AuthGate and @/lib/api, renders
// apps/ui/app/new/page.tsx with the real compiled components, and the rendered
// cases S01-20..S01-39 are therefore writable there.
//
// This file is written by the REVIEWER, from the claim, never copied from the
// author's tests. It lives in the lane's gitignored coverage/ dir so the lane's
// `git status --porcelain` stays empty; it is deleted at exit.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  createDebate: vi.fn(async () => ({ id: "run:new" })),
  readSession: vi.fn(async () => ({
    asker_id: "asker:test-user-alpha",
    session_id: "session:test-user-alpha",
    caller_scope: "ASKER",
    ownership_provenance: "user_dev_token",
    provisional_identity_model: true
  })),
  readDeployment: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams("")
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("token:test-user-alpha")
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
  contractClient: { readSession: mocks.readSession, readDeployment: mocks.readDeployment },
  createDebate: mocks.createDebate
}));

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ARCH-REV-S01 probe · does the sup-04-widget idiom render /new?", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    container = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  async function mount(): Promise<void> {
    const { default: NewDebatePage } = await import("../../apps/ui/app/new/page.js");
    await act(async () => { root!.render(<NewDebatePage />); });
    await settle();
  }

  it("P1 renders the REAL compiled page — the chrome the Screens block names", async () => {
    await mount();
    const d = document;
    expect(d.querySelector(".ndScreen"), ".ndScreen").not.toBeNull();
    expect(d.querySelector(".ndInner"), ".ndInner").not.toBeNull();
    expect(d.querySelector(".ndEyebrow")?.textContent, ".ndEyebrow copy").toBe("NEW QUESTION");
    expect(d.querySelector(".ndTitle")?.textContent, ".ndTitle copy").toBe("What should we debate?");
    expect(d.querySelector(".ndTopicBezel"), ".ndTopicBezel").not.toBeNull();
    expect(d.querySelector("#topic"), "#topic").not.toBeNull();
    expect(d.querySelector(".ndIntro")?.textContent, "the V-17 sentence").toContain("Choose your risk tier");
    expect(d.querySelector(".ndOptionsToggle"), ".ndOptionsToggle").not.toBeNull();
    expect(d.querySelector(".ndStart"), ".ndStart").not.toBeNull();
  });

  it("P2 renders the fourteen controls R4 must lock — all reachable by the ids the SPEC names", async () => {
    await mount();
    // expand OPTIONS first: five of the fourteen live behind it (R5 / S01-30)
    const toggle = document.querySelector<HTMLButtonElement>(".ndOptionsToggle")!;
    await act(async () => { toggle.click(); });
    await settle();
    const ids = ["riskTier-casual", "riskTier-standard", "riskTier-high-stakes",
      "budgetTier-low", "budgetTier-medium", "budgetTier-high",
      "treeDepth", "steeringPresets", "steeringAnnotations",
      "depthMode", "scrutinyDepth", "branchingWidth", "concurrency", "maxTokens"];
    const missing = ids.filter((id) => document.getElementById(id) === null);
    expect(missing, "ids the R4 list names that the rendered DOM has no element for").toEqual([]);
    expect(document.getElementById("additionalRunOptions"), "#additionalRunOptions after the toggle").not.toBeNull();
    expect(toggle.getAttribute("aria-expanded"), "toggle aria-expanded after click").toBe("true");
  });

  it("P3 propagates STATE through this idiom — the mechanism S01-34/35/36 depend on", async () => {
    await mount();
    const casual = document.getElementById("riskTier-casual") as HTMLButtonElement;
    expect(casual.getAttribute("aria-checked"), "before the click").toBe("false");
    await act(async () => { casual.click(); });
    await settle();
    expect(
      (document.getElementById("riskTier-casual") as HTMLButtonElement).getAttribute("aria-checked"),
      "after the click — if this is false, no rendered case in C3 can pass"
    ).toBe("true");

    // the depth slider's rendered value must move too (S01-36's slider arm)
    const slider = document.getElementById("treeDepth") as HTMLInputElement;
    expect(slider.getAttribute("min"), "R10 min").toBe("1");
    expect(slider.getAttribute("max"), "R10 max").toBe("5");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(slider, "4");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect((document.getElementById("treeDepth") as HTMLInputElement).value, "slider value after input").toBe("4");
  });

  it("P4 accepts typing into #topic and enables .ndStart — R6 / R18 are reachable here", async () => {
    await mount();
    const topic = document.getElementById("topic") as HTMLTextAreaElement;
    expect(topic.hasAttribute("disabled"), "#topic disabled").toBe(false);
    expect(topic.hasAttribute("readonly"), "#topic readonly").toBe(false);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(topic, "a debatable claim about transit");
      topic.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect((document.getElementById("topic") as HTMLTextAreaElement).value).toBe("a debatable claim about transit");
    const start = document.querySelector<HTMLButtonElement>(".ndStart")!;
    // riskTier is "" at base, so ready is still false — this is the CURRENT page,
    // not the S01 page. Recorded, not asserted as a requirement.
    // eslint-disable-next-line no-console
    console.log("PROBE ndStart disabled with a topic and no risk tier =", start.disabled);
    const casual = document.getElementById("riskTier-standard") as HTMLButtonElement;
    await act(async () => { casual.click(); });
    await settle();
    expect(document.querySelector<HTMLButtonElement>(".ndStart")!.disabled,
      "with topic + risk tier chosen, Start is enabled").toBe(false);
  });

  it("P5 reaches createDebate on submit — the S01-39 mount", async () => {
    await mount();
    const topic = document.getElementById("topic") as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(topic, "a debatable claim about transit");
      topic.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    await act(async () => { (document.getElementById("riskTier-standard") as HTMLButtonElement).click(); });
    await settle();
    const form = document.querySelector("form")!;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await settle();
    expect(mocks.createDebate).toHaveBeenCalledTimes(1);
    const config = mocks.createDebate.mock.calls[0]![1] as Record<string, unknown>;
    // eslint-disable-next-line no-console
    console.log("PROBE ask config =", JSON.stringify(config));
    expect(config.tier_source, "R7's provenance pair — source").toBe("ASKER");
    expect(config.tier_provenance_ref, "R7's provenance pair — ref (base value)").toBe("asker:ui-selection");
  });
});
