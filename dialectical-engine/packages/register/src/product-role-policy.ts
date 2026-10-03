import type { Pool } from "pg";
import { z } from "zod";
import { canonicalDecimal, canonicalRegisterJson } from "./register-publication.js";
import { TypedDomainError } from "@debateai/kernel";

export const PRODUCT_ROLE_POLICY_ROW_KEY = "productRolePolicy" as const;

export const PRODUCT_ROLE_IDS = Object.freeze([
  "anonymous",
  "user",
  "operator",
  "moderator",
  "support",
  "security_auditor",
  "db_operator",
  "worker_service"
] as const);

export type ProductRoleId = typeof PRODUCT_ROLE_IDS[number];

const anonymousGrantsSchema = z.tuple([
  z.literal("READ_PUBLISHED_DEBATE")
]);
const userGrantsSchema = z.tuple([
  z.literal("CREATE_PRIVATE_DEBATE"),
  z.literal("READ_OWN_DEBATE"),
  z.literal("MANAGE_OWN_SESSIONS"),
  z.literal("PUBLISH_OWN_DEBATE"),
  z.literal("UNPUBLISH_OWN_DEBATE"),
  z.literal("DELETE_OWN_PRIVATE_DEBATE"),
  z.literal("MANAGE_OWN_ACCOUNT")
]);
const emptyGrantsSchema = z.tuple([]);

const productRolePolicyValueSchema = z.object({
  kind: z.literal("PRODUCT_ROLE_POLICY"),
  policy_version: z.literal(1),
  assignment_authority: z.literal("SERVER_DERIVED_ONLY"),
  caller_supplied_role: z.literal("DENIED"),
  roles: z.tuple([
    z.object({
      id: z.literal("anonymous"),
      class: z.literal("LAUNCH"),
      implementation: z.literal("ACTIVE"),
      authentication: z.literal("NONE"),
      grants: anonymousGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("user"),
      class: z.literal("LAUNCH"),
      implementation: z.literal("ACTIVE"),
      authentication: z.literal("MFA_ENROLLED"),
      grants: userGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("operator"),
      class: z.literal("LAUNCH"),
      implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("PASSKEY_REQUIRED"),
      grants: emptyGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("moderator"),
      class: z.literal("GROWTH"),
      implementation: z.literal("UNIMPLEMENTED"),
      authentication: z.literal("UNRATIFIED"),
      grants: emptyGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("support"),
      class: z.literal("GROWTH"),
      implementation: z.literal("UNIMPLEMENTED"),
      authentication: z.literal("UNRATIFIED"),
      grants: emptyGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("security_auditor"),
      class: z.literal("GROWTH"),
      implementation: z.literal("UNIMPLEMENTED"),
      authentication: z.literal("UNRATIFIED"),
      grants: emptyGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("db_operator"),
      class: z.literal("GROWTH"),
      implementation: z.literal("UNIMPLEMENTED"),
      authentication: z.literal("UNRATIFIED"),
      grants: emptyGrantsSchema
    }).strict(),
    z.object({
      id: z.literal("worker_service"),
      class: z.literal("SERVICE"),
      implementation: z.literal("EXISTING_REUSED"),
      authentication: z.literal("SERVICE_IDENTITY"),
      grants: emptyGrantsSchema
    }).strict()
  ]),
  transitions: z.tuple([
    z.object({
      from_role: z.literal("anonymous"),
      to_role: z.literal("user"),
      implementation: z.literal("ACTIVE"),
      authority: z.literal("VERIFIED_REGISTRATION_AND_MFA")
    }).strict()
  ])
}).strict();

type ProductRolePolicyValue = z.infer<typeof productRolePolicyValueSchema>;
type ProductRoleValue = ProductRolePolicyValue["roles"][number];

export type ProductRolePolicyRegisterRow = Readonly<{
  rowKey: typeof PRODUCT_ROLE_POLICY_ROW_KEY;
  value: unknown;
  sourceRef: string;
}>;

export type ProductRole = Readonly<{
  id: ProductRoleValue["id"];
  class: ProductRoleValue["class"];
  implementation: ProductRoleValue["implementation"];
  authentication: ProductRoleValue["authentication"];
  grants: readonly string[];
}>;

