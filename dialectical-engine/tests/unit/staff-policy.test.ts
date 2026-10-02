import { afterEach, describe, expect, it, vi } from "vitest";
import { validApiEnvironmentFixture } from "../support/apiEnvironmentFixture.js";
import * as register from "../../packages/register/src/index.js";
import { canonicalRegisterJson } from "../../packages/register/src/register-publication.js";
import * as runtime from "../../packages/register/src/runtime-environment.js";

function exported<T>(module: object, name: string): T {
  expect(module, `missing ${name}`).toHaveProperty(name);
  return (module as Record<string, unknown>)[name] as T;
}
const staffRow = () => exported<{ value: unknown; sourceRef: string }>(register, "STAFF_ACCESS_POLICY_REGISTER_ROW");
const parse = (value: unknown, sourceRef = "test:staff-policy") =>
  exported<(value: unknown, sourceRef: string) => Record<string, unknown>>(register, "staffAccessPolicyFromValue")(value, sourceRef);
const parseRuntime = (env: Record<string, string | undefined>) =>
  exported<(env: Record<string, string | undefined>) => unknown>(runtime, "parseStaffAccessEnvironment")(env);
const configured = {
  STAFF_ACCESS_POLICY_VERSION: "2", PUBLIC_APP_URL: "https://admin.example.test",
  STAFF_WEBAUTHN_ORIGIN: "https://admin.example.test", STAFF_WEBAUTHN_RP_ID: "admin.example.test",
  STAFF_INDEPENDENT_ALERT_CONFIG_PATH: "/private/test-fixture/staff-alert.json"
};

