// @vitest-environment jsdom

/**
 * S04-R01 / R08 (PLAN S04 §2 member table, steps S2.1-S2.3): every flow that starts or ends a session in this tab
 * tells the other tabs, and no other flow does. A test-side BroadcastChannel on "debateai.session-change" stands in
 * for another tab and counts what it hears; `sessionStorage` is jsdom's. M01-M09.
 *
 * R08 cuts both ways: a member that stays silent leaves another tab showing the previous person's help chat, and a
 * flow that announces without a session change erases another tab's conversation for nothing (M02, M06, M09).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type SessionList } from "@debateai/contract";
import { AgeConfirmationFlow } from "../../apps/ui/components/AgeConfirmationFlow.js";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SessionControls } from "../../apps/ui/components/SessionControls.js";
import { onConversationReset } from "../../apps/ui/components/support/sessionChange.js";

const STORAGE_KEY = "debateai.support.conversation.v2";
const CHANNEL = "debateai.session-change";
/** Wait before reading the count: same-process BroadcastChannel delivery measured 0.02 ms median, 0.47 ms max (n=50). */
const QUIET_MS = 150;

const SESSION = {
  asker_id: "owner:11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  caller_scope: "ASKER" as const,
  ownership_provenance: "server_session" as const,
  provisional_identity_model: false as const
};
const currentId = "11111111-1111-4111-8111-111111111111";
const remoteId = "33333333-3333-4333-8333-333333333333";
const sessions: SessionList = {
  sessions: [currentId, remoteId].map((sessionId, index) => ({
    session_id: sessionId,
    created_at: "2026-09-30T10:00:00.000Z",
    last_seen_at: "2026-09-30T10:05:00.000Z",
    idle_expires_at: "2026-10-14T10:05:00.000Z",
    absolute_expires_at: "2026-12-29T10:00:00.000Z",
    last_mfa_at: "2026-09-30T10:00:00.000Z",
    current: index === 0
  }))
};

let root: Root | null = null;
let otherTab: BroadcastChannel | null = null;
let heard: unknown[] = [];
/** What this page's own subscribers saw at the in-page reset: was the key already gone? */
let keyAtReset: Array<string | null> = [];
let unsubscribe: (() => void) | null = null;

function seedTranscript(): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    language: "en", identityBound: true, messages: [{ id: "a", role: "user", text: "PERSON-A" }]
  }));
}

function keyState(): "erased" | "kept" {
  return sessionStorage.getItem(STORAGE_KEY) === null ? "erased" : "kept";
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
}

/** Lets any in-flight channel message land before the count is read. */
async function quiet(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, QUIET_MS)); });
}

function field(name: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input, `missing rendered input ${name}`).not.toBeNull();
  return input!;
}

async function submitForm(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

async function click(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label
      || candidate.getAttribute("aria-label") === label);
  expect(button, `missing rendered button ${label}`).toBeDefined();
  await act(async () => { (button as HTMLButtonElement).click(); });
  await settle();
}

/** The date of birth is React state: the prototype setter plus an `input` event, as age-gate-flow.test.tsx does. */
async function typeValue(name: string, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(name), value);
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  heard = [];
  keyAtReset = [];
  otherTab = new BroadcastChannel(CHANNEL);
  otherTab.addEventListener("message", (event) => { heard.push((event as MessageEvent).data); });
  unsubscribe = onConversationReset((reason) => {
    if (reason === "session-change") keyAtReset.push(sessionStorage.getItem(STORAGE_KEY));
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  seedTranscript();
});

afterEach(async () => {
  try {
    if (root !== null) await act(async () => root!.unmount());
  } finally {
    root = null;
    unsubscribe?.();
    unsubscribe = null;
    otherTab?.close();
    otherTab = null;
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  }
});

/** One announcement reached the other tab, and this tab had erased its own copy before announcing. */
function expectOneAnnouncement(): void {
  expect(heard).toEqual([{ type: "session-change" }]);
  expect(keyAtReset, "the key is erased before the in-page reset fires").toEqual([null]);
}

function expectSilence(): void {
  expect(heard).toEqual([]);
  expect(keyAtReset).toEqual([]);
}