export type ProductRolePolicy = Readonly<{
  policyVersion: 1;
  assignmentAuthority: "SERVER_DERIVED_ONLY";
  callerSuppliedRole: "DENIED";
  roles: readonly ProductRole[];
  transitions: readonly Readonly<{
    fromRole: "anonymous";
    toRole: "user";
    implementation: "ACTIVE";
    authority: "VERIFIED_REGISTRATION_AND_MFA";
  }>[];
  sourceRef: string;
}>;

const PRODUCT_ROLE_POLICY_PUBLICATION_ROW = Object.freeze({
  "rowKey": "productRolePolicy",
  "value": Object.freeze({
    "kind": "PRODUCT_ROLE_POLICY",
    "policy_version": canonicalDecimal("1"),
    "assignment_authority": "SERVER_DERIVED_ONLY",
    "caller_supplied_role": "DENIED",
    "roles": Object.freeze([
      Object.freeze({
        "id": "anonymous",
        "class": "LAUNCH",
        "implementation": "ACTIVE",
        "authentication": "NONE",
        "grants": Object.freeze([
          "READ_PUBLISHED_DEBATE"
        ])
      }),
      Object.freeze({
        "id": "user",
        "class": "LAUNCH",
        "implementation": "ACTIVE",
        "authentication": "MFA_ENROLLED",
        "grants": Object.freeze([
          "CREATE_PRIVATE_DEBATE",
          "READ_OWN_DEBATE",
          "MANAGE_OWN_SESSIONS",
          "PUBLISH_OWN_DEBATE",
          "UNPUBLISH_OWN_DEBATE",
          "DELETE_OWN_PRIVATE_DEBATE",
          "MANAGE_OWN_ACCOUNT"
        ])
      }),
      Object.freeze({
        "id": "operator",
        "class": "LAUNCH",
        "implementation": "RESERVED_UNASSIGNABLE",
        "authentication": "PASSKEY_REQUIRED",
        "grants": Object.freeze([])
      }),
      Object.freeze({
        "id": "moderator",
        "class": "GROWTH",
        "implementation": "UNIMPLEMENTED",
        "authentication": "UNRATIFIED",
        "grants": Object.freeze([])
      }),
      Object.freeze({
        "id": "support",
        "class": "GROWTH",
        "implementation": "UNIMPLEMENTED",
        "authentication": "UNRATIFIED",
        "grants": Object.freeze([])
      }),
      Object.freeze({
        "id": "security_auditor",
        "class": "GROWTH",
        "implementation": "UNIMPLEMENTED",
        "authentication": "UNRATIFIED",
        "grants": Object.freeze([])
      }),
      Object.freeze({
        "id": "db_operator",
        "class": "GROWTH",
        "implementation": "UNIMPLEMENTED",
        "authentication": "UNRATIFIED",
        "grants": Object.freeze([])
      }),
      Object.freeze({
        "id": "worker_service",
        "class": "SERVICE",
        "implementation": "EXISTING_REUSED",
        "authentication": "SERVICE_IDENTITY",
        "grants": Object.freeze([])
      })
    ]),
    "transitions": Object.freeze([
      Object.freeze({
        "from_role": "anonymous",
        "to_role": "user",
        "implementation": "ACTIVE",
        "authority": "VERIFIED_REGISTRATION_AND_MFA"
      })
    ])
  }),
  "sourceRef": "wave-2-target-architecture.md#11; wave-3-phase-1-plan.md#phase-2"
});

export const PRODUCT_ROLE_POLICY_REGISTER_ROW = Object.freeze({
  rowKey: PRODUCT_ROLE_POLICY_PUBLICATION_ROW.rowKey,
  valueAst: PRODUCT_ROLE_POLICY_PUBLICATION_ROW.value,
  value: JSON.parse(canonicalRegisterJson(PRODUCT_ROLE_POLICY_PUBLICATION_ROW.value)) as unknown,
  sourceRef: PRODUCT_ROLE_POLICY_PUBLICATION_ROW.sourceRef
});

function immutableRole(role: ProductRoleValue): ProductRole {
  return Object.freeze({
    id: role.id,
    class: role.class,
    implementation: role.implementation,
    authentication: role.authentication,
    grants: Object.freeze([...role.grants])
  });
}

