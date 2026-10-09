import { describe, expect, it } from "vitest";
import {
  authorizationPolicyInventory,
  buildApi,
  type AskApplication
} from "@debateai/api";
import { contractInventory, staffContractInventory } from "@debateai/contract";
import {
  RETIRED_DEV_HEADER,TEST_APP_ORIGIN,testHttpIdentity,
  testSessionApplication,testSessionHeaders
} from "../support/httpSession.js";
import type { AnswerStoryApplication } from "../../apps/api/src/stories.js";
import type { AnswerDisclosureApplication } from "../../apps/api/src/disclosures.js";
import { storedStoryRecord } from "../support/storyApiFixtures.js";

const OWNED_RUN_ID = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "22222222-2222-4222-8222-222222222222";
const NODE_ID = "33333333-3333-4333-8333-333333333333";

const EXPECTED_AUTHORIZATION_MATRIX = Object.freeze([
  { route: "POST /v1/auth/password-reset/start", auth: "public", origin: "trusted", resource: "identity", action: "start-password-reset" },
  { route: "POST /v1/auth/password-reset/exchange", auth: "public", origin: "trusted", resource: "identity", action: "exchange-password-reset" },
  { route: "GET /v1/auth/password-reset/status", auth: "public", resource: "identity", action: "read-password-reset" },
  { route: "POST /v1/auth/password-reset/complete", auth: "public", origin: "trusted", resource: "identity", action: "complete-password-reset" },
  { route: "POST /v1/auth/password-reset/cancel", auth: "public", origin: "trusted", resource: "identity", action: "cancel-password-reset" },
  { route: "POST /v1/auth/password-reset/cancel-current", auth: "public", origin: "trusted", resource: "identity", action: "cancel-current-password-reset" },
  { route: "GET /v1/account/backup-email", auth: "user", resource: "identity", action: "read-backup-email" },
  { route: "POST /v1/account/backup-email/verify/start", auth: "user", origin: "trusted", resource: "identity", action: "start-backup-email-verification" },
  { route: "POST /v1/account/backup-email/verify/confirm", auth: "public", origin: "trusted", resource: "identity", action: "confirm-backup-email-verification" },
  { route: "POST /v1/auth/mfa-recovery/start", auth: "public", origin: "trusted", resource: "identity", action: "start-mfa-recovery" },
  { route: "POST /v1/auth/mfa-recovery/exchange", auth: "public", origin: "trusted", resource: "identity", action: "exchange-mfa-recovery" },
  { route: "GET /v1/auth/mfa-recovery/status", auth: "public", resource: "identity", action: "read-mfa-recovery" },
  { route: "POST /v1/auth/mfa-recovery/totp/begin", auth: "public", origin: "trusted", resource: "identity", action: "bind-mfa-recovery-factor" },
  { route: "POST /v1/auth/mfa-recovery/totp/verify", auth: "public", origin: "trusted", resource: "identity", action: "verify-mfa-recovery-factor" },
  { route: "POST /v1/auth/mfa-recovery/codes/generate", auth: "public", origin: "trusted", resource: "identity", action: "generate-mfa-recovery-codes" },
  { route: "POST /v1/auth/mfa-recovery/codes/confirm", auth: "public", origin: "trusted", resource: "identity", action: "confirm-mfa-recovery-codes" },
  { route: "POST /v1/auth/mfa-recovery/complete", auth: "public", origin: "trusted", resource: "identity", action: "complete-mfa-recovery" },
  { route: "POST /v1/auth/mfa-recovery/cancel", auth: "public", origin: "trusted", resource: "identity", action: "cancel-mfa-recovery" },
  { route: "POST /v1/auth/mfa-recovery/cancel-current", auth: "public", origin: "trusted", resource: "identity", action: "cancel-current-mfa-recovery" },

  // Approved account-flow capabilities: exact authority and Origin classes, independent of declaration order.
  ...['begin','status','passkey-options','complete'].map((step,index)=>({route:index===0?'POST /v1/account/social/{provider}/step-up/begin':`POST /v1/account/social/step-up/${step}`,auth:'user',origin:'trusted',resource:'identity',action:'social-step-up'})),
  {route:'GET /v1/auth/providers',auth:'public',resource:'identity',action:'social-providers'},
  {route:'POST /v1/auth/social/{provider}/begin',auth:'public',origin:'trusted',resource:'identity',action:'social-begin'},
  {route:'GET /v1/auth/social/{provider}/callback',auth:'public',resource:'identity',action:'social-callback'},
  {route:'POST /v1/auth/social/apple/callback',auth:'public',resource:'identity',action:'social-callback'},
  {route:'POST /v1/auth/social/login/status',auth:'public',origin:'trusted',resource:'identity',action:'social-signup'},
  ...['status','complete'].map(step=>({route:`POST /v1/auth/social/signup/${step}`,auth:'public',origin:'trusted',resource:'identity',action:'social-signup'})),
  {route:'GET /v1/account/social-providers',auth:'user',resource:'identity',action:'social-links'},
  {route:'POST /v1/account/social/{provider}/link',auth:'user',origin:'trusted',resource:'identity',action:'social-link'},
  {route:'POST /v1/account/social/unlink',auth:'user',origin:'trusted',resource:'identity',action:'social-unlink'},
  ...['recovery/prove','recovery/enrollment/options','recovery/enrollment/complete','recovery/enrollment/status','recovery/enrollment/complete-evidence','onboarding/status','onboarding/complete'].map(path=>({route:`POST /v1/auth/${path}`,auth:'public',origin:'trusted',resource:'identity',action:'restricted-onboarding'})),
  ...['options','complete'].map(step=>({route:`POST /v1/auth/passkeys/enrollment/${step}`,auth:'public',origin:'trusted',session:'optional',resource:'identity',action:`passkey-enrollment-${step}`})),
  ...['options','complete'].map(step=>({route:`POST /v1/auth/passkeys/login/${step}`,auth:'public',origin:'trusted',resource:'identity',action:`passkey-login-${step}`})),
  ...['GET /v1/account/auth-methods','POST /v1/account/auth-methods/remove','POST /v1/account/recovery-codes/regenerate','POST /v1/auth/passkeys/step-up/options','POST /v1/auth/passkeys/step-up/complete'].map(route=>({route,auth:'user',resource:'session-self',action:'consumer-security'})),
  { route: "POST /v1/auth/age-check", auth: "public", origin: "trusted", resource: "identity", action: "age-check" },
  { route: "POST /v1/auth/register", auth: "public", origin: "trusted", resource: "identity", action: "register" },
  { route: "POST /v1/auth/verify-email", auth: "public", origin: "trusted", resource: "identity", action: "verify-email" },
  { route: "POST /v1/auth/resend-verification", auth: "public", origin: "trusted", resource: "identity", action: "resend-verification" },
  { route: "POST /v1/auth/recovery/start", auth: "public", origin: "trusted", resource: "identity", action: "start-recovery" },
  { route: "POST /v1/auth/mfa/totp/begin", auth: "public", origin:"trusted", session:"optional", resource: "identity", action: "begin-totp" },
  { route: "POST /v1/auth/mfa/totp/verify", auth: "public", origin:"trusted", session:"optional", resource: "identity", action: "verify-totp" },
  { route: "POST /v1/auth/mfa/recovery-codes/generate", auth: "public", resource: "identity", action: "generate-recovery-codes" },
  { route: "POST /v1/auth/mfa/recovery-codes/confirm", auth: "public", resource: "identity", action: "confirm-recovery-code" },
  { route: "POST /v1/auth/login", auth: "public", origin: "trusted", resource: "identity", action: "login" },
  { route: "POST /v1/auth/logout", auth: "user", resource: "session-self", action: "logout" },
  { route: "GET /v1/auth/sessions", auth: "user", resource: "session-owner", action: "list" },
  { route: "DELETE /v1/auth/sessions/{id}", auth: "user", resource: "session-owner", action: "revoke" },
  { route: "DELETE /v1/auth/sessions", auth: "user", resource: "session-owner", action: "revoke-all" },
  { route: "POST /v1/auth/step-up", auth: "user", resource: "session-self", action: "step-up" },
  { route: "GET /v1/auth/age-confirmation", auth: "user", resource: "session-self", action: "read-age-confirmation" },
  { route: "POST /v1/auth/age-confirmation", auth: "user", resource: "session-self", action: "confirm-age" },
  { route: "GET /v1/account/sensitive-data-consent", auth: "user", resource: "session-self", action: "read-sensitive-data-consent" },
  { route: "POST /v1/account/sensitive-data-consent", auth: "user", resource: "session-self", action: "give-sensitive-data-consent" },
  { route: "DELETE /v1/account", auth: "user", resource: "identity", action: "schedule-erasure" },
  { route: "GET /v1/account/erasure", auth: "user", resource: "identity", action: "read-erasure" },
  { route: "POST /v1/account/erasure/cancel", auth: "user", resource: "identity", action: "cancel-erasure" },
  { route: "GET /v1/account/legal-status", auth: "user", resource: "identity", action: "read-legal-status" },
  { route: "POST /v1/account/legal-accept", auth: "user", resource: "identity", action: "accept-legal" },
  { route: "POST /v1/account/legacy-runs/claim", auth: "user", resource: "identity", action: "claim-legacy-runs" },
  { route: "GET /v1/account/profile", auth: "user", resource: "identity", action: "profile-self" },
  { route: "POST /v1/account/profile/reveal", auth: "user", resource: "identity", action: "profile-self" },
  { route: "POST /v1/account/profile", auth: "user", resource: "identity", action: "profile-self" },
  { route: "GET /v1/account/recovery-email", auth: "user", resource: "identity", action: "profile-self" },
  { route: "POST /v1/account/recovery-email", auth: "user", resource: "identity", action: "profile-self" },
  { route: "POST /v1/account/recovery-email/confirm", auth: "public", origin: "trusted", resource: "identity", action: "confirm-recovery-email" },
  { route: "DELETE /v1/account/recovery-email", auth: "user", resource: "identity", action: "profile-self" },
  { route: "GET /v1/account/email", auth: "user", resource: "identity", action: "read-email" },
  { route: "POST /v1/account/email/change", auth: "user", resource: "identity", action: "request-email-change" },
  { route: "POST /v1/account/email/change/resend", auth: "user", resource: "identity", action: "resend-email-change" },
  { route: "DELETE /v1/account/email/change", auth: "user", resource: "identity", action: "cancel-email-change" },
  { route: "POST /v1/account/email/change/confirm", auth: "public", origin: "trusted", resource: "identity", action: "confirm-email-change" },
  { route: "POST /v1/account/email/change/cancel", auth: "public", origin: "trusted", resource: "identity", action: "cancel-email-change-link" },
  { route: "DELETE /v1/debates/{id}", auth: "user", resource: "run-owner", action: "erase-private" },
  { route: "GET /v1/public/debates", auth: "public", resource: "public-debate", action: "list" },
  { route: "GET /v1/public/debates/{id}", auth: "public", resource: "public-debate", action: "read" },
  { route: "GET /v1/geo/availability", auth: "public", resource: "geo", action: "read-availability" },
  // DL1-F7: every mutating support route, anonymous callers included.
  { route: "POST /v1/support/sessions", auth: "public", origin: "trusted", session: "optional", resource: "support-session", action: "create" },
  { route: "GET /v1/support/sessions/{id}", auth: "public", session: "optional", resource: "support-session", action: "read" },
  { route: "POST /v1/support/sessions/{id}/messages", auth: "public", origin: "trusted", session: "optional", resource: "support-message", action: "create" },
  { route: "POST /v1/support/messages/{id}/rating", auth: "public", origin: "trusted", session: "optional", resource: "support-message", action: "rate" },
  { route: "POST /v1/support/sessions/{id}/escalate", auth: "public", origin: "trusted", session: "optional", resource: "support-case", action: "create" },
  { route: "GET /v1/support/cases", auth: "user", resource: "support-case", action: "list" },
  // DL1-F5c/DL3-F4: the bearer is a header, never a path segment.
  { route: "GET /v1/support/case", auth: "public", session: "optional", resource: "support-case", action: "read" },
  { route: "POST /v1/support/case/messages", auth: "public", origin: "trusted", session: "optional", resource: "support-case", action: "reply" },
  { route: "GET /v1/support/status", auth: "public", session: "optional", resource: "support-status", action: "read" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },
  { route: "GET /v1/asks/room", auth: "user", resource: "run-owner", action: "read-room" },
  { route: "GET /v1/session", auth: "user", resource: "session-self", action: "read" },
  { route: "GET /v1/deployment", auth: "operator", resource: "deployment", action: "read" },
  { route: "GET /v1/dev/evaluator", auth: "operator", resource: "evaluator", action: "read" },
  { route: "POST /v1/dev/evaluator/consumer-selection", auth: "operator", resource: "evaluator", action: "select-consumer" },
  { route: "GET /v1/answers", auth: "user", resource: "run-owner", action: "list" },
  { route: "GET /v1/answers/{id}", auth: "user", resource: "run-owner", action: "read-answer" },
  { route: "GET /v1/answers/{id}/inspection", auth: "user", resource: "run-owner", action: "read-inspection" },
  { route: "GET /v1/answers/{id}/nodes/{nodeId}", auth: "user", resource: "run-owner", action: "read-node" },
  { route: "GET /v1/answers/{id}/ledger-digest", auth: "user", resource: "run-owner", action: "read-ledger-digest" },
  { route: "GET /v1/answers/{id}/story", auth: "user", resource: "run-owner", action: "read-story" },
  { route: "GET /v1/answers/{id}/disclosure", auth: "user", resource: "run-owner", action: "read-disclosure" },
  { route: "POST /v1/answers/{id}/investigations/{gapRef}", auth: "user", resource: "run-owner", action: "investigate" },
  { route: "POST /v1/answers/{id}/memory-link/unlink", auth: "user", resource: "run-owner", action: "unlink-memory" },
  { route: "GET /v1/runs/{id}", auth: "user", resource: "run-owner", action: "read-run" },
  { route: "GET /v1/runs/{id}/visibility", auth: "user", resource: "run-owner", action: "read-visibility" },
  { route: "GET /v1/runs/{id}/events", auth: "user", resource: "run-owner", action: "read-events" },
  { route: "GET /v1/runs/{id}/answer", auth: "user", resource: "run-owner", action: "read-run-answer" },
  { route: "POST /v1/runs/{id}/publish", auth: "user", resource: "run-owner", action: "publish" },
  { route: "POST /v1/runs/{id}/unpublish", auth: "user", resource: "run-owner", action: "unpublish" },
  { route: "GET /v1/billing/usage", auth: "user", resource: "billing", action: "read-usage" },
  { route: "GET /v1/billing/plans", auth: "public", resource: "billing", action: "read-plans" },
  { route: "POST /v1/billing/quote", auth: "user", resource: "billing", action: "quote" },
  { route: "POST /v1/billing/checkout", auth: "user", resource: "billing", action: "checkout" },
  { route: "GET /v1/billing/charges/{chargeRef}", auth: "user", resource: "billing", action: "read-charge" },
  { route: "POST /v1/billing/netopia/notify", auth: "public", resource: "billing", action: "notify" },
  { route: "GET /v1/billing/subscription", auth: "user", resource: "billing", action: "read-subscription" },
  { route: "GET /v1/billing/invoices", auth: "user", resource: "billing", action: "list-invoices" },
  { route: "POST /v1/billing/subscription/downgrade", auth: "user", resource: "billing", action: "downgrade" },
  { route: "POST /v1/billing/subscription/cancel", auth: "user", resource: "billing", action: "cancel" },
  { route: "POST /v1/billing/subscription/cancel-revoke", auth: "user", resource: "billing", action: "cancel-revoke" },
  { route: "POST /v1/billing/subscription/upgrade-quote", auth: "user", resource: "billing", action: "quote-upgrade" },
  { route: "POST /v1/billing/subscription/upgrade", auth: "user", resource: "billing", action: "upgrade" },
  { route: "POST /v1/billing/subscription/withdraw", auth: "user", resource: "billing", action: "withdraw" },
  { route: "GET /v1/billing/subscription/card", auth: "user", resource: "billing", action: "read-card-details" },
  { route: "POST /v1/billing/subscription/card", auth: "user", resource: "billing", action: "change-card" },
  // P13: first-party pages only, like the support mutations (DL1-F7), and never a session.
  { route: "POST /v1/billing/cancel-link", auth: "public", origin: "trusted", resource: "billing", action: "request-cancel-link" },
  { route: "POST /v1/billing/cancel-by-token", auth: "public", origin: "trusted", resource: "billing", action: "cancel-by-token" }
] as const);

