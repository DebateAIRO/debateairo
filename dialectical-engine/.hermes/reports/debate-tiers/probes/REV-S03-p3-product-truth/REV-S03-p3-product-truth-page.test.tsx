// @vitest-environment jsdom
//
// REV-S03-p3-product-truth — the lens's OWN fixture, pass 3, written against 3f488b3f.
//
// Pass-2 case C is RE-DERIVED here. The pass-2 copy mocked `readPlanTiers` to REJECT and
// then asserted the Free card lists the file's two Free ids — self-contradictory, so RED
// at every head (the pass-3 package names it: newpage.test.tsx:127). The re-derivation is
// not "mock a resolved literal" (that is case A, a control that proves nothing about the
// route). It is the JOIN: the REAL published register row -> the REAL projection -> the
// REAL route -> the bytes that come back -> the page's read.
//
// If acceptance step 2 passes at this head, it passes HERE, with no literal anywhere
// between the file on disk and the DOM V looks at.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import {
  buildApi as buildApiBase,
  PostgresAskApplication,
  type RunCreationSettings
} from "@debateai/api";
import {
  buildDevelopmentDeploymentRegisterRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

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

const USER_IDENTITY = testHttpIdentity("p3-product-truth-page");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

// What the REAL route hands the browser for the REAL published row. Filled in beforeAll.
let WIRE_BODY: { free: string[]; premium: string[] } | null = null;
let WIRE_STATUS = 0;

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 4,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  } as RunCreationSettings;
}

async function realRouteBody(): Promise<void> {
  const FILE_ROSTERS = developmentPlanTierRosters(config);
  const publishedRow = buildDevelopmentDeploymentRegisterRows(
    { requiredDistinctMakers: 1, configuredProviders: [] } as never,
    FILE_ROSTERS
  ).find(({ rowKey }) => rowKey === "planTierRosters")!;

  const application = new PostgresAskApplication(
    {
      query: async (statement: string) => {
        if (statement.includes("FROM register.register_row")) {
          return { rows: [{
            row_key: "planTierRosters",
            value_json: publishedRow.value,
            source_ref: "config/models.yaml"
          }] };
        }
        if (statement.includes("FROM scorecard.scorecard_cell")
          || statement.includes("FROM identity.run_execution_binding")) {
          return { rows: [] };
        }
        throw new Error(`UNEXPECTED_QUERY:${statement}`);
      }
    } as never,
    { dispatch: async () => undefined },
    settings(),
    undefined,
    {} as never,
    { server: {} as never, legacy: {} as never }
  );

  const server = buildApiBase({
    application: application as never,
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
  WIRE_STATUS = response.statusCode;
  console.log(`[PROBE p3 page] real route -> status=${WIRE_STATUS} body=${response.body.slice(0, 300)}`);
  if (WIRE_STATUS === 200) WIRE_BODY = response.json() as { free: string[]; premium: string[] };
  await server.close();
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("REV-S03-p3-product-truth — /new's tier lists, joined to the real route at 3f488b3f", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeAll(async () => { await realRouteBody(); });

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

  it("W the route this page reads answered 200 for the row the stack publishes", () => {
    expect(WIRE_STATUS).toBe(200);
    expect(WIRE_BODY).not.toBeNull();
  });

  it("C RE-DERIVED — step 2 as V states it, driven by the REAL route body: the Free card lists exactly the file's two Free ids", async () => {
    mocks.readPlanTiers.mockResolvedValue(WIRE_BODY!);
    const host = await mount();
    const freeCard = host.querySelector('.ndTierOption[data-value="free"]');
    expect(freeCard).not.toBeNull();
    const freeIds = [...freeCard!.querySelectorAll(".ndTierModel")].map((n) => (n.textContent ?? "").trim());
    console.log(`[PROBE p3 page] Free card ids = ${JSON.stringify(freeIds)}`);
    expect(freeIds).toEqual(FILE_FREE);
    expect(freeIds).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
  });

  it("C2 — and the Premium card lists exactly the file's premium ids, each with a non-empty dot", async () => {
    mocks.readPlanTiers.mockResolvedValue(WIRE_BODY!);
    const host = await mount();
    const premiumCard = host.querySelector('.ndTierOption[data-value="premium"]');
    expect(premiumCard).not.toBeNull();
    const premiumIds = [...premiumCard!.querySelectorAll(".ndTierModel")].map((n) => (n.textContent ?? "").trim());
    console.log(`[PROBE p3 page] Premium card ids = ${JSON.stringify(premiumIds)}`);
    expect(premiumIds).toEqual(FILE_PREMIUM);

    const dots = [...host.querySelectorAll(".ndTierModel .modelDot")];
    expect(dots).toHaveLength(FILE_FREE.length + FILE_PREMIUM.length);
    for (const dot of dots) {
      expect((dot as HTMLElement).style.getPropertyValue("--dot").trim()).not.toBe("");
    }
  });

  it("C3 — no refusal banner is shown when the real route answers", async () => {
    mocks.readPlanTiers.mockResolvedValue(WIRE_BODY!);
    const host = await mount();
    expect(host.textContent).not.toContain("ASK_PLAN_TIER_ROSTERS_UNAVAILABLE");
    expect(renderedModelIds(host)).toEqual([...FILE_FREE, ...FILE_PREMIUM]);
  });

  it("B FAULT INJECTION (not the current state) — if the read fails, the refusal is still NAMED and the ids absent", async () => {
    mocks.readPlanTiers.mockRejectedValue(new Error("INTERNAL_ERROR"));
    const host = await mount();
    const error = host.querySelector(".error");
    console.log(`[PROBE p3 page] injected failure -> ids=${JSON.stringify(renderedModelIds(host))} error=${JSON.stringify(error?.textContent ?? null)}`);
    expect(error).not.toBeNull();
    expect(error!.textContent).toContain("ASK_PLAN_TIER_ROSTERS_UNAVAILABLE");
    expect(renderedModelIds(host)).toEqual([]);
    expect(host.querySelectorAll(".ndTierOption")).toHaveLength(2);
  });
});
