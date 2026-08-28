import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_ROLE_POLICY_REGISTER_ROW,
  PRODUCT_ROLE_POLICY_ROW_KEY,
  productRolePolicyFromRegisterRows,
  readProductRolePolicy
} from "../../packages/register/src/product-role-policy.js";

describe("P2-14 sealed product-role catalog", () => {
  it("exposes exactly the ruled launch, growth, and reused service identities", () => {
    const policy = productRolePolicyFromRegisterRows([PRODUCT_ROLE_POLICY_REGISTER_ROW]);
    expect(policy).toEqual({
      policyVersion: 1,
      assignmentAuthority: "SERVER_DERIVED_ONLY",
      callerSuppliedRole: "DENIED",
      roles: [
        {
          id: "anonymous", class: "LAUNCH", implementation: "ACTIVE",
          authentication: "NONE", grants: ["READ_PUBLISHED_DEBATE"]
        },
        {
          id: "user", class: "LAUNCH", implementation: "ACTIVE",
          authentication: "MFA_ENROLLED",
          grants: [
            "CREATE_PRIVATE_DEBATE", "READ_OWN_DEBATE", "MANAGE_OWN_SESSIONS",
            "PUBLISH_OWN_DEBATE", "UNPUBLISH_OWN_DEBATE",
            "DELETE_OWN_PRIVATE_DEBATE", "MANAGE_OWN_ACCOUNT"
          ]
        },
        {
          id: "operator", class: "LAUNCH", implementation: "RESERVED_UNASSIGNABLE",
          authentication: "PASSKEY_REQUIRED", grants: []
        },
        {
          id: "moderator", class: "GROWTH", implementation: "UNIMPLEMENTED",
          authentication: "UNRATIFIED", grants: []
        },
        {
          id: "support", class: "GROWTH", implementation: "UNIMPLEMENTED",
          authentication: "UNRATIFIED", grants: []
        },
        {
          id: "security_auditor", class: "GROWTH", implementation: "UNIMPLEMENTED",
          authentication: "UNRATIFIED", grants: []
        },
        {
          id: "db_operator", class: "GROWTH", implementation: "UNIMPLEMENTED",
          authentication: "UNRATIFIED", grants: []
        },
        {
          id: "worker_service", class: "SERVICE", implementation: "EXISTING_REUSED",
          authentication: "SERVICE_IDENTITY", grants: []
        }
      ],
      transitions: [{
        fromRole: "anonymous",
        toRole: "user",
        implementation: "ACTIVE",
        authority: "VERIFIED_REGISTRATION_AND_MFA"
      }],
      sourceRef: expect.stringMatching(/wave-2-target-architecture\.md#11/)
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.roles)).toBe(true);
    expect(Object.isFrozen(policy.roles[0]?.grants)).toBe(true);
    expect(Object.isFrozen(policy.transitions)).toBe(true);
  });

  it("fails closed for unknown, extra, duplicated, unsealed, or provenance-free catalog state", async () => {
    const expectCode = (callback: () => unknown, code: string) => {
      try {
        callback();
        throw new Error("EXPECTED_PRODUCT_ROLE_POLICY_REFUSAL");
      } catch (error) {
        expect(error).toMatchObject({ code });
      }
    };
    expectCode(() => productRolePolicyFromRegisterRows([]), "PRODUCT_ROLE_POLICY_UNRESOLVED");
    expectCode(() => productRolePolicyFromRegisterRows([
      { ...PRODUCT_ROLE_POLICY_REGISTER_ROW, value: { kind: "PRODUCT_ROLE_POLICY" } }
    ]), "PRODUCT_ROLE_POLICY_INVALID");
    expectCode(() => productRolePolicyFromRegisterRows([
      PRODUCT_ROLE_POLICY_REGISTER_ROW, PRODUCT_ROLE_POLICY_REGISTER_ROW
    ]), "PRODUCT_ROLE_POLICY_DUPLICATE");
    expectCode(() => productRolePolicyFromRegisterRows([
      { ...PRODUCT_ROLE_POLICY_REGISTER_ROW, sourceRef: "" }
    ]), "PRODUCT_ROLE_POLICY_PROVENANCE_MISSING");
    const value = structuredClone(PRODUCT_ROLE_POLICY_REGISTER_ROW.value) as unknown as {
      roles: Array<Record<string, unknown>>;
    };
    value.roles[0] = { ...value.roles[0], id: "administrator" };
    expectCode(() => productRolePolicyFromRegisterRows([
      { ...PRODUCT_ROLE_POLICY_REGISTER_ROW, value }
    ]), "PRODUCT_ROLE_POLICY_INVALID");

    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(readProductRolePolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_UNRESOLVED" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("register.register_row"), [
      1, PRODUCT_ROLE_POLICY_ROW_KEY
    ]);
    await expect(readProductRolePolicy({ query } as never, 0)).rejects.toThrow(
      "A positive register version is required for product-role policy"
    );
    query.mockResolvedValueOnce({ rows: [{
      row_key: PRODUCT_ROLE_POLICY_ROW_KEY,
      value_json: PRODUCT_ROLE_POLICY_REGISTER_ROW.value,
      source_ref: PRODUCT_ROLE_POLICY_REGISTER_ROW.sourceRef,
      sealed: false,
      declared_row_count: 1,
      actual_row_count: "1"
    }] });
    await expect(readProductRolePolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_REGISTER_UNSEALED" });
    query.mockResolvedValueOnce({ rows: [{
      row_key: PRODUCT_ROLE_POLICY_ROW_KEY,
      value_json: PRODUCT_ROLE_POLICY_REGISTER_ROW.value,
      source_ref: PRODUCT_ROLE_POLICY_REGISTER_ROW.sourceRef,
      sealed: true,
      declared_row_count: 1,
      actual_row_count: "2"
    }] });
    await expect(readProductRolePolicy({ query } as never, 1))
      .rejects.toMatchObject({ code: "PRODUCT_ROLE_POLICY_REGISTER_COUNT_MISMATCH" });
  });

  it("persists the row in every bootstrap and makes API boot validate it before serving", async () => {
    const registerSource = await readFile("packages/register/src/index.ts", "utf8");
    const apiMain = await readFile("apps/api/src/main.ts", "utf8");
    const devSeed = await readFile("apps/runner/src/dev-deployment-register.ts", "utf8");
    const api = await readFile("apps/api/src/index.ts", "utf8");
    expect(registerSource).toContain("PRODUCT_ROLE_POLICY_REGISTER_ROW");
    expect(registerSource).toContain("AUTH_POLICY_REGISTER_ROWS.length + 4");
    expect(devSeed).toContain("PRODUCT_ROLE_POLICY_REGISTER_ROW");
    const readIndex = apiMain.indexOf("await readProductRolePolicy(pool, environment.REGISTER_VERSION)");
    const workerIndex = apiMain.indexOf("new Argon2WorkerPool()");
    expect(readIndex).toBeGreaterThan(-1);
    expect(workerIndex).toBeGreaterThan(readIndex);
    expect(api).not.toMatch(/request\.body\.role|body\.role/);
  });
});
