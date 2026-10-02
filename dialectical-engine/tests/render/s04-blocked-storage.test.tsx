// @vitest-environment jsdom

/**
 * S04-R06 (SD3-N1, PLAN S1.8): with the `sessionStorage` and `localStorage` getters throwing SecurityError — a
 * browser that blocks site storage — every member of SPEC-v2 §1 D2 completes: sign-in failures show their alert,
 * a sign-in succeeds, sign-out ends the session, the help panel opens, answers and starts over. B01-B08.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError, type SessionList } from "@debateai/contract";
import { LoginFlow } from "../../apps/ui/components/LoginFlow.js";
import { SessionControls } from "../../apps/ui/components/SessionControls.js";
import { Assistant } from "../../apps/ui/components/support/Assistant.js";

const VERIFICATION_FAILED = "Authenticator verification could not be completed.";
const CODE_REJECTED =
  "That authentication code was not accepted. Enter the current 6-digit code, or use an unused recovery code.";
const SESSION = {
  asker_id: "owner:11111111-1111-4111-8111-111111111111",
  session_id: "22222222-2222-4222-8222-222222222222",
  caller_scope: "ASKER" as const,
  ownership_provenance: "server_session" as const,
  provisional_identity_model: false as const
};

let root: Root | null = null;
const saved: Array<readonly [string, PropertyDescriptor | undefined]> = [];

function denyStorage(name: "sessionStorage" | "localStorage"): void {
  saved.push([name, Object.getOwnPropertyDescriptor(window, name)]);
  Object.defineProperty(window, name, {
    configurable: true,
    get() { throw new DOMException("denied", "SecurityError"); }
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve();
  });
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

/** Signs in to the code step, then submits a code against `completeLogin`. */
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
}

function alertText(): string | null {
  return document.querySelector('[role="alert"]')?.textContent ?? null;
}

describe("S04-R06 blocked storage: every D2 member completes", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    denyStorage("sessionStorage");
    denyStorage("localStorage");
  });

  afterEach(async () => {
    try {
      if (root !== null) await act(async () => root!.unmount());
    } finally {
      root = null;
      document.body.replaceChildren();
      for (const [name, descriptor] of saved.splice(0).reverse()) {
        if (descriptor === undefined) delete (window as unknown as Record<string, unknown>)[name];
        else Object.defineProperty(window, name, descriptor);
      }
      vi.unstubAllGlobals();
    }
  });

  it("B01 a 5xx at the code step shows the verification-failed alert (LoginFlow.tsx:116)", async () => {
    await signInWith(vi.fn().mockRejectedValue(new ContractHttpError("UPSTREAM", 503, "unavailable")));
    expect(alertText()).toBe(VERIFICATION_FAILED);
  });

  it("B02 a network error at the code step shows the verification-failed alert", async () => {
    await signInWith(vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(alertText()).toBe(VERIFICATION_FAILED);
  });

  it("B03 an unreadable 2xx at the code step shows the verification-failed alert", async () => {
    await signInWith(vi.fn().mockRejectedValue(new Error("SESSION_RESPONSE_INVALID")));
    expect(alertText()).toBe(VERIFICATION_FAILED);
  });

  it("B04 a 401 at the code step shows the code-rejected alert", async () => {
    await signInWith(vi.fn().mockRejectedValue(
      new ContractHttpError("SESSION_REQUIRED", 401, "AUTH_CREDENTIALS_INVALID", "AUTH_CREDENTIALS_INVALID")
    ));
    expect(alertText()).toBe(CODE_REJECTED);
  });

  it("B05 a completed sign-in navigates once and shows no alert (LoginFlow.tsx:104)", async () => {
    const onAuthenticated = vi.fn();
    await signInWith(vi.fn().mockResolvedValue({
      status: "authenticated" as const, csrf_token: "c".repeat(43), session: SESSION
    }), onAuthenticated);
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    expect(alertText()).toBeNull();
  });

  it("B06 sign-out ends the session once (SessionControls.tsx:84)", async () => {
    const sessions: SessionList = { sessions: [{
      session_id: "11111111-1111-4111-8111-111111111111",
      created_at: "2026-09-30T10:00:00.000Z", last_seen_at: "2026-09-30T10:05:00.000Z",
      idle_expires_at: "2026-10-14T10:05:00.000Z", absolute_expires_at: "2026-12-29T10:00:00.000Z",
      last_mfa_at: "2026-09-30T10:00:00.000Z", current: true
    }] };
    const client = {
      listSessions: vi.fn().mockResolvedValue(sessions),
      logout: vi.fn().mockResolvedValue(undefined),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokeAllSessions: vi.fn().mockResolvedValue({ revoked: 1 }),
      stepUp: vi.fn().mockResolvedValue({ status: "step_up_complete", csrf_token: "c".repeat(43) })
    };
    const ended = vi.fn();
    await act(async () => root!.render(<SessionControls client={client} onSessionEnded={ended} />));
    await settle();
    await click("Sign out");
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  describe("the help panel with its default client (Assistant.tsx:388, :392, :402, :477)", () => {
    const calls: string[] = [];

    beforeEach(() => {
      calls.length = 0;
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { "content-type": "application/json" }
      });
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        calls.push(url);
        if (url === "/api/v1/session") return json({});
        if (url === "/api/v1/support/status") return json({
          configuration: { kind: "AVAILABLE" }, relay_state: "AVAILABLE", kb_loaded: { shipped: 12, ignored: 0 }
        });
        if (url === "/api/v1/support/sessions") return json({
          session: { session_id: "support-1", identity_bound: true }, session_token: "t".repeat(43)
        }, 201);
        if (url === "/api/v1/support/sessions/support-1/messages") return json({
          message_id: "answer-1", outcome: "NO_SOURCE", text: "The stub's reply."
        });
        throw new Error(`UNEXPECTED_FETCH:${url}`);
      }));
    });

    async function askQuestion(): Promise<void> {
      await act(async () => root!.render(<Assistant fullPage />));
      await settle();
      const input = document.querySelector<HTMLInputElement>('input[name="support-message"]');
      expect(input, "the panel rendered its composer").not.toBeNull();
      await act(async () => {
        input!.value = "Where is my debate?";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input!.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await settle();
    }

    it("B07 the panel opens, sends the typed question and renders the reply", async () => {
      await askQuestion();
      expect(calls).toContain("/api/v1/support/sessions/support-1/messages");
      expect(document.body.textContent).toContain("Where is my debate?");
      expect(document.body.textContent).toContain("The stub's reply.");
    });

    it("B08 after B07, New conversation clears the rendered messages", async () => {
      await askQuestion();
      expect(document.body.textContent).toContain("The stub's reply.");
      await click("New conversation");
      expect(document.body.textContent).not.toContain("Where is my debate?");
      expect(document.body.textContent).not.toContain("The stub's reply.");
    });
  });
});