const validAskPayload = () => ({
  question_line: "Can an asker promote itself?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  plan_tier: "free",
  steering_annotations: []
});

const evaluatorView = () => ({
  catalog: { state: "UNAVAILABLE" as const, probeId: null, failureCode: "TEST", models: [] },
  selectedConsumer: null,
  dispatchBinding: {
    state: "UNBOUND" as const, reason: "ROW_ABSENT" as const,
    registerVersion: 1, sourceRef: null
  },
  harvestedRows: 0,
  domains: [],
  profiles: [],
  parkedRuns: []
});

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {
      yield {
        event_id: "event:test", event_type: "run.accepted", run_ref: OWNED_RUN_ID,
        at_sequence: 1, payload: {}
      };
    }
  };
}

function buildRoleApi(application: AskApplication = fixtureApplication()) {
  return buildApi({
    application,
    sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN
  });
}

const USER_IDENTITY=testHttpIdentity("s7-user");

/**
 * Verdict story: a composed reader that WOULD serve a READY story. The denied
 * and malformed rows below then reach the route's own gates instead of its
 * "not composed" 404, and any read past those gates turns them red.
 */
function servingStories(reads: unknown[]): AnswerStoryApplication {
  return {
    readStory: async (input) => {
      reads.push(input);
      return storedStoryRecord();
    },
    readStoryAnchor: async (input) => {
      reads.push(input);
      return { answerVersion: 1, storedAt: new Date() };
    }
  };
}
/**
 * Engine money rule, Task M5: a composed disclosure reader that WOULD serve a
 * record, for the same reason as `servingStories`: every read past the route's
 * own gates turns the denied and malformed rows red.
 */
