// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicDebateSummary } from "@debateai/contract";
import type { DebateSummary } from "../../apps/ui/lib/types.js";

/**
 * Paid plans L4 (spec 2026-09-29 §2.3.2; R3-2). Sign-in lands on the home page
 * (`/#start-a-debate`), so the blocking accept screen must cover it as it covers
 * the AuthGate pages: the age check's interstitial first, then the legal status,
 * and the composer and library only once nothing is owed. A failed status read
 * lets the page through unchanged (ruling Q-10).
 */

const mocks = vi.hoisted(() => ({
  readPublicDebates: vi.fn(async () => ({ items: [] as PublicDebateSummary[], total: 0 })),
  listDebatesPageServer: vi.fn(async () => ({ summaries: [] as DebateSummary[], shown: 0, total: 0 })),
  readAgeConfirmation: vi.fn(),
  serverLegalStatus: vi.fn(),
  client: { getLegalStatus: vi.fn(), acceptLegal: vi.fn(), logout: vi.fn(), readAgeConfirmation: vi.fn() }
}));

vi.mock("@/lib/serverApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/serverApi.js")>()),
  createServerContractClient: () => ({
    readPublicDebates: mocks.readPublicDebates,
    readAgeConfirmation: mocks.readAgeConfirmation,
    getLegalStatus: mocks.serverLegalStatus
  }),
  listDebatesPageServer: mocks.listDebatesPageServer
}));
// The accept screen's own reads in the browser go through `@/lib/api`'s client; the gate itself is real.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
  contractClient: mocks.client
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "__Host-debateai-session" ? { value: "t".repeat(43) } : undefined)
  }),
  headers: async () => new Headers({ "user-agent": "l4-home-render-test" })
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

import HomePage from "../../apps/ui/app/page.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";

const OWED_TERMS = { must_accept: [{ kind: "TERMS", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }] };
let root: Root | null = null;

async function home(): Promise<ReactNode> {
  return HomePage({ searchParams: Promise.resolve({}) });
}

async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.readPublicDebates.mockClear();
  mocks.listDebatesPageServer.mockClear();
  mocks.readAgeConfirmation.mockReset().mockResolvedValue({ status: "confirmed" });
  mocks.serverLegalStatus.mockReset();
  for (const method of Object.values(mocks.client)) method.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the home page's accept screen after sign-in (paid plans L4)", () => {
  it("shows the accept screen instead of the composer and library while the Terms are owed", async () => {
    mocks.serverLegalStatus.mockResolvedValue(OWED_TERMS);
    mocks.client.getLegalStatus.mockResolvedValue(OWED_TERMS);
    const page = await home();
    expect(mocks.serverLegalStatus).toHaveBeenCalledWith("en");
    // First paint: the composer is not in the server markup at all.
    const firstPaint = renderToStaticMarkup(<>{page}</>);
    expect(firstPaint).not.toContain('id="library-claim"');
    expect(firstPaint).not.toContain('id="start-a-debate"');
    await act(async () => root!.render(<>{page}</>));
    await settle();
    expect(document.querySelector("#legal-gate-title")?.textContent).toBe("Please read and accept the current documents");
    expect(document.querySelector("#library-claim")).toBeNull();
    expect(document.querySelector("#start-a-debate")).toBeNull();
  });

  it("renders the composer as before when the status read fails (ruling Q-10)", async () => {
    mocks.serverLegalStatus.mockRejectedValue(new Error("offline"));
    const page = await home();
    expect(mocks.serverLegalStatus).toHaveBeenCalledTimes(1);
    await act(async () => root!.render(<>{page}</>));
    await settle();
    expect(document.querySelector("#library-claim")).not.toBeNull();
    expect(document.querySelector("#legal-gate-title")).toBeNull();
    // No client gate is mounted, so the browser never repeats the read.
    expect(mocks.client.getLegalStatus).not.toHaveBeenCalled();
  });

  it("shows the age check's interstitial first and never reads the legal status while it is owed (R3-2)", async () => {
    mocks.readAgeConfirmation.mockResolvedValue({ status: "required" });
    mocks.serverLegalStatus.mockResolvedValue(OWED_TERMS);
    const markup = renderToStaticMarkup(<>{await home()}</>);
    expect(markup).toContain("Confirm your date of birth to keep using DebateAI");
    expect(markup).not.toContain('id="library-claim"');
    expect(markup).not.toContain('id="legal-gate-title"');
    expect(mocks.serverLegalStatus).not.toHaveBeenCalled();
    expect(mocks.client.getLegalStatus).not.toHaveBeenCalled();
  });
});
