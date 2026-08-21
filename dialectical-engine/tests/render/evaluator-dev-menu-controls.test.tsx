// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEvaluatorDevMenu: vi.fn(),
  selectEvaluatorConsumerModel: vi.fn()
}));

vi.mock("@/lib/api", () => ({
  getEvaluatorDevMenu: mocks.getEvaluatorDevMenu,
  selectEvaluatorConsumerModel: mocks.selectEvaluatorConsumerModel
}));

import { EvaluatorDevMenu } from "../../apps/ui/components/EvaluatorDevMenu.js";

let root: Root | null = null;

describe("evaluator dev-menu controls", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.getEvaluatorDevMenu.mockReset().mockResolvedValue({
      catalog: {
        state: "AVAILABLE",
        probeId: "probe:test",
        failureCode: null,
        models: [
          { modelId: "consumer:alpha" },
          { modelId: "consumer:beta" }
        ]
      },
      selectedConsumer: null,
      dispatchBinding: {
        state: "UNBOUND",
        reason: "ROW_ABSENT",
        registerVersion: 1,
        sourceRef: null
      },
      harvestedRows: 0,
      domains: [],
      profiles: [],
      parkedRuns: []
    });
    mocks.selectEvaluatorConsumerModel.mockReset();
  });

  afterEach(async () => {
    if (root !== null) await act(async () => root!.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("renders exactly the two catalog selection controls", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<EvaluatorDevMenu token="token:test" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const controls = Array.from(
      container.querySelectorAll("button, input, select, textarea, form, a[href]")
    ).map((control) => `${control.tagName}:${control.textContent?.trim() ?? ""}`);

    expect(controls).toEqual(["BUTTON:Select", "BUTTON:Select"]);
  });
});
