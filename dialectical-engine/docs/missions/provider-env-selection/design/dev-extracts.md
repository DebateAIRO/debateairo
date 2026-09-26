# Measured extracts from `origin/dev` @ 776359c3 (orchestrator, 2026-09-24 13:31 EEST; every line `path:LINE — text`, taken with `git show origin/dev:./<path> | grep -n` at write time — the REQ seat cites these and re-greps in its lane before leaning on one)

## `apps/runner/src/provider-topology.ts` (78 lines) — `grep -n -E '^export|provider_ref|base_url|authorization|development:|production:'`
- `apps/runner/src/provider-topology.ts:3` — `export type RunnerProviderMember = Readonly<{`
- `apps/runner/src/provider-topology.ts:9` — `export function createRunnerProviderTopology(`
- `apps/runner/src/provider-topology.ts:51` — `export function assertRunnerPrimaryProviderConfiguration(input: Readonly<{`
- `apps/runner/src/provider-topology.ts:70` — `      || firstTarget?.authorizationHeader !== declared.VLLM_AUTHORIZATION) {`

## `packages/register/src/configured-provider-set.ts` (196 lines) — `grep -n -E '^export|provider_ref|MISMATCH|parse|publish'`
- `packages/register/src/configured-provider-set.ts:10` — ` * sealed shape every deployment published before this ruling and it stays as`
- `packages/register/src/configured-provider-set.ts:21` — `export const CONFIGURED_PROVIDER_SET_ROW_KEY = "configuredProviderSet" as const;`
- `packages/register/src/configured-provider-set.ts:22` — `export const CONFIGURED_PROVIDER_SET_SEALED_VERSION = 1 as const;`
- `packages/register/src/configured-provider-set.ts:23` — `export const CONFIGURED_PROVIDER_SET_DEPLOYMENT_VERSION = 2 as const;`
- `packages/register/src/configured-provider-set.ts:26` — `export const CONFIGURED_PROVIDER_SET_DEPLOYMENT_SOURCE_REF =`
- `packages/register/src/configured-provider-set.ts:30` — `export type ConfiguredProvider = Readonly<{`
- `packages/register/src/configured-provider-set.ts:41` — `export type ConfiguredProviderVetting = Readonly<{`
- `packages/register/src/configured-provider-set.ts:47` — `export type VettedConfiguredProvider = ConfiguredProvider & Readonly<{`
- `packages/register/src/configured-provider-set.ts:51` — `export type ConfiguredProviderSetRow = Readonly<{`
- `packages/register/src/configured-provider-set.ts:103` — ` * The SEALED version-1 value, exactly as every deployment published it before`
- `packages/register/src/configured-provider-set.ts:106` — ` * nothing; it is never the row a hosted deployment publishes.`
- `packages/register/src/configured-provider-set.ts:108` — `export function buildConfiguredProviderSetSealedRow(`
- `packages/register/src/configured-provider-set.ts:134` — ` * whose record is missing, and publish it. So the same question is asked again`
- `packages/register/src/configured-provider-set.ts:136` — ` * `RegisterPublicationPort.publishGeneral`, for HOSTED publications only.`

## `apps/runner/src/dev-provider-set-publish-cli.ts` (31 lines) — `grep -n -E '^(import|export|const|async function|function)|process\.env|DEV_|dev-only|NODE_ENV|configuredProviderSet'`
- `apps/runner/src/dev-provider-set-publish-cli.ts:4` — `import { createPool } from "@debateai/db";`
- `apps/runner/src/dev-provider-set-publish-cli.ts:5` — `import { loadMigrationEnvironment, parseRegisterVersionText } from "@debateai/register";`
- `apps/runner/src/dev-provider-set-publish-cli.ts:6` — `import {`
- `apps/runner/src/dev-provider-set-publish-cli.ts:12` — `import { developmentConfiguredProviderPanel } from "./dev-provider-panel.js";`
- `apps/runner/src/dev-provider-set-publish-cli.ts:14` — `const environment = loadMigrationEnvironment();`
- `apps/runner/src/dev-provider-set-publish-cli.ts:15` — `const pool = createPool(environment.MIGRATION_DATABASE_URL);`

