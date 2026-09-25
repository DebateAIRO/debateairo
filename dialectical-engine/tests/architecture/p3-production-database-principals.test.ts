import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type ConnectionPurpose = Readonly<{
  component: string;
  sourceFile?: string;
  environmentKey: string | null;
  purpose: string;
  binding: "WIRED" | "WIRED_WHEN_ENABLED" | "DEVELOPMENT_ONLY"
    | "DEVELOPMENT_ONLY_UNBOUND" | "REQUIRED_NOT_WIRED"
    | "EXTERNAL_COMPONENT" | "JIT_HUMAN";
  condition?: string;
  unboundReason?: string;
}>;

type Principal = Readonly<{
  id: string;
  roleName: string;
  kind: "PERSISTENT_MIGRATION_OWNER" | "SERVICE" | "HUMAN_READ_ONLY"
    | "HUMAN_EXECUTE_ONLY";
  database: "debateai" | "hatchet";
  login: boolean;
  inherit: boolean;
  superuser: boolean;
  createDatabase: boolean;
  createRole: boolean;
  replication: boolean;
  bypassRls: boolean;
  credentialLifecycle?: "EPHEMERAL_JIT";
  directMemberships: readonly string[];
  effectiveMemberships: readonly string[];
  forbiddenMemberships: readonly string[];
  ownsDatabases: readonly string[];
  ownsSchemas: readonly string[];
  connectionPurposes: readonly ConnectionPurpose[];
}>;

type Manifest = Readonly<{
  format: string;
  status: string;
  provisioner: Readonly<{
    command: string;
    source: string;
    cliSource: string;
    runbook: string;
    input: "STDIN_EXACT_JSON_AND_PRIVATE_FILE_ARG";
    managedPrincipalIds: readonly string[];
  }>;
  principalProvisioning: readonly Readonly<{
    principalId: string;
    state: "SPECIFIED_NOT_PROVISIONED" | "MIGRATION_PROVISIONED_UNMANAGED_CREDENTIAL"
      | "EXTERNAL_COMPONENT";
    source: string | null;
  }>[];
  capabilityRoles: readonly Readonly<{
    roleName: string;
    login: false;
    inherit: boolean;
    directMemberships: readonly string[];
  }>[];
  ownershipRoles: readonly Readonly<{
    roleName: string;
    login: false;
    inherit: boolean;
    directMemberships: readonly string[];
    ownsSchemas: readonly string[];
    ownsRelations: readonly string[];
    ownsFunctions: readonly string[];
  }>[];
  principals: readonly Principal[];
  developmentOnlyPrincipalBindings: readonly (ConnectionPurpose & Readonly<{
    roleName: string;
    capabilityRole: string;
    provisioner: string;
  }>)[];
  unboundConnectionPurposes: readonly ConnectionPurpose[];
  membershipGrants: readonly Readonly<{
    memberRole: string;
    grantedRole: string;
    adminOption: false;
    inheritOption: true;
    setOption: true;
  }>[];
  credentialRequirements: readonly Readonly<{
    principalId: string;
    credentialId: string;
    lifecycle: "EPHEMERAL_JIT" | "ROTATED_SERVICE" | "JIT_SHORT_LIVED"
      | "MIGRATION_MINTED_UNMANAGED" | "EXTERNAL_COMPONENT";
    currentProvisioner?: string;
    ownerTicket: "P3-02";
  }>[];
  privilegeDisclosures: readonly Readonly<{
    roleName: string;
    source: string;
    grants: readonly string[];
  }>[];
  deploymentObligations: readonly Readonly<{
    id: string;
    ownerTicket: "P3-02";
    requiredEvidence: string;
  }>[];
  invariants: readonly string[];
}>;

const manifestPath =
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json";

const capabilityRoles = [
  "debateai_authorization_runtime",
  "debateai_content_provision",
  "debateai_erasure_runtime",
  "debateai_evaluator_api",
  "debateai_evaluator_reader",
  "debateai_evaluator_worker",
  "debateai_publication_cleanup",
  "debateai_replay",
  "debateai_runtime",
  "debateai_settlement_watch",
  "debateai_support",
  "debateai_support_config_operator"
] as const;

const ownershipRoles = [
  "debateai_evaluator_ddl",
  // V-29: owns obs.postgres_capacity(...), the observation agent's statistics window.
  "debateai_obs_stats_owner",
  "debateai_obs_view_owner",
  "debateai_register_publication_owner"
] as const;

// V-29 removed the one exception (the observation agent's pg_monitor login): no
// principal may hold any predefined pg_* role.
function exactForbidden(effectiveMemberships: readonly string[]): readonly string[] {
  const governedRoles: string[] = [...capabilityRoles, ...ownershipRoles];
  return governedRoles
    .filter((role) => !effectiveMemberships.includes(role))
    .concat("debateai_prod_*", "pg_*")
    .sort();
}

function connectionShape(connection: ConnectionPurpose) {
  return {
    component: connection.component,
    environmentKey: connection.environmentKey,
    purpose: connection.purpose,
    binding: connection.binding,
    ...(connection.condition === undefined ? {} : { condition: connection.condition })
  };
}