afterEach(() => vi.unstubAllEnvs());
describe("sealed staff policy v2", () => {
  it("enforces staff configuration on the real API boot loader", () => {
    for (const [key, value] of Object.entries({ ...validApiEnvironmentFixture(), ...configured })) vi.stubEnv(key, value);
    vi.stubEnv("STAFF_WEBAUTHN_RP_ID", undefined);
    expect(() => runtime.loadApiEnvironment()).toThrow("STAFF_ACCESS_CONFIGURATION_REQUIRED");
    vi.stubEnv("STAFF_WEBAUTHN_RP_ID", "admin.example.test");
    expect(runtime.loadApiEnvironment().STAFF_ACCESS).toEqual(parseRuntime(configured));
    expect(runtime.parseApiEnvironment({ ...validApiEnvironmentFixture(), ...configured }).STAFF_ACCESS)
      .toEqual(parseRuntime(configured));
  });
  it("parses exact lifetimes, key requirements and active A capability boundaries", () => {
    const policy = parse(staffRow().value);
    expect(policy).toMatchObject({
      policyVersion: 2, idleLifetimeMs: 900000, absoluteLifetimeMs: 28800000,
      challengeLifetimeMs: 300000, actionProofLifetimeMs: 300000,
      prerequisiteLifetimeMs: 300000, ownerCommandLifetimeMs: 300000,
      invitationLifetimeMs: 86400000, epochPollIntervalMs: 1000,
      externalOperationTimeoutMs: 5000, ownerCredentialMinimum: 2,
      delegatedCredentialMinimum: 1, userVerification: "required", backupEligible: false,
      backedUp: false, algorithms: [-7, -257], ceremonyBodyMaxBytes: 32768,
      challengeMaxFailures: 5,
      activeCapabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"],
      delegatedCapabilities: ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE"]
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.activeCapabilities)).toBe(true);
  });

  it("requires separate strict hashed privilege cookies, single use proofs and a live ordinary session", () => {
    expect(parse(staffRow().value)).toMatchObject({
      cookieName: "__Host-debateai-staff", csrfCookieName: "__Host-debateai-staff-csrf", tokenBytes: 32,
      cookieHttpOnly: true, csrfCookieHttpOnly: false, cookieSecure: true, cookiePath: "/", cookieSameSite: "Strict",
      tokenStorage: "HASH_ONLY", challengeSingleUse: true, actionProofSingleUse: true,
      prerequisiteSingleUse: true, invitationSingleUse: true, ownerCommandSingleUse: true,
      ordinarySessionRequired: true, positiveAuthorityCache: false,
      attestation: "none", crossOrigin: "DENIED", originPolicy: "EXACT_PUBLIC_APP_URL_ORIGIN", rpIdPolicy: "EXACT_PUBLIC_APP_URL_HOSTNAME",
      independentAlertRequired: true
    });
  });

  it.each([
    ["idle_lifetime_ms", 900001], ["absolute_lifetime_ms", 28800001],
    ["challenge_lifetime_ms", 300001], ["action_proof_lifetime_ms", 300001],
    ["prerequisite_lifetime_ms", 300001], ["owner_command_lifetime_ms", 300001],
    ["invitation_lifetime_ms", 86400001], ["epoch_poll_interval_ms", 1001],
    ["external_operation_timeout_ms", 5001], ["owner_credential_minimum", 1],
    ["delegated_credential_minimum", 0], ["backup_eligible", true], ["backed_up", true],
    ["user_verification", "preferred"], ["ceremony_body_max_bytes", 32769],
    ["challenge_max_failures", 6], ["algorithms", [-7, -8]],
    ["active_capabilities", ["ALLOWANCE_WRITE"]], ["delegated_capabilities", ["TEAM_GRANT"]],
    ["role", "owner"], ["cookie_secure", false], ["cookie_same_site", "Lax"], ["token_storage", "PLAINTEXT"],
    ["ordinary_session_required", false], ["positive_authority_cache", true], ["challenge_single_use", false],
    ["action_proof_single_use", false], ["prerequisite_single_use", false], ["invitation_single_use", false],
    ["owner_command_single_use", false], ["cross_origin", "ALLOWED"], ["attestation", "direct"], ["independent_alert_required", false]
  ])("denies changed or unknown staff policy field %s", (field, value) => {
    const original = staffRow().value;
    expect(parse(original)).toMatchObject({ policyVersion: 2 });
    expect(() => parse({ ...(original as object), [field]: value })).toThrow();
  });

  it("requires policy provenance and keeps allowance strictly disabled", () => {
    const original = staffRow().value;
    expect(parse(original)).toMatchObject({ policyVersion: 2 });
    expect(() => parse(original, "")).toThrow();
    const parseAllowance = exported<(value: unknown, source: string) => unknown>(register, "internalAllowancePolicyFromValue");
    expect(parseAllowance({ enabled: false }, "test:allowance")).toMatchObject({ enabled: false });
    for (const value of [{ enabled: true }, { enabled: false, maximum_grant_micros: 1 }, {}, null]) {
      expect(() => parseAllowance(value, "test:allowance")).toThrow();
    }
  });

  it("denies missing, duplicate, unsealed and row-count-inconsistent staff reads", async () => {
    const read = exported<(pool: unknown, version: number) => Promise<unknown>>(register, "readStaffAccessPolicy");
    const row = { row_key: "staffAccessPolicy", value_json: staffRow().value,
      source_ref: "test:staff", sealed: true, declared_row_count: 3, actual_row_count: "3" };
    const pool = (rows: unknown[]) => ({ query: async (_sql: string, values: unknown[]) => {
      expect(values).toEqual([9, "staffAccessPolicy"]);
      return { rows };
    } });
    await expect(read(pool([row]), 9)).resolves.toMatchObject({ policyVersion: 2 });
    await expect(read(pool([]), 9)).rejects.toMatchObject({ code: "STAFF_ACCESS_POLICY_UNRESOLVED" });
    await expect(read(pool([row, row]), 9)).rejects.toMatchObject({ code: "STAFF_ACCESS_POLICY_DUPLICATE" });
    await expect(read(pool([{ ...row, sealed: false }]), 9)).rejects.toMatchObject({ code: "STAFF_ACCESS_POLICY_REGISTER_UNSEALED" });
    await expect(read(pool([{ ...row, actual_row_count: "4" }]), 9)).rejects.toMatchObject({ code: "STAFF_ACCESS_POLICY_REGISTER_COUNT_MISMATCH" });
    await expect(read(pool([row]), 0)).rejects.toThrow();
  });

  it("reads allowance and v2 roles only from a sealed version and never infers an upgrade", async () => {
    const query = (key: string, value: unknown, changes: object = {}) => ({ query: async (_sql: string, values: unknown[]) => {
      expect(values).toEqual([9, key]);
      return { rows: [{ row_key: key, value_json: value, source_ref: "test:sealed", sealed: true,
        declared_row_count: 3, actual_row_count: "3", ...changes }] };
    } });
    const allowance = exported<(pool: unknown, version: number) => Promise<unknown>>(register, "readInternalAllowancePolicy");
    await expect(allowance(query("internalAllowancePolicy", { enabled: false }), 9)).resolves.toMatchObject({ enabled: false });
    await expect(allowance(query("internalAllowancePolicy", { enabled: true }), 9)).rejects.toMatchObject({ code: "INTERNAL_ALLOWANCE_POLICY_INVALID" });
    await expect(allowance(query("internalAllowancePolicy", { enabled: false }, { sealed: false }), 9)).rejects.toMatchObject({ code: "INTERNAL_ALLOWANCE_POLICY_REGISTER_UNSEALED" });
    const read = exported<(pool: unknown, version: number, policy: 1 | 2) => Promise<unknown>>(register, "readVersionedProductRolePolicy");
    const row = exported<{ value: unknown }>(register, "PRODUCT_ROLE_POLICY_V2_REGISTER_ROW");
    await expect(read(query("productRolePolicy", row.value), 9, 2)).resolves.toMatchObject({ policyVersion: 2 });
    await expect(read(query("productRolePolicy", row.value), 9, 1)).rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_INVALID" });
    await expect(read(query("productRolePolicy", row.value, { sealed: false }), 9, 2)).rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_REGISTER_UNSEALED" });
    await expect(read(query("productRolePolicy", row.value, { actual_row_count: "4" }), 9, 2)).rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_REGISTER_COUNT_MISMATCH" });
  });

  it("requires explicit matching origin/RP and independent alert configuration for v2", () => {
    expect(parseRuntime({})).toEqual({ policyVersion: 1 });
    expect(parseRuntime(configured)).toEqual({ policyVersion: 2, origin: "https://admin.example.test",
      rpId: "admin.example.test", independentAlertConfigPath: "/private/test-fixture/staff-alert.json" });
    for (const field of ["PUBLIC_APP_URL", "STAFF_WEBAUTHN_ORIGIN", "STAFF_WEBAUTHN_RP_ID", "STAFF_INDEPENDENT_ALERT_CONFIG_PATH"]) {
      expect(() => parseRuntime({ ...configured, [field]: undefined })).toThrow();
    }
    for (const change of [
      { STAFF_WEBAUTHN_RP_ID: "other.example.test" }, { STAFF_WEBAUTHN_ORIGIN: "https://other.example.test" },
      { STAFF_WEBAUTHN_ORIGIN: "https://admin.example.test/path" }, { STAFF_WEBAUTHN_ORIGIN: "https://admin.example.test/" },
      { PUBLIC_APP_URL: "https://user:password@admin.example.test" }, { PUBLIC_APP_URL: "https://admin.example.test/path" },
      { STAFF_INDEPENDENT_ALERT_CONFIG_PATH: "relative.json" }, { STAFF_ACCESS_POLICY_VERSION: "3" },
      { PUBLIC_APP_URL: "http://admin.example.test", STAFF_WEBAUTHN_ORIGIN: "http://admin.example.test" }
    ]) expect(() => parseRuntime({ ...configured, ...change })).toThrow();
  });

  it("composes v2 only by explicit selection and refuses an ambiguous or changed base", () => {
    const compose = exported<(rows: unknown[], selection: { policyVersion: 1 | 2 }) => Array<{ rowKey: string; valueJsonText: string }>>(register, "composeStaffPolicyRegisterPublicationRows");
    const old = { rowKey: "productRolePolicy", valueJsonText: canonicalRegisterJson(register.PRODUCT_ROLE_POLICY_REGISTER_ROW.valueAst), sourceRef: register.PRODUCT_ROLE_POLICY_REGISTER_ROW.sourceRef };
    const base = [old, { rowKey: "untouched", valueJsonText: "true", sourceRef: "test:base" }];
    expect(compose(base, { policyVersion: 1 })).toBe(base);
    const proposed = compose(base, { policyVersion: 2 });
    expect(proposed.map((row) => row.rowKey)).toEqual(["productRolePolicy", "untouched", "staffAccessPolicy", "internalAllowancePolicy"]);
    expect(proposed[1]).toBe(base[1]);
    expect(JSON.parse(proposed[0]!.valueJsonText)).toMatchObject({ policy_version: 2 });
    expect(JSON.parse(proposed[3]!.valueJsonText)).toEqual({ enabled: false });
    for (const rows of [[], [old, old], [{ ...old, valueJsonText: "{}" }], [...base, { rowKey: "staffAccessPolicy", valueJsonText: "{}" }]]) {
      expect(() => compose(rows, { policyVersion: 2 })).toThrow();
    }
  });

  it("recognizes Owner and delegated staff only on the explicitly selected v2 parser", () => {
    const row = exported<{ value: unknown }>(register, "PRODUCT_ROLE_POLICY_V2_REGISTER_ROW");
    const parseVersioned = exported<(rows: unknown[], version: 1 | 2) => { policyVersion: number; roles: Array<{ id: string; grants: string[] }> }>(register, "versionedProductRolePolicyFromRegisterRows");
    expect(() => register.productRolePolicyFromRegisterRows([row as never])).toThrow();
    const parsed = parseVersioned([row], 2);
    expect(parsed.policyVersion).toBe(2);
    expect(parsed.roles.find((role) => role.id === "owner")?.grants)
      .toEqual(["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"]);
    expect(parsed.roles.find((role) => role.id === "delegated_staff")?.grants).toEqual([]);
    for (const id of ["operator", "moderator", "support", "security_auditor", "db_operator", "business_administrator", "technical_administrator", "support_agent"]) {
      expect(parsed.roles.find((role) => role.id === id)?.grants).toEqual([]);
    }
    expect(() => parseVersioned([row], 1)).toThrow();
    const value = structuredClone(row.value) as { staff_roles: Array<{ grants: string[] }> };
    value.staff_roles[2]!.grants = ["TEAM_GRANT"];
    expect(() => parseVersioned([{ ...row, value }], 2)).toThrow();
    expect(() => parseVersioned([{ ...row, value: { ...(row.value as object), role: "owner" } }], 2)).toThrow();
  });
});
