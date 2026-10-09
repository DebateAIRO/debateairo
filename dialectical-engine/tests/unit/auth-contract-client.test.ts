import { describe, expect, it } from "vitest";
import { ContractHttpError, createContractClient } from "@debateai/contract";
import * as contract from "@debateai/contract";
import openapi from "../../packages/contract/generated/openapi.json" with { type: "json" };
import inventory from "../../packages/contract/generated/field-inventory.json" with { type: "json" };

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
          ? { message: REGISTRATION_MESSAGE, retry_after_seconds: 60 }
          : url.pathname.endsWith("/start")
            ? { message: RECOVERY_START_MESSAGE }
            : { message: RESEND_MESSAGE, retry_after_seconds: 60 },
        { status: 202 }
      );
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", fetchImplementation);

    await expect(client.register({email:"person@example.test",password:"correct horse battery staple",phone:"+40712345678",country: "RO", date_of_birth:"1990-01-01",terms:{version:"2.0",sha256:"a".repeat(64)},privacy:{version:"3.0",sha256:"b".repeat(64)},locale:"en",ui_locale:"en",time_zone:"Europe/Bucharest",turnstile_token:"test-proof"})).resolves.toEqual({ message: REGISTRATION_MESSAGE, retry_after_seconds: 60 });
    await expect(client.resendVerification(RESEND_INPUT))
      .resolves.toEqual({ message: RESEND_MESSAGE, retry_after_seconds: 60 });
    await expect(client.startRecovery("person@example.test"))
      .resolves.toEqual({ message: RECOVERY_START_MESSAGE });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      path: "/v1/auth/register",
      method: "POST",
      body: {
        email: "person@example.test",
        password: "correct horse battery staple",
        phone: "+40712345678",
        ui_locale: "en", time_zone: "Europe/Bucharest",turnstile_token:"test-proof",
        country: "RO", date_of_birth: "1990-01-01",
        terms: { version: "2.0", sha256: "a".repeat(64) },
        privacy: { version: "3.0", sha256: "b".repeat(64) },
        locale: "en"
      },
      credentials: "same-origin"
    });
    expect("us_state" in (calls[0]!.body as Record<string, unknown>)).toBe(false);
    expect(calls[1]).toMatchObject({
      path: "/v1/auth/resend-verification",
      method: "POST",
      body: RESEND_INPUT,
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
      return Response.json({ message: REGISTRATION_MESSAGE, retry_after_seconds:60 }, { status: 202 });
    }) as typeof fetch);

    await client.register({...REGISTRATION_INPUT, country:"US", us_state:"TX"});

    expect(body).toEqual({
      email: "person@example.test",
      password: "correct horse battery staple",
      phone: "+40722123456",
      ui_locale: "en-US", time_zone: "America/New_York", turnstile_token: "test-proof",
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

    await expect(client.register({email:"person@example.test",password:"password",phone:"+40712345678",country: "RO", date_of_birth:"1990-01-01",terms:{version:"2.0",sha256:"a".repeat(64)},privacy:{version:"3.0",sha256:"b".repeat(64)},locale:"en",ui_locale:"en",time_zone:null,turnstile_token:"test-proof"}))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 202 });
  });

  it("requires the ruled 202 status even when the generic response body is exact", async () => {
    const client = createContractClient(
      "https://api.debateai.test",
      (async () => Response.json({ message: RESEND_MESSAGE, retry_after_seconds: 60 }, { status: 200 })) as typeof fetch
    );

    await expect(client.resendVerification(RESEND_INPUT))
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

    const failure = await client.resendVerification(RESEND_INPUT).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ContractHttpError);
    expect(failure).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      serverCode: "AUTH_RATE_LIMITED"
    });
  });
});


