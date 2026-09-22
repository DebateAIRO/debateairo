import { describe, expect, it, vi } from "vitest";
import { Argon2InfrastructureError } from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  AuthFlowError,
  InProcessAuthRateLimiter,
  RegistrationService
} from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";

const SOURCE = Object.freeze({
  ip: "203.0.113.14",
  userAgent: "vitest-v14",
  requestId: "v14-password-maximum"
});

function sealedRow(rowKey: string): Readonly<{
  value: Readonly<Record<string, unknown>>;
  sourceRef: string;
}> {
  const row = AUTH_POLICY_REGISTER_ROWS.find((candidate) => candidate.rowKey === rowKey);
  if (row === undefined) throw new Error(`missing sealed row ${rowKey}`);
  return row;
}

function deploymentRow(rowKey: string): Readonly<{
  value: Readonly<Record<string, unknown>>;
  sourceRef: string;
}> {
  const row = AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS.find((candidate) => candidate.rowKey === rowKey);
  if (row === undefined) throw new Error(`missing deployment row ${rowKey}`);
  return row;
}

/**
 * A registration service whose only live dependency is the identity lookup spy.
 * Everything a valid request would reach AFTER input validation is a spy, so a
 * refusal that happens at the policy gate is visible as "nothing was called".
 */
function harness(policy: ReturnType<typeof authPolicyFromRegisterRows>) {
  // The first dependency a valid request reaches. It refuses with the pool's
  // own typed error so the attempt ends here, quietly, with nothing provisioned.
  const findAuditIdentityByBlindIndex = vi.fn(async (): Promise<never> => {
    throw new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE");
  });
  const hashPassword = vi.fn(async () =>
    `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`);
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByBlindIndex,
      findAuditIdentityByVerificationHash: async () => null,
      recordRegistrationFailure: async () => undefined,
      recordRateLimitRefusal: async () => undefined
    } as never,
    mail: new MemoryMailSender(),
    dekStore: {
      store: async () => undefined,
      destroy: async () => "ALREADY_ABSENT"
    } as never,
    blindIndexKey: Buffer.alloc(32, 0x14),
    policy,
    limiter: new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    ),
    argon2: {
      hashPassword,
      verifyPassword: async () => false,
      hashAuditContext: async () => "ab".repeat(32)
    },
    sleep: async () => undefined
  });
  return { service, findAuditIdentityByBlindIndex, hashPassword };
}