describe("S2.1 sign-in (LoginFlow, PLAN §2 row completeLogin)", () => {
  async function signInWith(completeLogin: ReturnType<typeof vi.fn>, onAuthenticated = vi.fn()): Promise<void> {
    const beginLogin = vi.fn().mockResolvedValue({ status: "mfa_required" as const, challenge_token: "challenge" });
    await act(async () => root!.render(
      <LoginFlow client={{ beginLogin, completeLogin }} onAuthenticated={onAuthenticated} />
    ));
    field("email").value = "person@example.test";
    field("password").value = "password";
    await submitForm();
    field("code").value = "123456";
    await submitForm();
    expect(completeLogin).toHaveBeenCalledWith("challenge", "123456");
    await quiet();
  }

  it("M01 a completed sign-in announces once and erases the key", async () => {
    const onAuthenticated = vi.fn();
    await signInWith(vi.fn().mockResolvedValue({
      status: "authenticated" as const, csrf_token: "c".repeat(43), session: SESSION
    }), onAuthenticated);
    expectOneAnnouncement();
    expect(keyState()).toBe("erased");
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it("M02 a 401 (code refused, nobody signed in) announces nothing and keeps the key", async () => {
    await signInWith(vi.fn().mockRejectedValue(
      new ContractHttpError("SESSION_REQUIRED", 401, "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID")
    ));
    expectSilence();
    expect(keyState()).toBe("kept");
  });

  it("M03 a 503 (not a completed sign-in, D-S04-18) announces nothing and erases this tab's key", async () => {
    await signInWith(vi.fn().mockRejectedValue(new ContractHttpError("UPSTREAM", 503, "unavailable")));
    expectSilence();
    expect(keyState()).toBe("erased");
  });
});

describe("S2.2 the session-ending controls (SessionControls → finishSession)", () => {
  let client: {
    listSessions: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeAllSessions: ReturnType<typeof vi.fn>;
    stepUp: ReturnType<typeof vi.fn>;
  };
  let ended: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    client = {
      listSessions: vi.fn().mockResolvedValue(sessions),
      logout: vi.fn().mockResolvedValue(undefined),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllSessions: vi.fn().mockResolvedValue({ revoked: 2 }),
      stepUp: vi.fn().mockResolvedValue({ status: "step_up_complete", csrf_token: "c".repeat(43) })
    };
    ended = vi.fn();
    await act(async () => root!.render(<SessionControls client={client} onSessionEnded={ended} />));
    await settle();
  });

  it("M04 sign-out announces once, erases the key and ends the session", async () => {
    await click("Sign out");
    await quiet();
    expect(client.logout).toHaveBeenCalledTimes(1);
    expectOneAnnouncement();
    expect(keyState()).toBe("erased");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("M05 revoking this browser's own session announces once and erases the key", async () => {
    await click(`Revoke session ${currentId}`);
    await quiet();
    expect(client.revokeSession).toHaveBeenCalledWith(currentId);
    expectOneAnnouncement();
    expect(keyState()).toBe("erased");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("M06 revoking another device's session announces nothing and keeps the key", async () => {
    await click(`Revoke session ${remoteId}`);
    await quiet();
    expect(client.revokeSession).toHaveBeenCalledWith(remoteId);
    expectSilence();
    expect(keyState()).toBe("kept");
    expect(ended).not.toHaveBeenCalled();
  });

  it("M07 sign out everywhere announces once and erases the key", async () => {
    await click("Revoke all sessions");
    await quiet();
    expect(client.revokeAllSessions).toHaveBeenCalledTimes(1);
    expectOneAnnouncement();
    expect(keyState()).toBe("erased");
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe("S2.3 the age check (AgeConfirmationFlow, PLAN §2 row confirmAge, D-S04-19)", () => {
  async function confirmWith(outcome: "allowed" | "refused", onConfirmed = vi.fn()): Promise<void> {
    const client = {
      readAgeConfirmation: vi.fn(async () => ({ status: "required" as const })),
      confirmAge: vi.fn(async () => ({ outcome }))
    };
    await act(async () => root!.render(
      <AgeConfirmationFlow client={client} onConfirmed={onConfirmed} onSignedOut={vi.fn()} />
    ));
    await typeValue("dob-d", "14");
    await typeValue("dob-m", "03");
    await typeValue("dob-y", outcome === "refused" ? "2010" : "1998");
    await submitForm();
    expect(client.confirmAge).toHaveBeenCalledTimes(1);
    await quiet();
  }

  it("M08 a refusal (every session of the account revoked) announces once and erases the key", async () => {
    const onConfirmed = vi.fn();
    await confirmWith("refused", onConfirmed);
    expectOneAnnouncement();
    expect(keyState()).toBe("erased");
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(document.querySelector("form"), "the refusal screen replaced the form").toBeNull();
  });

  it("M09 a pass (the session goes on) announces nothing and keeps the key", async () => {
    const onConfirmed = vi.fn();
    await confirmWith("allowed", onConfirmed);
    expectSilence();
    expect(keyState()).toBe("kept");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });
});
