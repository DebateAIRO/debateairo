// tests/architecture/vps-deployment-baseline.test.ts
// Pins the VPS deployment baseline (PLAN §8 C3, §9.1 C3 amendments, audit corrections
// L2-F3, L5-F6/F7/F8/F11, L7-F2/F3/F7). Every assertion is a floor on a file under
// deploy/; the files are configuration, so the pins are textual and deliberately exact.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const engineRoot = resolve(import.meta.dirname, "../..");
const read = (relative: string): string => readFileSync(resolve(engineRoot, relative), "utf8");
const exists = (relative: string): boolean => existsSync(resolve(engineRoot, relative));

const manifest = JSON.parse(
  read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")
) as { principals: ReadonlyArray<{ id: string; roleName: string; database: string; login: boolean }> };
const loginPrincipals = manifest.principals.filter((principal) => principal.login);

function configLines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
}

/** Executable SQL only: the `--` prose in these files legitimately names statements they must never run. */
function sqlStatements(text: string): string {
  return text.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
}

/** pg_hba.conf is column-aligned for humans; every field comparison here is on collapsed whitespace. */
function hbaLines(text: string): string[] {
  return configLines(text).map((line) => line.replace(/\s+/g, " "));
}

function publishedPorts(compose: string): string[] {
  const ports: string[] = [];
  let inPorts = false;
  for (const line of compose.split("\n")) {
    if (/^\s{4}ports:\s*$/.test(line)) { inPorts = true; continue; }
    if (inPorts && /^\s{6}-\s*"?[^"]+"?\s*$/.test(line)) { ports.push(line.replace(/^\s*-\s*"?/, "").replace(/"?\s*$/, "")); continue; }
    if (inPorts && !/^\s{6}/.test(line)) inPorts = false;
  }
  return ports;
}

function composeServices(compose: string): string[] {
  const names: string[] = [];
  let inServices = false;
  for (const line of compose.split("\n")) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (inServices && /^\S/.test(line)) inServices = false;
    const match = inServices ? /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line) : null;
    if (match?.[1] !== undefined) names.push(match[1]);
  }
  return names;
}

function envKeys(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of configLines(text)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match?.[1] !== undefined) entries.set(match[1], match[2] ?? "");
  }
  return entries;
}

const POSTGRES_FILES = [
  "deploy/postgres/pg_hba.conf.template",
  "deploy/postgres/postgresql.hardening.conf",
  "deploy/postgres/bootstrap.sql",
  "deploy/postgres/hardening.sql"
] as const;
const EDGE_FILES = [
  "deploy/vps/Caddyfile",
  "deploy/vps/compose.prod.yaml",
  "deploy/vps/systemd/debateai-api.service",
  "deploy/vps/systemd/debateai-ui.service",
  "deploy/vps/systemd/debateai-runner.service",
  "deploy/vps/systemd/debateai-hatchet.service"
] as const;
const BACKUP_FILES = [
  "deploy/vps/backup.sh",
  "deploy/vps/restore-drill.sh",
  "deploy/vps/drill-decrypt-sample.ts",
  "deploy/vps/backup.conf.example",
  "deploy/vps/systemd/debateai-backup.service",
  "deploy/vps/systemd/debateai-backup.timer"
] as const;
const RUNBOOK_FILES = [
  "deploy/vps/README.md",
  "deploy/vps/env/api.env.example",
  "deploy/vps/env/runner.env.example",
  "deploy/vps/env/ui.env.example"
] as const;