const REGISTRATION_INPUT = {
  email: "person@example.test", password: "correct horse battery staple", phone: "+40722123456",
  country: "RO", date_of_birth: "1990-01-01",
  terms: { version: "2.0", sha256: "a".repeat(64) },
  privacy: { version: "3.0", sha256: "b".repeat(64) },
  locale: "en", ui_locale: "en-US", time_zone: "America/New_York", turnstile_token: "test-proof"
} as const;
const RESEND_INPUT = {
  email: "person@example.test", locale: "en", ui_locale: "en-GB", time_zone: null, turnstile_token: "fresh-proof"
} as const;
const AUTHENTICATED = {
  status: "authenticated", csrf_token: "c".repeat(43),
  session: {
    asker_id: "owner:00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000002", caller_scope: "ASKER",
    ownership_provenance: "server_session", provisional_identity_model: false
  }
};
const REGISTRATION_CREDENTIAL = {
  id: "Y3JlZGVudGlhbA", rawId: "Y3JlZGVudGlhbA", type: "public-key",
  response: {
    clientDataJSON: "Y2xpZW50", attestationObject: "YXR0ZXN0YXRpb24",
    transports: ["internal"], publicKeyAlgorithm: -7, publicKey: "cHVibGlj", authenticatorData: "YXV0aA"
  },
  clientExtensionResults: { credProps: { rk: true } }, authenticatorAttachment: "platform"
};
const AUTHENTICATION_CREDENTIAL = {
  id: "Y3JlZGVudGlhbA", rawId: "Y3JlZGVudGlhbA", type: "public-key",
  response: { clientDataJSON: "Y2xpZW50", authenticatorData: "YXV0aA", signature: "c2ln" },
  clientExtensionResults: {}
};