## `apps/runner/src/dev-provider-panel.ts` (210 lines) — `grep -n -E 'base_url|provider_ref|127\.0\.0\.1|^export'`
- `apps/runner/src/dev-provider-panel.ts:13` — `export const DEVELOPMENT_UNAVAILABLE_CLI_MODEL = "CLI_HANDSHAKE_UNAVAILABLE" as const;`
- `apps/runner/src/dev-provider-panel.ts:14` — `export const DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1 as const;`
- `apps/runner/src/dev-provider-panel.ts:15` — `export const DEVELOPMENT_CLI_CALL_TIMEOUT_MS = 180_000 as const;`
- `apps/runner/src/dev-provider-panel.ts:17` — `export const REMOVED_DEVELOPMENT_SCAFFOLD_TARGETS_JSON = JSON.stringify([{`
- `apps/runner/src/dev-provider-panel.ts:18` — `  provider_ref: REMOVED_SCAFFOLD_PROVIDER_REF,`
- `apps/runner/src/dev-provider-panel.ts:19` — `  base_url: "http://127.0.0.1:8791/v1",`
- `apps/runner/src/dev-provider-panel.ts:26` — ` * target per provider_ref, checked in parseProviderDiscoveryTargets — so a maker that`
- `apps/runner/src/dev-provider-panel.ts:30` — `export const DEVELOPMENT_CLI_PROVIDER_ROSTER = Object.freeze([`
- `apps/runner/src/dev-provider-panel.ts:66` — `export function developmentCliProviderRoster(`
- `apps/runner/src/dev-provider-panel.ts:77` — `export type DevelopmentConfiguredProvider = Readonly<{`
- `apps/runner/src/dev-provider-panel.ts:83` — `export type DevelopmentProviderPanel = Readonly<{`
- `apps/runner/src/dev-provider-panel.ts:111` — `  return `http://127.0.0.1:${port}/v1`;`

## `apps/api/src/provider-discovery.ts` (102 lines) — `grep -n -E 'probeFreshnessMs|max_tokens|chat/completions|^export|PROVIDER_DISCOVERY'`
- `apps/api/src/provider-discovery.ts:6` — `export {`
- `apps/api/src/provider-discovery.ts:18` — `export type ProviderDiscoveryProbeStore = Readonly<{`
- `apps/api/src/provider-discovery.ts:40` — `export function createProviderDiscoveryResolver(input: Readonly<{`
- `apps/api/src/provider-discovery.ts:44` — `  probeFreshnessMs: number;`
- `apps/api/src/provider-discovery.ts:49` — `  if (!Number.isInteger(input.probeFreshnessMs) || input.probeFreshnessMs < 1) {`
- `apps/api/src/provider-discovery.ts:59` — `    throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");`
- `apps/api/src/provider-discovery.ts:69` — `      return isFreshMatchingRecord(record, target, now, input.probeFreshnessMs)`

## `packages/providers/src/provider-probe.ts` (145 lines) — `grep -n -E '^export|max_tokens|probe'`
- `packages/providers/src/provider-probe.ts:5` — ` * DR-181/DR-182 — the ONE provider health probe.`
- `packages/providers/src/provider-probe.ts:12` — ` * It lives here because BOTH shipped entry points need it — the API probes at ask`
- `packages/providers/src/provider-probe.ts:13` — ` * time, and the runner must re-probe at claim time (F34) so a pinned member that`
- `packages/providers/src/provider-probe.ts:15` — ` * would have given the runner its own probe were rejected on the record: a second`
- `packages/providers/src/provider-probe.ts:17` — ` * two probes disagree.`
- `packages/providers/src/provider-probe.ts:26` — `export type ProviderProbeObservation = Readonly<{`
- `packages/providers/src/provider-probe.ts:27` — `  probeEvidenceRef: string;`
- `packages/providers/src/provider-probe.ts:33` — `  probedAt: Date;`

