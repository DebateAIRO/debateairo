// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://localhost/settings"}

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import { createBrowserContractClient } from "../../apps/ui/lib/api.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };

/*
 * Every security check (step-up) replaces the session's token and both its cookies. A status read the export card sent
 * just before the check's answer arrived carries the old cookie, and the API refuses it with 401 SESSION_REQUIRED while
 * the session itself is fine. The site's client keeps the new readable cookie (its value changed since the read left), so
 * the browser still holds a session, and the card goes on reading. A session the server has ended loses its readable
 * cookie at its first refusal, and the card stops. The card and the site's client are the real ones; only the server
 * behind `fetch` is stood in. The cookie follows the browser's own rules on this https page.
 */

const OLD = `__Host-debateai-csrf=${"c".repeat(43)}`;
const NEW = `__Host-debateai-csrf=${"n".repeat(43)}`;
const PREPARING = { status: "PREPARING", requested_at: "2026-10-14T09:00:00.000Z" };
const SENT = { status: "SENT", requested_at: "2026-10-14T09:00:00.000Z", expires_at: "2026-10-21T09:00:00.000Z" };

function setReadable(cookie: string): void {
  document.cookie = `${cookie}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`;
}
function held(): string | null {
  return document.cookie.split(";").map((member) => member.trim()).find((member) => member.startsWith("__Host-debateai-csrf=")) ?? null;
}
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The server's answers, one per read in order; the last one repeats. */
function server(answers: ReadonlyArray<() => Response>) {
  const calls: string[] = [];
  const fetchImplementation = (async (input: unknown) => {
    calls.push(String(input));
    return answers[Math.min(calls.length, answers.length) - 1]!();
  }) as typeof fetch;
  return { fetch: fetchImplementation, calls };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  setReadable(OLD);
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null; host?.remove(); host = null;
  document.cookie = "__Host-debateai-csrf=; Path=/; Max-Age=0; Secure; SameSite=Lax";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  // The client reads the answer's body before the card sees it: a few turns of real time.
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => { setTimeout(resolve, 0); });
}
async function mount(view: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(view); await settle(); });
  return host;
}
async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); await settle(); });
}

describe("the export card on Settings, with the site's own client", () => {
  it("a read refused because a security check replaced the session meanwhile does not stop it; the next read shows the new status", async () => {
    const api = server([
      () => json(PREPARING, 200),
      () => { setReadable(NEW); return json({ error: "SESSION_REQUIRED" }, 401); },
      () => json(SENT, 200)
    ]);
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={createBrowserContractClient(api.fetch)} />);
    expect(api.calls).toEqual(["/api/v1/account/export"]);
    await advance(5_000);
    expect(api.calls).toHaveLength(2);
    expect(held(), "the new session's readable cookie is kept").toBe(NEW);
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    await advance(5_000);
    expect(api.calls, "the card reads again").toHaveLength(3);
    expect(card.textContent).not.toContain(settings["settings.export.statusUnavailable"]);
    expect(card.textContent).toContain(settings["settings.export.supersedes"]);
  });

  it("a read refused because the server ended the session removes the readable cookie, and the card asks nothing more", async () => {
    const api = server([
      () => json(PREPARING, 200),
      () => json({ error: "SESSION_REQUIRED" }, 401),
      () => json(SENT, 200)
    ]);
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={createBrowserContractClient(api.fetch)} />);
    await advance(5_000);
    expect(api.calls).toHaveLength(2);
    expect(held(), "the readable cookie is gone").toBeNull();
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    await advance(60_000);
    expect(api.calls, "nothing after the refusal").toHaveLength(2);
  });
});
