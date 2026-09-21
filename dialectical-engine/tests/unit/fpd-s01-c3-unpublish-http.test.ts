import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type ApiOptions
} from "../../apps/api/src/index.js";

const ORIGIN = "https://ui.example.test";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_RUN_ID = "00000000-0000-4000-8000-000000000000";
const OWNER_SESSION_TOKEN = "s".repeat(43);
const SECOND_SESSION_TOKEN = "t".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);

const OWNER_AUTHENTICATED = Object.freeze({
  session: Object.freeze({
    session_id: "22222222-2222-4222-8222-222222222222",
    asker_id: "owner:owner-one",
    caller_scope: "user",
    ownership_provenance: "server_session"
  }),
  userId: "33333333-3333-4333-8333-333333333333",
  ownerRef: "owner-one"
});
const SECOND_AUTHENTICATED = Object.freeze({
  session: Object.freeze({
    session_id: "44444444-4444-4444-8444-444444444444",
    asker_id: "owner:owner-two",
    caller_scope: "user",
    ownership_provenance: "server_session"
  }),
  userId: "55555555-5555-4555-8555-555555555555",
  ownerRef: "owner-two"
});

type PublicationApplication = NonNullable<ApiOptions["publications"]>;
type PreflightInput = Parameters<PublicationApplication["preflightGrant"]>[0];

type HarnessInput = Readonly<{
  withoutPublications?: boolean;
  preflight?: (input: PreflightInput) => boolean;
  owned?: object | null | ((runId: string) => object | null);
  visibility?: Readonly<{
    state: "PRIVATE" | "PUBLISHED";
    public_ref: string | null;
  }> | null;
  bound?: boolean | ((runId: string) => boolean);
}>;

const openedApis: ReturnType<typeof buildApi>[] = [];

afterEach(async () => {
  await Promise.all(openedApis.splice(0).map(async (api) => api.close()));
});

function authenticatedHeaders(sessionToken = OWNER_SESSION_TOKEN): Readonly<Record<string, string>> {
  return Object.freeze({
    cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
    origin: ORIGIN,
    "x-csrf-token": CSRF_TOKEN
  });
}

function validBody(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    step_up_grant: GRANT_TOKEN,
    copies_may_persist_acknowledged: true
  });
}

function makeHarness(input: HarnessInput = {}) {
  const readRun = vi.fn(async (runId: string) => input.owned === undefined
    ? Object.freeze({})
    : typeof input.owned === "function" ? input.owned(runId) : input.owned);
  const application = Object.freeze({ readRun }) as unknown as ApiOptions["application"];
  const preflightGrant = vi.fn(async (candidate: PreflightInput) => input.preflight?.(candidate) ?? true);
  const auditPreflightDenial = vi.fn(async () => undefined);
  const readOwnedVisibility = vi.fn(async () => input.visibility ?? Object.freeze({
    state: "PUBLISHED" as const,
    public_ref: RUN_ID
  }));
  const isFreePublicBound = vi.fn(async (runId: string) => typeof input.bound === "function"
    ? input.bound(runId)
    : input.bound ?? true);
  const unpublish = vi.fn(async () => Object.freeze({
    state: "PRIVATE" as const,
    public_ref: null
  }));
  const publications = Object.freeze({
    preflightGrant,
    auditPreflightDenial,
    readOwnedVisibility,
    isFreePublicBound,
    unpublish
  }) as unknown as PublicationApplication;
  const sessions = Object.freeze({
    authenticate: vi.fn(async (sessionToken: string) => sessionToken === OWNER_SESSION_TOKEN
      ? OWNER_AUTHENTICATED
      : sessionToken === SECOND_SESSION_TOKEN ? SECOND_AUTHENTICATED : null),
    verifyCsrf: vi.fn(() => true)
  }) as unknown as NonNullable<ApiOptions["sessions"]>;
  const api = buildApi({
    application,
    sessions,
    allowedOrigin: ORIGIN,
    ...(input.withoutPublications ? {} : { publications })
  });
  openedApis.push(api);
  return {
    api,
    readRun,
    preflightGrant,
    auditPreflightDenial,
    readOwnedVisibility,
    isFreePublicBound,
    unpublish
  };
}

