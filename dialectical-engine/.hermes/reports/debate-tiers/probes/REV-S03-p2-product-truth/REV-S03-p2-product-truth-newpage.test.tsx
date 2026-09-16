// @vitest-environment jsdom
//
// REV-S03-p2-product-truth — the lens's OWN fixture, pass 2, case B RE-DERIVED for the
// surface FIX-S03-p1-F2 shipped (GET /v1/plan-tiers, auth:"user").
//
// Pass-1 case B asserted SILENCE (0 ids, no .error). That direction is stale at this
// head: the page now names the refusal. The question that matters for acceptance step 2
// is unchanged — does V see the file's ids? — so the re-derived case asserts the ids and
// records what stands in their place.
//
// The reject message is not invented: the companion probe measured the real route
// handing an ordinary session 500 {"error":"INTERNAL_ERROR",...} for the row the dev
// register actually publishes, and packages/contract/src/client.ts:90-93 turns that body
// into a ContractHttpError whose message is "INTERNAL_ERROR".

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelConfig } from "@debateai/model-config";

const mocks = vi.hoisted(() => ({
  createDebate: vi.fn(),
  push: vi.fn(),
  readPlanTiers: vi.fn(),
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
    readPlanTiers: mocks.readPlanTiers,
    readSession: mocks.readSession
  }
}));

import NewDebatePage from "../../apps/ui/app/new/page.js";

const config = loadModelConfig(process.cwd());
const FILE_FREE = config.free.map(({ model }) => model);
const FILE_PREMIUM = config.premium.map(({ model }) => model);

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("REV-S03-p2-product-truth — /new's tier lists at the reviewed head", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.createDebate.mockReset().mockResolvedValue({ id: "run-probe" });
    mocks.push.mockReset();
    mocks.readPlanTiers.mockReset();
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

  it("A CONTROL — a RESOLVED roster read renders exactly the file's ids, each with a dot", async () => {
    mocks.readPlanTiers.mockResolvedValue({ free: FILE_FREE, premium: FILE_PREMIUM });
    const host = await mount();
    expect(renderedModelIds(host)).toEqual([...FILE_FREE, ...FILE_PREMIUM]);
    const dots = [...host.querySelectorAll(".ndTierModel .modelDot")];
    expect(dots).toHaveLength(FILE_FREE.length + FILE_PREMIUM.length);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.getPropertyValue("--dot").trim()).not.toBe("");
    }
  });

  it("B RE-DERIVED — the 500 the real route returns for the published row: step 2's ids are absent", async () => {
    mocks.readPlanTiers.mockRejectedValue(new Error("INTERNAL_ERROR"));
    const host = await mount();

    const error = host.querySelector(".error");
    console.log(`[PROBE] rendered ids=${JSON.stringify(renderedModelIds(host))} error=${JSON.stringify(error?.textContent ?? null)}`);

    // What FIX-S03-p1-F2 added, and what it is worth: the refusal is NAMED.
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain("ASK_PLAN_TIER_ROSTERS_UNAVAILABLE");

    // What acceptance step 2 asks for, and does not get.
    expect(renderedModelIds(host)).toEqual([]);
    expect(host.textContent).not.toContain("gpt-5.6-luna");
    expect(host.textContent).not.toContain("glm-5.3-flash");

    // The page still looks complete: both tier cards render, promises and all.
    expect(host.querySelectorAll(".ndTierOption")).toHaveLength(2);
  });

  it("C step 2, stated as V would: the Free card lists exactly the file's two Free ids", async () => {
    mocks.readPlanTiers.mockRejectedValue(new Error("INTERNAL_ERROR"));
    const host = await mount();
    const freeCard = host.querySelector('.ndTierOption[data-value="free"]');
    expect(freeCard).not.toBeNull();
    expect([...freeCard!.querySelectorAll(".ndTierModel")].map((n) => (n.textContent ?? "").trim()))
      .toEqual(FILE_FREE);
  });
});
