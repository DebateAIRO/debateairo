/**
 * Complete, valid process environments for the API and runner compositions.
 * Every value is loopback/dev-safe so a fixture parses in any NODE_ENV; tests
 * override single keys to exercise one refusal at a time (never process.env).
 *
 * V-9(c): `DEBATEAI_DEPLOYMENT_MODE` is `local` for the same reason — local is
 * the loopback-safe deployment, and a fixture that silently claimed `hosted`
 * would put every other refusal behind the hosted provider rules.
 *
 * Side-by-side §1: `RELEASE_KEY` names `REGISTER_VERSION` ("1"), so a test that moves the version moves the key too.
 * Built from its two parts, so no line pairs a *_KEY name with a literal (gitleaks).
 */
const FIXTURE_RELEASE_KEY = fixtureReleaseKey(1);

/**
 * Side-by-side §1: the release key a hand-built environment carries for its own `REGISTER_VERSION`
 * (`r<version>-0123456789ab`), so its number always matches the version beside it.
 */
export function fixtureReleaseKey(registerVersion: string | number): string {
  return [`r${registerVersion}`, "0123456789ab"].join("-");
}

export function validApiEnvironmentFixture(): Record<string, string> {
  return {
    DEBATEAI_DEPLOYMENT_MODE: "local",
    KEK_PATH: "/run/secrets/kek",
    SUPPORT_KEK_PATH: "/run/secrets/support-kek",
    BLIND_INDEX_KEY_PATH: "/run/secrets/email-blind-index",
    RECORDS_KEY_PATH: "/run/secrets/records-key",
    AUDIT_KEY_STORE_PATH: "/run/secrets/audit-users",
    AUDIT_SOURCE_IP_SALT_PATH: "/run/secrets/audit-source-ip",
    USER_DEK_STORE_PATH: "/run/secrets/user-deks",
    CONTENT_ENCRYPTION_ENABLED: "true",
    MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
    MAIL_FROM: "noreply@debateai.test",
    PUBLIC_APP_URL: "https://debateai.test",
    DATABASE_URL: "postgresql://api:pass@127.0.0.1:5432/debateai",
    SUPPORT_DATABASE_URL: "postgresql://support:pass@127.0.0.1:5432/debateai",
    AUTHORIZATION_DATABASE_URL: "postgresql://authorization:pass@127.0.0.1:5432/debateai",
    // Row-level security S01 (PLAN S2.5): the API's two system logins, each its own URL.
    API_SYSTEM_DATABASE_URL: "postgresql://api_system:pass@127.0.0.1:5432/debateai",
    API_AUTHORIZATION_SYSTEM_DATABASE_URL: "postgresql://authorization_system:pass@127.0.0.1:5432/debateai",
    ERASURE_DATABASE_URL: "postgresql://erasure:pass@127.0.0.1:5432/debateai",
    CONTENT_PROVISION_DATABASE_URL: "postgresql://content:pass@127.0.0.1:5432/debateai",
    ACCOUNT_ERASURE_GRACE_MS: "604800000",
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    STRANGER_SAMPLE_RATE: "0.1",
    REGISTER_VERSION: "1",
    BATTERY_VERSION: "fixture",
    SETTLEMENT_WATCH_HANDLE: "fixture",
    HATCHET_CLIENT_TOKEN: "fixture",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8080",
    HATCHET_TENANT_ID: "fixture",
    HATCHET_WORKFLOW_NAME: "fixture",
    HATCHET_TLS_STRATEGY: "none",
    RELEASE_KEY: FIXTURE_RELEASE_KEY
  };
}

export function validRunnerEnvironmentFixture(): Record<string, string> {
  return {
    DEBATEAI_DEPLOYMENT_MODE: "local",
    KEK_PATH: "/run/secrets/kek",
    DATABASE_URL: "postgresql://runner:pass@127.0.0.1:5432/debateai",
    RUNNER_WORKER_ID: "fixture",
    REGISTER_VERSION: "1",
    CONTENT_ENCRYPTION_ENABLED: "true",
    USER_DEK_STORE_PATH: "/run/secrets/user-deks",
    CLAIM_MS: "1000",
    CLAIM_MARGIN_MS: "100",
    JUDGE_MAX_ATTEMPTS: "2",
    JUDGE_TOKEN_CEILING: "1000",
    JUDGE_DEADLINE_MS: "1000",
    COMPOSER_MAX_ATTEMPTS: "2",
    COMPOSER_TOKEN_CEILING: "1000",
    COMPOSER_DEADLINE_MS: "1000",
    CONFORMANCE_MAX_ATTEMPTS: "2",
    CONFORMANCE_TOKEN_CEILING: "1000",
    CONFORMANCE_DEADLINE_MS: "1000",
    PROVIDER_REF: "fixture",
    JUDGE_CONTRACT_HASH: "fixture",
    COMPOSER_CONTRACT_HASH: "fixture",
    CONFORMANCE_CONTRACT_HASH: "fixture",
    PROPAGATION_CONTRACT_HASH: "fixture",
    SERVE_CONTRACT_HASH: "fixture",
    MAX_RECOMPOSE: "1",
    FACT_BUNDLE_VERSION: "1",
    JUDGEMENT_NUMBER_KIND: "fixture",
    JUDGEMENT_PRODUCER: "fixture",
    PROPAGATION_NUMBER_KIND: "fixture",
    PROPAGATION_PRODUCER: "fixture",
    HATCHET_ENGINE_RETRIES: "0",
    HATCHET_WORKER_NAME: "fixture",
    VLLM_BASE_URL: "http://127.0.0.1:8000",
    VLLM_MODEL: "fixture",
    VLLM_MAKER: "fixture",
    HATCHET_CLIENT_TOKEN: "fixture",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8080",
    HATCHET_TENANT_ID: "fixture",
    HATCHET_WORKFLOW_NAME: "fixture",
    HATCHET_TLS_STRATEGY: "none",
    RELEASE_KEY: FIXTURE_RELEASE_KEY
  };
}