describe("V-14 the password maximum length is register policy", () => {
  it("leaves the sealed passwordPolicy row exactly as it was sealed, with no maximum", () => {
    expect(sealedRow("passwordPolicy").value).toEqual({
      kind: "PASSWORD_POLICY",
      minimum_length: 8,
      composition_rules: false,
      forced_rotation: false,
      argon2id: { memory_cost_kib: 65_536, time_cost: 3, parallelism: 1, hash_length: 32 }
    });
    expect(Object.hasOwn(sealedRow("passwordPolicy").value, "max_length")).toBe(false);
    expect(authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.maximumLength).toBeNull();
  });

  it("publishes a superseding deployment row that adds max_length 1024 and nothing else", () => {
    expect(deploymentRow("passwordPolicy").value).toEqual({
      ...sealedRow("passwordPolicy").value,
      max_length: 1_024
    });
    // The superseding row cites the ruling and keeps the sealed provenance.
    expect(deploymentRow("passwordPolicy").sourceRef)
      .toContain(sealedRow("passwordPolicy").sourceRef);
    expect(deploymentRow("passwordPolicy").sourceRef).toMatch(/V-14/);
    // Every row the deployment set does not supersede is republished
    // byte-for-byte. Two rows are superseded: this one, and `rateLimitPolicy`
    // under V-25, whose own addition is checked just below.
    expect(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS.map((row) => row.rowKey))
      .toEqual(AUTH_POLICY_REGISTER_ROWS.map((row) => row.rowKey));
    for (const row of AUTH_POLICY_REGISTER_ROWS) {
      if (row.rowKey === "passwordPolicy" || row.rowKey === "rateLimitPolicy") continue;
      expect(deploymentRow(row.rowKey).value).toEqual(row.value);
      expect(deploymentRow(row.rowKey).sourceRef).toBe(row.sourceRef);
    }
  });

  it("supersedes rateLimitPolicy by ONE added member and moves nothing else (V-25)", () => {
    // The same guarantee V-14 gives for the password row, for the row V-25
    // supersedes: strip the one member the new version adds and what is left
    // must be the sealed row, member for member.
    const sealed = sealedRow("rateLimitPolicy").value as {
      sketch_design: Readonly<Record<string, unknown>>;
    };
    const deployed = deploymentRow("rateLimitPolicy").value as {
      sketch_design: Readonly<Record<string, unknown>>;
    };
    const {
      isolated_limiter_resident_measurement_versions: added,
      ...republished
    } = deployed.sketch_design;
    expect(added).toBeDefined();
    expect(republished).toEqual(sealed.sketch_design);
    expect({ ...deployed, sketch_design: republished }).toEqual(sealed);
    expect(Object.hasOwn(sealed.sketch_design, "isolated_limiter_resident_measurement_versions"))
      .toBe(false);
    expect(deploymentRow("rateLimitPolicy").sourceRef)
      .toContain(sealedRow("rateLimitPolicy").sourceRef);
    expect(deploymentRow("rateLimitPolicy").sourceRef).toMatch(/V-25/);
  });

  it("refuses a published row whose maximum is below its own minimum", () => {
    // A row that parses member by member and then refuses every registration
    // is not a policy, it is an outage. The two members are read together.
    const incoherent = AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS.map((row) => row.rowKey !== "passwordPolicy"
      ? row
      : { ...row, value: { ...row.value, max_length: 4 } });
    expect(() => authPolicyFromRegisterRows(incoherent))
      .toThrowError(expect.objectContaining({ code: "AUTH_POLICY_INVALID" }));
    // ...and the smallest coherent maximum, exactly the minimum, is admitted.
    const tight = AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS.map((row) => row.rowKey !== "passwordPolicy"
      ? row
      : { ...row, value: { ...row.value, max_length: 8 } });
    expect(authPolicyFromRegisterRows(tight).password.maximumLength).toBe(8);
  });

  it("resolves the superseding row through the reader: maximumLength is 1024", () => {
    expect(authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS).password.maximumLength)
      .toBe(1_024);
  });

  it("resolves the maximum as a policy member, in the same unit as the minimum", () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
    expect(policy.password.minimumLength).toBe(8);
    expect(policy.password.maximumLength).toBe(1_024);
    // The superseding row moves no other password value.
    expect(policy.password.argon2id).toEqual(
      authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.argon2id
    );
  });

  it("refuses a registration password longer than the ruled maximum before any work", async () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
    const { service, findAuditIdentityByBlindIndex, hashPassword } = harness(policy);
    const error = await service.register({
      email: "alice@example.test",
      password: "p".repeat(1_025),
      recoveryEmail: "recovery@example.test",
      adultAffirmed: true
    }, SOURCE).then(
      () => { throw new Error("an over-long password was accepted"); },
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(AuthFlowError);
    expect((error as AuthFlowError).code).toBe("AUTH_INPUT_INVALID");
    expect(findAuditIdentityByBlindIndex).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    await service.drainMailDispatches();
  });

  it("still admits a password of exactly the ruled maximum, so nobody is locked out", async () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
    const { service, findAuditIdentityByBlindIndex } = harness(policy);
    await service.register({
      email: "alice@example.test",
      password: "p".repeat(1_024),
      recoveryEmail: "recovery@example.test",
      adultAffirmed: true
    }, SOURCE).catch(() => undefined);
    expect(findAuditIdentityByBlindIndex).toHaveBeenCalledTimes(1);
    await service.drainMailDispatches();
  });

  it("keeps the sealed policy's behaviour when no maximum is published", async () => {
    const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const { service, findAuditIdentityByBlindIndex } = harness(policy);
    await service.register({
      email: "alice@example.test",
      password: "p".repeat(1_025),
      recoveryEmail: "recovery@example.test",
      adultAffirmed: true
    }, SOURCE).catch(() => undefined);
    expect(findAuditIdentityByBlindIndex).toHaveBeenCalledTimes(1);
    await service.drainMailDispatches();
  });
});
