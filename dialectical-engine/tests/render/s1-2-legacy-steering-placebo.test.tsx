// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S1-2 / T2. PROPERTY: the legacy new-question form offers the asker no steering
// control, so no text the asker can type into this form reaches `steering_presets` or
// `steering_annotations` — while both contract fields stay present, as empty arrays,
// so the submitted ask and already-stored asks remain valid.

const mocks = vi.hoisted(() => ({ submitAsk: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/api", () => ({ contractClient: { submitAsk: mocks.submitAsk } }));

import { NewQuestionForm } from "../../web/app/new/NewQuestionForm.js";

const MACHINE_AS_OF = "2026-09-01T00:00:00.000Z";
const TYPED = "asker-typed-steering-text";

let root: Root | null = null;

async function mountForm(): Promise<HTMLFormElement> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<NewQuestionForm machineAsOf={MACHINE_AS_OF} />));
  return document.querySelector("form")!;
}

/** Type the sentinel into every free-text control the form still renders, then submit. */
async function submitWithEveryTextControlFilled(form: HTMLFormElement): Promise<Record<string, unknown>> {
  await act(async () => {
    for (const area of form.querySelectorAll("textarea")) area.value = TYPED;
    for (const select of form.querySelectorAll("select")) select.value = select.options[1]!.value;
    form.querySelector<HTMLInputElement>('input[name="depth"]')!.value = "3";
  });
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(mocks.submitAsk).toHaveBeenCalledTimes(1);
  return mocks.submitAsk.mock.calls[0]![0] as Record<string, unknown>;
}

describe("S1-2 legacy /new form carries no steering placebo", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.submitAsk.mockReset().mockResolvedValue({ run_ref: "run:s1-2" });
    mocks.push.mockReset();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("renders no steering input", async () => {
    const form = await mountForm();
    expect(form.querySelector('[name="steering_presets"]')).toBeNull();
    expect(form.querySelector('[name="steering_annotations"]')).toBeNull();
    expect(form.textContent).not.toMatch(/steering/i);
  });

  it("reaches the ask with empty steering arrays though every text control carries text", async () => {
    const ask = await submitWithEveryTextControlFilled(await mountForm());
    expect(ask.steering_presets).toEqual([]);
    expect(ask.steering_annotations).toEqual([]);
  });

  it("keeps both steering contract fields present and the submission valid", async () => {
    const ask = await submitWithEveryTextControlFilled(await mountForm());
    expect(Object.keys(ask)).toEqual(
      expect.arrayContaining(["steering_presets", "steering_annotations"])
    );
    expect(ask).toMatchObject({
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      decision_scope: "personal",
      as_of: MACHINE_AS_OF,
      depth_params: { depth: 3 }
    });
    expect(mocks.push).toHaveBeenCalledWith("/debate/run%3As1-2");
  });
});
