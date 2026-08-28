import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (relativePath: string): Promise<string> =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

interface LocalAuthTopology {
  readonly format: string;
  readonly status: string;
  readonly commands: Readonly<Record<string, string>>;
  readonly publicOrigin: {
    readonly url: string;
    readonly plainHttpForbidden: boolean;
    readonly trustStoreMutationAllowed: boolean;
  };
  readonly services: readonly {
    readonly id: string;
    readonly endpoints: readonly string[];
    readonly exposure: string;
  }[];
  readonly persistentPaths: readonly {
    readonly id: string;
    readonly path: string;
    readonly mode: string;
  }[];
  readonly principals: readonly {
    readonly id: string;
    readonly login: boolean;
    readonly attributes: readonly string[];
    readonly memberships: readonly string[];
    readonly forbiddenMemberships: readonly string[];
    readonly owns: readonly string[];
    readonly purpose: readonly string[];
    readonly serviceCredential: boolean;
  }[];
  readonly startupOrder: readonly string[];
  readonly bootAttestations: readonly string[];
  readonly invariants: readonly string[];
}

describe("DEV-01 local-auth topology specification", () => {
  it("defines an exact partially implemented topology without advertising a complete stack", async () => {
    const [raw, documentation, packageText] = await Promise.all([
      source("docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.json"),
      source("docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md"),
      source("package.json")
    ]);
    const topology = JSON.parse(raw) as LocalAuthTopology;
    const packageJson = JSON.parse(packageText) as { readonly scripts: Readonly<Record<string, string>> };

    expect(topology.format).toBe("debateai.local-auth-topology.v1");
    expect(topology.status).toBe("SPECIFIED_NOT_IMPLEMENTED");
    expect(topology.commands).toEqual({
      up: "pnpm dev:auth:up",
      stop: "pnpm dev:auth:stop",
      reset: "pnpm dev:auth:reset --confirm DELETE_LOCAL_AUTH_DATA"
    });
    expect(packageJson.scripts["dev:auth:up"])
      .toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(documentation).toContain("SPECIFIED, PARTIALLY IMPLEMENTED");
    expect(documentation).toContain("`pnpm dev:auth:seed-register`");
    expect(documentation).toContain("`pnpm dev:auth:up`");

    expect(topology.publicOrigin).toEqual({
      url: "https://localhost:3000",
      plainHttpForbidden: true,
      trustStoreMutationAllowed: false
    });
    expect(Object.fromEntries(topology.services.map((service) => [service.id, service.endpoints])))
      .toEqual({
        "tls-front-door": ["https://127.0.0.1:3000"],
        ui: ["http://127.0.0.1:3001"],
        api: ["http://127.0.0.1:8790"],
        postgres: ["postgresql://127.0.0.1:55432/debateai", "postgresql://127.0.0.1:55432/hatchet"],
        hatchet: ["http://127.0.0.1:8888", "grpc://127.0.0.1:7077"],
        "mail-capture": []
      });
    expect(topology.services.filter((service) => service.exposure === "PUBLIC_LOOPBACK")
      .map((service) => service.id)).toEqual(["tls-front-door"]);

    expect(topology.persistentPaths).toEqual([
      { id: "root", path: ".local/dev-auth", mode: "0700" },
      { id: "postgres", path: ".local/dev-auth/postgres", mode: "0700" },
      { id: "database-principals", path: ".local/dev-auth/database-principals.env", mode: "0600" },
      { id: "operator-env", path: ".local/dev-auth/operator.env", mode: "0600" },
      { id: "secrets", path: ".local/dev-auth/secrets", mode: "0700" },
      { id: "audit-keys", path: ".local/dev-auth/audit-keys", mode: "0700" },
      { id: "user-deks", path: ".local/dev-auth/user-deks", mode: "0700" },
      { id: "mail", path: ".local/dev-auth/mail", mode: "0700" },
      { id: "tls", path: ".local/dev-auth/tls", mode: "0700" }
    ]);

    expect(topology.principals).toEqual([
      {
        id: "debateai_dev_migrator", login: true,
        attributes: ["INHERIT", "SUPERUSER", "CREATEDB", "CREATEROLE"],
        memberships: [], forbiddenMemberships: [],
        owns: [
          "database:debateai", "schema:audit_crypto_internal", "schema:core", "schema:evidence",
          "schema:identity", "schema:ledger", "schema:memory", "schema:obs",
          "schema:register", "schema:scorecard", "schema:serve"
        ],
        purpose: ["PRINCIPAL_BOOTSTRAP", "MIGRATIONS", "REGISTER_SEED"], serviceCredential: false
      },
      {
        id: "debateai_dev_runtime", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_runtime"],
        forbiddenMemberships: ["debateai_content_provision", "debateai_erasure_runtime", "pg_*"], owns: [],
        purpose: ["DATABASE_URL", "LEGACY_ASK_ADMISSION_POOL"], serviceCredential: true
      },
      {
        id: "debateai_dev_content_provision", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_content_provision"],
        forbiddenMemberships: ["debateai_runtime", "debateai_erasure_runtime", "pg_*"], owns: [],
        purpose: ["CONTENT_PROVISION_DATABASE_URL", "SERVER_ASK_ADMISSION_POOL"], serviceCredential: true
      },
      {
        id: "debateai_dev_erasure", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_erasure_runtime"],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "pg_*"], owns: [],
        purpose: ["ERASURE_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_authorization", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_authorization_runtime"],
        forbiddenMemberships: ["debateai_content_provision", "debateai_erasure_runtime", "debateai_publication_cleanup", "debateai_replay", "debateai_settlement_watch", "pg_*"], owns: [],
        purpose: ["AUTHORIZATION_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_publication_cleanup", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_publication_cleanup"],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "debateai_erasure_runtime", "debateai_authorization_runtime", "debateai_replay", "debateai_settlement_watch", "pg_*"], owns: [],
        purpose: ["PUBLICATION_CLEANUP_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_replay", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_replay"],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "debateai_erasure_runtime", "debateai_authorization_runtime", "debateai_publication_cleanup", "debateai_settlement_watch", "pg_*"], owns: [],
        purpose: ["REPLAY_SELF_TEST_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_liveness", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_runtime"],
        forbiddenMemberships: ["debateai_content_provision", "debateai_erasure_runtime", "debateai_authorization_runtime", "debateai_publication_cleanup", "debateai_replay", "debateai_settlement_watch", "pg_*"], owns: [],
        purpose: ["LIVENESS_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_settlement", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_settlement_watch"],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "debateai_erasure_runtime", "debateai_authorization_runtime", "debateai_publication_cleanup", "debateai_replay", "pg_*"], owns: [],
        purpose: ["SETTLEMENT_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_evaluator_api", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: ["debateai_evaluator_api"],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "debateai_erasure_runtime", "debateai_authorization_runtime", "debateai_publication_cleanup", "debateai_replay", "debateai_settlement_watch", "debateai_evaluator_worker", "debateai_evaluator_reader", "pg_*"],
        owns: [],
        purpose: ["EVALUATOR_DEV_MENU_DATABASE_URL"], serviceCredential: true
      },
      {
        id: "debateai_dev_hatchet", login: true,
        attributes: ["INHERIT", "NOSUPERUSER", "NOCREATEDB", "NOCREATEROLE", "NOREPLICATION", "NOBYPASSRLS"],
        memberships: [],
        forbiddenMemberships: ["debateai_runtime", "debateai_content_provision", "debateai_erasure_runtime", "pg_*"],
        owns: ["database:hatchet"], purpose: ["HATCHET_DATABASE_URL"], serviceCredential: true
      }
    ]);

    expect(topology.startupOrder).toEqual([
      "PREFLIGHT", "PERSISTENT_PATHS", "POSTGRES", "MIGRATIONS_REPLAY", "APPLICATION_PRINCIPALS",
      "REGISTER_SEED", "SECRETS", "HATCHET", "MAIL_CAPTURE", "API", "UI", "TLS_FRONT_DOOR",
      "BOOT_ATTESTATIONS"
    ]);
    expect(topology.bootAttestations).toEqual(expect.arrayContaining([
      "TLS_CERT_TRUSTED_FOR_LOCALHOST",
      "PUBLIC_APP_URL_EXACT_HTTPS_ORIGIN",
      "MIGRATIONS_FRESH_AND_REPLAY_SAFE",
      "REGISTER_COMPLETE_AND_SEALED",
      "RUNTIME_ROLE_EXACT",
      "CONTENT_PROVISION_ROLE_EXACT",
      "ERASURE_ROLE_EXACT",
      "AUTHORIZATION_ROLE_EXACT",
      "PUBLICATION_CLEANUP_ROLE_EXACT",
      "REPLAY_ROLE_EXACT",
      "LIVENESS_ROLE_EXACT",
      "SETTLEMENT_ROLE_EXACT",
      "DATABASE_URL_PRINCIPALS_DISTINCT",
      "SECRET_FILES_0600_AND_32_RAW_BYTES",
      "SECRET_STORES_0700",
      "MAIL_CAPTURE_EXECUTABLE_AND_WRITABLE",
      "HATCHET_TOKEN_WORKFLOW_REACHABLE",
      "SECURE_COOKIE_CONFIGURATION_ATTESTED",
      "UNAUTHENTICATED_ORIGIN_CSRF_NEGATIVE_PROBE"
    ]));
    expect(topology.invariants).toEqual(expect.arrayContaining([
      "NO_SEEDED_ACCOUNT",
      "NO_ACCEPTANCE_SERVER",
      "NO_PLAINTEXT_HTTP_FALLBACK",
      "NO_SHARED_DATABASE_LOGIN",
      "NO_SECRET_IN_REPOSITORY_OR_COMMAND_OUTPUT",
      "STOP_IS_NON_DESTRUCTIVE",
      "RESET_IS_SEPARATE_AND_CONFIRMATION_GATED"
    ]));
  });

  it("matches the current runtime security facts without weakening them", async () => {
    const [environment, apiMain, uiServer, compose, evaluatorMigration] = await Promise.all([
      source("packages/register/src/runtime-environment.ts"),
      source("apps/api/src/main.ts"),
      source("apps/ui/server.mjs"),
      source("compose.dev.yaml"),
      source("migrations/0023_evaluator_foundation.sql")
    ]);

    expect(environment).toContain("value.startsWith(\"https://\")");
    expect(environment).toContain("CONTENT_PROVISION_DATABASE_URL_MUST_BE_SEPARATE");
    expect(environment).toContain("ERASURE_DATABASE_URL_MUST_BE_SEPARATE");
    expect(apiMain).toContain("assertContentProvisionDatabaseRole(pool,contentProvisionPool)");
    expect(apiMain).toContain("assertAccountErasureDatabaseRole(pool,erasurePool)");
    expect(apiMain).toContain("environment.MAIL_SENDMAIL_PATH");
    expect(uiServer).toContain('process.env.PORT?.trim() || "3000"');
    expect(compose).toContain('"8888:8888"');
    expect(compose).toContain('"7077:7077"');
    expect(evaluatorMigration).toContain(
      "CREATE SCHEMA IF NOT EXISTS evaluator AUTHORIZATION debateai_evaluator_ddl"
    );
  });
});
