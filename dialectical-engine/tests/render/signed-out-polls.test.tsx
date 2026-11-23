// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";
import { ChargeStatusPoller } from "../../apps/ui/components/billing/ChargeStatusPoller.js";
import { useWaitPolling, WAIT_AFTER_FAILURE_MS, type WaitCheck, type WaitPolling } from "../../apps/ui/lib/v4/useWaitPolling.js";
import { useReportWatch } from "../../apps/ui/lib/v4/useReportVersions.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import billing from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import { holdReadableCookies, holdSessionCookies } from "../support/sessionCookie.js";

const investigation = vi.hoisted(() => ({ load: async (_runId: string): Promise<unknown> => null }));
vi.mock("../../apps/ui/lib/v4/load.js", async (original) => ({
  ...await original<Record<string, unknown>>(),
  loadInvestigation: (runId: string) => investigation.load(runId)
}));

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. Pages that ask the server again on a timer kept asking after the session
 * was gone (a sign-out in another tab, or a session the server ended), so the site password was asked for again every few
 * seconds. Each of them now sends nothing once the browser holds no session, and stops after a 401 that leaves it holding
 * none. A 401 while a session is still held does not stop them: every security check replaces the session's cookies, and
 * a read that left with the old ones just before is refused while the session is fine. A waiting page's checks pause only
 * on a page that needs a session; a public page's are tried again whatever the browser holds.
 */

const refused = () => new ContractHttpError("SESSION_REQUIRED", 401, "refused", "SESSION_REQUIRED");
/** The readable cookie a security check sets in place of the old one. Made-up value. */
const REPLACED = `__Host-debateai-csrf=${"n".repeat(43)}`;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let cookies: ReturnType<typeof holdSessionCookies> | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  cookies = holdSessionCookies();
});
afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null; host?.remove(); host = null;
  cookies?.drop(); cookies = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(view: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(view); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
  return host;
}
async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
}
/** A sign-out in another tab: the API cleared both cookies. */
function signOutElsewhere(): void { cookies?.drop(); cookies = null; }
/**
 * The API's 401 for a session it has ended, as a page's client hands it on: the site's client has already removed the
 * readable cookie (lib/api.ts, forgetEndedSession) before the caller sees the refusal.
 */
function sessionEnded(): ContractHttpError { cookies?.drop(); cookies = null; return refused(); }
/**
 * The API's 401 for a read that left with the old session cookie just before a security check (here or in another tab)
 * replaced it: the browser now holds the new cookie, which the site's client keeps, and the session is fine.
 */
function replacedMeanwhile(): ContractHttpError { cookies?.drop(); cookies = holdReadableCookies(REPLACED); return refused(); }

describe("the export card on Settings", () => {
  const exportClient = (read: () => Promise<unknown>) => ({
    readDataExportStatus: vi.fn(read), requestDataExport: vi.fn(), authMethods: vi.fn(),
    stepUp: vi.fn(), beginPasskeyStepUp: vi.fn(), completePasskeyStepUp: vi.fn()
  });

  it("after a sign-out in another tab it asks nothing more and says the status cannot be read", async () => {
    const client = exportClient(async () => ({ status: "NONE" }));
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={client as never} />);
    expect(client.readDataExportStatus).toHaveBeenCalledTimes(1);
    signOutElsewhere();
    await advance(5_000);
    expect(client.readDataExportStatus, "no read once no session is held").toHaveBeenCalledTimes(1);
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    await advance(60_000);
    expect(client.readDataExportStatus).toHaveBeenCalledTimes(1);
  });

  it("stops after the 401 of a session the server has ended and says the status cannot be read; another failure is tried again, as before", async () => {
    let answer: () => Promise<unknown> = async () => { throw new Error("OFFLINE"); };
    const client = exportClient(() => answer());
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={client as never} />);
    await advance(5_000);
    expect(client.readDataExportStatus, "a lost connection is tried again").toHaveBeenCalledTimes(2);
    answer = async () => { throw sessionEnded(); };
    await advance(5_000);
    expect(client.readDataExportStatus).toHaveBeenCalledTimes(3);
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    await advance(60_000);
    expect(client.readDataExportStatus, "nothing after the 401").toHaveBeenCalledTimes(3);
  });

  it("a 401 while the browser still holds a session (a security check replaced it meanwhile) does not stop it: the next read shows the new status", async () => {
    let answer: () => Promise<unknown> = async () => ({ status: "PREPARING", requested_at: "2026-10-14T09:00:00.000Z" });
    const client = exportClient(() => answer());
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={client as never} />);
    answer = async () => { throw replacedMeanwhile(); };
    await advance(5_000);
    expect(client.readDataExportStatus).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    answer = async () => ({ status: "SENT", requested_at: "2026-10-14T09:00:00.000Z", expires_at: "2026-10-21T09:00:00.000Z" });
    await advance(5_000);
    expect(client.readDataExportStatus, "the card reads again").toHaveBeenCalledTimes(3);
    expect(card.textContent).not.toContain(settings["settings.export.statusUnavailable"]);
    expect(card.textContent).toContain(settings["settings.export.supersedes"]);
  });
});