## `apps/api/src/main.ts` (804 lines) — `grep -n -E 'PROVIDER_DISCOVERY_TARGETS|parseProviderDiscoveryTargets|probeFreshnessMs|deploymentRiskTier|KEK_PATH|readFileSync|_PATH\b'`
- `apps/api/src/main.ts:3` — `import { readFileSync } from "node:fs";`
- `apps/api/src/main.ts:73` — `  parseProviderDiscoveryTargets,`
- `apps/api/src/main.ts:106` — `  reviewManifest: JSON.parse(readFileSync(`
- `apps/api/src/main.ts:109` — `  recoveryComponents: readFileSync(resolve("packages/support-kb/recovery/components.json")),`
- `apps/api/src/main.ts:127` — ` * With no `*_KEK_PREVIOUS_PATH` set — the steady state — each ring is exactly`
- `apps/api/src/main.ts:136` — `const userKeks = boot.runSync("user-dek-kek", () => loadKekRing(environment.KEK_PATH, environment.KEK_PREVIOUS_PATH, (handle) => boot.holdKek(handle)));`
- `apps/api/src/main.ts:139` — `  ? boot.runSync("corpus-kek", () => loadKekRing(environment.CORPUS_KEK_PATH!, environment.CORPUS_KEK_PREVIOUS_PATH, (handle) => boot.holdKek(handle)))`
- `apps/api/src/main.ts:142` — `const blindIndexKey = loadSecretKey(environment.BLIND_INDEX_KEY_PATH);`
- `apps/api/src/main.ts:143` — `const sourceIpSalt = loadSecretKey(environment.AUDIT_SOURCE_IP_SALT_PATH);`
- `apps/api/src/main.ts:152` — `// private-only deployment could point KEK_PATH and BLIND_INDEX_KEY_PATH at one`
- `apps/api/src/main.ts:159` — `    corpusKekPath: environment.CORPUS_KEK_PATH!,`
- `apps/api/src/main.ts:160` — `    publicationStorePath: environment.PUBLICATION_KEY_STORE_PATH!`
- `apps/api/src/main.ts:162` — `  privateKekPath: environment.KEK_PATH,`
- `apps/api/src/main.ts:163` — `  privateStorePath: environment.USER_DEK_STORE_PATH,`

## `apps/runner/src/dev-api-environment.ts` (595 lines) — `grep -n -E 'PROVIDER_DISCOVERY_TARGETS|KEK_PATH|AUDIT_KEY_STORE_PATH|_PATH\b|^export'`
- `apps/runner/src/dev-api-environment.ts:36` — `export const DEVELOPMENT_API_ENVIRONMENT_KEYS = Object.freeze([`
- `apps/runner/src/dev-api-environment.ts:37` — `  "KEK_PATH",`
- `apps/runner/src/dev-api-environment.ts:38` — `  "SUPPORT_KEK_PATH",`
- `apps/runner/src/dev-api-environment.ts:39` — `  "BLIND_INDEX_KEY_PATH",`
- `apps/runner/src/dev-api-environment.ts:40` — `  "AUDIT_KEY_STORE_PATH",`
- `apps/runner/src/dev-api-environment.ts:41` — `  "AUDIT_SOURCE_IP_SALT_PATH",`
- `apps/runner/src/dev-api-environment.ts:42` — `  "USER_DEK_STORE_PATH",`
- `apps/runner/src/dev-api-environment.ts:47` — `  "CORPUS_KEK_PATH",`
- `apps/runner/src/dev-api-environment.ts:48` — `  "PUBLICATION_KEY_STORE_PATH",`
- `apps/runner/src/dev-api-environment.ts:52` — `  "MAIL_SENDMAIL_PATH",`
- `apps/runner/src/dev-api-environment.ts:65` — `  "PROVIDER_DISCOVERY_TARGETS_JSON",`
- `apps/runner/src/dev-api-environment.ts:80` — `export type DevelopmentApiEnvironmentReceipt = Readonly<{`

