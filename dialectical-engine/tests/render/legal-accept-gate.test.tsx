// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The settings page and the real AuthGate read `@/lib/api`; the gate tests below pass their own client.
const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  client: {
    getLegalStatus: vi.fn(),
    acceptLegal: vi.fn(),
    logout: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    stepUp: vi.fn(),
    readAccountErasure: vi.fn(),
    scheduleAccountErasure: vi.fn(),
    cancelAccountErasure: vi.fn(),
    claimLegacyRuns: vi.fn(),
    // The settings page's email card (dev's change-email turn) reads the account's address on mount.
    readAccountEmail: vi.fn(),
    requestEmailChange: vi.fn(),
    resendEmailChange: vi.fn(),
    cancelEmailChange: vi.fn()
  }
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../apps/ui/lib/api.js")>()),
  COOKIE_SESSION_MARKER: "cookie-session",
  validateSession: mocks.validateSession,
  contractClient: mocks.client
}));
// The age gate's one-time check (PR #41) runs inside AuthGate before anything renders. Its redirect target is
// a hash here, the one navigation jsdom performs, so the test can see that it happened.
const age = vi.hoisted(() => ({ required: vi.fn() }));
vi.mock("@/lib/ageConfirmation", () => ({
  ageConfirmationRequired: age.required,
  ageConfirmationHref: () => "#age-confirmation"
}));

import { AuthGate } from "../../apps/ui/components/AuthGate.js";
import { LegalAcceptGate } from "../../apps/ui/components/billing/LegalAcceptGate.js";
import { SettingsPageClient } from "../../apps/ui/components/SettingsPageClient.js";
import { SUPPORT_CONVERSATION_STORAGE_KEY } from "../../apps/ui/components/support/conversation.js";
import { PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_OF_SERVICE } from "../../apps/ui/lib/termsOfService.js";
import newDebateEnglish from "../../apps/ui/messages/en/newDebate.json" with { type: "json" };

const METRIC_KEYS = ["scrollTop", "clientHeight", "scrollHeight"] as const;
let metrics: Record<(typeof METRIC_KEYS)[number], number> = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
let root: Root | null = null;
const OWED_TERMS = { must_accept: [{ kind: "TERMS", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }] };
const OWED_PRIVACY = { must_accept: [{ kind: "PRIVACY", version: PRIVACY_POLICY.version, sha256: PRIVACY_POLICY.sha256 }] };

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

/** The session check, then the status read: two chains of microtasks. */
async function settleGate(): Promise<void> {
  for (let round = 0; round < 3; round += 1) await settle();
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((node) => node.textContent === label);
  expect(found.length, `one button labelled ${label}`).toBe(1);
  return found[0]!;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  metrics = { scrollTop: 0, clientHeight: 200, scrollHeight: 500 };
  for (const key of METRIC_KEYS) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement): number { return this.classList.contains("policyBody") ? metrics[key] : 0; }
    });
  }
  mocks.validateSession.mockReset().mockResolvedValue(undefined);
  age.required.mockReset().mockResolvedValue(false);
  window.location.hash = "";
  for (const method of Object.values(mocks.client)) method.mockReset();
  mocks.client.listSessions.mockResolvedValue({ sessions: [] });
  mocks.client.readAccountErasure.mockRejectedValue(new Error("offline"));
  mocks.client.readAccountEmail.mockRejectedValue(new Error("offline"));
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root !== null) await act(async () => root!.unmount());
  root = null;
  for (const key of METRIC_KEYS) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("the blocking accept screen after sign-in (paid plans L4)", () => {
  it("passes straight through when nothing must be accepted", async () => {
    const client = { getLegalStatus: vi.fn().mockResolvedValue({ must_accept: [] }), acceptLegal: vi.fn(), logout: vi.fn() };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    expect(document.body.textContent).toContain("inside");
    expect(client.getLegalStatus).toHaveBeenCalledWith("en");
  });

  it("blocks until the updated Terms are read to the end and accepted, then lets the page through", async () => {
    const client = {
      getLegalStatus: vi.fn()
        .mockResolvedValueOnce(OWED_TERMS)
        .mockResolvedValueOnce({ must_accept: [] }),
      acceptLegal: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn()
    };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    expect(document.body.textContent).not.toContain("inside");
    expect(button("Accept and continue").disabled).toBe(true);
    await act(async () => { button("Read the Terms of Service").click(); });
    await settle();
    metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
    await act(async () => { document.querySelector(".policyBody")!.dispatchEvent(new Event("scroll")); });
    await settle();
    await act(async () => { button("I have read it").click(); });
    await settle();
    expect(button("Accept and continue").disabled).toBe(false);
    await act(async () => { button("Accept and continue").click(); });
    await settle();
    expect(client.acceptLegal).toHaveBeenCalledWith({
      documents: [{ kind: "TERMS", version: TERMS_OF_SERVICE.version, sha256: TERMS_OF_SERVICE.sha256 }],
      locale: "en"
    });
    expect(document.body.textContent).toContain("inside");
  });

  // The acceptance is recorded once acceptLegal resolves; a failed re-read afterwards is a failed status
  // read (ruling Q-10), never "Your acceptance could not be saved".
  it("lets the page through when the acceptance is saved but the follow-up status read fails", async () => {
    const client = {
      getLegalStatus: vi.fn()
        .mockResolvedValueOnce(OWED_TERMS)
        .mockRejectedValueOnce(new Error("offline")),
      acceptLegal: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn()
    };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    await act(async () => { button("Read the Terms of Service").click(); });
    await settle();
    metrics.scrollTop = metrics.scrollHeight - metrics.clientHeight;
    await act(async () => { document.querySelector(".policyBody")!.dispatchEvent(new Event("scroll")); });
    await settle();
    await act(async () => { button("I have read it").click(); });
    await settle();
    await act(async () => { button("Accept and continue").click(); });
    await settle();
    expect(client.acceptLegal).toHaveBeenCalledTimes(1);
    expect(client.getLegalStatus).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("inside");
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  // Ruling Q-10: the screen fails OPEN when the status read fails; the server's
  // LEGAL_REACCEPTANCE_REQUIRED refusal on the billing routes is the real guard.
  it("does not hold the page hostage when the status read fails", async () => {
    const client = { getLegalStatus: vi.fn().mockRejectedValue(new Error("offline")), acceptLegal: vi.fn(), logout: vi.fn() };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    expect(document.body.textContent).toContain("inside");
  });

  it("offers two ways out without accepting: sign out, and the account page", async () => {
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY, "{}");
    const onSignedOut = vi.fn();
    const client = {
      getLegalStatus: vi.fn().mockResolvedValue(OWED_PRIVACY),
      acceptLegal: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined)
    };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client} onSignedOut={onSignedOut}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    expect(document.body.textContent).not.toContain("inside");
    // The account page (account deletion, consent withdrawal) is never behind this screen.
    expect(document.querySelector<HTMLAnchorElement>('a[href="/settings"]')?.textContent)
      .toBe("Manage or delete your account");
    await act(async () => { button("Sign out").click(); });
    await settle();
    expect(client.logout).toHaveBeenCalledTimes(1);
    // DL3-F3, as SessionControls does: the support transcript does not outlive the session.
    expect(sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY)).toBeNull();
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(client.acceptLegal).not.toHaveBeenCalled();
  });

  it("stays on the screen and says so when signing out fails", async () => {
    const onSignedOut = vi.fn();
    const client = {
      getLegalStatus: vi.fn().mockResolvedValue(OWED_PRIVACY),
      acceptLegal: vi.fn(),
      logout: vi.fn().mockRejectedValue(new Error("offline"))
    };
    await act(async () => root!.render(
      <LegalAcceptGate catalog={newDebateEnglish} client={client} onSignedOut={onSignedOut}><p>inside</p></LegalAcceptGate>
    ));
    await settle();
    await act(async () => { button("Sign out").click(); });
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Signing out did not complete. Please try again.");
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});

