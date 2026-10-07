import openapi from "../../packages/contract/generated/openapi.json" with { type: "json" };
import { createContractClient } from "@debateai/contract";
import { describe, expect, it } from "vitest";
import { buildApi, SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, type AskApplication } from "../../apps/api/src/index.js";
import type { SessionApplication, AuthenticatedSession } from "../../apps/api/src/sessions.js";
const origin = "https://app.example.test", token = "s".repeat(43), csrf = "c".repeat(43), grant = "g".repeat(43);
const session = {
  userId: "44444444-4444-4444-8444-444444444444", ownerRef: "22222222-2222-4222-8222-222222222222", tokenHash: `sha256:${"aa".repeat(32)}`, csrfTokenHash: `sha256:${"bb".repeat(32)}`, authKind: "cookie", session: {
    asker_id: "owner:22222222-2222-4222-8222-222222222222", session_id: "33333333-3333-4333-8333-333333333333", caller_scope: "ASKER", ownership_provenance: "server_session", provisional_identity_model: false
  }
} as AuthenticatedSession;
const headers = {
  origin, cookie: `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`, "x-csrf-token": csrf
};
function harness() {
  const calls: unknown[] = [];
  const api = buildApi({
    application: {} as AskApplication, allowedOrigin: origin, sessions: {
      authenticate: async (t) => t === token ? session : null, verifyCsrf: (_s, t) => t === csrf, beginLogin: async () => ({
        status: "mfa_required", challengeToken: token
      }), completeLogin: async () => ({
        status: "authenticated", sessionToken: token, csrfToken: csrf, session: session.session
      }), logout: async () => true, listSessions: async () => [], revokeSession: async () => true, revokeAllSessions: async () => 1, stepUp: async () => ({
        sessionToken: token, csrfToken: csrf
      })
    } satisfies SessionApplication, accountProfile: {
      phoneProfile: async (s) => {
        calls.push(s);
        return {
          phone_present: true, phone_masked: "••••••••3456", phone_verified: false, updated_at: null
        };
      }, revealPhoneProfile: async (s, g) => {
        calls.push({
          s, g
        });
        return {
          phone: "+40722123456", phone_verified: false
        };
      }, updatePhoneProfile: async (s, i) => {
        calls.push({
          s, i
        });
        return {
          phone_present: true, phone_masked: "••••••••3456", phone_verified: false, updated_at: null
        };
      }
    }, recoveryEmail: {
      recoveryEmail: async () => ({
        state: "absent", email: null, pending: null
      }), requestRecoveryEmail: async () => ({
        state: "pending", email: null, pending: {
          email: "candidate@example.test", expires_at: "2026-10-05T12:00:00.000Z"
        }
      }), confirmRecoveryEmail: async () => undefined, removeRecoveryEmail: async () => undefined
    }
  });
  return {
    api, calls
  };
}
describe("purpose-bound account profile routes", () => {
  it("returns only masked phone by default with no-store", async () => {
    const { api, calls } = harness();
    try {
      const r = await api.inject({
        url: "/v1/account/profile", headers
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        phone_present: true, phone_masked: "••••••••3456", phone_verified: false, updated_at: null
      });
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body).not.toContain("+40722123456");
      expect(calls[0]).toEqual({
        userId: session.userId, sessionId: session.session.session_id, tokenHash: session.tokenHash
      });
    }
    finally {
      await api.close();
    }
  });
  it.each(["/v1/account/profile/reveal", "/v1/account/profile"])("requires CSRF before %s can use a grant", async (url) => {
    const { api, calls } = harness();
    try {
      const r = await api.inject({
        method: "POST", url, headers: {
          origin, cookie: headers.cookie
        }, payload: {
          step_up_grant: grant, ...(url.endsWith("reveal") ? {} : {
            phone: "+40722123456"
          })
        }
      });
      expect(r.statusCode).toBe(403);
      expect(calls).toHaveLength(0);
    }
    finally {
      await api.close();
    }
  });
  it("reveals only through the explicit protected route and forwards current authority", async () => {
    const { api, calls } = harness();
    try {
      const r = await api.inject({
        method: "POST", url: "/v1/account/profile/reveal", headers, payload: {
          step_up_grant: grant
        }
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        phone: "+40722123456", phone_verified: false
      });
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(calls[0]).toMatchObject({
        s: {
          tokenHash: session.tokenHash
        }, g: grant
      });
    }
    finally {
      await api.close();
    }
  });
  it("requires a session for profile and recovery settings", async () => {
    const { api } = harness();
    try {
      for (const url of ["/v1/account/profile", "/v1/account/recovery-email"]) {
        expect((await api.inject({
          url
        })).statusCode).toBe(401);
      }
    }
    finally {
      await api.close();
    }
  });
  it("shows optional recovery absence and protects confirmation Origin", async () => {
    const { api } = harness();
    try {
      const r = await api.inject({
        url: "/v1/account/recovery-email", headers
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        state: "absent", email: null, pending: null
      });
      expect(r.headers["cache-control"]).toBe("no-store");
      expect((await api.inject({
        method: "POST", url: "/v1/account/recovery-email/confirm", payload: {
          token: grant
        }
      })).statusCode).toBe(403);
      expect((await api.inject({
        method: "POST", url: "/v1/account/recovery-email/confirm", headers: {
          origin
        }, payload: {
          token: grant
        }
      })).statusCode).toBe(200);
    }
    finally {
      await api.close();
    }
  });
});
it("validates profile/recovery client DTOs over the real HTTP routes", async () => {
  const { api } = harness();
  try {
    const transport = (async (url, init) => {
      const result = await api.inject({
        method: (init?.method ?? "GET") as "GET" | "POST" | "DELETE", url: new URL(String(url)).pathname, headers: {
          ...headers, ...Object.fromEntries(new Headers(init?.headers).entries())
        }, ...(init?.body === undefined ? {} : {
          payload: String(init.body)
        })
      });
      return new Response(result.statusCode === 204 ? null : result.body, {
        status: result.statusCode, headers: result.headers as Record<string, string>
      });
    }) as typeof fetch;
    const client = createContractClient(origin, transport, {
      mode: "cookie", csrfToken: () => csrf, cookieHeader: headers.cookie
    });
    expect(await client.phoneProfile()).toMatchObject({
      phone_present: true, phone_verified: false
    });
    expect(await client.revealPhoneProfile(grant)).toEqual({
      phone: "+40722123456", phone_verified: false
    });
    expect(await client.updatePhoneProfile({
      phone: "+40722123456", grantToken: grant
    })).toMatchObject({
      phone_present: true
    });
    expect(await client.recoveryEmail()).toEqual({
      state: "absent", email: null, pending: null
    });
    expect(await client.requestRecoveryEmail({
      email: "candidate@example.test", grantToken: grant
    })).toMatchObject({
      state: "pending"
    });
    expect(await client.confirmRecoveryEmail({
      token: grant
    })).toEqual({
      status: "CONFIRMED"
    });
    await expect(client.removeRecoveryEmail({
      grantToken: grant
    })).resolves.toBeUndefined();
  }
  finally {
    await api.close();
  }
});
it.each(["READ_PHONE_PROFILE", "CHANGE_PHONE_PROFILE", "CHANGE_RECOVERY_EMAIL"] as const)("mints targetless %s and propagates rotated session/CSRF/grant", async (action) => {
  const identity = await import("../support/httpSession.js");
  const auth = identity.testHttpIdentity(`profile-${action}`);
  const api = buildApi({
    application: {} as AskApplication, allowedOrigin: origin, sessions: {
      ...identity.testSessionApplication([auth]), stepUp: async () => ({
        sessionToken: "r".repeat(43), csrfToken: "k".repeat(43), grantToken: grant, grantExpiresAt: new Date("2026-10-04T12:05:00.000Z")
      })
    }
  });
  try {
    const h = identity.testSessionHeaders(auth, true, origin);
    const response = await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers: h, payload: {
        password: "correct horse", code: "123456", authorization: {
          action
        }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "step_up_complete", csrf_token: "k".repeat(43), step_up_grant: {
        token: grant, action, expires_at: "2026-10-04T12:05:00.000Z"
      }
    });
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining(`${SESSION_COOKIE_NAME}=${"r".repeat(43)}`), expect.stringContaining(`${CSRF_COOKIE_NAME}=${"k".repeat(43)}`)]));
    expect((await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers: h, payload: {
        password: "correct horse", code: "123456", authorization: {
          action, target_run_id: "11111111-1111-4111-8111-111111111111"
        }
      }
    })).statusCode).toBe(400);
  }
  finally {
    await api.close();
  }
});
it("rejects a candidate ciphertext or locator added to mailed confirmation", async () => {
  const { api } = harness();
  try {
    for (const field of ["user_id", "candidate_ciphertext", "candidate_nonce"]) {
      const response = await api.inject({
        method: "POST", url: "/v1/account/recovery-email/confirm", headers: {
          origin
        }, payload: {
          token: grant, [field]: "injected"
        }
      });
      expect(response.statusCode).toBe(400);
    }
  }
  finally {
    await api.close();
  }
});
it("rejects profile authority fields and has no staff bulk phone route", async () => {
  const { api, calls } = harness();
  try {
    expect((await api.inject({
      method: "POST", url: "/v1/account/profile", headers, payload: {
        phone: "+40722123456", step_up_grant: grant, phone_verified: true, user_id: session.userId
      }
    })).statusCode).toBe(400);
    expect((await api.inject({
      url: "/v1/admin/account/profile?owner_ref=" + session.ownerRef, headers
    })).statusCode).toBe(404);
    expect(calls).toEqual([]);
  }
  finally {
    await api.close();
  }
});
it("publishes bounded profile and confirmation request/response contracts", () => {
  const document = openapi as unknown as {
    components: {
      schemas: Record<string, {
        properties: Record<string, unknown>;
      }>;
    };
    paths: Record<string, Record<string, {
      requestBody?: {
        content: {
          "application/json": {
            schema: {
              $ref: string;
            };
          };
        };
      };
      responses: Record<string, {
        content?: {
          "application/json": {
            schema: {
              $ref: string;
            };
          };
        };
      }>;
    }>>;
  };
  expect(document.paths["/v1/account/profile"]!.get!.responses["200"]!.content!["application/json"].schema.$ref).toBe("#/components/schemas/AccountPhoneProfileSchema");
  expect(Object.keys(document.components.schemas.AccountPhoneProfileSchema!.properties)).toEqual(["phone_present", "phone_masked", "phone_verified", "updated_at"]);
  expect(document.paths["/v1/account/recovery-email/confirm"]!.post!.requestBody!.content["application/json"].schema.$ref).toBe("#/components/schemas/EmailChangeLinkRequestSchema");
  expect(Object.keys(document.components.schemas.EmailChangeLinkRequestSchema!.properties)).toEqual(["token"]);
});
