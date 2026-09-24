// tests/architecture/vps-deployment-baseline.test.ts
// Pins the VPS deployment baseline (PLAN §8 C3, §9.1 C3 amendments, audit corrections
// L2-F3, L5-F6/F7/F8/F11, L7-F2/F3/F7). Every assertion is a floor on a file under
// deploy/; the files are configuration, so the pins are textual and deliberately exact.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
  "deploy/vps/systemd/debateai-hatchet.service",
  "deploy/vps/systemd/debateai-observation-agent.service"
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
  "deploy/vps/env/ui.env.example",
  "deploy/vps/env/observation-agent.env.example"
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

/**
 * DL5-F7. hardening.sql closes CONNECT to PUBLIC and re-opens it by name, so a role missing from
 * its list cannot connect at all: the support data plane and the support-config operator were
 * missing, and on the VPS the support chat failed closed at boot. The list is checked against the
 * manifest rather than restated: every capability role the managed principals inherit CONNECT
 * through, and every principal a migration mints with its own LOGIN.
 */
describe("VPS baseline: hardening.sql re-opens CONNECT for every manifest role (DL5-F7)", () => {
  const fullManifest = JSON.parse(
    read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")
  ) as {
    capabilityRoles: ReadonlyArray<{ roleName: string }>;
    principals: ReadonlyArray<{ id: string; roleName: string; database: string }>;
    principalProvisioning: ReadonlyArray<{ principalId: string; state: string }>;
  };

  function connectGrantees(sql: string): ReadonlySet<string> {
    const grantees = new Set<string>();
    for (const match of sqlStatements(sql).matchAll(/GRANT\s+CONNECT\s+ON\s+DATABASE\s+debateai\s+TO\s+([^;]+);/giu)) {
      for (const role of (match[1] ?? "").split(",")) grantees.add(role.trim());
    }
    return grantees;
  }

  it("grants CONNECT on debateai to every capability role and every migration-minted principal", () => {
    const grantees = connectGrantees(read("deploy/postgres/hardening.sql"));
    const migrationMinted = new Set(fullManifest.principalProvisioning
      .filter(({ state }) => state === "MIGRATION_PROVISIONED_UNMANAGED_CREDENTIAL")
      .map(({ principalId }) => principalId));
    const expected = [
      ...fullManifest.capabilityRoles.map(({ roleName }) => roleName),
      ...fullManifest.principals
        .filter(({ id, database }) => database === "debateai" && migrationMinted.has(id))
        .map(({ roleName }) => roleName)
    ];
    expect(expected).toContain("debateai_support");
    expect(expected).toContain("debateai_support_config_operator");
    expect(expected.filter((role) => !grantees.has(role))).toEqual([]);
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
      // Caddy's own 0640 root:caddy copy: the UI refuses a secret file with any group bit.
      "header_up X-Debateai-Edge-Secret {file./etc/debateai/ui-edge.caddy.secret}",
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

  /**
   * Task 14: the observation agent's unit. Same hardening floor as the three application units,
   * its own OS user, no custody group, no writable path but its state directory — and it is NOT
   * switched on by the runbook's enable line, because the agent has never run on Linux (§12).
   */
  it("debateai-observation-agent.service: own user, hardening floor, no custody, not enabled by §5", () => {
    const unit = read("deploy/vps/systemd/debateai-observation-agent.service");
    expect(unit).toContain("User=debateai-observer");
    expect(unit).toContain("EnvironmentFile=/etc/debateai/observation-agent.env");
    for (const needle of HARDENING) expect(unit, `observation-agent: ${needle}`).toContain(needle);
    expect(unit).not.toContain("MemoryDenyWriteExecute=true");
    expect(unit).not.toMatch(/^ReadWritePaths=/m);
    expect(unit).not.toContain("debateai-custody");
    expect(unit).toContain("StateDirectory=debateai-observation-agent");
    expect(unit).toContain("ExecStart=/usr/bin/pnpm --dir /opt/debateai/dialectical-engine exec tsx apps/observation-agent/src/main.ts");
    expect(unit).toMatch(/^After=.*\bpostgresql\.service\b/m);
    const readme = read("deploy/vps/README.md");
    const enable = /systemctl enable --now ([^\n]*(?:\\\n[^\n]*)*)/u.exec(readme)?.[1] ?? "";
    expect(enable).toContain("debateai-api");
    expect(enable).not.toContain("debateai-observation-agent");
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

  /**
   * DL2-F5. The support session and case keys live in Postgres, wrapped by the support KEK, so
   * the nightly dump carries them — and without the support KEK in escrow a restore from that
   * dump can never open a single support conversation. It is the fifth escrowed secret, beside
   * the four the C3 baseline named, and the drill proves it came back.
   */
  it("backup.sh escrows the support KEK as the fifth secret, and the drill proves it came back (DL2-F5)", () => {
    const script = read("deploy/vps/backup.sh");
    expect(script).toContain(': "${SUPPORT_KEK_PATH:?}"');
    const escrow = script.slice(script.indexOf('tar -cf "$WORK/keys.tar"'), script.indexOf("KEY_DIGEST="));
    for (const key of ["KEK_PATH", "CORPUS_KEK_PATH", "BLIND_INDEX_KEY_PATH", "AUDIT_SOURCE_IP_SALT_PATH", "SUPPORT_KEK_PATH"]) {
      expect(escrow, key).toContain(`"$(basename "$${key}")"`);
    }
    // The support KEK never rides in the data envelope with the dump it unlocks.
    const dataEnvelope = script.slice(script.indexOf("# --- 3. the custody tree"), script.indexOf("# --- 5."));
    expect(dataEnvelope).not.toContain("SUPPORT_KEK_PATH");
    const conf = envKeys(read("deploy/vps/backup.conf.example"));
    expect(conf.get("SUPPORT_KEK_PATH")).toBe("/etc/debateai/api/support-kek.bin");
    expect(envKeys(read("deploy/vps/env/api.env.example")).get("SUPPORT_KEK_PATH")).toBe(conf.get("SUPPORT_KEK_PATH"));
    const drill = read("deploy/vps/restore-drill.sh");
    expect(drill).toContain(': "${SUPPORT_KEK_PATH:?}"');
    expect(drill).toContain("RESTORE_DRILL_REFUSED no restored support KEK");
    expect(drill.indexOf("RESTORE_DRILL_REFUSED no restored support KEK"))
      .toBeLessThan(drill.indexOf("RESTORE_DRILL_OK"));
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
    // V-19: tar restores the live tree's own modes and group, so a host running
    // the custody group hands the drill 2750/0640 material owned by a group the
    // postgres user is not in. The drill normalises the WHOLE tree, not just its
    // top directories, and proves the backup opens under the strictest contract.
    expect(script).toMatch(/find "\$WORK\/custody" "\$WORK\/keys" -type d -exec chmod 0700 \{\} \+/);
    expect(script).toMatch(/find "\$WORK\/custody" "\$WORK\/keys" -type f -exec chmod 0600 \{\} \+/);
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

  /**
   * V-9, ruled 2026-09-22. The kit used to say the production maker path was
   * undefined and that the relays were dev-only code. Both halves are superseded:
   * the relays are the LOCAL deployment, a supported product path, and this host
   * is the hosted one, which refuses them in code.
   */
  it("README rules the provider path and no longer calls the relays dev-only", () => {
    const readme = read("deploy/vps/README.md");
    expect(readme).not.toMatch(/relays[^.]*are dev-only code/u);
    expect(readme).not.toContain("The production maker path is not defined here");
    for (const needle of [
      "DEBATEAI_DEPLOYMENT_MODE=hosted",
      "DEPLOYMENT_MODE_UNRESOLVED",
      "PROVIDER_TARGET_LOOPBACK_REFUSED",
      "PROVIDER_INLINE_CREDENTIAL_REFUSED",
      "COST_ENVELOPES_NOT_SEALED",
      "authorization_file",
      "/etc/debateai/runner/providers",
      "/etc/debateai/api/providers",
      "systemd-ask-password",
      "PROVIDER_VENDOR_NOT_VETTED",
      "buildConfiguredProviderSetDeploymentRow",
      "superseded, never edited"
    ]) expect(readme, needle).toContain(needle);
    // The vetting step V approved, named as the first step of the procedure.
    expect(readme).toMatch(/data-use and retention terms/u);
    expect(readme).toMatch(/privacy notice/u);
  });

  /**
   * Constraint 10: a fenced block in a document the owner may read holds only
   * commands that are safe to paste as-is. §11 is new prose, so its blocks are
   * checked here rather than trusted.
   */
  it("README §11's shell blocks carry no angle-bracket placeholder", () => {
    const readme = read("deploy/vps/README.md");
    const section = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    expect(section).not.toBe("");
    for (const block of section.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      expect(block[1], block[1]).not.toMatch(/<[a-z-]+>/u);
    }
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
      "HATCHET_API_URL", "HATCHET_TENANT_ID", "HATCHET_WORKFLOW_NAME", "HATCHET_TLS_STRATEGY",
      "DEBATEAI_DEPLOYMENT_MODE",
      // E-I2: both are REQUIRED by apiEnvironmentShape and by the rotation's
      // own shape, and both were absent — an api.env built from this example
      // refused at boot with KEK_UNRESOLVED, and the runbook's rotation command
      // (which loads this same file) refused before touching a record.
      "SUPPORT_KEK_PATH", "SUPPORT_DATABASE_URL"
    ]) expect(env.has(key), key).toBe(true);
    expect(env.get("NODE_ENV")).toBe("production");
    // V-9(c): both services answer the same question with the same word, or the
    // API would admit a relay target the runner refuses.
    expect(env.get("DEBATEAI_DEPLOYMENT_MODE")).toBe("hosted");
    expect(envKeys(read("deploy/vps/env/runner.env.example")).get("DEBATEAI_DEPLOYMENT_MODE"))
      .toBe("hosted");
    expect(env.get("API_HOST")).toBe("127.0.0.1");
    expect(env.get("API_PORT")).toBe("8790");
    expect(env.get("CONTENT_ENCRYPTION_ENABLED")).toBe("true");
    expect(env.get("HATCHET_TLS_STRATEGY")).toBe("tls");
    expect(env.get("HATCHET_HOST_PORT")).toBe("127.0.0.1:7077");
    expect(env.get("ACCOUNT_ERASURE_GRACE_MS")).toBe("604800000");
    // Six API principals, one URL each (P3-01: api-runtime, content-provision, authorization,
    // publication-cleanup, erasure, api-support). The sixth is SUPPORT_DATABASE_URL, which the
    // strict shape requires and this example used to omit (E-I2). There is no seventh:
    // MIGRATION_DATABASE_URL is the just-in-time superuser credential and the manifest invariant
    // NO_LONG_LIVED_SUPERUSER_CREDENTIAL forbids parking it in an EnvironmentFile.
    const urls = [...env.entries()].filter(([key]) => key.endsWith("DATABASE_URL"));
    expect(urls.length).toBe(6);
    expect(env.has("MIGRATION_DATABASE_URL")).toBe(false);
    const roles = urls.map(([key, url]) => {
      expect(url, key).toMatch(/^postgresql:\/\/debateai_prod_[a-z_]+:<[a-z-]+>@localhost\/debateai\?host=\/var\/run\/postgresql$/);
      return /^postgresql:\/\/([a-z_]+):/.exec(url)?.[1];
    });
    expect(new Set(roles).size).toBe(6);
    for (const [key] of env) expect(key).not.toMatch(/^DEBATEAI_DEV_|^EVALUATOR_DEV_MENU/);
  });

  it("units declare the custody group, so it does not depend on a lookup systemd may skip", () => {
    // Both units set User= AND Group= explicitly, which is exactly the case
    // where systemd does not consult the group database for the user's other
    // groups. `usermod -a -G` alone would leave the runner outside the group at
    // runtime, and every key read would refuse.
    for (const unit of ["debateai-api", "debateai-runner"]) {
      expect(read(`deploy/vps/systemd/${unit}.service`), unit)
        .toMatch(/^SupplementaryGroups=.*\bdebateai-custody\b/m);
    }
    // The UI touches no key material and must not be in the group.
    expect(read("deploy/vps/systemd/debateai-ui.service")).not.toContain("debateai-custody");
  });

  it("README provisions the tree the runner must traverse, with an explicit mode", () => {
    const readme = read("deploy/vps/README.md");
    // The runner has to walk /var/lib/debateai and /var/lib/debateai/api to
    // reach the store. Today they exist only as a by-product of `install -d` on
    // the leaf, so nothing pins what they are.
    expect(readme).toMatch(
      /install -d -m 0755 -o root -g root \/var\/lib\/debateai \/var\/lib\/debateai\/api/
    );
    expect(readme).toContain("| `/var/lib/debateai/api` |");
  });

  it("README's custody check tests the group, not only the mode", () => {
    // A 2750 directory whose group is debateai-api passes a mode-only check and
    // is refused at runtime, which is the worst kind of green.
    expect(read("deploy/vps/README.md")).toMatch(/! -group debateai-custody -print/);
  });

  it("README provisions the V-19 custody group and no longer leaves the question open", () => {
    const readme = read("deploy/vps/README.md");
    for (const needle of [
      "DEBATEAI_CUSTODY_GROUP", "debateai-custody", "0750", "0640",
      // The group is created and BOTH principals that read the user-DEK store join it.
      "groupadd --system debateai-custody",
      "usermod -a -G debateai-custody debateai-api",
      "usermod -a -G debateai-custody debateai-runner"
    ]) expect(readme, needle).toContain(needle);
    // V-19 is ruled: the runbook must no longer present the two-principal custody
    // problem as an open question for the owner.
    expect(readme).not.toContain("Custody and the three service users — **OPEN, needs V**");
    // The relaxation is opt-in and bounded: the key files that only the API reads
    // stay 0600 in a 0700 directory.
    for (const needle of ["0600", "0700"]) expect(readme, needle).toContain(needle);
  });

  it("README documents the V-3 master-key rotation and its retirement rule", () => {
    const readme = read("deploy/vps/README.md");
    for (const needle of [
      "rotate-kek-cli.ts", "KEK_PREVIOUS_PATH", "CORPUS_KEK_PREVIOUS_PATH",
      "SUPPORT_KEK_PREVIOUS_PATH", "KEYS_ROTATE_KEK_OK", "KEYS_ROTATE_KEK_FAILED"
    ]) expect(readme, needle).toContain(needle);
    // The rule the whole design turns on: the old key is retired only AFTER a
    // clean verification pass, never before.
    expect(readme).toMatch(/only after .*KEYS_ROTATE_KEK_OK/i);
    // Content is never re-encrypted — an operator must not expect a content pass.
    expect(readme).toContain("never re-encrypt");
  });

  /**
   * FIX WAVE A-I4 / E-I1 / E-I3. The procedure used to describe a changeover
   * the code could not perform and a key replacement it left half-done: the
   * runner's own copy of the KEK was never refreshed, its previous path named a
   * file `debateai-runner` cannot open, and the paste-as-is block would
   * overwrite the only copy of the previous key on a second paste.
   */
  it("README's rotation procedure covers the runner's copy, both previous paths and a re-run guard", () => {
    const readme = read("deploy/vps/README.md");
    const section = readme.slice(
      readme.indexOf("### Changing a master key (V-3)"),
      readme.indexOf("## 4. PostgreSQL")
    );
    expect(section).not.toBe("");
    // The runner's own two files: the new key, and a previous key inside a
    // directory its own user owns.
    expect(section).toContain("/etc/debateai/runner/kek.bin.new");
    expect(section).toContain("KEK_PREVIOUS_PATH=/etc/debateai/runner-previous/kek.bin");
    expect(section).toContain(
      "install -d -m 0700 -o debateai-runner -g debateai-runner /etc/debateai/runner-previous"
    );
    // The re-run guard: a second paste must stop before it can overwrite the
    // only remaining copy of the previous key.
    expect(section).toContain("test ! -e /etc/debateai/api-previous/kek.bin");
    // The restart comes BEFORE the rotation command, which is the order that
    // makes the changeover work at all.
    const restart = section.indexOf("systemctl restart debateai-api debateai-runner");
    const rotate = section.indexOf("rotate-kek-cli.ts");
    expect(restart).toBeGreaterThan(-1);
    expect(rotate).toBeGreaterThan(restart);
    // And the confirmation step: the verified count against the store itself.
    expect(section).toContain("find /var/lib/debateai/api/user-deks/users -mindepth 1 -maxdepth 1 -type d | wc -l");
    // Every fenced block in this section is a real command, not a result or a
    // placeholder to fill in (constraint 10).
    for (const block of section.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      expect(block[1], block[1]).not.toMatch(/<[a-z-]+>/u);
    }
  });

  it("api.env.example and runner.env.example both opt into the custody group (V-19)", () => {
    const api = envKeys(read("deploy/vps/env/api.env.example"));
    const runner = envKeys(read("deploy/vps/env/runner.env.example"));
    expect(api.get("DEBATEAI_CUSTODY_GROUP")).toBe("debateai-custody");
    expect(runner.get("DEBATEAI_CUSTODY_GROUP")).toBe("debateai-custody");
    const ui = envKeys(read("deploy/vps/env/ui.env.example"));
    expect(ui.has("DEBATEAI_CUSTODY_GROUP")).toBe(false);
  });

  it("runner.env.example and ui.env.example carry only what those services need", () => {
    const runner = envKeys(read("deploy/vps/env/runner.env.example"));
    // V-20: the three VLLM_* keys are gone from this file on purpose — they
    // described a primary provider this host does not have, and their
    // `<unused-on-vps>` placeholders passed the shape check and then failed the
    // drift cross-check, so the runner could not have started as the kit stood.
    for (const key of ["NODE_ENV", "KEK_PATH", "DATABASE_URL", "RUNNER_WORKER_ID", "REGISTER_VERSION", "CONTENT_ENCRYPTION_ENABLED", "USER_DEK_STORE_PATH", "HATCHET_CLIENT_TOKEN", "HATCHET_TLS_STRATEGY", "DEBATEAI_DEPLOYMENT_MODE", "PROVIDER_REF", "PROVIDER_DISCOVERY_TARGETS_JSON"]) {
      expect(runner.has(key), key).toBe(true);
    }
    for (const key of ["VLLM_BASE_URL", "VLLM_MODEL", "VLLM_MAKER", "VLLM_AUTHORIZATION"]) {
      expect(runner.has(key), key).toBe(false);
    }
    expect(runner.get("DEBATEAI_DEPLOYMENT_MODE")).toBe("hosted");
    expect(runner.get("DATABASE_URL")).toMatch(/^postgresql:\/\/debateai_prod_runner_runtime:<[a-z-]+>@localhost\/debateai\?host=\/var\/run\/postgresql$/);
    expect(runner.get("KEK_PATH")).toBe("/etc/debateai/runner/kek.bin");
    expect(runner.has("BLIND_INDEX_KEY_PATH")).toBe(false);
    const ui = envKeys(read("deploy/vps/env/ui.env.example"));
    expect(ui.get("DIALECTICAL_API_BASE")).toBe("http://127.0.0.1:8790");
    expect(ui.get("NEXT_PUBLIC_API_BASE")).toBe("/api");
    for (const [key] of ui) expect(key).not.toMatch(/KEK|DATABASE_URL|HATCHET|SECRET$/);
  });

  /**
   * Task 14 (DEPLOY1). The kit carried a "Known-stale sections" banner listing what a first
   * provision would trip over. Each item is pinned here as fixed, and the banner is gone.
   */
  it("README: the Task 14 refresh — banner removed, every item it listed fixed", () => {
    const readme = read("deploy/vps/README.md");
    expect(readme).not.toContain("Known-stale sections");
    const providers = readme.slice(readme.indexOf("## 11. Providers and vendors"));
    for (const code of [
      "PROVIDER_TARGET_PRICE_REQUIRED", "PROVIDER_TARGET_PRICE_ZERO",
      "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID", "COST_ENVELOPE_POLICY_UNRESOLVED",
      "COST_ENVELOPE_POLICY_INVALID", "SUPPORT_ADMISSION_SCOPES_NOT_SEALED"
    ]) expect(providers, code).toMatch(new RegExp(`\\| \`${code}`, "u"));
    expect(providers).toContain('"input_price_micros_per_million":3000000');
    expect(providers).toContain('"output_price_micros_per_million":15000000');
    expect(readme).not.toMatch(/daily\s+call\s+cap\s+is\s+the\s+only\s+ceiling\s+until/u);
    expect(readme).not.toMatch(/KEK rotation\*\* is not implemented/u);
    expect(readme).toContain("pnpm keys:rotate-kek");
    const layout = readme.slice(readme.indexOf("## 3. `/etc/debateai` layout"), readme.indexOf("### The key-file contract"));
    expect(layout).toMatch(/\| `\/etc\/debateai\/api\/` \|[^\n]*`support-kek\.bin`/u);
    expect(layout).toMatch(/SUPPORT_DATABASE_URL[^\n]*debateai_prod_api_support/u);
  });

  it("README: cost envelopes, register publication, rehearsals, V-9(a)(b), known limitations", () => {
    const readme = read("deploy/vps/README.md");
    for (const needle of [
      // V-28: the temporary values for the owner's first paid run, and how they are superseded.
      "`250000`", "`2000000`", "0.25 USD", "2.00 USD", "provisional: true", "provisional: false",
      // The settings register on this host, and the rows a hosted start-up refuses without.
      "### Publishing the settings register on this host", "costEnvelopePolicy", "admissionPolicy",
      "configuredProviderSet", "Task 14b", "go-live blocker",
      // Rehearsals as runbook steps.
      "#### Rehearsing the rotation", "tests/unit/rotate-kek.test.ts", "#### The restore rehearsal",
      // V-9(a)(b).
      "V-9(a) and (b)", "ssh -L 8888:127.0.0.1:8888",
      // Honest limitations for what the owner ruled out of this round.
      "ASK_PLAN_TIER_MODEL_UNAVAILABLE", "Task 16", "V-26", "V-17", "B28", "Task 13",
      // The provisioner's real command line, and the six principals provisioned expired.
      "pnpm db:provision-principals --support-config-credential-file", "VALID UNTIL '-infinity'",
      // The observation agent's database access, consistent with V-29.
      "a narrow statistics window (V-29)"
    ]) expect(readme, needle).toContain(needle);
  });

  /** Constraint 10, over the whole runbook now rather than one section. */
  it("README: every fenced block is a paste-safe sh block or an explicit text block", () => {
    const readme = read("deploy/vps/README.md");
    const fences = [...readme.matchAll(/^```(\S*)$/gmu)].map((match) => match[1]);
    expect(fences.length % 2).toBe(0);
    for (let index = 0; index < fences.length; index += 2) {
      expect(["sh", "text"], `opening fence #${index / 2}`).toContain(fences[index]);
      expect(fences[index + 1], `closing fence #${index / 2}`).toBe("");
    }
    for (const block of readme.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      expect(block[1], block[1]).not.toMatch(/<[A-Za-z][A-Za-z0-9_-]*>/u);
      expect(block[1], block[1]).not.toContain("→");
    }
  });

  /**
   * V-29 (migration 0068, merged). The kit's wording — "a narrow statistics window" — is true only
   * while (1) a migration really revokes pg_monitor from the agent and hands it the definer
   * function, (2) no LATER migration grants it a pg_* role again, and (3) nothing in deploy/
   * grants any pg_* role to anyone.
   */
  it("V-29: the window exists in the migrations, nothing re-grants a pg_* role, and deploy/ grants none", () => {
    const migrationsDirectory = resolve(engineRoot, "migrations");
    const migrations = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
    const window = migrations.find((name) => name.startsWith("0068_"));
    expect(window).toBeDefined();
    const windowSql = sqlStatements(read(`migrations/${window!}`));
    expect(windowSql).toMatch(/REVOKE\s+pg_monitor\s+FROM\s+debateai_observation_agent\s*;/u);
    expect(windowSql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+obs\.postgres_capacity\([^)]*\)\s+TO\s+debateai_observation_agent\s*;/u);
    expect(windowSql).toContain("OBS_AGENT_PREDEFINED_ROLE_MEMBERSHIP");
    for (const name of migrations.filter((candidate) => candidate > window!)) {
      expect(sqlStatements(read(`migrations/${name}`)), name)
        .not.toMatch(/GRANT\s+pg_[a-z_]+\s+TO\s+[^;]*debateai_observation_agent/iu);
    }
    for (const file of POSTGRES_FILES) {
      if (!file.endsWith(".sql")) continue;
      expect(sqlStatements(read(file)), file).not.toMatch(/GRANT\s+pg_[a-z_]+\s+TO/iu);
      expect(sqlStatements(read(file)), file).not.toMatch(/\bpg_(monitor|read_all_stats)\b/iu);
    }
  });

  /**
   * Task 14 review, items 1, 5, 6 and 7. A runbook block is pasted, and pasted again. A bare
   * `>` onto a key or credential file on a live host replaces the only copy of that secret —
   * every record it wraps is then lost. So every redirect that writes a secret must be guarded
   * (a `test ! -e` / `test -e … ||` check in the same command, or noclobber), and every
   * `shred -u` must run only after the command before it SUCCEEDED (`&&`), so a failed step
   * never destroys the evidence or the envelope it needed.
   */
  it("README: every secret-writing redirect is guarded and every shred -u is chained with &&", () => {
    const readme = read("deploy/vps/README.md");
    const unguarded: string[] = [];
    const unchainedShreds: string[] = [];
    for (const block of readme.matchAll(/```sh\n([\s\S]*?)```/gu)) {
      const commands = (block[1] ?? "").replace(/\\\n\s*/gu, " ").split("\n")
        .map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
      for (const command of commands) {
        for (const redirect of command.matchAll(/(?<![0-9&])>\s*(\S+)/gu)) {
          const target = redirect[1] ?? "";
          if (!/(secret|key|pgpass|\.bin|\.header|\.json|token|password)/iu.test(target)) continue;
          if (/\btest\s+(!\s+)?-e\s/u.test(command) || /\bset\s+(-C|-o\s+noclobber)\b/u.test(command)) continue;
          unguarded.push(command);
        }
        if (/\bshred\s+-u\b/u.test(command) && !/&&\s*shred\s+-u\b/u.test(command)) {
          unchainedShreds.push(command);
        }
      }
    }
    expect(unguarded).toEqual([]);
    expect(unchainedShreds).toEqual([]);
  });

  it("README: the previous master keys are shredded only after a machine check that no service names them", () => {
    const readme = read("deploy/vps/README.md");
    const shred = /[^\n]*shred -u \/etc\/debateai\/api-previous\/kek\.bin[^\n]*/u.exec(
      readme.replace(/\\\n\s*/gu, " ")
    )?.[0] ?? "";
    expect(shred).toMatch(/!\s*grep -q '_KEK_PREVIOUS_PATH=' \/etc\/debateai\/api\.env \/etc\/debateai\/runner\.env\s*&&/u);
  });

  it("README: the edge secret is created unreadable to others, owned by the UI, with the Caddy copy", () => {
    const readme = read("deploy/vps/README.md").replace(/\\\n\s*/gu, " ");
    expect(readme).toMatch(/umask 0277[^\n]*> \/etc\/debateai\/ui-edge\.secret/u);
    expect(readme).toMatch(/chown debateai-ui:debateai-ui \/etc\/debateai\/ui-edge\.secret/u);
    expect(readme).toMatch(/install -m 0640 -o root -g caddy \/etc\/debateai\/ui-edge\.secret/u);
  });
});