export function productRolePolicyFromRegisterRows(
  rows: readonly ProductRolePolicyRegisterRow[]
): ProductRolePolicy {
  if (rows.length === 0) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_UNRESOLVED", "The sealed product-role policy is absent");
  }
  if (rows.length > 1) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_DUPLICATE", "The sealed product-role policy is duplicated");
  }
  const row = rows[0]!;
  if (row.rowKey !== PRODUCT_ROLE_POLICY_ROW_KEY) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_INVALID", "The sealed product-role row key is invalid");
  }
  const parsed = productRolePolicyValueSchema.safeParse(row.value);
  if (!parsed.success) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_INVALID", "The sealed product-role policy is malformed");
  }
  if (row.sourceRef.trim() === "") {
    throw new TypedDomainError(
      "PRODUCT_ROLE_POLICY_PROVENANCE_MISSING",
      "The sealed product-role policy has no source_ref"
    );
  }
  return Object.freeze({
    policyVersion: parsed.data.policy_version,
    ...('funding_policy_version' in parsed.data ? { fundingPolicyVersion: 1 as const } : {}),
    assignmentAuthority: parsed.data.assignment_authority,
    callerSuppliedRole: parsed.data.caller_supplied_role,
    roles: Object.freeze(parsed.data.roles.map(immutableRole)),
    transitions: Object.freeze(parsed.data.transitions.map((transition) => Object.freeze({
      fromRole: transition.from_role,
      toRole: transition.to_role,
      implementation: transition.implementation,
      authority: transition.authority
    }))),
    sourceRef: row.sourceRef
  });
}

export async function readProductRolePolicy(
  pool: Pool,
  registerVersion: number
): Promise<ProductRolePolicy> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for product-role policy");
  }
  const result = await pool.query<{
    row_key: string;
    value_json: unknown;
    source_ref: string;
    sealed: boolean;
    declared_row_count: number;
    actual_row_count: string;
  }>(
    `SELECT row.row_key,row.value_json,row.source_ref,version.sealed,
            version.row_count AS declared_row_count,
            (SELECT count(*)::text FROM register.register_row AS counted
             WHERE counted.register_version=row.register_version) AS actual_row_count
     FROM register.register_row AS row
     JOIN register.register_version AS version USING (register_version)
     WHERE row.register_version=$1 AND row.row_key=$2`,
    [registerVersion, PRODUCT_ROLE_POLICY_ROW_KEY]
  );
  if (result.rows.some((row) => !row.sealed)) {
    throw new TypedDomainError(
      "PRODUCT_ROLE_POLICY_REGISTER_UNSEALED",
      `Register version ${registerVersion} is not sealed`
    );
  }
  if (result.rows.some((row) => Number(row.declared_row_count) !== Number(row.actual_row_count))) {
    throw new TypedDomainError(
      "PRODUCT_ROLE_POLICY_REGISTER_COUNT_MISMATCH",
      `Register version ${registerVersion} does not match its sealed row count`
    );
  }
  return productRolePolicyFromRegisterRows(result.rows.map((row) => ({
    rowKey: row.row_key as typeof PRODUCT_ROLE_POLICY_ROW_KEY,
    value: row.value_json,
    sourceRef: row.source_ref
  })));
}

