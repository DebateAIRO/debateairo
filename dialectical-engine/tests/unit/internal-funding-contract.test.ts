import { describe, expect, it } from "vitest";
import * as register from "@debateai/register";
import * as contract from "@debateai/contract";
import type { ZodType } from "zod";
import { parseStaffAccessEnvironment } from "../../packages/register/src/runtime-environment.js";

const raw = { enabled: true, funding_policy_version: 1, currency: "USD", maximum_grant_micros: 1200000,
  maximum_day_micros: 100000, maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000, finish_allowance_bp: 10000 };
const sourceRef = "test:finite-policy";
const id = "1c5a7a96-544a-4b66-94f9-a0b18f4053dd";
function schema(name: string): ZodType {
  expect(contract).toHaveProperty(name);
  return (contract as unknown as Record<string, ZodType>)[name]!;
}
const staffConfiguration = {
  STAFF_ACCESS_POLICY_VERSION: "2", PUBLIC_APP_URL: "https://admin.example.test",
  STAFF_WEBAUTHN_ORIGIN: "https://admin.example.test", STAFF_WEBAUTHN_RP_ID: "admin.example.test",
  STAFF_INDEPENDENT_ALERT_CONFIG_PATH: "/private/fixture/alert.json", STAFF_ALERT_OPERATOR_MODULE_PATH: "/private/fixture/operator.mjs",
  STAFF_ALERT_OPERATOR_MODULE_SHA256: "a".repeat(64)
};
const fundingConfiguration = {
  INTERNAL_ALLOWANCE_POLICY_VERSION: "1", INTERNAL_ALLOWANCE_CURRENCY: "USD",
  INTERNAL_ALLOWANCE_MAXIMUM_GRANT_MICROS: "1200000", INTERNAL_ALLOWANCE_MAXIMUM_DAY_MICROS: "100000",
  INTERNAL_ALLOWANCE_MAXIMUM_WEEK_MICROS: "500000", INTERNAL_ALLOWANCE_MAXIMUM_LIFETIME_MS: "2678400000",
  INTERNAL_ALLOWANCE_FINISH_ALLOWANCE_BP: "10000", INTERNAL_ALLOWANCE_POLICY_SOURCE_REF: sourceRef
};