async function postUnpublish(
  api: ReturnType<typeof buildApi>,
  input: Readonly<{
    runId?: string;
    headers?: Readonly<Record<string, string>>;
    payload?: Readonly<Record<string, unknown>>;
  }> = {}
) {
  return api.inject({
    method: "POST",
    url: `/v1/runs/${input.runId ?? RUN_ID}/unpublish`,
    ...(input.headers === undefined ? {} : { headers: input.headers }),
    payload: input.payload ?? validBody()
  });
}

describe("S01-C3 Free-public unpublish HTTP boundary", () => {
  // PROPERTY G1: unauthenticated unpublish is rejected before any publication dependency is consulted.
  it("G1 returns the exact 401 face without a session cookie", async () => {
    const harness = makeHarness();
    const response = await postUnpublish(harness.api);

    expect({
      status: response.statusCode,
      body: response.body,
      preflightCalls: harness.preflightGrant.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 401,
      body: '{"error":"SESSION_REQUIRED"}',
      preflightCalls: 0,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY G2: every invalid origin/CSRF permutation is rejected before route logic.
  it("G2 returns the exact 403 face for missing or foreign origin and CSRF mismatch", async () => {
    const harness = makeHarness();
    const valid = authenticatedHeaders();
    const invalidHeaders = [
      { cookie: valid.cookie!, "x-csrf-token": valid["x-csrf-token"]! },
      { ...valid, origin: "https://foreign.example.test" },
      { ...valid, "x-csrf-token": "x".repeat(43) }
    ];
    const outcomes = [];
    for (const headers of invalidHeaders) {
      const response = await postUnpublish(harness.api, { headers });
      outcomes.push({ status: response.statusCode, body: response.body });
    }

    expect({
      outcomes,
      preflightCalls: harness.preflightGrant.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      outcomes: Array.from({ length: 3 }, () => ({
        status: 403,
        body: '{"error":"CSRF_VALIDATION_FAILED"}'
      })),
      preflightCalls: 0,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY G3: the acknowledgement is required before publication availability or ownership is disclosed.
  it("G3 returns 400 with the malformed-request code when copies acknowledgement is absent", async () => {
    const harness = makeHarness();
    const response = await postUnpublish(harness.api, {
      headers: authenticatedHeaders(),
      payload: { step_up_grant: GRANT_TOKEN }
    });

    expect({
      status: response.statusCode,
      body: response.json(),
      preflightCalls: harness.preflightGrant.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toMatchObject({
      status: 400,
      body: { error: "MALFORMED_REQUEST" },
      preflightCalls: 0,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY G4: an authenticated valid request reports publication unavailability before grant preflight.
  it("G4 returns the exact 503 face when the publication application is absent", async () => {
    const harness = makeHarness({ withoutPublications: true });
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({ status: response.statusCode, body: response.body }).toEqual({
      status: 503,
      body: '{"error":"PUBLICATION_UNAVAILABLE"}'
    });
  });

  // PROPERTY G5: a failed live-grant/owner preflight has the uniform 404 face and stops every later read.
  it("G5 returns the exact 404 face when grant preflight fails", async () => {
    const harness = makeHarness({ preflight: () => false });
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      status: response.statusCode,
      body: response.body,
      auditCalls: harness.auditPreflightDenial.mock.calls.length,
      readRunCalls: harness.readRun.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 404,
      body: '{"error":"RUN_NOT_FOUND"}',
      auditCalls: 1,
      readRunCalls: 0,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY G6: an owner read that finds no run has the same 404 face and stops visibility classification.
  it("G6 returns the exact 404 face when the owned run read is null", async () => {
    const harness = makeHarness({ owned: null });
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      status: response.statusCode,
      body: response.body,
      preflightCalls: harness.preflightGrant.mock.calls.length,
      readRunCalls: harness.readRun.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 404,
      body: '{"error":"RUN_NOT_FOUND"}',
      preflightCalls: 1,
      readRunCalls: 1,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY R-12: a live-granted owner cannot unpublish a bound run whose latest visibility is PUBLISHED.
  it("R-12 returns the exact typed 409 and never calls unpublish", async () => {
    const harness = makeHarness();
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      status: response.statusCode,
      body: response.body,
      preflightCalls: harness.preflightGrant.mock.calls.length,
      readRunCalls: harness.readRun.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 409,
      body: '{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}',
      preflightCalls: 1,
      readRunCalls: 1,
      visibilityCalls: 1,
      boundCalls: 1,
      unpublishCalls: 0
    });
  });

  // PROPERTY R-12 boundary: boundness alone is insufficient; only latest PUBLISHED is refused.
  it("R-12 lets a bound PRIVATE run follow the existing 200 unpublish path", async () => {
    const harness = makeHarness({
      visibility: { state: "PRIVATE", public_ref: null },
      bound: true
    });
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      status: response.statusCode,
      body: response.json(),
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 200,
      body: { state: "PRIVATE", public_ref: null },
      boundCalls: 0,
      unpublishCalls: 1
    });
  });

  // PROPERTY R-13: a second signed-in user cannot distinguish a bound existing run from a missing run.
  it("R-13 gives a second user the byte-identical missing-run 404 face", async () => {
    const harness = makeHarness({
      preflight: ({ runId, authenticated }) => runId === RUN_ID
        && authenticated === OWNER_AUTHENTICATED as never,
      owned: (runId) => runId === RUN_ID ? Object.freeze({}) : null,
      bound: (runId) => runId === RUN_ID
    });
    const foreign = await postUnpublish(harness.api, {
      headers: authenticatedHeaders(SECOND_SESSION_TOKEN)
    });
    const missing = await postUnpublish(harness.api, {
      runId: MISSING_RUN_ID,
      headers: authenticatedHeaders()
    });

    expect({
      foreign: { status: foreign.statusCode, body: foreign.body },
      missing: { status: missing.statusCode, body: missing.body },
      readRunCalls: harness.readRun.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      foreign: { status: 404, body: '{"error":"RUN_NOT_FOUND"}' },
      missing: { status: 404, body: '{"error":"RUN_NOT_FOUND"}' },
      readRunCalls: 0,
      visibilityCalls: 0,
      boundCalls: 0,
      unpublishCalls: 0
    });
  });

  // PROPERTY R-14: refusing a bound run is non-consuming, so the same live grant receives the same 409 twice.
  it("R-14 preserves the grant across two sequential refusals", async () => {
    const harness = makeHarness();
    const first = await postUnpublish(harness.api, { headers: authenticatedHeaders() });
    const second = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      responses: [first, second].map((response) => ({
        status: response.statusCode,
        body: response.body
      })),
      preflightCalls: harness.preflightGrant.mock.calls.length,
      visibilityCalls: harness.readOwnedVisibility.mock.calls.length,
      boundCalls: harness.isFreePublicBound.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      responses: Array.from({ length: 2 }, () => ({
        status: 409,
        body: '{"error":"FREE_DEBATE_CANNOT_BE_UNPUBLISHED"}'
      })),
      preflightCalls: 2,
      visibilityCalls: 2,
      boundCalls: 2,
      unpublishCalls: 0
    });
  });

  // PROPERTY R-15: a published Premium run follows the existing unpublish path and exposes no pending key.
  it("R-15 keeps Premium unpublish at 200 with the private projection", async () => {
    const harness = makeHarness({ bound: false });
    const response = await postUnpublish(harness.api, { headers: authenticatedHeaders() });

    expect({
      status: response.statusCode,
      body: response.json(),
      preflightCalls: harness.preflightGrant.mock.calls.length,
      readRunCalls: harness.readRun.mock.calls.length,
      unpublishCalls: harness.unpublish.mock.calls.length
    }).toEqual({
      status: 200,
      body: { state: "PRIVATE", public_ref: null },
      preflightCalls: 1,
      readRunCalls: 1,
      unpublishCalls: 1
    });
  });
});
