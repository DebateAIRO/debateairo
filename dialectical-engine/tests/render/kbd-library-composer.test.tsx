// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { installFocusFixup } from "./kbd-focus-fixup.js";

/**
 * Keyboard-only check (2026-10-22 follow-up): the home composer's Start is disabled while a press of it runs, so a
 * keyboard press dropped focus to the page. When the press ends in an answer shown under the composer — one
 * question already waits (sentence D), or today's limit is reached — focus now goes back to the question, as /new
 * already does with #topic, so the reader stays where the answer is.
 */

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  readSession: vi.fn(),
  getAskRoom: vi.fn(),
  push: vi.fn()
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stubs/next-navigation.js")>()),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("@/lib/api", () => ({
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: mocks.validateSession,
  contractClient: {
    readSession: mocks.readSession,
    getAskRoom: mocks.getAskRoom,
    readSensitiveDataConsent: async () => ({ status: "given" as const })
  }
}));

import { LibraryComposer } from "../../apps/ui/components/LibraryComposer.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalogue = (namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, "en", `${namespace}.json`), "utf8")) as Record<string, string>;
const room = (overrides: Record<string, unknown>) => ({
  room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null, ...overrides
});
const RESET = new Date(Date.now() + 30 * 86_400_000).toISOString();

let root: Root | null = null;
let uninstallFocusFixup: (() => void) | null = null;

async function settle(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

async function type(field: HTMLTextAreaElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    setter!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** A session check that fails with `failure` once the test releases it, so Start is disabled meanwhile. */
function heldRefusal(failure: unknown): () => void {
  let fail: (reason: unknown) => void = () => undefined;
  mocks.validateSession.mockReturnValue(new Promise<never>((_resolve, reject) => { fail = reject; }));
  return () => fail(failure);
}

async function pressStart(release: () => void): Promise<{ claim: HTMLTextAreaElement; start: HTMLButtonElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const catalog = Object.freeze({ ...catalogue("home"), ...catalogue("chrome") });
  await act(async () => root!.render(
    <LibraryComposer catalog={catalog} newDebateCatalog={catalogue("newDebate")} roomCatalog={catalogue("newDebate")} locale="en" />
  ));
  await settle();
  const claim = container.querySelector<HTMLTextAreaElement>("#library-claim")!;
  const start = container.querySelector<HTMLButtonElement>(".libStart")!;
  await type(claim, "Cities should ban cars downtown");

  await act(async () => start.focus());
  await act(async () => start.click());
  await settle();
  expect(start.disabled, "Start is busy while the press runs").toBe(true);
  expect(document.activeElement, "the browser dropped focus to the page").toBe(document.body);

  await act(async () => release());
  await settle();
  return { claim, start };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  uninstallFocusFixup = installFocusFixup();
  mocks.validateSession.mockReset();
  mocks.readSession.mockReset().mockResolvedValue(null);
  mocks.getAskRoom.mockReset().mockResolvedValue(room({}));
  mocks.push.mockReset();
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  uninstallFocusFixup?.();
  uninstallFocusFixup = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("keyboard: the home composer's Start", () => {
  it("puts focus back in the question when one question already waits", async () => {
    const release = heldRefusal(new ContractHttpError("UNPROCESSABLE", 422, "ASK_ALREADY_WAITING: x", "ASK_ALREADY_WAITING"));
    mocks.getAskRoom.mockResolvedValueOnce(room({}))
      .mockResolvedValue(room({ room: "ALREADY_WAITING", resets_at: RESET, waiting_run_ref: "run:waiting" }));

    const { claim, start } = await pressStart(release);

    expect(document.querySelector(".roomNoticeText"), "sentence D is shown").not.toBeNull();
    expect(start.disabled, "Start stays disabled while the question waits").toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.activeElement, "focus is not left on the page").not.toBe(document.body);
    expect(document.activeElement).toBe(claim);
  });

  it("puts focus back in the question when today's limit is reached", async () => {
    const release = heldRefusal(new ContractHttpError(
      "RATE_LIMITED", 429, "DAILY_COST_ENVELOPE_REACHED: DAILY_COST_ENVELOPE_REACHED", "DAILY_COST_ENVELOPE_REACHED"
    ));

    const { claim, start } = await pressStart(release);

    expect(document.querySelector(".libComposer .error")?.textContent).toContain("today's limit");
    expect(start.disabled).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.activeElement, "focus is not left on the page").not.toBe(document.body);
    expect(document.activeElement).toBe(claim);
  });
});