describe("streamlined consumer auth boundary", () => {
  it("posts the complete signup and resend objects and returns their generic retry acknowledgements", async () => {
    const bodies: unknown[] = [];
    const client = createContractClient("https://api.debateai.test", (async (input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const registration = String(input).endsWith("/register");
      return Response.json({ message: registration ? REGISTRATION_MESSAGE : RESEND_MESSAGE, retry_after_seconds: 60 }, { status: 202 });
    }) as typeof fetch);
    await expect(client.register(REGISTRATION_INPUT)).resolves.toEqual({ message: REGISTRATION_MESSAGE, retry_after_seconds: 60 });
    await expect(client.resendVerification(RESEND_INPUT)).resolves.toEqual({ message: RESEND_MESSAGE, retry_after_seconds: 60 });
    expect(bodies).toEqual([
      {
        email: "person@example.test", password: "correct horse battery staple", phone: "+40722123456",
        country: "RO", date_of_birth: "1990-01-01", terms: { version: "2.0", sha256: "a".repeat(64) },
        privacy: { version: "3.0", sha256: "b".repeat(64) }, locale: "en", ui_locale: "en-US",
        time_zone: "America/New_York", turnstile_token: "test-proof"
      },
      { email: "person@example.test", locale: "en", ui_locale: "en-GB", time_zone: null, turnstile_token: "fresh-proof" }
    ]);
  });

  it.each(["adultAffirmed", "userId", "verified"])("rejects uploaded %s authority in both requests", (field) => {
    expect(contract.RegisterRequestSchema?.safeParse(REGISTRATION_INPUT).success).toBe(true);
    expect(contract.ResendVerificationRequestSchema?.safeParse(RESEND_INPUT).success).toBe(true);
    expect(contract.RegisterRequestSchema.safeParse({ ...REGISTRATION_INPUT, [field]: true }).success).toBe(false);
    expect(contract.ResendVerificationRequestSchema.safeParse({ ...RESEND_INPUT, [field]: true }).success).toBe(false);
  });

  it("takes an optional phone and requires fresh bounded anti-bot proof without accepting regional legal locales", () => {
    expect(contract.RegisterRequestSchema?.safeParse(REGISTRATION_INPUT).success).toBe(true);
    // Owner ruling 2026-10-09: the phone is optional; a given one may not be blank.
    const { phone: _phone, ...withoutPhone } = REGISTRATION_INPUT;
    expect(contract.RegisterRequestSchema.safeParse(withoutPhone).success).toBe(true);
    expect(contract.RegisterRequestSchema.safeParse({ ...REGISTRATION_INPUT, phone: "   " }).success).toBe(false);
    expect(contract.RegisterRequestSchema.safeParse({ ...REGISTRATION_INPUT, phone: null }).success).toBe(false);
    for (const [schema, input] of [[contract.RegisterRequestSchema, REGISTRATION_INPUT], [contract.ResendVerificationRequestSchema, RESEND_INPUT]] as const) {
      const { turnstile_token: _token, ...withoutProof } = input;
      expect(schema.safeParse(withoutProof).success).toBe(false);
      expect(schema.safeParse({ ...input, turnstile_token: "x".repeat(2048) }).success).toBe(true);
      expect(schema.safeParse({ ...input, turnstile_token: "x".repeat(2049) }).success).toBe(false);
      expect(schema.safeParse({ ...input, locale: "en-US" }).success).toBe(false);
      expect(schema.safeParse({ ...input, ui_locale: "en" }).success).toBe(true);
    }
    expect(contract.RegisterRequestSchema.safeParse({ ...REGISTRATION_INPUT, terms: { ...REGISTRATION_INPUT.terms, verified: true } }).success).toBe(false);
  });

  it("rejects an operation's wrong generic message and malformed retry acknowledgement", async () => {
    for (const response of [
      { message: RESEND_MESSAGE, retry_after_seconds: 60 },
      { message: REGISTRATION_MESSAGE },
      { message: REGISTRATION_MESSAGE, retry_after_seconds: 59 },
      { message: REGISTRATION_MESSAGE, retry_after_seconds: 60, verified: false }
    ]) {
      const client = createContractClient("https://api.debateai.test", (async () => Response.json(response, { status: 202 })) as typeof fetch);
      await expect(client.register(REGISTRATION_INPUT)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  it("refuses request authority before transmitting to the API", async () => {
    let transmissions = 0;
    const client = createContractClient("https://api.debateai.test", (async () => {
      transmissions++;
      return Response.json({ message: REGISTRATION_MESSAGE, retry_after_seconds: 60 }, { status: 202 });
    }) as typeof fetch);
    await expect(client.register({ ...REGISTRATION_INPUT, verified: true } as typeof REGISTRATION_INPUT)).rejects.toBeDefined();
    expect(transmissions).toBe(0);
  });

  it("keeps authentication output strict and refuses raw session tokens at the client boundary", async () => {
    expect(contract.AuthenticationResponseSchema?.safeParse(AUTHENTICATED).success).toBe(true);
    const leaked = { ...AUTHENTICATED, session_token: "raw-session-token" };
    expect(contract.AuthenticationResponseSchema.safeParse(leaked).success).toBe(false);
    const client = createContractClient("https://api.debateai.test", (async () => Response.json(leaked)) as typeof fetch);
    await expect(client.completeLogin("challenge", "123456")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("accepts standard browser credential JSON while rejecting uploaded credential authority and oversized bodies", () => {
    for (const [schema, credential] of [
      [contract.ConsumerRegistrationCredentialSchema, REGISTRATION_CREDENTIAL],
      [contract.ConsumerAuthenticationCredentialSchema, AUTHENTICATION_CREDENTIAL]
    ] as const) {
      expect(schema?.safeParse(credential).success).toBe(true);
      for (const field of ["userId", "verified", "userVerified", "counter"]) {
        expect(schema.safeParse({ ...credential, [field]: true }).success).toBe(false);
        expect(schema.safeParse({ ...credential, response: { ...credential.response, [field]: true } }).success).toBe(false);
      }
      expect(schema.safeParse({ ...credential, response: { ...credential.response, clientDataJSON: "a".repeat(32768) } }).success).toBe(false);
    }
  });

  it("uses the pinned browser JSON userHandle shape: omitted or encoded, never null", () => {
    expect(contract.ConsumerAuthenticationCredentialSchema.safeParse(AUTHENTICATION_CREDENTIAL).success).toBe(true);
    expect(contract.ConsumerAuthenticationCredentialSchema.safeParse({ ...AUTHENTICATION_CREDENTIAL, response: {
      ...AUTHENTICATION_CREDENTIAL.response, userHandle: "dXNlcg"
    } }).success).toBe(true);
    expect(contract.ConsumerAuthenticationCredentialSchema.safeParse({ ...AUTHENTICATION_CREDENTIAL, response: {
      ...AUTHENTICATION_CREDENTIAL.response, userHandle: null
    } }).success).toBe(false);
  });

  it("describes bounded passkey options with required user verification and discoverable authentication", () => {
    const options = {
      challenge: "c".repeat(43), rp: { id: "example.test", name: "Dialectical Engine" },
      user: { id: "dXNlcg", name: "person@example.test", displayName: "person@example.test" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      timeout: 300000, attestation: "none",
      authenticatorSelection: { userVerification: "required", residentKey: "required", requireResidentKey: true },
      excludeCredentials: [], extensions: { credProps: true }
    };
    const registration = { challenge_handle: "h".repeat(43), expires_at: "2026-10-05T12:00:00.000Z", options };
    expect(contract.PasskeyRegistrationOptionsResponseSchema?.safeParse(registration).success).toBe(true);
    expect(contract.PasskeyRegistrationOptionsResponseSchema.safeParse({ ...registration, options: {
      ...options, authenticatorSelection: { userVerification: "preferred" }
    } }).success).toBe(false);
    expect(contract.PasskeyRegistrationOptionsResponseSchema.safeParse({ ...registration, options: {
      ...options, excludeCredentials: Array.from({ length: 101 }, () => ({ id: "Y3JlZA", type: "public-key" }))
    } }).success).toBe(false);
    const authentication = { challenge_handle: "h".repeat(43), expires_at: "2026-10-05T12:00:00.000Z", options: {
      challenge: "c".repeat(43), rpId: "example.test", timeout: 300000, userVerification: "required", allowCredentials: []
    } };
    expect(contract.PasskeyAuthenticationOptionsResponseSchema?.safeParse(authentication).success).toBe(true);
    expect(contract.PasskeyAuthenticationOptionsResponseSchema.safeParse({ ...authentication, options: {
      ...authentication.options, userVerification: "discouraged"
    } }).success).toBe(false);
  });

  it("publishes the signup/resend request fields and 202 acknowledgements in generated contracts", () => {
    const document = openapi as Record<string, any>;
    const registration = document.paths["/v1/auth/register"].post;
    const resend = document.paths["/v1/auth/resend-verification"].post;
    expect(registration.requestBody?.content["application/json"].schema.$ref).toBe("#/components/schemas/RegisterRequestSchema");
    expect(registration.responses?.["202"].content["application/json"].schema.$ref).toBe("#/components/schemas/RegistrationVerificationAckSchema");
    expect(resend.requestBody?.content["application/json"].schema.$ref).toBe("#/components/schemas/ResendVerificationRequestSchema");
    // Owner ruling 2026-10-09: published, but optional.
    expect(document.components.schemas.RegisterRequestSchema?.properties).toHaveProperty("phone");
    expect(document.components.schemas.RegisterRequestSchema?.required).not.toContain("phone");
    expect(document.components.schemas.RegisterRequestSchema?.additionalProperties).toBe(false);
    expect(inventory.resources).toHaveProperty("RegisterRequestSchema");
    expect(inventory.resources).toHaveProperty("ResendVerificationRequestSchema");
  });
});

it('exposes strict direct TOTP enrollment and secure available-method continuation contracts',async()=>{
  const requests:Array<{path:string;body:unknown}>=[];
  const response={status:'verification_required',secret:'A'.repeat(32),otpauthUri:'otpauth://totp/fixture',enrollment_token:'e'.repeat(43),expires_at:'2026-10-05T12:00:00.000Z'};
  const client=createContractClient('https://debate.test',async(input,init)=>{
    const path=new URL(String(input)).pathname;requests.push({path,body:JSON.parse(String(init?.body))});
    return Response.json(path.endsWith('/begin')?response:path.endsWith('/verify')?AUTHENTICATED:{status:'mfa_required',challenge_token:'l'.repeat(43),available_methods:['passkey']});
  });
  await expect(client.beginTotpEnrollment({step_up_grant:'g'.repeat(43)})).resolves.toEqual(response);
  await expect(client.completeTotpEnrollment({enrollment_token:'e'.repeat(43),code:'123456'})).resolves.toEqual(AUTHENTICATED);
  await expect(client.beginLogin('person@example.test','password')).resolves.toMatchObject({status:'mfa_required',available_methods:['passkey']});
  expect(requests[0]).toEqual({path:'/v1/auth/mfa/totp/begin',body:{step_up_grant:'g'.repeat(43)}});
  expect(contract.BeginTotpEnrollmentRequestSchema.safeParse({enrollment_token:'e'.repeat(43),step_up_grant:'g'.repeat(43)}).success).toBe(false);
  expect(contract.TotpEnrollmentResponseSchema.safeParse({status:'recovery_codes_required'}).success).toBe(false);
  expect(contract.LoginContinuationResponseSchema.safeParse({status:'mfa_required',challenge_token:'l'.repeat(43),available_methods:[]}).success).toBe(false);
});