describe("VPS baseline: native hardened Postgres (L5-F6, L5-F7, L5-F11)", () => {
  it("ships every Postgres file", () => {
    for (const file of POSTGRES_FILES) expect(exists(file), file).toBe(true);
  });

  it("pg_hba: socket SCRAM for every LOGIN principal, TLS-only loopback, reject last (L5-F7)", () => {
    const lines = hbaLines(read("deploy/postgres/pg_hba.conf.template"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, line).toMatch(/^(local|hostssl|host)\s+\S+\s+\S+(\s+\S+)?\s+(scram-sha-256|peer|reject)$/);
      expect(line, line).not.toMatch(/\b(trust|md5|password|ident|hostnossl)\b/);
    }
    const local = lines.filter((line) => line.startsWith("local"));
    const hostssl = lines.filter((line) => line.startsWith("hostssl"));
    const host = lines.filter((line) => /^host\s/.test(line));
    for (const principal of loginPrincipals) {
      const socketLine = local.find((line) => new RegExp(`^local\\s+${principal.database}\\s+${principal.roleName}\\s+scram-sha-256$`).test(line));
      expect(socketLine, `${principal.roleName} needs a local scram-sha-256 line on ${principal.database}`).toBeDefined();
    }
    for (const line of local) {
      if (!/\s+postgres\s+peer$/.test(line)) expect(line, line).toMatch(/scram-sha-256$/);
    }
    for (const line of hostssl) {
      expect(line, line).toMatch(/\s(127\.0\.0\.1\/32|::1\/128)\s+scram-sha-256$/);
      expect(line, line).not.toMatch(/^hostssl\s+all\s/);
    }
    expect(hostssl.some((line) => /\s127\.0\.0\.1\/32\s/.test(line))).toBe(true);
    expect(hostssl.some((line) => /\s::1\/128\s/.test(line))).toBe(true);
    expect(host).toEqual(["host all all 0.0.0.0/0 reject", "host all all ::/0 reject"]);
    expect(lines.slice(-2)).toEqual(host);
    for (const line of lines) {
      if (/\shatchet\s/.test(line)) expect(line, line).toMatch(/\shatchet\s+debateai_prod_hatchet\s/);
      if (/debateai_prod_hatchet/.test(line)) expect(line, line).toMatch(/\shatchet\s+debateai_prod_hatchet\s/);
    }
  });

  it("postgresql.hardening.conf: loopback listen, TLS 1.3, SCRAM, connection logs, no statement text (L5-F11)", () => {
    const conf = read("deploy/postgres/postgresql.hardening.conf");
    for (const needle of [
      "listen_addresses = '127.0.0.1, ::1'",
      "ssl = on",
      "ssl_cert_file = '/etc/debateai/postgres-tls/server.crt'",
      "ssl_key_file = '/etc/debateai/postgres-tls/server.key'",
      "ssl_min_protocol_version = 'TLSv1.3'",
      "password_encryption = scram-sha-256",
      "log_connections = on",
      "log_disconnections = on",
      "log_statement = 'none'",
      "log_min_error_statement = 'panic'",
      "log_min_duration_statement = -1",
      "log_parameter_max_length = 0",
      "log_parameter_max_length_on_error = 0",
      "unix_socket_directories = '/var/run/postgresql'"
    ]) expect(conf, needle).toContain(needle);
    expect(conf).not.toMatch(/log_statement\s*=\s*'(all|ddl|mod)'/);
    expect(conf).not.toMatch(/listen_addresses\s*=\s*'\*'/);
  });

  it("bootstrap.sql: migrator + hatchet roles and databases, no literal passwords", () => {
    const sql = read("deploy/postgres/bootstrap.sql");
    expect(sql).toMatch(/CREATE ROLE debateai_prod_migrator[^;]*\bSUPERUSER\b[^;]*\bLOGIN\b/s);
    expect(sql).toMatch(/CREATE ROLE debateai_prod_hatchet[^;]*\bLOGIN\b[^;]*\bNOSUPERUSER\b/s);
    expect(sql).toContain("CREATE DATABASE debateai OWNER debateai_prod_migrator");
    expect(sql).toContain("CREATE DATABASE hatchet OWNER debateai_prod_hatchet");
    for (const match of sql.matchAll(/PASSWORD\s+(\S+)/g)) expect(match[1], match[0]).toMatch(/^(:'|NULL|%L)/);
    expect(sql).toContain(":'hatchet_password'");
  });

  it("hardening.sql: DATABASE-level search_path + timeout, CONNECT closed to PUBLIC, never per-role settings (L5-F6)", () => {
    const sql = read("deploy/postgres/hardening.sql");
    for (const needle of [
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC;",
      "ALTER DATABASE debateai SET search_path = pg_catalog;",
      "ALTER DATABASE debateai SET statement_timeout = '30s';",
      "REVOKE CONNECT ON DATABASE debateai FROM PUBLIC;",
      "REVOKE CONNECT ON DATABASE hatchet FROM PUBLIC;",
      "GRANT CONNECT ON DATABASE hatchet TO debateai_prod_hatchet;"
    ]) expect(sql, needle).toContain(needle);
    for (const file of ["deploy/postgres/hardening.sql", "deploy/postgres/bootstrap.sql"]) {
      expect(sqlStatements(read(file)), file).not.toMatch(/ALTER\s+ROLE\s+\S+\s+(IN\s+DATABASE\s+\S+\s+)?(SET|RESET)\b/i);
    }
  });
});

describe("VPS baseline: Caddy edge, loopback-only compose, hardened systemd units (L7-F2, L7-F3, L7-F7)", () => {
  it("ships every edge file", () => {
    for (const file of EDGE_FILES) expect(exists(file), file).toBe(true);
  });

  it("Caddyfile: TLS edge to the UI with the edge secret, no proxy trust, no API compression", () => {
    const caddy = read("deploy/vps/Caddyfile");
    for (const needle of [
      "reverse_proxy 127.0.0.1:3001",
      "header_up X-Forwarded-For {remote_host}",
      "header_up X-Forwarded-Proto https",
      "header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.secret}",
      'Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"',
      "-Server",
      "protocols tls1.2 tls1.3",
      "@compressible not path /api/*",
      "encode @compressible gzip"
    ]) expect(caddy, needle).toContain(needle);
    expect(caddy).toMatch(/request_body\s*\{\s*max_size 1MB\s*\}/);
    expect(caddy).not.toContain("trusted_proxies");
    expect(caddy).not.toContain("log_credentials");
    expect(caddy).not.toMatch(/^\s*encode\s+gzip/m);
    expect(caddy).not.toMatch(/^\s*(http:\/\/|:80\b)/m);
  });

  it("compose.prod.yaml: hatchet-lite only, loopback published, TLS on, no insecure flags, secrets from env_file (L7-F2, L7-F3)", () => {
    const compose = read("deploy/vps/compose.prod.yaml");
    expect(composeServices(compose)).toEqual(["hatchet-lite"]);
    const ports = publishedPorts(compose);
    expect(ports.length).toBeGreaterThanOrEqual(2);
    expect(ports.filter((port) => !port.startsWith("127.0.0.1:"))).toEqual([]);
    for (const forbidden of ["SERVER_AUTH_COOKIE_INSECURE", "SERVER_GRPC_INSECURE", "Admin123", "network_mode", "vllm", "postgres:"]) {
      expect(compose, forbidden).not.toContain(forbidden);
    }
    expect(compose).not.toMatch(/ADMIN_PASSWORD:\s*\S/);
    expect(compose).not.toMatch(/DATABASE_URL:\s*\S/);
    expect(compose).toContain("env_file:");
    expect(compose).toContain("/etc/debateai/hatchet.env");
    expect(compose).toContain("SERVER_TLS_STRATEGY: tls");
    expect(compose).toContain("SERVER_TLS_CERT_FILE:");
    expect(compose).toContain("SERVER_TLS_KEY_FILE:");
    expect(compose).toContain(":/config");
    const pins = read("deploy/IMAGE-PINS.md");
    const digest = /hatchet-lite:latest@(sha256:[0-9a-f]{64})/.exec(pins)?.[1];
    expect(digest).toBeDefined();
    expect(compose).toContain(`hatchet-lite:latest@${digest}`);
  });

  const HARDENING = [
    "NoNewPrivileges=true", "ProtectSystem=strict", "ProtectHome=true", "PrivateTmp=true",
    "ProtectProc=invisible", "ProcSubset=pid", "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
    "Environment=NODE_ENV=production", "TimeoutStopSec=30", "Restart=on-failure", "RestartSec=5",
    "ProtectKernelTunables=true", "ProtectKernelModules=true", "ProtectControlGroups=true",
    "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet=", "UMask=0077"
  ] as const;

  it.each(["api", "ui", "runner"] as const)("debateai-%s.service: own user, hardening floor, root-read env file", (service) => {
    const unit = read(`deploy/vps/systemd/debateai-${service}.service`);
    expect(unit).toContain(`User=debateai-${service}`);
    expect(unit).toContain(`EnvironmentFile=/etc/debateai/${service}.env`);
    for (const needle of HARDENING) expect(unit, `${service}: ${needle}`).toContain(needle);
    expect(unit).not.toContain("MemoryDenyWriteExecute=true");
    expect(unit).not.toMatch(/^User=debateai$/m);
  });

  it("ReadWritePaths are exactly the custody trees each service writes (L2 out-of-scope, C3 amendment)", () => {
    const api = read("deploy/vps/systemd/debateai-api.service");
    expect(api).toMatch(/^ReadWritePaths=\/var\/lib\/debateai\/api\/user-deks \/var\/lib\/debateai\/api\/publication-keys \/var\/lib\/debateai\/api\/audit-keys$/m);
    expect(api).toContain("ExecStart=/usr/bin/pnpm --dir /opt/debateai/dialectical-engine exec tsx apps/api/src/main.ts");
    const runner = read("deploy/vps/systemd/debateai-runner.service");
    expect(runner).not.toMatch(/^ReadWritePaths=/m);
    expect(runner).toMatch(/^ReadOnlyPaths=\/var\/lib\/debateai\/api\/user-deks$/m);
    expect(runner).toContain("ExecStart=/usr/bin/pnpm --dir /opt/debateai/dialectical-engine exec tsx apps/runner/src/main.ts");
    const ui = read("deploy/vps/systemd/debateai-ui.service");
    expect(ui).not.toMatch(/^ReadWritePaths=/m);
    expect(ui).toContain("Environment=DIALECTICAL_UI_TRUSTED_PROXIES=127.0.0.1,::1");
    expect(ui).toContain("Environment=DIALECTICAL_UI_EDGE_SECRET_PATH=/etc/debateai/ui-edge.secret");
    expect(ui).toContain("Environment=DIALECTICAL_UI_HOST=127.0.0.1");
    expect(ui).toContain("Environment=PORT=3001");
    expect(ui).toContain("ExecStart=/usr/bin/node /opt/debateai/dialectical-engine/apps/ui/server.mjs");
    for (const unit of [api, runner]) expect(unit).toContain("Environment=NODE_EXTRA_CA_CERTS=/etc/debateai/hatchet-tls/ca.crt");
  });

  it("boot order: hatchet after postgres, api after both, ui after api", () => {
    const hatchet = read("deploy/vps/systemd/debateai-hatchet.service");
    expect(hatchet).toMatch(/^After=.*\bpostgresql\.service\b.*\bdocker\.service\b/m);
    expect(hatchet).toContain("compose.prod.yaml");
    expect(read("deploy/vps/systemd/debateai-api.service")).toMatch(/^After=.*\bpostgresql\.service\b.*\bdebateai-hatchet\.service\b/m);
    expect(read("deploy/vps/systemd/debateai-runner.service")).toMatch(/^After=.*\bpostgresql\.service\b.*\bdebateai-hatchet\.service\b/m);
    expect(read("deploy/vps/systemd/debateai-ui.service")).toMatch(/^After=.*\bdebateai-api\.service\b/m);
  });
});

describe("VPS baseline: encrypted DB + custody backups with separate escrow, restore drill (L2-F3, L5-F8)", () => {
  it("ships every backup file", () => {
    for (const file of BACKUP_FILES) expect(exists(file), file).toBe(true);
  });

  it("backup.sh: root over the socket as postgres, DB first then custody, two distinct age recipients, receipt", () => {
    const script = read("deploy/vps/backup.sh");
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    for (const needle of [
      "set -euo pipefail", "umask 077",
      "sudo -u postgres pg_dumpall --globals-only",
      "sudo -u postgres pg_dump --format=custom",
      "USER_DEK_STORE_PATH", "PUBLICATION_KEY_STORE_PATH", "AUDIT_KEY_STORE_PATH",
      "KEK_PATH", "CORPUS_KEK_PATH", "BLIND_INDEX_KEY_PATH", "AUDIT_SOURCE_IP_SALT_PATH",
      "sha256sum", "rclone copy", "BACKUP_OK", "KEEP_DAILY=14", "KEEP_WEEKLY=8"
    ]) expect(script, needle).toContain(needle);
    const recipients = [...script.matchAll(/age -r "\$\{?([A-Z_]+)\}?"/g)].map((match) => match[1]);
    expect(new Set(recipients)).toEqual(new Set(["BACKUP_DATA_RECIPIENT", "BACKUP_ESCROW_RECIPIENT"]));
    expect(script.indexOf("pg_dump --format=custom")).toBeLessThan(script.indexOf("custody.tar"));
    expect(script).toMatch(/printf 'BACKUP_OK %s %s %s\\n'/);
    expect(script).not.toMatch(/age -r "\$\{?BACKUP_DATA_RECIPIENT\}?"[^\n]*(kek|secrets)/);
  });

  it("restore-drill.sh: scratch DB + scratch custody, core.run count, chain SQL, sample decrypt, RESTORE_DRILL_OK, cleanup", () => {
    const script = read("deploy/vps/restore-drill.sh");
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    for (const needle of [
      "set -euo pipefail", "umask 077", "debateai_drill", "pg_restore",
      "SELECT count(*) FROM core.run", "audit_crypto_internal.digest", "identity.audit_canonical_jsonb",
      "drill-decrypt-sample.ts", "RESTORE_DRILL_OK", "DROP DATABASE IF EXISTS debateai_drill"
    ]) expect(script, needle).toContain(needle);
    expect(script).not.toContain("core.runs");
    expect(script.indexOf("RESTORE_DRILL_OK")).toBeGreaterThan(script.indexOf("drill-decrypt-sample.ts"));
  });

  it("drill-decrypt-sample.ts proves one run row decrypts with the restored keys and never prints plaintext", () => {
    const script = read("deploy/vps/drill-decrypt-sample.ts");
    for (const needle of ["@debateai/crypto", "ContentCipher", "FileRunContentKeyStore", "FileUserDekStore", "loadKek", "RESTORE_DRILL_DECRYPT_OK", "content_encryption_version = 1"]) {
      expect(script, needle).toContain(needle);
    }
    expect(script).not.toContain("questionLine");
  });

  it("backup timer runs the script as root daily", () => {
    expect(read("deploy/vps/systemd/debateai-backup.service")).toContain("ExecStart=/opt/debateai/dialectical-engine/deploy/vps/backup.sh");
    const timer = read("deploy/vps/systemd/debateai-backup.timer");
    expect(timer).toMatch(/^OnCalendar=/m);
    expect(timer).toContain("Persistent=true");
  });
});

describe("VPS baseline: runbook and environment templates", () => {
  it("ships the README and env templates", () => {
    for (const file of RUNBOOK_FILES) expect(exists(file), file).toBe(true);
  });

  it("README covers topology, firewall, custody contract, provisioning, backups, drill, absences", () => {
    const readme = read("deploy/vps/README.md");
    for (const needle of [
      "127.0.0.1:3001", "127.0.0.1:8790", "ufw default deny incoming", "ufw allow 22,80,443/tcp",
      "unattended-upgrades", "/etc/debateai", "head -c 32 /dev/urandom", "0600", "0700",
      "pnpm db:provision-principals", "log_statement", "sslmode=verify-full", "CONTENT_ENCRYPTION_ENABLED=true",
      "NODE_EXTRA_CA_CERTS", "X-Debateai-Edge-Secret", "backup.sh", "restore-drill.sh", "quarterly",
      "SystemMaxUse", "Phase 2", "no compiled artefact", "dev:auth:up", "DEBATEAI_DEV_", "postgresql.service",
      "hatchet.env", "escrow"
    ]) expect(readme, needle).toContain(needle);
  });

  it("api.env.example names every production key with socket URLs, distinct principals and no dev tooling", () => {
    const env = envKeys(read("deploy/vps/env/api.env.example"));
    for (const key of [
      "NODE_ENV", "KEK_PATH", "BLIND_INDEX_KEY_PATH", "AUDIT_KEY_STORE_PATH", "AUDIT_SOURCE_IP_SALT_PATH",
      "USER_DEK_STORE_PATH", "CONTENT_ENCRYPTION_ENABLED", "CONTENT_PROVISION_DATABASE_URL", "PUBLICATION_ENABLED",
      "CORPUS_KEK_PATH", "PUBLICATION_KEY_STORE_PATH", "AUTHORIZATION_DATABASE_URL", "PUBLICATION_CLEANUP_DATABASE_URL",
      "ERASURE_DATABASE_URL", "ACCOUNT_ERASURE_GRACE_MS", "MAIL_SENDMAIL_PATH", "MAIL_FROM", "PUBLIC_APP_URL",
      "DATABASE_URL", "API_HOST", "API_PORT", "STRANGER_SAMPLE_RATE", "REGISTER_VERSION", "BATTERY_VERSION",
      "SETTLEMENT_WATCH_HANDLE", "PROVIDER_DISCOVERY_TARGETS_JSON", "HATCHET_CLIENT_TOKEN", "HATCHET_HOST_PORT",
      "HATCHET_API_URL", "HATCHET_TENANT_ID", "HATCHET_WORKFLOW_NAME", "HATCHET_TLS_STRATEGY"
    ]) expect(env.has(key), key).toBe(true);
    expect(env.get("NODE_ENV")).toBe("production");
    expect(env.get("API_HOST")).toBe("127.0.0.1");
    expect(env.get("API_PORT")).toBe("8790");
    expect(env.get("CONTENT_ENCRYPTION_ENABLED")).toBe("true");
    expect(env.get("HATCHET_TLS_STRATEGY")).toBe("tls");
    expect(env.get("HATCHET_HOST_PORT")).toBe("127.0.0.1:7077");
    expect(env.get("ACCOUNT_ERASURE_GRACE_MS")).toBe("604800000");
    const urls = [...env.entries()].filter(([key]) => key.endsWith("DATABASE_URL"));
    expect(urls.length).toBe(6);
    const roles = urls.map(([key, url]) => {
      expect(url, key).toMatch(/^postgresql:\/\/debateai_prod_[a-z_]+:<[a-z-]+>@localhost\/debateai\?host=\/var\/run\/postgresql$/);
      return /^postgresql:\/\/([a-z_]+):/.exec(url)?.[1];
    });
    expect(new Set(roles).size).toBe(6);
    for (const [key] of env) expect(key).not.toMatch(/^DEBATEAI_DEV_|^EVALUATOR_DEV_MENU/);
  });

  it("runner.env.example and ui.env.example carry only what those services need", () => {
    const runner = envKeys(read("deploy/vps/env/runner.env.example"));
    for (const key of ["NODE_ENV", "KEK_PATH", "DATABASE_URL", "RUNNER_WORKER_ID", "REGISTER_VERSION", "CONTENT_ENCRYPTION_ENABLED", "USER_DEK_STORE_PATH", "HATCHET_CLIENT_TOKEN", "HATCHET_TLS_STRATEGY", "VLLM_BASE_URL", "PROVIDER_REF"]) {
      expect(runner.has(key), key).toBe(true);
    }
    expect(runner.get("DATABASE_URL")).toMatch(/^postgresql:\/\/debateai_prod_runner_runtime:<[a-z-]+>@localhost\/debateai\?host=\/var\/run\/postgresql$/);
    expect(runner.get("KEK_PATH")).toBe("/etc/debateai/runner/kek.bin");
    expect(runner.has("BLIND_INDEX_KEY_PATH")).toBe(false);
    const ui = envKeys(read("deploy/vps/env/ui.env.example"));
    expect(ui.get("DIALECTICAL_API_BASE")).toBe("http://127.0.0.1:8790");
    expect(ui.get("NEXT_PUBLIC_API_BASE")).toBe("/api");
    for (const [key] of ui) expect(key).not.toMatch(/KEK|DATABASE_URL|HATCHET|SECRET$/);
  });
});
