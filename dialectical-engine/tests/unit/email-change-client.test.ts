import { describe, expect, it } from "vitest";
import { createContractClient } from "@debateai/contract";

// Turn 14 — the contract client's change-email calls: exact paths, methods and
// bodies, and responses validated against the closed schemas.

const TOKEN = "T".repeat(43);
const PENDING = { status: "PENDING", new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z" };

function recordingFetch(respond: (path: string, method: string) => Response) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    calls.push({ path: url.pathname, method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return respond(url.pathname, method);
  }) as typeof fetch;
  return { calls, fetchImplementation };
}

describe("Turn 14 change-email contract client", () => {
  it("asks step-up for a targetless CHANGE_EMAIL grant", async () => {
    const { calls, fetchImplementation } = recordingFetch(() => Response.json({
      status: "step_up_complete", csrf_token: "c".repeat(43),
      step_up_grant: { token: TOKEN, action: "CHANGE_EMAIL", expires_at: "2026-09-28T12:05:00.000Z" }
    }));
    const client = createContractClient("https://api.debateai.test", fetchImplementation);
    await expect(client.stepUp("pw", "123456", { action: "CHANGE_EMAIL" })).resolves.toMatchObject({
      step_up_grant: { token: TOKEN, action: "CHANGE_EMAIL" }
    });
    expect(calls).toEqual([{ path: "/v1/auth/step-up", method: "POST",
      body: { password: "pw", code: "123456", authorization: { action: "CHANGE_EMAIL" } } }]);
  });

  it("reads, requests, resends and cancels on the owner routes", async () => {
    const { calls, fetchImplementation } = recordingFetch((path, method) => {
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (method === "GET") return Response.json({
        email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me", pending: null
      });
      return Response.json(PENDING, { status: 202 });
    });
    const client = createContractClient("https://api.debateai.test", fetchImplementation);
    await expect(client.readAccountEmail()).resolves.toEqual({
      email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me", pending: null
    });
    await expect(client.requestEmailChange("ana.popescu@icub.ro", TOKEN)).resolves.toEqual(PENDING);
    await expect(client.resendEmailChange()).resolves.toEqual(PENDING);
    await expect(client.cancelEmailChange()).resolves.toBeUndefined();
    expect(calls).toEqual([
      { path: "/v1/account/email", method: "GET", body: undefined },
      { path: "/v1/account/email/change", method: "POST", body: { new_email: "ana.popescu@icub.ro", step_up_grant: TOKEN } },
      { path: "/v1/account/email/change/resend", method: "POST", body: {} },
      { path: "/v1/account/email/change", method: "DELETE", body: undefined }
    ]);
  });

  it("confirms and cancels by the mailed bearer", async () => {
    const { calls, fetchImplementation } = recordingFetch((path) => Response.json({
      status: path.endsWith("/confirm") ? "CONFIRMED" : "CANCELLED"
    }));
    const client = createContractClient("https://api.debateai.test", fetchImplementation);
    await expect(client.confirmEmailChange(TOKEN)).resolves.toEqual({ status: "CONFIRMED" });
    await expect(client.cancelEmailChangeByLink(TOKEN)).resolves.toEqual({ status: "CANCELLED" });
    expect(calls).toEqual([
      { path: "/v1/account/email/change/confirm", method: "POST", body: { token: TOKEN } },
      { path: "/v1/account/email/change/cancel", method: "POST", body: { token: TOKEN } }
    ]);
  });
});