describe("the deletion card on Settings", () => {
  const PROCESSING = { status: "PROCESSING", execute_at: "2026-10-14T00:00:00.000Z", cancellation_ref: "55555555-5555-4555-8555-555555555555" };
  const erasureClient = (read: () => Promise<unknown>) => ({
    readAccountErasure: vi.fn(read), scheduleAccountErasure: vi.fn(), cancelAccountErasure: vi.fn(),
    authMethods: vi.fn(), stepUp: vi.fn(), beginPasskeyStepUp: vi.fn(), completePasskeyStepUp: vi.fn()
  });

  it("after a sign-out in another tab it asks nothing more and says the status cannot be read", async () => {
    const client = erasureClient(async () => ({ status: "NONE" }));
    const card = await mount(<AccountErasureControls client={client as never} />);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(1);
    signOutElsewhere();
    await advance(5_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(1);
    expect(card.textContent).toContain(settings["settings.erasure.statusUnavailable"]);
    await advance(60_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(1);
  });

  it("stops after the 401 of a session the server has ended", async () => {
    let answer: () => Promise<unknown> = async () => ({ status: "NONE" });
    const client = erasureClient(() => answer());
    const card = await mount(<AccountErasureControls client={client as never} />);
    answer = async () => { throw sessionEnded(); };
    await advance(5_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain(settings["settings.erasure.statusUnavailable"]);
    await advance(60_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(2);
  });

  it("a 401 while the browser still holds a session (a security check replaced it meanwhile) does not stop it", async () => {
    let answer: () => Promise<unknown> = async () => ({ status: "NONE" });
    const client = erasureClient(() => answer());
    const card = await mount(<AccountErasureControls client={client as never} />);
    answer = async () => { throw replacedMeanwhile(); };
    await advance(5_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain(settings["settings.erasure.statusUnavailable"]);
    answer = async () => ({ status: "NONE" });
    await advance(5_000);
    expect(client.readAccountErasure, "the poll reads again").toHaveBeenCalledTimes(3);
    expect(card.textContent).not.toContain(settings["settings.erasure.statusUnavailable"]);
  });

  it("while a deletion is processing it still reads its status without the readable cookie, until the API refuses", async () => {
    // The account is suspended: every other read is refused and the readable cookie may be gone, but the API still
    // answers this one read for the session that scheduled the deletion.
    let answer: () => Promise<unknown> = async () => PROCESSING;
    const client = erasureClient(() => answer());
    const card = await mount(<AccountErasureControls client={client as never} />);
    signOutElsewhere();
    await advance(10_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(3);
    expect(card.textContent).toContain(settings["settings.erasure.processing"]);
    expect(card.textContent).not.toContain(settings["settings.erasure.statusUnavailable"]);
    // The deletion is done and the session with it.
    answer = async () => { throw refused(); };
    await advance(5_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(4);
    await advance(60_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(4);
  });
});

describe("the payment's waiting screen", () => {
  const poller = (getBillingCharge: ReturnType<typeof vi.fn>) =>
    <ChargeStatusPoller chargeRef="0123456789abcdef0123456789abcdef" catalog={billing} client={{ getBillingCharge }} successText="PAID" failureText="REFUSED" />;

  it("after a sign-out in another tab it stops watching and says an email will follow", async () => {
    const getBillingCharge = vi.fn(async () => ({ state: "PENDING" as const, reason_code: null }));
    const screen = await mount(poller(getBillingCharge));
    expect(getBillingCharge).toHaveBeenCalledTimes(1);
    signOutElsewhere();
    await advance(2_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(1);
    expect(screen.textContent).toBe(billing["billing.checkout.willEmail"]);
    await advance(120_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(1);
  });

  it("stops watching after the 401 of a session the server has ended; another failure is tried again, as before", async () => {
    let failure: () => unknown = () => new Error("OFFLINE");
    const getBillingCharge = vi.fn(async () => { throw failure(); });
    const screen = await mount(poller(getBillingCharge));
    await advance(2_000);
    expect(getBillingCharge, "a lost connection is tried again").toHaveBeenCalledTimes(2);
    expect(screen.textContent).toBe(billing["billing.checkout.waitingForBank"]);
    failure = sessionEnded;
    await advance(2_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(3);
    expect(screen.textContent).toBe(billing["billing.checkout.willEmail"]);
    await advance(120_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(3);
  });

  it("a 401 while the browser still holds a session (a security check replaced it meanwhile) does not stop the watching", async () => {
    let answer: () => Promise<{ state: "PENDING" | "SUCCEEDED"; reason_code: null }> = async () => { throw replacedMeanwhile(); };
    const getBillingCharge = vi.fn(() => answer());
    const screen = await mount(poller(getBillingCharge));
    expect(getBillingCharge).toHaveBeenCalledTimes(1);
    expect(screen.textContent).toBe(billing["billing.checkout.waitingForBank"]);
    answer = async () => ({ state: "SUCCEEDED", reason_code: null });
    await advance(2_000);
    expect(getBillingCharge, "the screen reads again").toHaveBeenCalledTimes(2);
    expect(screen.textContent).toBe("PAID");
  });
});

describe("a waiting page's checks (useWaitPolling)", () => {
  let latest: WaitPolling | null = null;
  function Probe({ check, restartKey = 0, needsSession }: Readonly<{ check: WaitCheck; restartKey?: number; needsSession?: boolean }>) {
    latest = useWaitPolling(check, { everyMs: 5_000, restartKey, ...(needsSession === undefined ? {} : { needsSession }) });
    return null;
  }

  it("on a page that needs a session, a check that fails once the session is gone stops the checks until a session is held again; Try now still checks", async () => {
    let signedIn = true;
    const check = vi.fn<WaitCheck>(async () => { if (!signedIn) throw refused(); return "AGAIN"; });
    await mount(<Probe check={check} needsSession />);
    expect(check).toHaveBeenCalledTimes(1);
    signOutElsewhere(); signedIn = false;
    await advance(5_000);
    expect(check, "the check that finds the session gone").toHaveBeenCalledTimes(2);
    await advance(WAIT_AFTER_FAILURE_MS * 4);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online")); });
    expect(check, "no timer, no return to the tab, no reconnection checks").toHaveBeenCalledTimes(2);
    expect(latest!.reconnecting).toBe(true);
    await act(async () => { latest!.tryNow(); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
    expect(check, "a press is the person's own").toHaveBeenCalledTimes(3);
    // Signed in again in another tab: back on this tab, the checks go on.
    cookies = holdSessionCookies(); signedIn = true;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
    expect(check).toHaveBeenCalledTimes(4);
    expect(latest!.reconnecting).toBe(false);
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(5);
  });

  it("on a page that needs a session, checks started afresh after the session is gone still wait for one, after their first refused check", async () => {
    let signedIn = true;
    const check = vi.fn<WaitCheck>(async () => { if (!signedIn) throw refused(); return "AGAIN"; });
    await mount(<Probe check={check} needsSession />);
    signOutElsewhere(); signedIn = false;
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(2);
    await act(async () => { root!.render(<Probe check={check} restartKey={1} needsSession />); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
    expect(check, "a fresh start checks at once").toHaveBeenCalledTimes(3);
    await advance(WAIT_AFTER_FAILURE_MS * 4);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("a signed-out visitor's checks, and a signed-in person's lost connection, are tried again as before", async () => {
    signOutElsewhere();
    const check = vi.fn<WaitCheck>(async () => { throw new Error("OFFLINE"); });
    await mount(<Probe check={check} />);
    await advance(WAIT_AFTER_FAILURE_MS * 2);
    expect(check, "a public page with no session").toHaveBeenCalledTimes(3);
    await act(async () => root!.unmount()); root = null;
    cookies = holdSessionCookies();
    const again = vi.fn<WaitCheck>(async () => { throw new Error("OFFLINE"); });
    await mount(<Probe check={again} />);
    await advance(WAIT_AFTER_FAILURE_MS * 2);
    expect(again, "a session still held").toHaveBeenCalledTimes(3);
  });
});

describe("the map's report reads, a page that needs a session", () => {
  const RUN = "11111111-1111-4111-8111-111111111111";
  function Watch() {
    // Watching for the report the server starts by itself, so a failed read is tried again.
    useReportWatch(RUN, false, () => undefined, true);
    return null;
  }

  it("a failed read is tried again while the session is held, and waits for one once the session is gone", async () => {
    const load = vi.fn(async () => null);
    investigation.load = load;
    await mount(<Watch />);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(WAIT_AFTER_FAILURE_MS);
    expect(load, "a session still held: tried again").toHaveBeenCalledTimes(2);
    signOutElsewhere();
    await advance(WAIT_AFTER_FAILURE_MS);
    expect(load, "the read that finds the session gone").toHaveBeenCalledTimes(3);
    await advance(WAIT_AFTER_FAILURE_MS * 4);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