function servingDisclosures(reads: unknown[]): AnswerDisclosureApplication {
  return {
    readDisclosure: async (input) => {
      reads.push(input);
      return {
        answer_id: ANSWER_ID, answer_version: 1,
        floor: { verdict_state: "CONTESTED", leading_node_id: NODE_ID, basis_incomplete: false },
        floor_reason: "ENVELOPE_EXHAUSTED",
        writer: null, checker: null, checker_same_as_writer: false,
        digest: { compacted: false, points_left_out: 0 },
        cut_short: { arguing: null, answer_writing: "MONEY" }
      };
    },
    readFloor: async (input) => {
      reads.push(input);
      return { verdict_state: "CONTESTED", leading_node_id: NODE_ID, basis_incomplete: false };
    }
  };
}
const USER_HEADERS=testSessionHeaders(USER_IDENTITY);
const USER_MUTATION_HEADERS=testSessionHeaders(USER_IDENTITY,true);

function buildUserApi(application:AskApplication=fixtureApplication()) {
  return buildApi({
    application,sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN
  });
}

describe("S7 deny-by-default authorization", () => {
  it("governs the entire canonical inventory and mounts every route in explicit v2", async () => {
    const governed = authorizationPolicyInventory.map(policy => policy.route);
    expect(new Set(contractInventory.routes).size).toBe(contractInventory.routes.length);
    expect(new Set(governed).size).toBe(governed.length);
    expect(new Set(governed)).toEqual(new Set(contractInventory.routes));
    const api = buildApi({application: fixtureApplication(), sessions: testSessionApplication([USER_IDENTITY]), allowedOrigin: TEST_APP_ORIGIN, staffPolicyVersion: 2, passwordReset:{} as never,backupEmail:{} as never,mfaRecovery:{} as never,consumerRecovery:{} as never,onboardingEvidence:{} as never,consumerSecurity:{} as never,consumerWebAuthn:{} as never, registration: {} as never, recovery: {} as never, mfa: {} as never, support: {} as never, evaluatorDevMenu: {} as never, evaluatorDevMenuRegisterVersion: 1});
    await api.ready();
    for (const route of contractInventory.routes) {
      const [method, path] = route.split(" ");
      expect(api.hasRoute({method: method as "GET" | "POST" | "PATCH" | "DELETE", url: path!.replace(/\{([^}]+)\}/g, ":$1")}), route).toBe(true);
    }
    await api.close();
    const ordinary=authorizationPolicyInventory.filter(policy => !policy.route.startsWith("GET /v1/admin/") && !policy.route.startsWith("POST /v1/admin/") && !policy.route.startsWith("PATCH /v1/admin/") && policy.route !== "DELETE /v1/admin/internal-allowances/{grantId}");
    const order=(a:{route:string},b:{route:string})=>a.route<b.route?-1:a.route>b.route?1:0;
    expect([...ordinary].sort(order)).toEqual([...EXPECTED_AUTHORIZATION_MATRIX].sort(order));
    expect(staffContractInventory.routes).toHaveLength(18);
    // The merged closed inventory adds the nineteen external recovery routes to the current ordinary inventory and 20 staff/internal
    // allowance routes; set equality and Fastify mounting above check each one. NETOPIA's card page (N13) adds
    // GET /v1/billing/subscription/card beside dev's 158.
    expect(contractInventory.routes).toHaveLength(159);
    expect(contractInventory.routes.filter(route => route.includes("/v1/admin/internal-allowances"))).toHaveLength(2);
  });

  it("registers the full optional composition and rejects anonymous access to every governed private route", async () => {
    const api = buildApi({
      application: fixtureApplication(),
      consumerRecovery:{} as never,onboardingEvidence:{} as never,consumerSecurity:{} as never,consumerWebAuthn:{} as never,
      registration: {} as never,
      passwordReset: {} as never,
      backupEmail: {} as never,
      mfaRecovery: {} as never,
      recovery: {} as never,
      mfa: {} as never,
      sessions: {} as never,
      evaluatorDevMenu: {} as never,
      evaluatorDevMenuRegisterVersion: 1,
      support: {} as never
    });
    for (const policy of EXPECTED_AUTHORIZATION_MATRIX) {
      const [method, template] = policy.route.split(" ") as [string, string];
      const httpMethod = method as "GET" | "POST" | "DELETE";
      const registeredUrl = template.replace(/\{([^}]+)\}/g, ":$1");
      expect(api.hasRoute({ method: httpMethod, url: registeredUrl }), policy.route).toBe(true);
      if (policy.auth === "public") continue;
      const requestUrl = template
        .replace("{nodeId}", NODE_ID)
        .replace("{gapRef}", "gap:test")
        .replace("{chargeRef}", "0".repeat(32))
        .replace("{id}", policy.route.includes("/runs/") ? OWNED_RUN_ID : ANSWER_ID);
      const response = await api.inject({ method: httpMethod, url: requestUrl });
      expect(response.statusCode, policy.route).toBe(401);
      expect(response.json(), policy.route).toEqual({ error: "SESSION_REQUIRED" });
    }
    await api.close();
  });

  it("rejects registration of a route outside the canonical policy table", async () => {
    const api = buildRoleApi();
    expect(() => api.get("/test/undeclared-auth-policy", async () => ({ exposed: true })))
      .toThrow("AUTHORIZATION_POLICY_UNDECLARED:GET /test/undeclared-auth-policy");
    await api.close();
  });

  it("retires the transitional operator credential and keeps cookie askers out", async () => {
    const api = buildRoleApi();
    const ordinary = await api.inject({
      method: "GET", url: "/v1/deployment",
      headers: USER_HEADERS
    });
    const retired = await api.inject({
      method: "GET", url: "/v1/deployment",
      headers: { [RETIRED_DEV_HEADER]: "exact-operator-token" }
    });
    expect(ordinary.statusCode).toBe(403);
    expect(retired.statusCode).toBe(401);
    await api.close();
  });

  it("operator-gates both evaluator routes", async () => {
    const selectedBy: string[] = [];
    const api = buildApi({
      application: fixtureApplication(),
      sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN,
      evaluatorDevMenuRegisterVersion: 1,
      evaluatorDevMenu: {
        readView: async () => evaluatorView(),
        selectConsumerModel: async (input) => {
          selectedBy.push(input.selectedBy);
          return { consumerSelectionId: "selection:test", modelId: input.modelId, selectedAt: input.selectedAt };
        }
      }
    });
    for (const route of [
      { method: "GET" as const, url: "/v1/dev/evaluator" },
      {
        method: "POST" as const, url: "/v1/dev/evaluator/consumer-selection",
        payload: { model_id: "model:test" }
      }
    ]) {
      expect((await api.inject({
        ...route, headers: route.method==="POST" ? USER_MUTATION_HEADERS : USER_HEADERS
      })).statusCode).toBe(403);
    }
    expect((await api.inject({
      method: "GET", url: "/v1/dev/evaluator",
      headers: { [RETIRED_DEV_HEADER]: "exact-operator-token" }
    })).statusCode).toBe(401);
    expect((await api.inject({
      method: "POST", url: "/v1/dev/evaluator/consumer-selection",
      headers: USER_MUTATION_HEADERS,
      payload: { model_id: "model:test" }
    })).statusCode).toBe(403);
    expect(selectedBy).toHaveLength(0);
    await api.close();
  });

  it("derives caller scope from the authenticated principal for a valid ask", async () => {
    let submittedScope: string | undefined;
    const application = fixtureApplication();
    application.submit = async (_ask, session) => {
      submittedScope = session.caller_scope;
      return { run_ref: "run:test", status: "QUEUED" };
    };
    const api = buildUserApi(application);
    const response = await api.inject({
      method: "POST", url: "/v1/asks",
      headers: USER_MUTATION_HEADERS,
      payload: validAskPayload()
    });
    expect(response.statusCode).toBe(202);
    expect(submittedScope).toBe("ASKER");
    await api.close();
  });

  it.each(["caller_scope", "decision_owner", "action_owner", "role"] as const)(
    "rejects the forbidden %s claim by itself",
    async (field) => {
    let submitted = false;
    const application = fixtureApplication();
    application.submit = async () => {
      submitted = true;
      return { run_ref: "run:test", status: "QUEUED" };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: USER_MUTATION_HEADERS,
      payload: {
        ...validAskPayload(),
        [field]: field === "caller_scope" ? "OPERATOR" : "attacker"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(submitted).toBe(false);
    await api.close();
    }
  );

  it("preauthorizes an owned SSE stream before committing status 200", async () => {
    let streamed = false;
    let ownershipReads = 0;
    const application = fixtureApplication();
    application.readRun = async () => {
      ownershipReads += 1;
      return null;
    };
    application.events = async function* () {
      streamed = true;
      yield {
        event_id: "event:foreign", event_type: "run.accepted", run_ref: OWNED_RUN_ID,
        at_sequence: 1, payload: {}
      };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "GET", url: `/v1/runs/${OWNED_RUN_ID}/events`,
      headers: USER_HEADERS
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    expect(ownershipReads).toBe(1);
    expect(streamed).toBe(false);
    await api.close();
  });

  it("streams only after a successful owned-run preflight", async () => {
    let streamed = false;
    const application = fixtureApplication();
    application.readRun = async (runId) => ({
      run_ref: runId, question_line: "Owned stream", state: "QUEUED",
      terminal_reason: null, hold_until: null
    });
    application.events = async function* (runId) {
      streamed = true;
      yield {
        event_id: "event:owned", event_type: "run.accepted", run_ref: runId,
        at_sequence: 1, payload: {}
      };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "GET", url: `/v1/runs/${OWNED_RUN_ID}/events`,
      headers: USER_HEADERS
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: run.accepted");
    expect(streamed).toBe(true);
    await api.close();
  });

  it.each([
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}`, error: "ANSWER_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/inspection`, error: "INSPECTION_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/ledger-digest`, error: "LEDGER_DIGEST_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/story`, error: "STORY_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/disclosure`, error: "DISCLOSURE_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/nodes/${NODE_ID}`, error: "NODE_NOT_FOUND" },
    {
      method: "POST" as const, url: `/v1/answers/${ANSWER_ID}/investigations/gap:test`,
      payload: { user_input: null, human_steer_input: true }, error: "INVESTIGATION_GAP_NOT_FOUND"
    },
    { method: "POST" as const, url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`, error: "MEMORY_LINK_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}`, error: "RUN_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}/answer`, error: "ANSWER_NOT_SERVED" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}/events`, error: "RUN_NOT_FOUND" }
  ])("maps denied owned route $method $url to its closed 404 face", async (route) => {
    const application = fixtureApplication();
    application.unlinkMemoryLink = async () => null;
    const foreignIdentity=testHttpIdentity("s7-foreign");
    const storyReads: unknown[] = [];
    const disclosureReads: unknown[] = [];
    const api = buildApi({
      application,sessions:testSessionApplication([foreignIdentity]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads)
    });
    const foreign = await api.inject({
      ...route, headers:testSessionHeaders(foreignIdentity,route.method==="POST")
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: route.error });
    expect(storyReads).toEqual([]);
    expect(disclosureReads).toEqual([]);
    await api.close();
  });

  it.each([
    { method: "GET" as const, url: "/v1/answers/not-a-uuid", error: "ANSWER_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/inspection", error: "INSPECTION_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/ledger-digest", error: "LEDGER_DIGEST_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/story", error: "STORY_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/disclosure", error: "DISCLOSURE_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/nodes/not-a-uuid`, error: "NODE_NOT_FOUND" },
    {
      method: "POST" as const, url: "/v1/answers/not-a-uuid/investigations/gap:test",
      payload: { user_input: null, human_steer_input: true }, error: "INVESTIGATION_GAP_NOT_FOUND"
    },
    { method: "POST" as const, url: "/v1/answers/not-a-uuid/memory-link/unlink", error: "MEMORY_LINK_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid", error: "RUN_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid/answer", error: "ANSWER_NOT_SERVED" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid/events", error: "RUN_NOT_FOUND" }
  ])("maps malformed resource IDs on $method $url to the closed 404 face", async (route) => {
    const storyReads: unknown[] = [];
    const disclosureReads: unknown[] = [];
    const api = buildApi({
      application: fixtureApplication(),
      sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN,
      stories: servingStories(storyReads),
      disclosures: servingDisclosures(disclosureReads)
    });
    const response = await api.inject({
      ...route, headers: route.method==="POST" ? USER_MUTATION_HEADERS : USER_HEADERS
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: route.error });
    expect(storyReads).toEqual([]);
    expect(disclosureReads).toEqual([]);
    await api.close();
  });

  it("does not expose implicit HEAD carriers for any governed GET route", async () => {
    const api = buildApi({
      application: fixtureApplication(),
      sessions:testSessionApplication([USER_IDENTITY]),allowedOrigin:TEST_APP_ORIGIN,
      evaluatorDevMenuRegisterVersion: 1,
      evaluatorDevMenu: {
        readView: async () => evaluatorView(),
        selectConsumerModel: async (input) => ({
          consumerSelectionId: "selection:test", modelId: input.modelId, selectedAt: input.selectedAt
        })
      }
    });
    for (const policy of authorizationPolicyInventory.filter(({ route }) => route.startsWith("GET "))) {
      const url = policy.route.slice(4)
        .replace("{id}", OWNED_RUN_ID)
        .replace("{nodeId}", "22222222-2222-4222-8222-222222222222")
        .replace("{chargeRef}", "0".repeat(32));
      expect((await api.inject({
        method: "HEAD", url,
        headers: USER_HEADERS
      })).statusCode, policy.route).toBe(404);
    }
    await api.close();
  });
});