## `apps/runner/src/dev-secret-files.ts` (208 lines) — `grep -n -E '^export|_PATH|writeFile|mode|0o'`
- `apps/runner/src/dev-secret-files.ts:11` — `export type DevelopmentSecretFile = Readonly<{`
- `apps/runner/src/dev-secret-files.ts:16` — `export type DevelopmentSecretStore = Readonly<{`
- `apps/runner/src/dev-secret-files.ts:21` — `export const DEVELOPMENT_SECRET_FILES = Object.freeze([`
- `apps/runner/src/dev-secret-files.ts:32` — `export const DEVELOPMENT_SECRET_STORES = Object.freeze([`
- `apps/runner/src/dev-secret-files.ts:38` — `export type DevelopmentSecretReceipt = Readonly<{`
- `apps/runner/src/dev-secret-files.ts:89` — `        || (metadata.mode & 0o777) !== 0o600 || metadata.size !== 32) {`
- `apps/runner/src/dev-secret-files.ts:159` — `    const handle = await open(temporaryPath, "wx", 0o600);`
- `apps/runner/src/dev-secret-files.ts:161` — `      await handle.writeFile(material);`
- `apps/runner/src/dev-secret-files.ts:183` — `export async function generateDevelopmentSecretFiles(`

## `packages/register/src/compose-env.ts` (9 lines) — `grep -n -E '^export|PROVIDER|_PATH|compose'`
- `packages/register/src/compose-env.ts:6` — `  new URL("../../../.env.compose", import.meta.url),`

## `deploy/vps/env/runner.env.example` (83 lines) — `grep -n -E 'PROVIDER|configuredProviderSet|KEK|_PATH|SECRET|API_KEY'`
- `deploy/vps/env/runner.env.example:9` — `# written inline into PROVIDER_DISCOVERY_TARGETS_JSON. A production unit that omits this key`
- `deploy/vps/env/runner.env.example:18` — `# The runner's OWN 0600 copy of the same 32 KEK bytes, owned by debateai-runner. A per-user copy`
- `deploy/vps/env/runner.env.example:22` — `#   KEK_PREVIOUS_PATH=/etc/debateai/runner-previous/kek.bin`
- `deploy/vps/env/runner.env.example:26` — `KEK_PATH=/etc/debateai/runner/kek.bin`
- `deploy/vps/env/runner.env.example:33` — `USER_DEK_STORE_PATH=/var/lib/debateai/api/user-deks`
- `deploy/vps/env/runner.env.example:48` — `# server on this host. With them absent, PROVIDER_DISCOVERY_TARGETS_JSON is the single source of`
- `deploy/vps/env/runner.env.example:49` — `# the provider set and the RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT cross-check is skipped;`
- `deploy/vps/env/runner.env.example:50` — `# PROVIDER_REF must still name the FIRST entry of that set (RUNNER_PRIMARY_PROVIDER_REF_DRIFT).`
- `deploy/vps/env/runner.env.example:56` — `# Every provider_ref must also appear in the register's configuredProviderSet row. README §11`
- `deploy/vps/env/runner.env.example:58` — `PROVIDER_REF=<provider-ref>`
- `deploy/vps/env/runner.env.example:59` — `PROVIDER_DISCOVERY_TARGETS_JSON=<provider-discovery-targets-json>`

