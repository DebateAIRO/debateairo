// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { DataExportCard } from "../../apps/ui/components/DataExportCard.js";
import { AccountErasureControls } from "../../apps/ui/components/AccountErasureControls.js";
import { ChargeStatusPoller } from "../../apps/ui/components/billing/ChargeStatusPoller.js";
import { useWaitPolling, WAIT_AFTER_FAILURE_MS, type WaitCheck, type WaitPolling } from "../../apps/ui/lib/v4/useWaitPolling.js";
import settings from "../../apps/ui/messages/en/settings.json" with { type: "json" };
import billing from "../../apps/ui/messages/en/billing.json" with { type: "json" };
import { holdSessionCookies } from "../support/sessionCookie.js";

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. Pages that ask the server again on a timer kept asking after the session
 * was gone (a sign-out in another tab, or a session the server ended), so the site password was asked for again every few
 * seconds. Each of them now sends nothing once the browser holds no session, and stops after a 401.
 */

const refused = () => new ContractHttpError("SESSION_REQUIRED", 401, "refused", "SESSION_REQUIRED");
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

  it("stops after a 401 and says the status cannot be read; another failure is tried again, as before", async () => {
    let answer: () => Promise<unknown> = async () => { throw new Error("OFFLINE"); };
    const client = exportClient(() => answer());
    const card = await mount(<DataExportCard catalog={settings} locale="en" client={client as never} />);
    await advance(5_000);
    expect(client.readDataExportStatus, "a lost connection is tried again").toHaveBeenCalledTimes(2);
    answer = async () => { throw refused(); };
    await advance(5_000);
    expect(client.readDataExportStatus).toHaveBeenCalledTimes(3);
    expect(card.textContent).toContain(settings["settings.export.statusUnavailable"]);
    await advance(60_000);
    expect(client.readDataExportStatus, "nothing after the 401").toHaveBeenCalledTimes(3);
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

  it("stops after a 401", async () => {
    let answer: () => Promise<unknown> = async () => ({ status: "NONE" });
    const client = erasureClient(() => answer());
    const card = await mount(<AccountErasureControls client={client as never} />);
    answer = async () => { throw refused(); };
    await advance(5_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain(settings["settings.erasure.statusUnavailable"]);
    await advance(60_000);
    expect(client.readAccountErasure).toHaveBeenCalledTimes(2);
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

  it("stops watching after a 401; another failure is tried again, as before", async () => {
    let failure: unknown = new Error("OFFLINE");
    const getBillingCharge = vi.fn(async () => { throw failure; });
    const screen = await mount(poller(getBillingCharge));
    await advance(2_000);
    expect(getBillingCharge, "a lost connection is tried again").toHaveBeenCalledTimes(2);
    expect(screen.textContent).toBe(billing["billing.checkout.waitingForBank"]);
    failure = refused();
    await advance(2_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(3);
    expect(screen.textContent).toBe(billing["billing.checkout.willEmail"]);
    await advance(120_000);
    expect(getBillingCharge).toHaveBeenCalledTimes(3);
  });
});

describe("a waiting page's checks (useWaitPolling)", () => {
  let latest: WaitPolling | null = null;
  function Probe({ check, restartKey = 0 }: Readonly<{ check: WaitCheck; restartKey?: number }>) {
    latest = useWaitPolling(check, { everyMs: 5_000, restartKey });
    return null;
  }

  it("a check that fails once the session is gone stops the checks until a session is held again; Try now still checks", async () => {
    let signedIn = true;
    const check = vi.fn<WaitCheck>(async () => { if (!signedIn) throw refused(); return "AGAIN"; });
    await mount(<Probe check={check} />);
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

  it("checks started afresh after the session is gone still wait for one, after their first refused check", async () => {
    let signedIn = true;
    const check = vi.fn<WaitCheck>(async () => { if (!signedIn) throw refused(); return "AGAIN"; });
    await mount(<Probe check={check} />);
    signOutElsewhere(); signedIn = false;
    await advance(5_000);
    expect(check).toHaveBeenCalledTimes(2);
    await act(async () => { root!.render(<Probe check={check} restartKey={1} />); for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); });
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