describe("which signed-in pages the accept screen covers (paid plans L4)", () => {
  it("covers a gated page (/new, /debate) while documents are owed", async () => {
    mocks.client.getLegalStatus.mockResolvedValue(OWED_TERMS);
    await act(async () => root!.render(
      <AuthGate catalog={newDebateEnglish}>{() => <p>inside</p>}</AuthGate>
    ));
    await settleGate();
    expect(mocks.client.getLegalStatus).toHaveBeenCalledWith("en");
    expect(document.body.textContent).not.toContain("inside");
    expect(document.querySelector("#legal-gate-title")?.textContent).toBe("Please read and accept the current documents");
  });

  it("never covers /settings: account deletion, the privacy panel and sign-out stay reachable", async () => {
    mocks.client.getLegalStatus.mockResolvedValue(OWED_TERMS);
    await act(async () => root!.render(<SettingsPageClient />));
    await settleGate();
    expect(document.querySelector("#legal-gate-title")).toBeNull();
    expect(mocks.client.getLegalStatus).not.toHaveBeenCalled();
    expect(document.querySelector("#account-deletion-heading")?.textContent).toBe("Delete account");
    expect(document.querySelector("#consent-privacy-heading")?.textContent).toContain("Privacy");
    expect(document.querySelector("#active-sessions-heading")).not.toBeNull();
    expect([...document.querySelectorAll("button")].filter((node) => node.textContent === "Sign out")).toHaveLength(1);
  });

  it("shows the age gate's one-time interstitial FIRST: no legal status read while the age check is owed (R3-2)", async () => {
    // PR #41: an account created before the date-of-birth field still owes its one-time age check. AuthGate sends
    // it to the interstitial and renders nothing else, so the legal accept screen cannot appear before it.
    age.required.mockResolvedValue(true);
    mocks.client.getLegalStatus.mockResolvedValue(OWED_TERMS);
    await act(async () => root!.render(
      <AuthGate catalog={newDebateEnglish}>{() => <p>inside</p>}</AuthGate>
    ));
    await settleGate();
    expect(age.required).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#age-confirmation");
    expect(mocks.client.getLegalStatus).not.toHaveBeenCalled();
    expect(document.querySelector("#legal-gate-title")).toBeNull();
    expect(document.body.textContent).not.toContain("inside");
  });

  it("reads the legal status only after the age check has cleared", async () => {
    mocks.client.getLegalStatus.mockResolvedValue(OWED_PRIVACY);
    await act(async () => root!.render(
      <AuthGate catalog={newDebateEnglish}>{() => <p>inside</p>}</AuthGate>
    ));
    await settleGate();
    expect(age.required).toHaveBeenCalledTimes(1);
    expect(age.required.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.client.getLegalStatus.mock.invocationCallOrder[0]!);
    expect(window.location.hash).toBe("");
  });
});