/** V2 is an explicit new-version path; the historical v1 row/parser above are unchanged. */
const ownerGrantsSchema = z.tuple([
  z.literal("TEAM_READ"), z.literal("TEAM_INVITE"), z.literal("TEAM_GRANT"),
  z.literal("TEAM_DISABLE"), z.literal("AUDIT_READ"), z.literal("EMERGENCY_DISABLE")
]);
const productRolePolicyV2ValueSchema = productRolePolicyValueSchema.extend({
  policy_version: z.literal(2),
  staff_roles: z.tuple([
    z.object({ id: z.literal("owner"), class: z.literal("LAUNCH"), implementation: z.literal("ACTIVE"),
      authentication: z.literal("PRIVILEGED_WEBAUTHN"), grants: ownerGrantsSchema }).strict(),
    z.object({ id: z.literal("delegated_staff"), class: z.literal("LAUNCH"), implementation: z.literal("ACTIVE"),
      authentication: z.literal("PRIVILEGED_WEBAUTHN"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("business_administrator"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("technical_administrator"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("support_agent"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict()
  ])
}).strict();
const fundedProductRolePolicyV2ValueSchema = productRolePolicyV2ValueSchema.extend({
  funding_policy_version: z.literal(1),
  staff_roles: z.tuple([
    z.object({ id: z.literal("owner"), class: z.literal("LAUNCH"), implementation: z.literal("ACTIVE"),
      authentication: z.literal("PRIVILEGED_WEBAUTHN"), grants: z.tuple([
        z.literal("TEAM_READ"), z.literal("TEAM_INVITE"), z.literal("TEAM_GRANT"), z.literal("TEAM_DISABLE"),
        z.literal("AUDIT_READ"), z.literal("EMERGENCY_DISABLE"), z.literal("ALLOWANCE_WRITE")
      ]) }).strict(),
    z.object({ id: z.literal("delegated_staff"), class: z.literal("LAUNCH"), implementation: z.literal("ACTIVE"),
      authentication: z.literal("PRIVILEGED_WEBAUTHN"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("business_administrator"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("technical_administrator"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict(),
    z.object({ id: z.literal("support_agent"), class: z.literal("GROWTH"), implementation: z.literal("RESERVED_UNASSIGNABLE"),
      authentication: z.literal("UNRATIFIED"), grants: emptyGrantsSchema }).strict()
  ])
}).strict();
type ProductRolePolicyV2Value = z.infer<typeof productRolePolicyV2ValueSchema>;
type ProductRoleV2Value = ProductRolePolicyV2Value["roles"][number] | ProductRolePolicyV2Value["staff_roles"][number];
export type ProductRoleV2 = Readonly<Omit<ProductRoleV2Value, "grants"> & { grants: readonly string[] }>;
export type ProductRolePolicyV2 = Readonly<Omit<ProductRolePolicy, "policyVersion" | "roles"> & {
  policyVersion: 2;
  fundingPolicyVersion?: 1;
  roles: readonly ProductRoleV2[];
}>;
export type VersionedProductRolePolicy = ProductRolePolicy | ProductRolePolicyV2;
const PRODUCT_ROLE_POLICY_V2_PUBLICATION_VALUE = Object.freeze({
  ...PRODUCT_ROLE_POLICY_PUBLICATION_ROW.value,
  policy_version: canonicalDecimal("2"),
  staff_roles: Object.freeze([
    Object.freeze({ id: "owner", class: "LAUNCH", implementation: "ACTIVE", authentication: "PRIVILEGED_WEBAUTHN",
      grants: Object.freeze(["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"]) }),
    Object.freeze({ id: "delegated_staff", class: "LAUNCH", implementation: "ACTIVE", authentication: "PRIVILEGED_WEBAUTHN", grants: Object.freeze([]) }),
    ...(["business_administrator", "technical_administrator", "support_agent"] as const).map((id) => Object.freeze({
      id, class: "GROWTH", implementation: "RESERVED_UNASSIGNABLE", authentication: "UNRATIFIED", grants: Object.freeze([])
    }))
  ])
});
export const PRODUCT_ROLE_POLICY_V2_REGISTER_ROW = Object.freeze({
  rowKey: PRODUCT_ROLE_POLICY_ROW_KEY,
  valueAst: PRODUCT_ROLE_POLICY_V2_PUBLICATION_VALUE,
  value: JSON.parse(canonicalRegisterJson(PRODUCT_ROLE_POLICY_V2_PUBLICATION_VALUE)) as unknown,
  sourceRef: "2026-10-02-v3-owner-and-team-access.md#authority-model"
});
export const PRODUCT_ROLE_POLICY_FUNDED_V2_REGISTER_ROW = Object.freeze({
  rowKey: PRODUCT_ROLE_POLICY_ROW_KEY,
  valueAst: Object.freeze({
    ...PRODUCT_ROLE_POLICY_V2_PUBLICATION_VALUE,
    funding_policy_version: canonicalDecimal("1"),
    staff_roles: Object.freeze(PRODUCT_ROLE_POLICY_V2_PUBLICATION_VALUE.staff_roles.map(role => role.id === "owner"
      ? Object.freeze({ ...role, grants: Object.freeze([...role.grants, "ALLOWANCE_WRITE"]) }) : role))
  }),
  sourceRef: "2026-10-02-v3-owner-and-team-access.md#explicit-finite-internal-funding"
});
export function versionedProductRolePolicyFromRegisterRows(
  rows: readonly ProductRolePolicyRegisterRow[], policyVersion: 1 | 2, selection?: Readonly<{ fundingPolicyVersion: 1 }>
): VersionedProductRolePolicy {
  if (policyVersion === 1) {
    if (selection !== undefined) throw new TypeError("PRODUCT_ROLE_POLICY_VERSION_INVALID");
    return productRolePolicyFromRegisterRows(rows);
  }
  if (policyVersion !== 2) throw new TypeError("PRODUCT_ROLE_POLICY_VERSION_INVALID");
  if (rows.length === 0) throw new TypedDomainError("PRODUCT_ROLE_POLICY_UNRESOLVED", "The sealed product-role policy is absent");
  if (rows.length !== 1) throw new TypedDomainError("PRODUCT_ROLE_POLICY_DUPLICATE", "The sealed product-role policy is duplicated");
  const row = rows[0]!;
  const parsed = (selection?.fundingPolicyVersion === 1 ? fundedProductRolePolicyV2ValueSchema : productRolePolicyV2ValueSchema).safeParse(row.value);
  if (row.rowKey !== PRODUCT_ROLE_POLICY_ROW_KEY || !parsed.success) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_INVALID", "The sealed v2 product-role policy is malformed");
  }
  if (row.sourceRef.trim() === "") throw new TypedDomainError("PRODUCT_ROLE_POLICY_PROVENANCE_MISSING", "The sealed product-role policy has no source_ref");
  return Object.freeze({
    policyVersion: parsed.data.policy_version,
    ...('funding_policy_version' in parsed.data ? { fundingPolicyVersion: 1 as const } : {}),
    assignmentAuthority: parsed.data.assignment_authority,
    callerSuppliedRole: parsed.data.caller_supplied_role,
    roles: Object.freeze([...parsed.data.roles, ...parsed.data.staff_roles].map((role) => Object.freeze({
      ...role, grants: Object.freeze([...role.grants])
    }))),
    transitions: Object.freeze(parsed.data.transitions.map((transition) => Object.freeze({
      fromRole: transition.from_role, toRole: transition.to_role,
      implementation: transition.implementation, authority: transition.authority
    }))),
    sourceRef: row.sourceRef
  });
}
export async function readVersionedProductRolePolicy(
  pool: Pool, registerVersion: number, policyVersion: 1 | 2, selection?: Readonly<{ fundingPolicyVersion: 1 }>
): Promise<VersionedProductRolePolicy> {
  if (policyVersion === 1) {
    if (selection !== undefined) throw new TypeError("PRODUCT_ROLE_POLICY_VERSION_INVALID");
    return readProductRolePolicy(pool, registerVersion);
  }
  if (policyVersion !== 2 || !Number.isSafeInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("PRODUCT_ROLE_POLICY_VERSION_INVALID");
  }
  const result = await pool.query<{
    row_key: string; value_json: unknown; source_ref: string; sealed: boolean; declared_row_count: number; actual_row_count: string;
  }>(`SELECT row.row_key,row.value_json,row.source_ref,version.sealed,
      version.row_count AS declared_row_count,
      (SELECT count(*)::text FROM register.register_row AS counted WHERE counted.register_version=row.register_version) AS actual_row_count
      FROM register.register_row AS row JOIN register.register_version AS version USING (register_version)
      WHERE row.register_version=$1 AND row.row_key=$2`, [registerVersion, PRODUCT_ROLE_POLICY_ROW_KEY]);
  if (result.rows.some((row) => row.sealed !== true)) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_REGISTER_UNSEALED", "The product-role register is unsealed");
  }
  if (result.rows.some((row) => !Number.isSafeInteger(row.declared_row_count) || row.declared_row_count < 1
    || !/^[1-9][0-9]*$/u.test(row.actual_row_count) || BigInt(row.declared_row_count) !== BigInt(row.actual_row_count))) {
    throw new TypedDomainError("PRODUCT_ROLE_POLICY_REGISTER_COUNT_MISMATCH", "The product-role register count does not match its seal");
  }
  return versionedProductRolePolicyFromRegisterRows(result.rows.map((row) => ({
    rowKey: row.row_key as typeof PRODUCT_ROLE_POLICY_ROW_KEY, value: row.value_json, sourceRef: row.source_ref
  })), policyVersion, selection);
}