## `deploy/vps/env/api.env.example` (96 lines) — `grep -n -E 'PROVIDER|KEK|_PATH|SECRET|API_KEY|DISCOVERY'`
- `deploy/vps/env/api.env.example:12` — `# written inline into PROVIDER_DISCOVERY_TARGETS_JSON. A production unit that omits this key`
- `deploy/vps/env/api.env.example:32` — `# The support data plane (P3-01 `api-support`), and the ONLY database the KEK`
- `deploy/vps/env/api.env.example:41` — `# Every *_PATH below is a raw 32-byte file, 0600, owned by debateai-api, inside a 0700 directory.`
- `deploy/vps/env/api.env.example:42` — `# See README "The key-file contract". The two *_STORE_PATH entries are directories the API`
- `deploy/vps/env/api.env.example:51` — `KEK_PATH=/etc/debateai/api/kek.bin`
- `deploy/vps/env/api.env.example:55` — `# it (SUPPORT_KEK_PATH_MUST_BE_SEPARATE). Single-owner custody: 0600 owned by`
- `deploy/vps/env/api.env.example:57` — `SUPPORT_KEK_PATH=/etc/debateai/api/support-kek.bin`
- `deploy/vps/env/api.env.example:58` — `BLIND_INDEX_KEY_PATH=/etc/debateai/api/blind-index-key.bin`
- `deploy/vps/env/api.env.example:59` — `AUDIT_SOURCE_IP_SALT_PATH=/etc/debateai/api/audit-source-ip-salt.bin`
- `deploy/vps/env/api.env.example:60` — `CORPUS_KEK_PATH=/etc/debateai/api/corpus-kek.bin`
- `deploy/vps/env/api.env.example:61` — `USER_DEK_STORE_PATH=/var/lib/debateai/api/user-deks`
- `deploy/vps/env/api.env.example:62` — `AUDIT_KEY_STORE_PATH=/var/lib/debateai/api/audit-keys`

## `deploy/vps/README.md` (873 lines) — `grep -n -E '^#|provider|Provider|secret|API key|publish'`
- `deploy/vps/README.md:1` — `# DebateAI VPS deployment baseline`
- `deploy/vps/README.md:8` — `Audit corrections folded in: `L2-F3` (backups must carry custody, secrets escrowed separately),`
- `deploy/vps/README.md:14` — `## Known-stale sections — refreshed by Task 14`
- `deploy/vps/README.md:19` — `- **§11's hosted provider target example** does not carry`
- `deploy/vps/README.md:23` — `  provider ref.`
- `deploy/vps/README.md:42` — `## 1. Topology`
- `deploy/vps/README.md:58` — `   native, apt postgresql-18        loopback-published`
- `deploy/vps/README.md:66` — `  `127.0.0.1:3001`, Hatchet publishes `127.0.0.1:8888` and `127.0.0.1:7077`, PostgreSQL listens on`
- `deploy/vps/README.md:71` — `- **Docker publishes bypass `ufw`** through the `DOCKER` iptables chain. Binding every publish to`
- `deploy/vps/README.md:76` — `### Boot order`
- `deploy/vps/README.md:84` — `## 2. Host preparation`
- `deploy/vps/README.md:87` — `# Firewall. Docker's published ports are NOT filtered by this — see §1.`
- `deploy/vps/README.md:93` — `# Unattended security updates, with a reboot window (kernel updates otherwise never land).`
- `deploy/vps/README.md:96` — `#   Unattended-Upgrade::Automatic-Reboot "true";`

## `deploy/vps/systemd/debateai-api.service` (67 lines) — `grep -n -E 'EnvironmentFile|ExecStart|User='`
- `deploy/vps/systemd/debateai-api.service:15` — `User=debateai-api`
- `deploy/vps/systemd/debateai-api.service:22` — `EnvironmentFile=/etc/debateai/api.env`
- `deploy/vps/systemd/debateai-api.service:25` — `ExecStart=/usr/bin/pnpm --dir /opt/debateai/dialectical-engine exec tsx apps/api/src/main.ts`

