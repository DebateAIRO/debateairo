// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";

/**
 * Side-by-side spec §13 addition, D24 (Task SA7 part A): THE NEW-DEBATE PAGE SHOWS THE LINE-UP OF THE VERSION ITS ROOM
 * READ WAS READ FROM. Plain words: the owners may change which AIs debate on Free and Premium without an upload; the
 * Free and Premium cards name the AIs the room read says (`preview_rosters`), and only when the read carries no such
 * list (an older API), a list naming an AI nobody reviewed, or a failed read, the list the website was built with.
 * A read from another version (Ruling R51) brings its own list with it, or the build list when it has none.
 */
const mocks = vi.hoisted(() => ({ getAskRoom: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  createDebate: async () => ({ id: "run:new" }),
  validateSession: async () => undefined,
  // No scored model list is in force: the one state in which the plan cards name their AIs (final review C1).
  contractClient: {
    readSession: async () => ({ model_scorecard_in_force: false }),
    getAskRoom: mocks.getAskRoom,
    readSensitiveDataConsent: async () => ({ status: "given" as const })
  }
}));
vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: (token: string) => unknown }) => children("test-token")
}));
vi.mock("@/components/support/SupportWidget", () => ({ SupportWidget: () => null }));

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, "en", `${namespace}.json`), "utf8")) as Record<string, string>;
const en = catalogue("newDebate");
const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
/** The website's build flag: Free GLM + DeepSeek, Premium four AIs. */
const BUILD_FLAG = JSON.stringify({ free: [GLM, DEEPSEEK], premium: [GLM, DEEPSEEK, MIMO, QWEN] });
const BUILD = Object.freeze({ free: [GLM, DEEPSEEK], premium: [GLM, DEEPSEEK, MIMO, QWEN] });
const room = (overrides: Record<string, unknown>) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, ...overrides
});

let root: Root | null = null;

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
  }
}

async function mount(): Promise<HTMLElement> {
  const { default: NewDebatePage } = await import("../../apps/ui/app/new/NewDebatePageClient.js");
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(
    <NewDebatePage catalog={en} homeCatalog={catalogue("home")} chromeCatalog={catalogue("chrome")} locale="en" />));
  await settle();
  return container;
}

async function click(container: HTMLElement, selector: string): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>(selector)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

const shown = (container: HTMLElement) => ({
  free: [...container.querySelectorAll("#planTier-free .ndTierModel")].map((model) => model.textContent?.trim()),
  premium: [...container.querySelectorAll("#planTier-premium .ndTierModel")].map((model) => model.textContent?.trim())
});
const banners = (container: HTMLElement) => [...container.querySelectorAll(".error")].map((banner) => banner.textContent ?? "");

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON", BUILD_FLAG);
  mocks.getAskRoom.mockReset().mockResolvedValue(room({}));
  mocks.push.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("/new names the AIs of the room read's version (addition D24)", () => {
  it("shows the room read's Free and Premium lists, not the build's", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ settings_version: 18, preview_rosters: { free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] } }));
    const container = await mount();
    expect(shown(container)).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
  });

  it("shows the build list when the read carries no list (an older API)", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ settings_version: 18 }));
    const container = await mount();
    expect(shown(container)).toEqual(BUILD);
  });

  it("shows the build list when the read's list names an AI nobody reviewed", async () => {
    mocks.getAskRoom.mockResolvedValue(room({ preview_rosters: { free: [GLM, "other/model"], premium: [GLM, QWEN, HAIKU] } }));
    const container = await mount();
    expect(shown(container)).toEqual(BUILD);
  });

  it("shows the build list when the room read fails", async () => {
    mocks.getAskRoom.mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    const container = await mount();
    expect(shown(container)).toEqual(BUILD);
  });

  it("R51: a read from another version brings its own list and says the choices changed", async () => {
    let served: Record<string, unknown> = { settings_version: 17, preview_rosters: { free: [GLM, DEEPSEEK], premium: [GLM, MIMO] } };
    mocks.getAskRoom.mockImplementation(async () => room(served));
    const container = await mount();
    expect(shown(container)).toEqual({ free: [GLM, DEEPSEEK], premium: [GLM, MIMO] });
    expect(banners(container)).not.toContain(en["newDebate.settingsChanged"]);
    served = { settings_version: 18, preview_rosters: { free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] } };
    await click(container, "#planTier-premium");
    expect(banners(container)).toContain(en["newDebate.settingsChanged"]);
    expect(shown(container)).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
  });

  it("R51: a read from another version that carries no list is authoritative too: the build list comes back", async () => {
    let served: Record<string, unknown> = { settings_version: 17, preview_rosters: { free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] } };
    mocks.getAskRoom.mockImplementation(async () => room(served));
    const container = await mount();
    expect(shown(container)).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
    served = { settings_version: 18 };
    await click(container, "#planTier-premium");
    expect(banners(container)).toContain(en["newDebate.settingsChanged"]);
    expect(shown(container)).toEqual(BUILD);
  });

  it("a later failed read keeps the list on screen (the choices shown are still that version's)", async () => {
    mocks.getAskRoom.mockResolvedValueOnce(room({ settings_version: 18, preview_rosters: { free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] } }))
      .mockRejectedValue(new ContractHttpError("SERVER_FAILURE", 503, "down"));
    const container = await mount();
    await click(container, "#planTier-premium");
    expect(shown(container)).toEqual({ free: [GLM, HAIKU], premium: [GLM, QWEN, HAIKU] });
  });
});
