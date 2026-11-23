// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. The API's "not signed in" answer is such a 401, so each one a signed-out
 * page receives asks the visitor for the site password once more. The ask page read the room on opening, once more after a
 * failed read, and again on every focus, every return to the tab and every 5 minutes: on a signed-out visit, a loop of
 * password prompts. Here the page, its session check, its hooks and the contract client are the real ones; only the
 * server (behind `fetch`), the consent pop-up, the crisis help and the language choice are stood in.
 */
const server = vi.hoisted(() => {
  const state = {
    /** What the server says of the browser's session. */
    signedIn: false,
    /** A status the session read fails with whatever the session is (a gateway answer while the API restarts); null: none. */
    sessionBroken: null as number | null,
    calls: [] as string[]
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" }
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    state.calls.push(url);
    const path = url.split("?")[0];
    if (path === "/api/v1/session") {
      if (state.sessionBroken !== null) return json({ error: "UPSTREAM_UNAVAILABLE" }, state.sessionBroken);
      return state.signedIn ? json({
        asker_id: "owner:33333333-3333-4333-8333-333333333333",
        session_id: "22222222-2222-4222-8222-222222222222",
        caller_scope: "ASKER",
        ownership_provenance: "server_session",
        provisional_identity_model: false
      }) : json({ error: "SESSION_REQUIRED" }, 401);
    }
    if (path === "/api/v1/asks/room") {
      return state.signedIn
        ? json({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: "PLUS" })
        : json({ error: "SESSION_REQUIRED" }, 401);
    }
    return json({ error: "NOT_FOUND" }, 404);
  }) as typeof fetch;
  return state;
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/SensitiveDataConsent", () => ({
  isSensitiveDataConsentRefusal: () => false,
  useSensitiveDataConsent: () => ({ ensureConsent: async () => true, declined: false, dialog: null })
}));
vi.mock("@/components/CrisisSupport", () => ({
  isCrisisSupportRefusal: () => false,
  useCrisisSupport: () => ({ offerIfCrisis: () => false, offer: () => undefined, flags: () => false, dialog: null })
}));
vi.mock("@/components/QuestionLanguageChoice", () => ({ useQuestionLanguageChoice: () => ({ ensureChoice: async () => "KEEP", dialog: null }) }));

import { V4AskClient } from "../../apps/ui/components/v4/V4AskClient.js";
import { SITE_VERSION_POLL_MS } from "../../apps/ui/lib/v4/siteVersion.js";
import { holdSessionCookies } from "../support/sessionCookie.js";

const messages = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../apps/ui/messages/en/${name}.json`), "utf8")) as Record<string, string>;
const NEW_DEBATE = messages("newDebate");
const NOTICE = NEW_DEBATE["newDebate.freePublicNotice"]!;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const sessionReads = (): number => server.calls.filter((url) => url.split("?")[0] === "/api/v1/session").length;
const roomReads = (): number => server.calls.filter((url) => url.split("?")[0] === "/api/v1/asks/room").length;
const notice = (): string | null => host!.querySelector(".v4AskPublicNotice")?.textContent ?? null;

async function settle(): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await act(async () => { for (let tick = 0; tick < 10; tick += 1) await Promise.resolve(); });
  }
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(
    <V4AskClient catalog={messages("v4")} homeCatalog={messages("home")} newDebateCatalog={NEW_DEBATE} billingCatalog={messages("billing")}
      locale="en" crisisCountryHint={null} initialQuestion="Should the city fund the tram line?" initialLevel="plain" />
  ));
  await settle();
}

/** Three focus events, a return to the tab and one full poll period: every way the page reads the room again. */
async function everyRereadTrigger(): Promise<void> {
  for (let focus = 0; focus < 3; focus += 1) {
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await settle();
  }
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  await settle();
  await act(async () => { vi.advanceTimersByTime(SITE_VERSION_POLL_MS); });
  await settle();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Only the page's 5-minute poll runs on a fake clock; every other timer is real.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  server.signedIn = false;
  server.sessionBroken = null;
  server.calls.length = 0;
  window.history.replaceState(null, "", "/v4");
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the signed-out ask page sends no read the API can only refuse", () => {
  it("a browser holding no session reads neither the session nor the room, on opening or ever after, and still shows the Free notice", async () => {
    await mount();
    expect(sessionReads(), "no session read on opening").toBe(0);
    expect(roomReads(), "no room read on opening").toBe(0);
    expect(notice(), "the plan is one that could not be read: Free debates are public").toBe(NOTICE);
    await everyRereadTrigger();
    expect(sessionReads(), "no session read after focus, visibility or the poll").toBe(0);
    expect(roomReads(), "no room read after focus, visibility or the poll").toBe(0);
    expect(notice()).toBe(NOTICE);
  });

  it("a browser with cookies for a session the server refuses stops reading the room once the page knows it is signed out", async () => {
    holdSessionCookies();
    await mount();
    expect(sessionReads(), "the session is asked once").toBe(1);
    const roomReadsOnOpening = roomReads();
    // While the session was still being checked the room was read once, as always. Its refusal is not tried again:
    // by then the page knows there is no session.
    expect(roomReadsOnOpening, "one room read while the session is checked, and no second one after it").toBe(1);
    expect(notice()).toBe(NOTICE);
    await everyRereadTrigger();
    expect(roomReads(), "no room read after focus, visibility or the poll").toBe(roomReadsOnOpening);
    expect(sessionReads()).toBe(1);
    expect(notice()).toBe(NOTICE);
  });

  it("a signed-in person whose session read only failed keeps the room reads: the plan is known and read again on focus", async () => {
    holdSessionCookies();
    server.signedIn = true;
    server.sessionBroken = 502;
    await mount();
    expect(sessionReads()).toBe(1);
    const opening = roomReads();
    expect(opening, "the room is read on opening").toBeGreaterThanOrEqual(1);
    expect(notice(), "the plan was read (a paid one): no Free notice").toBeNull();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(roomReads(), "one more read on focus").toBe(opening + 1);
    await act(async () => { vi.advanceTimersByTime(SITE_VERSION_POLL_MS); });
    await settle();
    expect(roomReads(), "one more read after the poll period").toBe(opening + 2);
    expect(notice()).toBeNull();
  });

  it("a signed-in page reads the room on opening and again on every focus, return to the tab and poll, as before", async () => {
    holdSessionCookies();
    server.signedIn = true;
    await mount();
    expect(sessionReads()).toBe(1);
    const opening = roomReads();
    expect(opening, "the room is read on opening").toBeGreaterThanOrEqual(1);
    expect(notice(), "a paid plan: no Free notice").toBeNull();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await settle();
    expect(roomReads(), "one more read on focus").toBe(opening + 1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await settle();
    expect(roomReads(), "one more read on becoming visible").toBe(opening + 2);
    await act(async () => { vi.advanceTimersByTime(SITE_VERSION_POLL_MS); });
    await settle();
    expect(roomReads(), "one more read after the poll period").toBe(opening + 3);
  });
});