## `tests/architecture/vps-deployment-baseline.test.ts` (561 lines) — `grep -n -E '^\s*(describe|it|test)\(|PROVIDER|env\.example'`
- `tests/architecture/vps-deployment-baseline.test.ts:88` — `  "deploy/vps/env/api.env.example",`
- `tests/architecture/vps-deployment-baseline.test.ts:89` — `  "deploy/vps/env/runner.env.example",`
- `tests/architecture/vps-deployment-baseline.test.ts:90` — `  "deploy/vps/env/ui.env.example"`
- `tests/architecture/vps-deployment-baseline.test.ts:93` — `describe("VPS baseline: native hardened Postgres (L5-F6, L5-F7, L5-F11)", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:94` — `  it("ships every Postgres file", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:98` — `  it("pg_hba: socket SCRAM for every LOGIN principal, TLS-only loopback, reject last (L5-F7)", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:129` — `  it("postgresql.hardening.conf: loopback listen, TLS 1.3, SCRAM, connection logs, no statement text (L5-F11)", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:151` — `  it("bootstrap.sql: migrator + hatchet roles and databases, no literal passwords", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:161` — `  it("hardening.sql: DATABASE-level search_path + timeout, CONNECT closed to PUBLIC, never per-role settings (L5-F6)", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:177` — `describe("VPS baseline: Caddy edge, loopback-only compose, hardened systemd units (L7-F2, L7-F3, L7-F7)", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:178` — `  it("ships every edge file", () => {`
- `tests/architecture/vps-deployment-baseline.test.ts:182` — `  it("Caddyfile: TLS edge to the UI with the edge secret, no proxy trust, no API compression", () => {`

## `tests/architecture/dev-real-provider-only.test.ts` (61 lines) — `grep -n -E '^\s*(describe|it|test)\(|development:|production:|provider_ref'`
- `tests/architecture/dev-real-provider-only.test.ts:4` — `describe("development debate provider boundary", () => {`
- `tests/architecture/dev-real-provider-only.test.ts:5` — `  it("has no canned provider and launches the real CLI handshake panel", async () => {`
- `tests/architecture/dev-real-provider-only.test.ts:27` — `    expect(panel).toContain("development:codex-cli");`
- `tests/architecture/dev-real-provider-only.test.ts:28` — `    expect(panel).toContain("development:codex-premium-cli");`
- `tests/architecture/dev-real-provider-only.test.ts:29` — `    expect(panel).toContain("development:claude-cli");`
- `tests/architecture/dev-real-provider-only.test.ts:30` — `    expect(panel).toContain("development:claude-premium-cli");`
- `tests/architecture/dev-real-provider-only.test.ts:31` — `    expect(panel).toContain("development:grok-cli");`
- `tests/architecture/dev-real-provider-only.test.ts:36` — `  it("keeps Hermes GLM in the Support-only stack seam and out of the debate roster",async () => {`

## `tests/unit/api-provider-discovery.test.ts` (172 lines) — `grep -n -E '^\s*(describe|it|test)\('`
- `tests/unit/api-provider-discovery.test.ts:25` — `describe("production provider discovery", () => {`
- `tests/unit/api-provider-discovery.test.ts:26` — `  it("wires the active resolver into the real API entrypoint", async () => {`
- `tests/unit/api-provider-discovery.test.ts:34` — `  it("handshakes every configured target and pins every responder in configured order", async () => {`
- `tests/unit/api-provider-discovery.test.ts:94` — `  it("requires an exact one-to-one target for every configured provider", () => {`
- `tests/unit/api-provider-discovery.test.ts:103` — `  it("reprobes a fresh absence so a recovered responder joins the next handshake", async () => {`
- `tests/unit/api-provider-discovery.test.ts:140` — `  it("shares one stale discovery probe across concurrent ask handshakes", async () => {`

## `tests/integration/dev-provider-panel.test.ts` (62 lines) — `grep -n -E '^\s*(describe|it|test)\('`
- `tests/integration/dev-provider-panel.test.ts:10` — `describe("real development CLI provider panel", () => {`
- `tests/integration/dev-provider-panel.test.ts:11` — `  it("loads the exact live CLI targets without changing the fixed maker order", () => {`
- `tests/integration/dev-provider-panel.test.ts:25` — `  it("fails closed when the live handshake result is absent or not the exact CLI roster", () => {`
- `tests/integration/dev-provider-panel.test.ts:36` — `  it("accepts only the selected support-preview relay ports", () => {`
- `tests/integration/dev-provider-panel.test.ts:51` — `  it("rejects the removed scaffold and healthy-looking targets without relay credentials", () => {`

