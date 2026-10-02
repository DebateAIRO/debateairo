import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient } from "@debateai/contract";

const REGISTRATION_MESSAGE =
  "If this address can be registered, verification instructions will arrive. Check your spam folder.";
const RESEND_MESSAGE =
  "If this address is awaiting verification, new instructions will arrive. Check your spam folder.";
const RECOVERY_START_MESSAGE =
  "If this account can be recovered, instructions will arrive through an eligible channel.";

describe("auth registration contract client", () => {
  it("posts only the ruled registration and resend fields and validates the generic responses", async () => {
    const calls: Array<{
      path: string;
      method: string;
      body: unknown;
      headers: Headers;
      credentials: RequestCredentials | undefined;
    }> = [];
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push({
        path: url.pathname,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        headers: new Headers(init?.headers),
        credentials: init?.credentials
      });
      return Response.json(
        url.pathname.endsWith("/register")
          ? { message: REGISTRATION_MESSAGE }
          : url.pathname.endsWith("/start")
            ? { message: RECOVERY_START_MESSAGE }
            : { message: RESEND_MESSAGE },
        { status: 202 }
      );
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", fetchImplementation);

    await expect(client.register(
      "person@example.test",
      "correct horse battery staple",
      "recovery@example.test",
      "1990-01-01",
      { terms: { version: "2.0", sha256: "a".repeat(64) }, privacy: { version: "3.0", sha256: "b".repeat(64) }, locale: "en" },
      { country: "RO", usState: null }
    )).resolves.toEqual({ message: REGISTRATION_MESSAGE });
    await expect(client.resendVerification("person@example.test"))
      .resolves.toEqual({ message: RESEND_MESSAGE });
    await expect(client.startRecovery("person@example.test"))
      .resolves.toEqual({ message: RECOVERY_START_MESSAGE });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      path: "/v1/auth/register",
      method: "POST",
      body: {
        email: "person@example.test",
        password: "correct horse battery staple",
        recovery_email: "recovery@example.test",
        date_of_birth: "1990-01-01",
        terms: { version: "2.0", sha256: "a".repeat(64) },
        privacy: { version: "3.0", sha256: "b".repeat(64) },
        locale: "en",
        country: "RO"
      },
      credentials: "same-origin"
    });
    expect("us_state" in (calls[0]!.body as Record<string, unknown>)).toBe(false);
    expect(calls[1]).toMatchObject({
      path: "/v1/auth/resend-verification",
      method: "POST",
      body: { email: "person@example.test" },
      credentials: "same-origin"
    });
    expect(calls[2]).toMatchObject({
      path: "/v1/auth/recovery/start",
      method: "POST",
      body: { email: "person@example.test" },
      credentials: "same-origin"
    });
    for (const call of calls) {
      expect(call.headers.get("content-type")).toBe("application/json");
      expect(call.headers.get("authorization")).toBeNull();
    }
  });

  it("sends the exact US region members in the registration body", async () => {
    let body: unknown;
    const client = createContractClient("https://api.debateai.test", (async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ message: REGISTRATION_MESSAGE }, { status: 202 });
    }) as typeof fetch);

    await client.register(
      "person@example.test", "correct horse battery staple", "recovery@example.test", "1990-01-01",
      { terms: { version: "2.0", sha256: "a".repeat(64) }, privacy: { version: "3.0", sha256: "b".repeat(64) }, locale: "en" },
      { country: "US", usState: "TX" }
    );

    expect(body).toEqual({
      email: "person@example.test",
      password: "correct horse battery staple",
      recovery_email: "recovery@example.test",
      date_of_birth: "1990-01-01",
      terms: { version: "2.0", sha256: "a".repeat(64) },
      privacy: { version: "3.0", sha256: "b".repeat(64) },
      locale: "en",
      country: "US",
      us_state: "TX"
    });
  });

  it("rejects success-shaped enumeration leaks instead of widening the public contract", async () => {
    const client = createContractClient(
      "https://api.debateai.test",
      (async () => Response.json({ message: "That account already exists." }, { status: 202 })) as typeof fetch
    );

    await expect(client.register(
      "person@example.test", "password", "recovery@example.test", "1990-01-01",
      { terms: { version: "2.0", sha256: "a".repeat(64) }, privacy: { version: "3.0", sha256: "b".repeat(64) }, locale: "en" },
      { country: "RO", usState: null }
    ))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 202 });
  });

  it("requires the ruled 202 status even when the generic response body is exact", async () => {
    const client = createContractClient(
      "https://api.debateai.test",
      (async () => Response.json({ message: RESEND_MESSAGE }, { status: 200 })) as typeof fetch
    );

    await expect(client.resendVerification("person@example.test"))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
  });

  it("preserves the backend auth code on typed HTTP failures", async () => {
    const client = createContractClient(
      "https://api.debateai.test",
      (async () => Response.json(
        { error: "AUTH_RATE_LIMITED", message: "AUTH_RATE_LIMITED" },
        { status: 429 }
      )) as typeof fetch
    );

    const failure = await client.resendVerification("person@example.test").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ContractHttpError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      serverCode: "AUTH_RATE_LIMITED"
    });
  });
});
