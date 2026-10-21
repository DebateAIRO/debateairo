import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fixtureReleaseKey } from "../support/apiEnvironmentFixture.js";
import { assertProductionFloors, parseApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import { DEVELOPMENT_API_ENVIRONMENT_KEYS } from "../../apps/runner/src/dev-api-environment.js";

function apiSource(): Record<string, string> {
  return {
    KEK_PATH: "/tmp/dx-kek", SUPPORT_KEK_PATH: "/tmp/dx-support-kek",
    BLIND_INDEX_KEY_PATH: "/tmp/dx-blind", RECORDS_KEY_PATH: "/tmp/dx-records",
    AUDIT_KEY_STORE_PATH: "/tmp/dx-audit", AUDIT_SOURCE_IP_SALT_PATH: "/tmp/dx-salt",
    USER_DEK_STORE_PATH: "/tmp/dx-user-deks",
    CONTENT_PROVISION_DATABASE_URL: "postgresql://localhost/content",
    AUTHORIZATION_DATABASE_URL: "postgresql://localhost/authorization",
    ERASURE_DATABASE_URL: "postgresql://localhost/erasure",
    DATABASE_URL: "postgresql://localhost/main",
    SUPPORT_DATABASE_URL: "postgresql://localhost/support",
    ACCOUNT_ERASURE_GRACE_MS: "604800000", MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
    MAIL_FROM: "noreply@example.test", PUBLIC_APP_URL: "https://example.test",
    API_HOST: "127.0.0.1", API_PORT: "8790", STRANGER_SAMPLE_RATE: "0",
    REGISTER_VERSION: "1", RELEASE_KEY: fixtureReleaseKey("1"), BATTERY_VERSION: "test", SETTLEMENT_WATCH_HANDLE: "test",
    HATCHET_CLIENT_TOKEN: "test", HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8888", HATCHET_TENANT_ID: "test",
    HATCHET_WORKFLOW_NAME: "test", HATCHET_TLS_STRATEGY: "none", NODE_ENV: "test"
  };
}

describe("data export worker principal contract", () => {
  it("DW1 requires a worker URL when export storage is enabled and permits neither key", () => {
    expect(() => parseApiEnvironment({ ...apiSource(), DATA_EXPORT_STORE_PATH: "/tmp/export" }))
      .toThrow("DATA_EXPORT_DATABASE_URL_REQUIRED");
    const disabled = parseApiEnvironment(apiSource());
    expect(disabled.DATA_EXPORT_STORE_PATH).toBeUndefined();
    expect(disabled.DATA_EXPORT_DATABASE_URL).toBeUndefined();
  });

  it("DW2 separates the worker URL from all seven other database URLs and enforces TLS", () => {
    const source = apiSource();
    source.PUBLICATION_CLEANUP_DATABASE_URL = "postgresql://localhost/publication";
    source.EVALUATOR_DEV_MENU_DATABASE_URL = "postgresql://localhost/evaluator";
    const distinct = "postgresql://localhost/data-export";
    for (const key of ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "CONTENT_PROVISION_DATABASE_URL",
      "PUBLICATION_CLEANUP_DATABASE_URL", "ERASURE_DATABASE_URL", "SUPPORT_DATABASE_URL", "EVALUATOR_DEV_MENU_DATABASE_URL"]) {
      expect(() => parseApiEnvironment({ ...source, DATA_EXPORT_STORE_PATH: "/tmp/export", DATA_EXPORT_DATABASE_URL: source[key]! }), key)
        .toThrow("DATA_EXPORT_DATABASE_URL_MUST_BE_SEPARATE");
    }
    expect(parseApiEnvironment({ ...source, DATA_EXPORT_STORE_PATH: "/tmp/export", DATA_EXPORT_DATABASE_URL: distinct }).DATA_EXPORT_DATABASE_URL)
      .toBe(distinct);
    expect(() => assertProductionFloors({ NODE_ENV: "production", DATA_EXPORT_DATABASE_URL: "postgresql://x:y@10.0.0.5:5432/debateai" }))
      .toThrow("DATABASE_URL_TLS_REQUIRED:DATA_EXPORT_DATABASE_URL");
  });

  it("DW3 maps the last local dev principal to the worker capability and API key", () => {
    expect(DEVELOPMENT_DATABASE_PRINCIPALS.at(-1)).toEqual({
      roleName: "debateai_dev_data_export", capabilityRole: "debateai_data_export_worker", environmentKey: "DATA_EXPORT_DATABASE_URL"
    });
    expect(DEVELOPMENT_API_ENVIRONMENT_KEYS).toContain("DATA_EXPORT_DATABASE_URL");
  });

  it("DW4 documents the production worker URL and its API principal", async () => {
    const example = await readFile(new URL("../../deploy/vps/env/api.env.example", import.meta.url), "utf8");
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    expect(example).toContain("DATA_EXPORT_DATABASE_URL=postgresql://debateai_prod_api_data_export:<data-export-password>@localhost/debateai?host=/var/run/postgresql");
    expect(readme).toContain("| `api.env` `DATA_EXPORT_DATABASE_URL` | `api-data-export` |");
  });
});
