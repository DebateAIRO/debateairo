import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureReleaseKey } from "../support/apiEnvironmentFixture.js";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseApiEnvironment } from "../../packages/register/src/runtime-environment.js";
import { assembleDevelopmentApiEnvironment, DEVELOPMENT_API_ENVIRONMENT_KEYS } from "../../apps/runner/src/dev-api-environment.js";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import { DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";

vi.mock("../../deploy/dev-auth/custody-root.mjs", () => ({
  resolveDevCustodyRoot: (root: string) => `${root}/custody`,
  assertDevCustodyDirectory: async () => {},
  assertDevCustodyRootCustody: async () => {}
}));

vi.mock("../../apps/runner/src/dev-deployment-register.js", () => ({
  developmentDeploymentRegisterReceiptPath: (root: string) => `${root}/custody/register.json`,
  readDevelopmentDeploymentRegisterReceipt: async () => ({ registerVersion: "1", receiptSha256: "a".repeat(64) }),
  serializeDevelopmentDeploymentRegisterReceipt: (receipt: unknown) => JSON.stringify(receipt)
}));

vi.mock("../../apps/runner/src/dev-support-model.js", () => ({
  parseDevelopmentSupportModelTargetJson: () => ({ targetJson: "{}" })
}));

const ZIP = Buffer.from("PK\x03\x04MARK-PLAIN export payload", "binary");
const USER_A = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000002";
const EXPORT_A = "10000000-0000-4000-8000-000000000001";
const EXPORT_B = "10000000-0000-4000-8000-000000000002";
const EXPORT_C = "10000000-0000-4000-8000-000000000003";

function users() {
  return { load: async (userId: string) => Buffer.alloc(32, userId === USER_A ? 0x11 : 0x22) };
}

function apiSource(): Record<string, string> {
  return {
    KEK_PATH: "/tmp/dx-kek", SUPPORT_KEK_PATH: "/tmp/dx-support-kek",
    BLIND_INDEX_KEY_PATH: "/tmp/dx-blind", RECORDS_KEY_PATH: "/tmp/dx-records",
    AUDIT_KEY_STORE_PATH: "/tmp/dx-audit", AUDIT_SOURCE_IP_SALT_PATH: "/tmp/dx-salt",
    USER_DEK_STORE_PATH: "/tmp/dx-user-deks",
    CONTENT_PROVISION_DATABASE_URL: "postgresql://localhost/content",
    AUTHORIZATION_DATABASE_URL: "postgresql://localhost/authorization",
    // Row-level security S01 (PLAN S2.5): the API's two system logins.
    API_SYSTEM_DATABASE_URL: "postgresql://localhost/api-system",
    API_AUTHORIZATION_SYSTEM_DATABASE_URL: "postgresql://localhost/authorization-system",
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

describe("FileDataExportStore", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), "dx-store-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("T-1 writes an encrypted key and archive and reads identical ZIP bytes", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const store = new FileDataExportStore({ directory, users: users() });
    await store.write(EXPORT_A, USER_A, ZIP);
    expect(await store.read(EXPORT_A, USER_A)).toEqual(ZIP);
    expect((await fs.readdir(directory)).sort()).toEqual([`${EXPORT_A}.key`, `${EXPORT_A}.zip.enc`]);
    expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(join(directory, `${EXPORT_A}.key`))).mode & 0o777).toBe(0o600);
    expect((await fs.stat(join(directory, `${EXPORT_A}.zip.enc`))).mode & 0o777).toBe(0o600);
  });

  it("T-2 sends no ZIP header or plaintext marker to filesystem writes", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const written: Buffer[] = [];
    const recordingFs = {
      ...fs,
      writeFile: async (path: string, bytes: string | Uint8Array, options: Parameters<typeof fs.writeFile>[2]) => {
        written.push(Buffer.from(bytes));
        await fs.writeFile(path, bytes, options);
      }
    };
    const store = new FileDataExportStore({ directory, users: users(), fs: recordingFs });
    await store.write(EXPORT_A, USER_A, ZIP);
    expect(written.length).toBeGreaterThan(0);
    for (const bytes of written) {
      expect(bytes.includes(Buffer.from("PK\x03\x04", "binary"))).toBe(false);
      expect(bytes.includes(Buffer.from("MARK-PLAIN"))).toBe(false);
    }
  });

  it("T-3 authenticates the export and user when opening a copied key", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const store = new FileDataExportStore({ directory, users: users() });
    await store.write(EXPORT_A, USER_A, ZIP);
    await store.write(EXPORT_B, USER_A, ZIP);
    await fs.copyFile(join(directory, `${EXPORT_A}.key`), join(directory, `${EXPORT_B}.key`));
    await expect(store.read(EXPORT_B, USER_A)).rejects.toThrow();
    await fs.copyFile(join(directory, `${EXPORT_A}.zip.enc`), join(directory, `${EXPORT_B}.zip.enc`));
    await expect(store.read(EXPORT_B, USER_A)).rejects.toThrow();
    await store.write(EXPORT_C, USER_B, ZIP);
    await fs.copyFile(join(directory, `${EXPORT_A}.key`), join(directory, `${EXPORT_C}.key`));
    await expect(store.read(EXPORT_C, USER_B)).rejects.toThrow();
    await fs.copyFile(join(directory, `${EXPORT_A}.zip.enc`), join(directory, `${EXPORT_C}.zip.enc`));
    await expect(store.read(EXPORT_C, USER_B)).rejects.toThrow();
    const sharedDekStore = new FileDataExportStore({ directory, users: {
      load: async () => Buffer.alloc(32, 0x11)
    } });
    await sharedDekStore.write(EXPORT_C, USER_A, ZIP);
    await expect(sharedDekStore.read(EXPORT_C, USER_B)).rejects.toThrow();
  });

  it("T-4 destroys the key once and refuses later reads", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const store = new FileDataExportStore({ directory, users: users() });
    await store.write(EXPORT_A, USER_A, ZIP);
    expect(await store.destroyKey(EXPORT_A)).toBe("DESTROYED");
    await expect(fs.stat(join(directory, `${EXPORT_A}.key`))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.read(EXPORT_A, USER_A)).rejects.toMatchObject({ code: "DATA_EXPORT_KEY_DESTROYED" });
    expect(await store.destroyKey(EXPORT_A)).toBe("ALREADY_ABSENT");
  });

  it("T-5 deletes only the selected archive and lists remaining IDs", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const store = new FileDataExportStore({ directory, users: users() });
    await store.write(EXPORT_A, USER_A, ZIP);
    await store.write(EXPORT_B, USER_A, ZIP);
    await store.deleteArchive(EXPORT_A);
    await expect(fs.stat(join(directory, `${EXPORT_A}.zip.enc`))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.listIds()).toEqual([EXPORT_A, EXPORT_B]);
    await store.destroyKey(EXPORT_A);
    expect(await store.listIds()).toEqual([EXPORT_B]);
  });

  it("R36 lists key-only and temporary orphans and deletes every suffix", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    const store = new FileDataExportStore({ directory, users: users() });
    const names = [".key", ".zip.enc", ".key.tmp", ".zip.enc.tmp"];
    for (const [index, suffix] of names.entries()) {
      await fs.writeFile(join(directory, `${[EXPORT_A, EXPORT_B, EXPORT_C, "10000000-0000-4000-8000-000000000004"][index]}${suffix}`), "orphan");
    }
    expect(await store.listIds()).toEqual([EXPORT_A, EXPORT_B, EXPORT_C, "10000000-0000-4000-8000-000000000004"]);
    for (const id of await store.listIds()) {
      await store.destroyKey(id);
      await store.deleteArchive(id);
    }
    expect(await fs.readdir(directory)).toEqual([]);
  });

  it("T-6 reports a destroyed user DEK as a destroyed export key", async () => {
    const { FileDataExportStore } = await import("../../apps/api/src/data-export/store.js");
    let destroyed = false;
    const store = new FileDataExportStore({ directory, users: {
      load: async () => {
        if (destroyed) throw new Error("USER_DEK_DESTROYED");
        return Buffer.alloc(32, 0x11);
      }
    } });
    await store.write(EXPORT_A, USER_A, ZIP);
    destroyed = true;
    await expect(store.read(EXPORT_A, USER_A)).rejects.toMatchObject({ code: "DATA_EXPORT_KEY_DESTROYED" });
  });

  it("T-7 parses an optional store path and emits the dev custody path", async () => {
    const without = parseApiEnvironment(apiSource());
    expect(without.DATA_EXPORT_STORE_PATH).toBeUndefined();
    const path = "/tmp/dx-custody/data-exports";
    expect(parseApiEnvironment({ ...apiSource(), DATA_EXPORT_STORE_PATH: path,
      DATA_EXPORT_DATABASE_URL: "postgresql://localhost/data-export" }).DATA_EXPORT_STORE_PATH).toBe(path);
    expect(DEVELOPMENT_API_ENVIRONMENT_KEYS).toContain("DATA_EXPORT_STORE_PATH");

    const profile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE;
    const repositoryRoot = join(directory, "repo");
    const custodyRoot = join(repositoryRoot, "custody");
    const secrets = join(custodyRoot, "secrets");
    await fs.mkdir(secrets, { recursive: true, mode: 0o700 });
    for (const name of ["kek", "support-kek", "corpus-kek", "blind-index-key", "audit-source-ip-salt", "records-key"]) {
      await fs.writeFile(join(secrets, `${name}.bin`), Buffer.alloc(32, 0x11), { mode: 0o600 });
    }
    const credentials = DEVELOPMENT_DATABASE_PRINCIPALS.map((principal, index) => {
      const password = `${String(index).padStart(32, "a")}`;
      return `${principal.environmentKey}=postgresql://${principal.roleName}:${password}@127.0.0.1:${profile.postgresPort}/debateai`;
    }).join("\n") + "\n";
    await fs.writeFile(join(custodyRoot, "database-principals.env"), credentials, { mode: 0o600 });
    const payload = Buffer.from(JSON.stringify({
      sub: "00000000-0000-4000-8000-000000000001",
      server_url: `http://localhost:${profile.hatchetApiPort}`,
      grpc_broadcast_address: `localhost:${profile.hatchetGrpcPort}`
    })).toString("base64url");
    await fs.writeFile(join(custodyRoot, "hatchet.env"), `HATCHET_CLIENT_TOKEN=e30.${payload}.sig\n`, { mode: 0o600 });
    const receipt = { registerVersion: "1", receiptSha256: "a".repeat(64) } as Parameters<typeof assembleDevelopmentApiEnvironment>[0]["registerReceipt"];
    await assembleDevelopmentApiEnvironment({
      repositoryRoot, profile, registerReceipt: receipt,
      providerPanel: { targetsJson: "[]" } as Parameters<typeof assembleDevelopmentApiEnvironment>[0]["providerPanel"],
      supportModelTarget: "{}"
    });
    const emitted = await fs.readFile(join(custodyRoot, "api.env"), "utf8");
    expect(emitted).toContain(`DATA_EXPORT_STORE_PATH=${join(custodyRoot, "data-exports")}\n`);
  });

  it("T-8 names the store in the VPS API environment but never in the backup script", async () => {
    const example = await fs.readFile(resolve("deploy/vps/env/api.env.example"), "utf8");
    const backup = await fs.readFile(resolve("deploy/vps/backup.sh"), "utf8");
    expect(example).toContain("DATA_EXPORT_STORE_PATH=/var/lib/debateai/data-exports");
    expect(backup).not.toContain("DATA_EXPORT_STORE_PATH");
  });
});
