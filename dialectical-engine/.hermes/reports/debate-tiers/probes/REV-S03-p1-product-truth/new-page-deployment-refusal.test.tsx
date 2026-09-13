// @vitest-environment jsdom
//
// REV-S03-p1-product-truth — the lens's OWN fixture, built from the CLAIM
// (SPEC-v3 acceptance step 2: "Open /new. The Free card lists exactly
// gpt-5.6-luna and glm-5.3-flash"), not from the author's test.
//
// The author's suite mocks readDeployment RESOLVED. The real browser session
// cannot resolve it: GET /v1/deployment is auth:"operator"
// (apps/api/src/index.ts:139) and the only runtime evaluation of that policy
// refuses every cookie session with 403 OPERATOR_REQUIRED
// (apps/api/src/index.ts:475-477). This probe renders the page the way the
// real API answers it.
//
// Case A is the CONTROL on known-good input (the resolved payload): five ids.
// Case B is the refusal. Case C is a resolved payload whose row is absent.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  push: vi.fn(),
  readDeployment: vi.fn(),
  readSession: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));

vi.mock("@/lib/api", () => ({
  createDebate: mocks.createDebate,
  contractClient: {
    readDeployment: mocks.readDeployment,
    readSession: mocks.readSession
  }
}));

import NewDebatePage from "../../apps/ui/app/new/page.js";

const LIVE_ROSTERS = Object.freeze({
  register: {
    register_version: 1,
    rows: [{
      row_key: "planTierRosters",
      value: {
        kind: "PLAN_TIER_ROSTERS",
        free: ["gpt-5.6-luna", "glm-5.3-flash"],
        premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"]
      },
      source_ref: "config/models.yaml"
    }]
  },
  scorecards: [],
  model_ledger: [],
  fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
});

const NO_ROSTER_ROW = Object.freeze({
  register: {
    register_version: 1,
    rows: [{ row_key: "riskTier", value: "standard", source_ref: "seed" }]
  },
  scorecards: [],
  model_ledger: [],
  fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("REV-S03-p1-product-truth — what /new shows when the deployment read is refused", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-probe" });
    mocks.push.mockReset();
    mocks.readDeployment.mockReset();
    // A HEALTHY session: the author's suite rejects it, which paints an
    // ASK_SESSION_DEFAULTS_UNAVAILABLE error and would mask what the
    // deployment refusal alone does to the page. Isolate the one variable.
    mocks.readSession.mockReset().mockResolvedValue({
      session_id: "00000000-0000-4000-8000-000000000000",
      asker_id: "probe-asker"
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  async function mount(): Promise<HTMLElement> {
    await act(async () => { root!.render(<NewDebatePage />); });
    await settle();
    return container!;
  }

  function renderedModelIds(host: HTMLElement): string[] {
    return [...host.querySelectorAll(".ndTierModel")].map((node) => (node.textContent ?? "").trim());
  }

  it("A CONTROL — a RESOLVED deployment renders all five ids (the harness works)", async () => {
    mocks.readDeployment.mockResolvedValue(LIVE_ROSTERS);
    const host = await mount();
    expect(renderedModelIds(host)).toEqual([
      "gpt-5.6-luna", "glm-5.3-flash", "gpt-5.6-sol", "claude-opus-5", "grok-4.6-build"
    ]);
    // Every id carries a non-empty identity dot (R17).
    const dots = [...host.querySelectorAll(".ndTierModel .modelDot")];
    expect(dots).toHaveLength(5);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.getPropertyValue("--dot").trim()).not.toBe("");
    }
  });

  it("B the REAL browser answer — 403 OPERATOR_REQUIRED: BOTH tier cards list ZERO models, silently", async () => {
    mocks.readDeployment.mockRejectedValue(new Error("OPERATOR_REQUIRED"));
    const host = await mount();

    // Acceptance step 2 asks for exactly these two on the Free card.
    expect(renderedModelIds(host)).toEqual([]);
    expect(host.textContent).not.toContain("gpt-5.6-luna");
    expect(host.textContent).not.toContain("glm-5.3-flash");
    expect(host.textContent).not.toContain("gpt-5.6-sol");

    // And nothing tells the reader why: no error element anywhere in the page.
    expect(host.querySelector(".error")).toBeNull();
    expect(host.textContent).not.toContain("OPERATOR_REQUIRED");
    expect(host.textContent).not.toContain("UNAVAILABLE");

    // The tier cards themselves still render — so the page looks complete.
    expect(host.querySelectorAll(".ndTierOption")).toHaveLength(2);
  });

  it("C a resolved payload with NO planTierRosters row is equally silent", async () => {
    mocks.readDeployment.mockResolvedValue(NO_ROSTER_ROW);
    const host = await mount();
    expect(renderedModelIds(host)).toEqual([]);
    expect(host.querySelector(".error")).toBeNull();
  });
});