describe("P3-01 production database-principal manifest", () => {
  it("defines the exact capability, ownership, service, and connection-purpose inventory", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

    expect(manifest.format).toBe("debateai.production-database-principals.v3");
    expect(manifest.status).toBe("MIXED_PROVISIONING_STATE");
    expect(manifest.capabilityRoles.map(({ roleName }) => roleName)).toEqual(capabilityRoles);
    expect(manifest.capabilityRoles.every(({ login }) => login === false)).toBe(true);
    expect(manifest.capabilityRoles.map(({ roleName, inherit, directMemberships }) => ({
      roleName, inherit,
      directMemberships
    }))).toEqual([
      { roleName: "debateai_authorization_runtime", inherit: true, directMemberships: ["debateai_runtime"] },
      { roleName: "debateai_content_provision", inherit: false, directMemberships: [] },
      { roleName: "debateai_erasure_runtime", inherit: false, directMemberships: [] },
      { roleName: "debateai_evaluator_api", inherit: true, directMemberships: [] },
      { roleName: "debateai_evaluator_reader", inherit: true, directMemberships: [] },
      { roleName: "debateai_evaluator_worker", inherit: true, directMemberships: [] },
      { roleName: "debateai_publication_cleanup", inherit: false, directMemberships: [] },
      { roleName: "debateai_replay", inherit: true, directMemberships: [] },
      { roleName: "debateai_runtime", inherit: true, directMemberships: [] },
      { roleName: "debateai_settlement_watch", inherit: true, directMemberships: [] },
      { roleName: "debateai_support", inherit: false, directMemberships: [] },
      { roleName: "debateai_support_config_operator", inherit: false, directMemberships: [] }
    ]);
    expect(manifest.ownershipRoles).toEqual([
      {
        roleName: "debateai_evaluator_ddl",
        login: false,
        inherit: true,
        directMemberships: [],
        ownsSchemas: ["evaluator"],
        ownsRelations: [],
        ownsFunctions: []
      },
      {
        roleName: "debateai_obs_stats_owner",
        login: false,
        inherit: false,
        directMemberships: ["pg_read_all_stats"],
        ownsSchemas: [],
        ownsRelations: [],
        ownsFunctions: ["obs.postgres_capacity(double precision,double precision)"]
      },
      {
        roleName: "debateai_obs_view_owner",
        login: false,
        inherit: false,
        directMemberships: [],
        ownsSchemas: [],
        ownsRelations: ["obs.run_correlation_v"],
        ownsFunctions: []
      },
      {
        roleName: "debateai_register_publication_owner",
        login: false,
        inherit: false,
        directMemberships: [],
        ownsSchemas: [],
        ownsRelations: [],
        ownsFunctions: []
      }
    ]);

    expect(manifest.principals.map(({ id, roleName, kind }) => ({ id, roleName, kind })))
      .toEqual([
        { id: "migration-admin", roleName: "debateai_prod_migrator", kind: "PERSISTENT_MIGRATION_OWNER" },
        { id: "api-runtime", roleName: "debateai_prod_api_runtime", kind: "SERVICE" },
        { id: "api-content-provision", roleName: "debateai_prod_api_content_provision", kind: "SERVICE" },
        { id: "api-erasure", roleName: "debateai_prod_api_erasure", kind: "SERVICE" },
        { id: "api-authorization", roleName: "debateai_prod_api_authorization", kind: "SERVICE" },
        { id: "api-publication-cleanup", roleName: "debateai_prod_api_publication_cleanup", kind: "SERVICE" },
        { id: "api-support", roleName: "debateai_prod_api_support", kind: "SERVICE" },
        { id: "runner-runtime", roleName: "debateai_prod_runner_runtime", kind: "SERVICE" },
        { id: "scheduler-replay", roleName: "debateai_prod_scheduler_replay", kind: "SERVICE" },
        { id: "scheduler-liveness", roleName: "debateai_prod_scheduler_liveness", kind: "SERVICE" },
        { id: "scheduler-settlement", roleName: "debateai_prod_scheduler_settlement", kind: "SERVICE" },
        { id: "evaluator-worker", roleName: "debateai_prod_evaluator_worker", kind: "SERVICE" },
        { id: "evaluator-api", roleName: "debateai_prod_evaluator_api", kind: "SERVICE" },
        { id: "evaluator-reader", roleName: "debateai_prod_evaluator_reader", kind: "SERVICE" },
        { id: "obs-writer", roleName: "debateai_obs_writer", kind: "SERVICE" },
        { id: "obs-listener", roleName: "debateai_obs_listener", kind: "SERVICE" },
        { id: "obs-watchdog", roleName: "debateai_obs_watchdog", kind: "SERVICE" },
        { id: "obs-human", roleName: "debateai_obs_human", kind: "HUMAN_READ_ONLY" },
        {
          id: "observation-agent",
          roleName: "debateai_observation_agent",
          kind: "SERVICE"
        },
        // DL7-F9 (migration 0071): the principal `oactl thresholds apply` writes as, so the
        // daemon's own principal no longer holds INSERT on the policy that rules it.
        {
          id: "observation-threshold-operator",
          roleName: "debateai_observation_threshold_operator",
          kind: "SERVICE"
        },
        {
          id: "support-config-operator",
          roleName: "debateai_prod_support_config_operator",
          kind: "HUMAN_EXECUTE_ONLY"
        },
        { id: "hatchet", roleName: "debateai_prod_hatchet", kind: "SERVICE" }
      ]);
    expect(manifest.principalProvisioning.map(({ principalId, state, source }) => ({
      principalId, state, source
    }))).toEqual(manifest.principals.map(({ id }) => ({
      principalId: id,
      state: id === "observation-agent" || id === "observation-threshold-operator"
        || id.startsWith("obs-")
        ? "MIGRATION_PROVISIONED_UNMANAGED_CREDENTIAL"
        : id === "hatchet" ? "EXTERNAL_COMPONENT" : "SPECIFIED_NOT_PROVISIONED",
      source: id === "observation-agent"
        ? "migrations/0057_observation_foundation.sql"
        : id === "observation-threshold-operator"
          ? "migrations/0071_observation_threshold_operator.sql"
        : id.startsWith("obs-") ? "migrations/0034_obs_foundation.sql"
        : id === "hatchet" ? "compose.dev.yaml" : null
    })));
    expect(manifest.principals.map(({
      id, database, inherit, directMemberships, effectiveMemberships
    }) => ({ id, database, inherit, directMemberships, effectiveMemberships })))
      .toEqual([
        { id: "migration-admin", database: "debateai", inherit: true, directMemberships: [], effectiveMemberships: [] },
        { id: "api-runtime", database: "debateai", inherit: true, directMemberships: ["debateai_runtime"], effectiveMemberships: ["debateai_runtime"] },
        { id: "api-content-provision", database: "debateai", inherit: true, directMemberships: ["debateai_content_provision"], effectiveMemberships: ["debateai_content_provision"] },
        { id: "api-erasure", database: "debateai", inherit: true, directMemberships: ["debateai_erasure_runtime"], effectiveMemberships: ["debateai_erasure_runtime"] },
        { id: "api-authorization", database: "debateai", inherit: true, directMemberships: ["debateai_authorization_runtime"], effectiveMemberships: ["debateai_authorization_runtime", "debateai_runtime"] },
        { id: "api-publication-cleanup", database: "debateai", inherit: true, directMemberships: ["debateai_publication_cleanup"], effectiveMemberships: ["debateai_publication_cleanup"] },
        { id: "api-support", database: "debateai", inherit: true, directMemberships: ["debateai_support"], effectiveMemberships: ["debateai_support"] },
        { id: "runner-runtime", database: "debateai", inherit: true, directMemberships: ["debateai_runtime"], effectiveMemberships: ["debateai_runtime"] },
        { id: "scheduler-replay", database: "debateai", inherit: true, directMemberships: ["debateai_replay"], effectiveMemberships: ["debateai_replay"] },
        { id: "scheduler-liveness", database: "debateai", inherit: true, directMemberships: ["debateai_runtime"], effectiveMemberships: ["debateai_runtime"] },
        { id: "scheduler-settlement", database: "debateai", inherit: true, directMemberships: ["debateai_settlement_watch"], effectiveMemberships: ["debateai_settlement_watch"] },
        { id: "evaluator-worker", database: "debateai", inherit: true, directMemberships: ["debateai_evaluator_worker"], effectiveMemberships: ["debateai_evaluator_worker"] },
        { id: "evaluator-api", database: "debateai", inherit: true, directMemberships: ["debateai_evaluator_api"], effectiveMemberships: ["debateai_evaluator_api"] },
        { id: "evaluator-reader", database: "debateai", inherit: true, directMemberships: ["debateai_evaluator_reader"], effectiveMemberships: ["debateai_evaluator_reader"] },
        { id: "obs-writer", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "obs-listener", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "obs-watchdog", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "obs-human", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "observation-agent", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "observation-threshold-operator", database: "debateai", inherit: false, directMemberships: [], effectiveMemberships: [] },
        { id: "support-config-operator", database: "debateai", inherit: true, directMemberships: ["debateai_support_config_operator"], effectiveMemberships: ["debateai_support_config_operator"] },
        { id: "hatchet", database: "hatchet", inherit: true, directMemberships: [], effectiveMemberships: [] }
      ]);

    expect(new Set(manifest.principals.map(({ roleName }) => roleName)).size)
      .toBe(manifest.principals.length);
    for (const principal of manifest.principals) {
      expect(principal.login).toBe(true);
      expect(principal.replication).toBe(false);
      expect(principal.bypassRls).toBe(false);
      if (principal.kind === "PERSISTENT_MIGRATION_OWNER") {
        expect(principal).toMatchObject({
          credentialLifecycle: "EPHEMERAL_JIT",
          inherit: true,
          superuser: true,
          createDatabase: true,
          createRole: true,
          directMemberships: [],
          effectiveMemberships: [],
          ownsDatabases: ["debateai"],
          ownsSchemas: [
            "audit_crypto_internal", "core", "evidence", "identity", "ledger",
            "memory", "obs", "observation", "register", "scorecard", "serve", "support"
          ]
        });
        expect(principal.connectionPurposes).toEqual([
          {
            component: "apps/runner:migrate-cli",
            sourceFile: "apps/runner/src/migrate-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "MIGRATIONS_AND_ROLE_BOOTSTRAP",
            binding: "WIRED"
          },
          {
            component: "apps/runner:dev-database-principals-cli",
            sourceFile: "apps/runner/src/dev-database-principals-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "DEVELOPMENT_PRINCIPAL_PROVISIONING",
            binding: "DEVELOPMENT_ONLY",
            condition: "package script dev:auth:provision-principals"
          },
          {
            component: "apps/runner:dev-deployment-register-cli",
            sourceFile: "apps/runner/src/dev-deployment-register-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "DEVELOPMENT_REGISTER_SEED",
            binding: "DEVELOPMENT_ONLY",
            condition: "package script dev:auth:seed-register"
          },
          // SYNC3: dev's `dev:auth:publish-provider-set` (debate tiers) is a new
          // migrator-principal seam, development only, like the seeder above.
          {
            component: "apps/runner:dev-provider-set-publish-cli",
            sourceFile: "apps/runner/src/dev-provider-set-publish-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "DEVELOPMENT_PROVIDER_SET_PUBLICATION",
            binding: "DEVELOPMENT_ONLY",
            condition: "package script dev:auth:publish-provider-set"
          },
          {
            component: "apps/runner:production-database-principals-cli",
            sourceFile: "apps/runner/src/production-database-principals-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "PRODUCTION_PRINCIPAL_PROVISIONING",
            binding: "WIRED",
            condition: "package script db:provision-principals"
          },
          // Task 14b: the hosted register publication. The migrator is the only
          // principal that can execute register.publish_register_version since
          // 0065 revoked it from debateai_runtime; no new privilege is granted.
          {
            component: "apps/runner:hosted-register-publish-cli",
            sourceFile: "apps/runner/src/hosted-register-publish-cli.ts",
            environmentKey: "MIGRATION_DATABASE_URL",
            purpose: "PRODUCTION_REGISTER_PUBLICATION",
            binding: "WIRED",
            condition: "package script register:publish-hosted"
          }
        ]);
        continue;
      }
      expect(principal.superuser).toBe(false);
      expect(principal.createDatabase).toBe(false);
      expect(principal.createRole).toBe(false);
      expect(principal.ownsSchemas).toEqual([]);
      expect(principal.forbiddenMemberships)
        .toEqual(exactForbidden(principal.effectiveMemberships));
      if (principal.id === "hatchet") {
        expect(principal.ownsDatabases).toEqual(["hatchet"]);
      } else {
        expect(principal.ownsDatabases).toEqual([]);
      }
    }

    const allConnectionPurposes = [
      ...manifest.principals.flatMap(({ connectionPurposes }) => connectionPurposes),
      ...manifest.developmentOnlyPrincipalBindings,
      ...manifest.unboundConnectionPurposes
    ];
    expect(allConnectionPurposes.map(connectionShape)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))))
      .toEqual([
        { component: "apps/runner:migrate-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "MIGRATIONS_AND_ROLE_BOOTSTRAP", binding: "WIRED" },
        { component: "apps/runner:dev-database-principals-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "DEVELOPMENT_PRINCIPAL_PROVISIONING", binding: "DEVELOPMENT_ONLY", condition: "package script dev:auth:provision-principals" },
        { component: "apps/runner:dev-deployment-register-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "DEVELOPMENT_REGISTER_SEED", binding: "DEVELOPMENT_ONLY", condition: "package script dev:auth:seed-register" },
        { component: "apps/runner:dev-provider-set-publish-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "DEVELOPMENT_PROVIDER_SET_PUBLICATION", binding: "DEVELOPMENT_ONLY", condition: "package script dev:auth:publish-provider-set" },
        { component: "apps/runner:production-database-principals-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "PRODUCTION_PRINCIPAL_PROVISIONING", binding: "WIRED", condition: "package script db:provision-principals" },
        { component: "apps/runner:hosted-register-publish-cli", environmentKey: "MIGRATION_DATABASE_URL", purpose: "PRODUCTION_REGISTER_PUBLICATION", binding: "WIRED", condition: "package script register:publish-hosted" },
        { component: "apps/api", environmentKey: "DATABASE_URL", purpose: "PRODUCT_RUNTIME", binding: "WIRED" },
        { component: "apps/api", environmentKey: "DATABASE_URL", purpose: "LEGACY_ASK_ADMISSION_POOL", binding: "WIRED" },
        { component: "apps/api", environmentKey: "CONTENT_PROVISION_DATABASE_URL", purpose: "CONTENT_PROVISION", binding: "WIRED" },
        { component: "apps/api", environmentKey: "CONTENT_PROVISION_DATABASE_URL", purpose: "SERVER_ASK_ADMISSION_POOL", binding: "WIRED" },
        { component: "apps/api", environmentKey: "ERASURE_DATABASE_URL", purpose: "ACCOUNT_AND_PRIVATE_RUN_ERASURE", binding: "WIRED" },
        { component: "apps/api", environmentKey: "AUTHORIZATION_DATABASE_URL", purpose: "STEP_UP_SESSION_ROTATION", binding: "WIRED" },
        { component: "apps/api", environmentKey: "PUBLICATION_CLEANUP_DATABASE_URL", purpose: "PUBLICATION_KEY_CLEANUP", binding: "WIRED_WHEN_ENABLED", condition: "PUBLICATION_ENABLED=true" },
        { component: "apps/api", environmentKey: "SUPPORT_DATABASE_URL", purpose: "SUPPORT_DATA_PLANE", binding: "WIRED" },
        // V-3. `pnpm exec tsx apps/runner/src/rotate-kek-cli.ts` re-wraps
        // support.session_key and support.case_key under a new master key. It is
        // the same principal as the support data plane because that principal is
        // the only one granted UPDATE on those two columns (0054:884-885).
        { component: "apps/runner", environmentKey: "SUPPORT_DATABASE_URL", purpose: "SUPPORT_KEK_ROTATION", binding: "WIRED" },
        { component: "apps/runner", environmentKey: "DATABASE_URL", purpose: "RUNNER_PRODUCT_RUNTIME", binding: "WIRED" },
        { component: "apps/scheduler:replay-self-test", environmentKey: "REPLAY_SELF_TEST_DATABASE_URL", purpose: "REPLAY_SELF_TEST", binding: "WIRED" },
        { component: "apps/scheduler:liveness", environmentKey: "LIVENESS_DATABASE_URL", purpose: "LIVENESS_SWEEP", binding: "WIRED" },
        { component: "apps/scheduler:settlement", environmentKey: "SETTLEMENT_DATABASE_URL", purpose: "SETTLEMENT_WATCH", binding: "WIRED" },
        { component: "apps/evaluator-worker", environmentKey: "EVALUATOR_WORKER_DATABASE_URL", purpose: "EVALUATOR_COLLECTION", binding: "REQUIRED_NOT_WIRED" },
        { component: "apps/api:evaluator", environmentKey: "EVALUATOR_API_DATABASE_URL", purpose: "EVALUATOR_SELECTION", binding: "REQUIRED_NOT_WIRED" },
        { component: "apps/api:evaluator-dev-menu", environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL", purpose: "EVALUATOR_DEV_MENU", binding: "DEVELOPMENT_ONLY", condition: "EVALUATOR_DEV_MENU_ENABLED=true AND NODE_ENV=development" },
        { component: "operator:evaluator-reader", environmentKey: "EVALUATOR_READER_DATABASE_URL", purpose: "EVALUATOR_READ_ONLY", binding: "REQUIRED_NOT_WIRED" },
        { component: "obs-capture", environmentKey: "OBS_WRITER_DATABASE_URL", purpose: "OBS_APPEND_ONLY_CAPTURE", binding: "REQUIRED_NOT_WIRED" },
        { component: "obs-listener", environmentKey: "OBS_LISTENER_DATABASE_URL", purpose: "OBS_MACHINE_SAFE_LISTENER", binding: "REQUIRED_NOT_WIRED" },
        { component: "obs-watchdog", environmentKey: "OBS_WATCHDOG_DATABASE_URL", purpose: "OBS_WATCHDOG", binding: "REQUIRED_NOT_WIRED" },
        { component: "human:observability", environmentKey: null, purpose: "JIT_OBSERVABILITY_READ", binding: "JIT_HUMAN" },
        { component: "apps/observation-agent", environmentKey: "OBSERVATION_DATABASE_URL", purpose: "OBSERVATION_AGENT_MONITORING", binding: "WIRED" },
        { component: "operator:oactl-thresholds-apply", environmentKey: null, purpose: "OBSERVATION_THRESHOLD_RATIFICATION", binding: "WIRED" },
        { component: "operator:support-config", environmentKey: null, purpose: "JIT_SUPPORT_CONFIGURATION", binding: "JIT_HUMAN" },
        { component: "operator:support-status", environmentKey: null, purpose: "SUPPORT_STATUS_DATA", binding: "WIRED" },
        { component: "hatchet", environmentKey: "HATCHET_DATABASE_URL", purpose: "HATCHET_INTERNAL_DATABASE", binding: "EXTERNAL_COMPONENT" }
      ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
    expect(manifest.developmentOnlyPrincipalBindings).toEqual([{
      component: "apps/api:evaluator-dev-menu",
      sourceFile: "apps/api/src/main.ts",
      roleName: "debateai_dev_evaluator_api",
      capabilityRole: "debateai_evaluator_api",
      environmentKey: "EVALUATOR_DEV_MENU_DATABASE_URL",
      purpose: "EVALUATOR_DEV_MENU",
      binding: "DEVELOPMENT_ONLY",
      condition: "EVALUATOR_DEV_MENU_ENABLED=true AND NODE_ENV=development",
      provisioner: "pnpm dev:auth:provision-principals"
    }]);
    expect(manifest.unboundConnectionPurposes).toEqual([]);

    const declaredMemberships = [
      ...manifest.capabilityRoles.flatMap(({ roleName, directMemberships }) =>
        directMemberships.map((grantedRole) => ({ memberRole: roleName, grantedRole }))),
      ...manifest.principals.flatMap(({ roleName, directMemberships }) =>
        directMemberships.map((grantedRole) => ({ memberRole: roleName, grantedRole })))
    ];
    expect(manifest.membershipGrants.map(({ memberRole, grantedRole }) => ({
      memberRole, grantedRole
    }))).toEqual(declaredMemberships);
    expect(manifest.membershipGrants.every((grant) =>
      grant.adminOption === false
      && grant.inheritOption === true
      && grant.setOption === true)).toBe(true);

    expect(manifest.credentialRequirements.map(({ principalId }) => principalId))
      .toEqual(manifest.principals.map(({ id }) => id));
    expect(new Set(manifest.credentialRequirements.map(({ credentialId }) => credentialId)).size)
      .toBe(manifest.credentialRequirements.length);
    expect(manifest.credentialRequirements.every(({ ownerTicket }) => ownerTicket === "P3-02"))
      .toBe(true);
    expect(manifest.credentialRequirements.find(({ principalId }) => principalId === "migration-admin"))
      .toMatchObject({ lifecycle: "EPHEMERAL_JIT" });
    expect(manifest.credentialRequirements.find(({ principalId }) => principalId === "obs-human"))
      .toMatchObject({
        lifecycle: "JIT_SHORT_LIVED",
        ownerTicket: "P3-02"
      });
    expect(manifest.credentialRequirements.find(
      ({ principalId }) => principalId === "observation-agent"
    )).toMatchObject({
      lifecycle: "MIGRATION_MINTED_UNMANAGED",
      currentProvisioner: "migrations/0057_observation_foundation.sql",
      ownerTicket: "P3-02"
    });
    expect(manifest.credentialRequirements.find(
      ({ principalId }) => principalId === "observation-threshold-operator"
    )).toMatchObject({
      lifecycle: "MIGRATION_MINTED_UNMANAGED",
      currentProvisioner: "migrations/0071_observation_threshold_operator.sql",
      ownerTicket: "P3-02"
    });
    expect(manifest.credentialRequirements.find(
      ({ principalId }) => principalId === "api-support"
    )).toMatchObject({ lifecycle: "ROTATED_SERVICE", ownerTicket: "P3-02" });
    expect(manifest.credentialRequirements.find(
      ({ principalId }) => principalId === "support-config-operator"
    )).toMatchObject({ lifecycle: "JIT_SHORT_LIVED", ownerTicket: "P3-02" });
    expect(manifest.principals
      .filter(({ kind }) => kind === "HUMAN_READ_ONLY" || kind === "HUMAN_EXECUTE_ONLY")
      .map(({ id, roleName, database, directMemberships, effectiveMemberships }) => ({
        id, roleName, database, directMemberships, effectiveMemberships
      }))).toEqual([
        {
          id: "obs-human",
          roleName: "debateai_obs_human",
          database: "debateai",
          directMemberships: [],
          effectiveMemberships: []
        },
        {
          id: "support-config-operator",
          roleName: "debateai_prod_support_config_operator",
          database: "debateai",
          directMemberships: ["debateai_support_config_operator"],
          effectiveMemberships: ["debateai_support_config_operator"]
        }
      ]);
    expect(manifest.credentialRequirements
      .filter(({ principalId }) => /^(?:obs-writer|obs-listener|obs-watchdog)$/u.test(principalId))
      .every(({ lifecycle, currentProvisioner }) =>
        lifecycle === "MIGRATION_MINTED_UNMANAGED"
        && currentProvisioner === "migrations/0034_obs_foundation.sql")).toBe(true);

    expect(manifest.privilegeDisclosures).toEqual([
      {
        roleName: "debateai_evaluator_api",
        source: "migrations/0023_evaluator_foundation.sql",
        grants: [
        "USAGE ON SCHEMA ledger",
        "SELECT, UPDATE ON ledger.sequence_allocator",
        "EXECUTE ON FUNCTION ledger.allocate_sequence()"
        ]
      },
      {
        roleName: "debateai_evaluator_api",
        source: "migrations/0029_evaluator_dev_menu_grants.sql",
        grants: [
          "USAGE ON SCHEMA register",
          "SELECT ON register.register_row,register.register_version"
        ]
      }
    ]);
    expect(manifest.deploymentObligations.map(({ id, ownerTicket }) => ({ id, ownerTicket })))
      .toEqual([
        { id: "CREDENTIAL_MATERIAL_PAIRWISE_DISTINCT", ownerTicket: "P3-02" },
        { id: "JIT_HUMAN_CREDENTIAL_HAS_BOUNDED_EXPIRY", ownerTicket: "P3-02" },
        { id: "SAME_ENVIRONMENT_KEY_ACROSS_COMPONENTS_USES_DISTINCT_CREDENTIALS", ownerTicket: "P3-02" }
      ]);
    expect(manifest.deploymentObligations.every(({ requiredEvidence }) =>
      requiredEvidence.trim().length > 0)).toBe(true);
    expect(manifest.invariants).toEqual([
      "NO_LONG_LIVED_SUPERUSER_CREDENTIAL",
      "SERVICE_ROLE_NAMES_PAIRWISE_DISTINCT",
      "SERVICE_PRINCIPALS_OWN_NO_DEBATEAI_DATABASE_OR_SCHEMA",
      "DIRECT_MEMBERSHIPS_EXACT_NO_GRANT_OPTION",
      "NO_SERVICE_TO_SERVICE_MEMBERSHIP",
      "NO_PREDEFINED_PG_ROLE_MEMBERSHIP_EXCEPT_OBSERVATION_AGENT_PG_MONITOR",
      "AUTHORIZATION_EFFECTIVE_MEMBERSHIP_IS_AUTHORIZATION_PLUS_RUNTIME_ONLY",
      "PRODUCTION_EVALUATOR_DEV_MENU_FORBIDDEN"
    ]);
  });

  it("maps the manifest to current migrations and executable connection seams without inventing completion", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
    const migrationPaths = (await readdir("migrations"))
      .filter((path) => path.endsWith(".sql"))
      .sort()
      .map((path) => `migrations/${path}`);
    const [
      migrations,
      runtimeEnvironment,
      apiMain,
      runnerMain,
      schedulerCli,
      observationMain,
      membershipProvisioner
    ] = await Promise.all([
      Promise.all(migrationPaths.map((path) => readFile(path, "utf8")))
        .then((sources) => sources.join("\n")),
      readFile("packages/register/src/runtime-environment.ts", "utf8"),
      readFile("apps/api/src/main.ts", "utf8"),
      readFile("apps/runner/src/main.ts", "utf8"),
      readFile("apps/scheduler/src/cli.ts", "utf8"),
      readFile("apps/observation-agent/src/main.ts", "utf8"),
      readFile("apps/runner/src/dev-database-principals.ts", "utf8")
    ]);

    const literalCreatedRoles = [...migrations.matchAll(
      /\bCREATE\s+ROLE\s+"?(debateai_[a-z0-9_]+)"?/giu
    )].map(([, role]) => role!);
    const dynamicallyCreatedObsRoles = [...migrations.matchAll(
      /\('(debateai_[a-z0-9_]+)',\s*'debateai\.[a-z0-9_.]+_password'\)/giu
    )].map(([, role]) => role!);
    const directDynamicRoles = [...migrations.matchAll(
      /format\(\s*'CREATE\s+ROLE\s+%I[^']*'\s*,\s*'(debateai_[a-z0-9_]+)'/giu
    )].map(([, role]) => role!);
    const createRoleSiteCount = [...migrations.matchAll(/\bCREATE\s+ROLE\b/giu)].length;
    expect(createRoleSiteCount).toBe(literalCreatedRoles.length + 1);
    const sourceCreatedRoles = [...new Set([
      ...literalCreatedRoles, ...dynamicallyCreatedObsRoles, ...directDynamicRoles
    ])].sort();
    const manifestMigrationRoles = [
      ...manifest.capabilityRoles.map(({ roleName }) => roleName),
      ...manifest.ownershipRoles.map(({ roleName }) => roleName),
      ...manifest.principals
        .map(({ roleName }) => roleName)
        .filter((roleName) => /^(?:debateai_obs_(?:writer|listener|watchdog|human)|debateai_observation_agent|debateai_observation_threshold_operator)$/u.test(roleName))
    ].sort();
    expect(sourceCreatedRoles).toEqual(manifestMigrationRoles);

    const sourceDatabaseKeys = [...new Set([
      ...`${runtimeEnvironment}\n${observationMain}`.matchAll(
        /\b(?:[A-Z][A-Z0-9_]*_)?DATABASE_URL\b/gu
      )
    ].map(([key]) => key))].sort();
    const allConnectionPurposes = [
      ...manifest.principals.flatMap(({ connectionPurposes }) => connectionPurposes),
      ...manifest.developmentOnlyPrincipalBindings,
      ...manifest.unboundConnectionPurposes
    ];
    const executableBindings = [
      "WIRED", "WIRED_WHEN_ENABLED", "DEVELOPMENT_ONLY", "DEVELOPMENT_ONLY_UNBOUND"
    ];
    const executableManifestKeys = [...new Set(allConnectionPurposes
      .filter(({ binding }) => executableBindings.includes(binding))
      .map(({ environmentKey }) => environmentKey)
      .filter((key): key is string => key !== null))].sort();
    expect(sourceDatabaseKeys).toEqual(executableManifestKeys);

    const appSourceRoots = [
      "apps/api/src",
      "apps/runner/src",
      "apps/scheduler/src"
    ];
    const appSourcePaths = (await Promise.all(appSourceRoots.map(async (root) =>
      (await readdir(root, { recursive: true }))
        .filter((path) => path.endsWith(".ts"))
        .map((path) => `${root}/${path}`)))).flat()
      .concat("apps/observation-agent/src/main.ts");
    const sourceConnectionPairs: string[] = [];
    for (const sourceFile of appSourcePaths) {
      const source = await readFile(sourceFile, "utf8");
      if (!source.includes("createPool") && !source.includes("new pg.Pool")) continue;
      for (const [environmentKey] of source.matchAll(
        /\b(?:[A-Z][A-Z0-9_]*_)?DATABASE_URL\b/gu
      )) sourceConnectionPairs.push(`${sourceFile}::${environmentKey}`);
    }
    const manifestConnectionPairs = allConnectionPurposes
      .filter(({ binding }) => executableBindings.includes(binding))
      .filter(({ environmentKey }) => environmentKey !== null)
      .map(({ sourceFile, environmentKey }) => `${String(sourceFile)}::${String(environmentKey)}`);
    expect([...new Set(sourceConnectionPairs)].sort())
      .toEqual([...new Set(manifestConnectionPairs)].sort());

    expect(apiMain).toContain("createPool(environment.DATABASE_URL)");
    expect(apiMain).toContain("createPool(environment.CONTENT_PROVISION_DATABASE_URL)");
    expect(apiMain).toContain("createPool(environment.ERASURE_DATABASE_URL)");
    expect(apiMain).toContain("createPool(environment.AUTHORIZATION_DATABASE_URL!)");
    expect(apiMain).toContain("createPool(environment.PUBLICATION_CLEANUP_DATABASE_URL!)");
    expect(apiMain).toContain("createPool(environment.SUPPORT_DATABASE_URL)");
    expect(apiMain).toContain("createPool(environment.EVALUATOR_DEV_MENU_DATABASE_URL!)");
    expect(runnerMain).toContain("createPool(environment.DATABASE_URL)");
    expect(schedulerCli).toContain("REPLAY_SELF_TEST_DATABASE_URL");
    expect(schedulerCli).toContain("LIVENESS_DATABASE_URL");
    expect(schedulerCli).toContain("SETTLEMENT_DATABASE_URL");
    expect(observationMain).toContain(
      "connectionString: environment.OBSERVATION_DATABASE_URL"
    );
    expect(runtimeEnvironment).toContain(
      'environment.EVALUATOR_DEV_MENU_ENABLED === "true" && environment.NODE_ENV !== "development"'
    );
    expect(membershipProvisioner).toContain("WITH INHERIT TRUE, SET TRUE");

    expect(migrations).toContain("GRANT USAGE ON SCHEMA register TO debateai_evaluator_api");
    expect(migrations).toContain(
      "GRANT SELECT ON register.register_row,register.register_version TO debateai_evaluator_api"
    );
    expect(migrations).toContain("GRANT USAGE ON SCHEMA ledger TO debateai_evaluator_api");
    expect(migrations).toContain(
      "GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_evaluator_api"
    );
    expect(migrations).toContain(
      "GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_evaluator_api"
    );
    const sourceEvaluatorCrossSchemaGrants = [...migrations.matchAll(
      /\bGRANT\s+[\s\S]*?;/giu
    )].map(([statement]) => statement.replace(/\s+/gu, " ").trim())
      .filter((statement) => {
        if (!/\bTO\s+[^;]*\bdebateai_evaluator_api\b/iu.test(statement)) return false;
        const qualifiedSchemas = [...statement.matchAll(
          /\b([a-z_][a-z0-9_]*)\./gu
        )].map(([, schema]) => schema!);
        const schemaList = statement.match(/\bON\s+SCHEMA\s+(.+?)\s+TO\b/iu)?.[1]
          ?.split(",").map((schema) => schema.trim()) ?? [];
        return [...qualifiedSchemas, ...schemaList]
          .some((schema) => schema !== "evaluator");
      })
      .sort();
    const manifestEvaluatorCrossSchemaGrants = manifest.privilegeDisclosures
      .flatMap(({ roleName, grants }) => grants.map((grant) =>
        `GRANT ${grant} TO ${roleName};`))
      .sort();
    expect(sourceEvaluatorCrossSchemaGrants).toEqual(manifestEvaluatorCrossSchemaGrants);
    expect(migrations).toContain("CREATE ROLE debateai_erasure_runtime NOLOGIN NOINHERIT");
    expect(migrations).toContain("CREATE ROLE debateai_publication_cleanup NOLOGIN NOINHERIT");
    expect(migrations).toContain("CREATE ROLE debateai_content_provision NOLOGIN NOINHERIT");

    expect(runtimeEnvironment).not.toContain("EVALUATOR_WORKER_DATABASE_URL");
    expect(runtimeEnvironment).not.toContain("EVALUATOR_API_DATABASE_URL");
    expect(runtimeEnvironment).not.toContain("EVALUATOR_READER_DATABASE_URL");
    expect(runtimeEnvironment).not.toContain("OBS_WRITER_DATABASE_URL");
    expect(runtimeEnvironment).not.toContain("OBS_LISTENER_DATABASE_URL");
    expect(runtimeEnvironment).not.toContain("OBS_WATCHDOG_DATABASE_URL");
    const sourceSchemas = [...new Set([...migrations.matchAll(
      /\bCREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)/giu
    )].map(([, schema]) => schema!))].sort();
    const manifestSchemas = [...new Set([
      ...manifest.principals.flatMap(({ ownsSchemas }) => ownsSchemas),
      ...manifest.ownershipRoles.flatMap(({ ownsSchemas }) => ownsSchemas)
    ])].sort();
    expect(sourceSchemas).toEqual(manifestSchemas);
    expect(migrations.replace(/\s+/gu, " ")).toContain(
      "CREATE SCHEMA IF NOT EXISTS evaluator AUTHORIZATION debateai_evaluator_ddl"
    );
    expect(migrations.replace(/\s+/gu, " ")).toContain(
      "ALTER VIEW obs.run_correlation_v OWNER TO debateai_obs_view_owner"
    );

    // V-29: the net predefined-role grants across all migrations are exactly the ones
    // the manifest declares — on ownership roles only, never on a principal. GRANT and
    // REVOKE statements are replayed in migration order (`migrations` is the sorted
    // files joined in order, the order migrate() applies them), so a re-grant after a
    // revoke stays visible. 0059's pg_monitor grant is revoked by 0068.
    const netPredefined = new Set<string>();
    const revokedPredefinedInOrder: string[] = [];
    for (const [, verb, grantedRole, memberRole] of migrations.matchAll(
      /\b(GRANT|REVOKE)\s+(pg_[a-z_]+)\s+(?:TO|FROM)\s+(debateai_[a-z0-9_]+)\b/giu
    )) {
      const pair = `${memberRole!}:${grantedRole!}`;
      if (verb!.toUpperCase() === "GRANT") {
        netPredefined.add(pair);
      } else {
        netPredefined.delete(pair);
        revokedPredefinedInOrder.push(pair);
      }
    }
    const netPredefinedGrants = [...netPredefined].sort();
    const declaredPredefinedGrants = [
      ...manifest.ownershipRoles.flatMap(({ roleName, directMemberships }) =>
        directMemberships.map((granted) => `${roleName}:${granted}`)),
      ...manifest.principals.flatMap(({ roleName, directMemberships }) =>
        directMemberships.map((granted) => `${roleName}:${granted}`))
    ].filter((pair) => pair.includes(":pg_")).sort();
    expect(netPredefinedGrants).toEqual(declaredPredefinedGrants);
    expect(netPredefinedGrants).toEqual(["debateai_obs_stats_owner:pg_read_all_stats"]);
    expect(revokedPredefinedInOrder).toEqual(["debateai_observation_agent:pg_monitor"]);
    expect(migrations.replace(/\s+/gu, " ")).toContain(
      "ALTER FUNCTION obs.postgres_capacity(double precision,double precision) OWNER TO debateai_obs_stats_owner"
    );
    expect(manifest.status).toBe("MIXED_PROVISIONING_STATE");
  });
});