describe("explicit funded-v2 policies and actor-only wire contracts", () => {
  it("composes a coherent three-row variant while leaving six-capability defaults unchanged", () => {
    const base = [{ rowKey: "productRolePolicy", valueJsonText: register.canonicalRegisterJson(register.PRODUCT_ROLE_POLICY_REGISTER_ROW.valueAst), sourceRef: register.PRODUCT_ROLE_POLICY_REGISTER_ROW.sourceRef }];
    const policy = register.internalAllowancePolicyFromValue(raw, sourceRef);
    const compose = register.composeStaffPolicyRegisterPublicationRows;
    if (!policy.enabled) throw new Error("Synthetic enabled policy required");
    const a = compose(base, { policyVersion: 2 });
    const b = compose(base, { policyVersion: 2, internalAllowance: policy });
    const byKey = (rows: readonly register.RegisterPublicationRow[], key: string) => JSON.parse(rows.find(row => row.rowKey === key)!.valueJsonText);
    expect(byKey(a, "internalAllowancePolicy")).toEqual({ enabled: false });
    expect(byKey(a, "staffAccessPolicy").active_capabilities).toHaveLength(6);
    expect(byKey(b, "internalAllowancePolicy")).toEqual(raw);
    expect(byKey(b, "staffAccessPolicy")).toMatchObject({ funding_policy_version: 1, active_capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE"] });
    expect(byKey(b, "productRolePolicy").staff_roles[0].grants).toContain("ALLOWANCE_WRITE");
    expect(byKey(b, "productRolePolicy").funding_policy_version).toBe(1);
    expect(register.staffAccessPolicyFromValue(byKey(b, "staffAccessPolicy"), sourceRef)).toMatchObject({ fundingPolicyVersion: 1 });
  });

  it("requires all explicit deployment maxima and refuses stray or mixed funding configuration", () => {
    const configured = { ...staffConfiguration, ...fundingConfiguration };
    expect(parseStaffAccessEnvironment(configured)).toMatchObject({ policyVersion: 2, internalAllowancePolicy: { enabled: true, maximumGrantMicros: 1200000 } });
    expect(parseStaffAccessEnvironment(staffConfiguration)).not.toHaveProperty("internalAllowancePolicy");
    for (const key of Object.keys(fundingConfiguration)) {
      expect(() => parseStaffAccessEnvironment({ ...configured, [key]: undefined }), key).toThrow();
    }
    expect(() => parseStaffAccessEnvironment({ ...fundingConfiguration, STAFF_ACCESS_POLICY_VERSION: "1" })).toThrow();
    expect(() => parseStaffAccessEnvironment({ ...staffConfiguration, INTERNAL_ALLOWANCE_MAXIMUM_GRANT_MICROS: "1200000" })).toThrow();
  });

  it("allows explicit funded self intents and refuses uploaded targets, revision and digest", () => {
    const intent = { action: "ALLOWANCE_CONFIGURE", amount_micros: 1000000, day_micros: 100000, week_micros: 500000,
      starts_at: "2026-10-03T09:00:00.000Z", expires_at: "2026-10-10T09:00:00.000Z", funding_approval_ref: "TEST-APPROVAL-1",
      operation_id: id, reason: { code: "FUNDING_APPROVAL" } };
    expect(schema("FundedStaffActionIntentSchema").safeParse(intent).success).toBe(true);
    expect(schema("StaffActionIntentSchema").safeParse(intent).success).toBe(false);
    for (const extra of [{ owner_ref: id }, { expected_revision: 0 }, { body_sha256: "a".repeat(64) }, { target_user_id: id }, { role: "owner" }]) {
      expect(schema("FundedStaffActionIntentSchema").safeParse({ ...intent, ...extra }).success).toBe(false);
    }
    expect(schema("FundedStaffActionIntentSchema").safeParse({ action: "ALLOWANCE_REVOKE", grant_id: id, operation_id: id, reason: { code: "FUNDING_APPROVAL" } }).success).toBe(true);
    expect(schema("DelegatedStaffCapabilitiesSchema").safeParse(["ALLOWANCE_WRITE"]).success).toBe(false);
  });

  it("projects seven capabilities only through an explicitly funded elevation schema", () => {
    const response = { staff_id: id, capabilities: ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE", "ALLOWANCE_WRITE"], grant_revision: 0, expires_at: "2026-10-03T09:00:00.000Z" };
    expect(schema("FundedStaffElevationResponseSchema").safeParse(response).success).toBe(true);
    expect(schema("StaffElevationResponseSchema").safeParse(response).success).toBe(false);
    expect(schema("FundedActionBindingSchema").safeParse({ action: "ALLOWANCE_CONFIGURE", target_id: id, expected_revision: 0, operation_id: id, body_sha256: "a".repeat(64) }).success).toBe(true);
    expect(contract.PlanIdSchema.options).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
  });
});

it("documents explicit funded endpoint request/response variants in the generated OpenAPI", async () => {
  const { readFile } = await import("node:fs/promises");
  const document = JSON.parse(await readFile("packages/contract/generated/openapi.json", "utf8"));
  expect(document.paths["/v1/admin/webauthn/elevation/verify"].post.responses["200"].content["application/json"].schema.anyOf)
    .toContainEqual({ $ref: "#/components/schemas/FundedStaffElevationResponseSchema" });
  expect(document.paths["/v1/admin/team"].get.responses["200"].content["application/json"].schema.anyOf)
    .toContainEqual({ $ref: "#/components/schemas/FundedStaffTeamPageSchema" });
  expect(document.paths["/v1/admin/webauthn/action/options"].post.requestBody.content["application/json"].schema.anyOf)
    .toContainEqual({ $ref: "#/components/schemas/FundedStaffActionOptionsRequestSchema" });
  expect(document.paths["/v1/admin/internal-allowances"].post.requestBody.content["application/json"].schema)
    .toEqual({ $ref: "#/components/schemas/InternalAllowanceConfigureRequestSchema" });
  expect(document.components.schemas.InternalAllowanceConfigureRequestSchema.properties).not.toHaveProperty("owner_ref");
  expect(document.components.schemas.FundedStaffElevationResponseSchema.properties.capabilities.items.enum).toContain("ALLOWANCE_WRITE");
  expect(document.components.schemas.StaffElevationResponseSchema.properties.capabilities.items.enum).not.toContain("ALLOWANCE_WRITE");
});
