import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentCipher,
  FileRunContentKeyStore,
  MemoryRunContentKeyStore,
  generateDek,
  loadKek,
  type LoadedRunContentKey,
  type ReadableUserDekStore,
  type RunContentKeyIdentity,
  type RunContentKeyStore
} from "../../packages/crypto/src/index.js";
import {
  loadApiEnvironment,
  loadRunnerEnvironment
} from "../../packages/register/src/runtime-environment.js";
import { encryptContentForRun, type Pool } from "../../packages/db/src/index.js";

class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();

  async store(userId: string, dek: Uint8Array): Promise<void> {
    this.#keys.set(userId, Buffer.from(dek));
  }

  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }
}

type RunKeyFileSystemFailure = "temp-sync" | "directory-sync" | "cleanup";

function observingRunKeyFileSystem(
  events: string[],
  failures: ReadonlySet<RunKeyFileSystemFailure> = new Set()
) {
  return {
    mkdir,
    chmod,
    stat,
    readFile,
    async rename(source: string, destination: string) {
      events.push("rename");
      await rename(source, destination);
    },
    async rm(path: string, options: { recursive: boolean; force: boolean }) {
      events.push("cleanup");
      if (failures.has("cleanup")) throw new Error("S6_INJECTED_CLEANUP_FAILURE");
      await rm(path, options);
    },
    async open(path: string, flags: string, mode?: number) {
      const handle = await open(path, flags, mode);
      const directory = !path.includes("content-key.v1.json");
      events.push(directory ? "open-directory" : "open-temp");
      return {
        writeFile: handle.writeFile.bind(handle),
        async sync() {
          events.push(directory ? "sync-directory" : "sync-temp");
          if (!directory && failures.has("temp-sync")) {
            throw new Error("S6_INJECTED_TEMP_FSYNC_FAILURE");
          }
          if (directory && failures.has("directory-sync")) {
            throw new Error("S6_INJECTED_DIRECTORY_FSYNC_FAILURE");
          }
          await handle.sync();
        },
        async close() {
          events.push(directory ? "close-directory" : "close-temp");
          await handle.close();
        }
      };
    }
  };
}

function fileRunContentKeyStoreWithIo(
  root: string,
  users: ReadableUserDekStore,
  resolveUserId: (ownerRef: string) => Promise<string>,
  io: ReturnType<typeof observingRunKeyFileSystem>
): FileRunContentKeyStore {
  const InjectableStore = FileRunContentKeyStore as unknown as new (
    candidateRoot: string,
    candidateUsers: ReadableUserDekStore,
    candidateResolver: (ownerRef: string) => Promise<string>,
    candidateIo: ReturnType<typeof observingRunKeyFileSystem>
  ) => FileRunContentKeyStore;
  return new InjectableStore(root, users, resolveUserId, io);
}

async function fixture() {
  const users = new MemoryUserDekStore();
  const userId = randomUUID();
  const ownerRef = randomUUID();
  await users.store(userId, generateDek());
  const keys = new MemoryRunContentKeyStore(users, async (candidate) => {
    if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  });
  const cipher = new ContentCipher(keys, Buffer.alloc(32, 0x6d));
  const runId = randomUUID();
  await cipher.provisionRun(runId, { userId, ownerRef });
  return { cipher, keys, runId, userId, ownerRef };
}

function stubEnvironment(values: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

function stubApiEnvironment(): void {
  stubEnvironment({
    KEK_PATH: "/run/secrets/kek",
    BLIND_INDEX_KEY_PATH: "/run/secrets/email-blind-index",
    AUDIT_KEY_STORE_PATH: "/run/secrets/audit-users",
    AUDIT_SOURCE_IP_SALT_PATH: "/run/secrets/audit-source-ip",
    USER_DEK_STORE_PATH: "/run/secrets/user-deks",
    MAIL_SENDMAIL_PATH: "/usr/sbin/sendmail",
    MAIL_FROM: "noreply@debateai.test",
    PUBLIC_APP_URL: "https://debateai.test",
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/debateai",
    API_HOST: "127.0.0.1",
    API_PORT: "3000",
    STRANGER_SAMPLE_RATE: "0.1",
    REGISTER_VERSION: "1",
    BATTERY_VERSION: "s6",
    SETTLEMENT_WATCH_HANDLE: "s6",
    HATCHET_CLIENT_TOKEN: "s6",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8080",
    HATCHET_TENANT_ID: "s6",
    HATCHET_WORKFLOW_NAME: "s6",
    HATCHET_TLS_STRATEGY: "none"
  });
}

function stubRunnerEnvironment(): void {
  stubEnvironment({
    KEK_PATH: "/run/secrets/kek",
    DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/debateai",
    RUNNER_WORKER_ID: "s6",
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
    PROVIDER_REF: "s6",
    JUDGE_CONTRACT_HASH: "s6",
    COMPOSER_CONTRACT_HASH: "s6",
    CONFORMANCE_CONTRACT_HASH: "s6",
    PROPAGATION_CONTRACT_HASH: "s6",
    SERVE_CONTRACT_HASH: "s6",
    MAX_RECOMPOSE: "1",
    FACT_BUNDLE_VERSION: "1",
    JUDGEMENT_NUMBER_KIND: "s6",
    JUDGEMENT_PRODUCER: "s6",
    PROPAGATION_NUMBER_KIND: "s6",
    PROPAGATION_PRODUCER: "s6",
    HATCHET_ENGINE_RETRIES: "0",
    HATCHET_WORKER_NAME: "s6",
    VLLM_BASE_URL: "http://127.0.0.1:8000",
    VLLM_MODEL: "s6",
    VLLM_MAKER: "s6",
    HATCHET_CLIENT_TOKEN: "s6",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8080",
    HATCHET_TENANT_ID: "s6",
    HATCHET_WORKFLOW_NAME: "s6",
    HATCHET_TLS_STRATEGY: "none"
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("S6 per-run private content encryption", () => {
  it("returns null without touching PostgreSQL when no content cipher is configured", async () => {
    const query = vi.fn(async () => {
      throw new Error("S6_DISABLED_CIPHER_MUST_NOT_QUERY");
    });
    const pool = { query } as unknown as Pool;
    await expect(encryptContentForRun(
      pool,
      randomUUID(),
      "core.node",
      randomUUID(),
      { claimText: "legacy plaintext" }
    )).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("binds ciphertext to the carrier, primary key, run, user and envelope version", async () => {
    const { cipher, runId } = await fixture();
    const rowId = randomUUID();
    const envelope = await cipher.encrypt(runId, "core.node", rowId, {
      claimText: "Only this exact row may decrypt me."
    });

    await expect(cipher.decrypt(runId, "core.node", rowId, envelope))
      .resolves.toEqual({ claimText: "Only this exact row may decrypt me." });
    await expect(cipher.decrypt(runId, "core.node", randomUUID(), envelope))
      .rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");
    await expect(cipher.decrypt(runId, "ledger.raw_artifact", rowId, envelope))
      .rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");
    expect(JSON.stringify(envelope)).not.toContain("Only this exact row");
  });

  it("shreds one debate key without harming another debate owned by the same user", async () => {
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    await users.store(userId, generateDek());
    const keys = new MemoryRunContentKeyStore(users, async (candidate) => {
      if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
      return userId;
    });
    const cipher = new ContentCipher(keys, Buffer.alloc(32, 0x2a));
    const firstRun = randomUUID();
    const secondRun = randomUUID();
    await cipher.provisionRun(firstRun, { userId, ownerRef });
    await cipher.provisionRun(secondRun, { userId, ownerRef });
    const first = await cipher.encrypt(firstRun, "core.run", firstRun, { questionLine: "first private question" });
    const second = await cipher.encrypt(secondRun, "core.run", secondRun, { questionLine: "second private question" });

    await cipher.destroyRunKey(firstRun);

    await expect(cipher.decrypt(firstRun, "core.run", firstRun, first)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    await expect(cipher.decrypt(secondRun, "core.run", secondRun, second))
      .resolves.toEqual({ questionLine: "second private question" });
  });

  it("reports missing or unresolvable key material without identity or store details", async () => {
    const { cipher, keys, runId, userId, ownerRef } = await fixture();
    await keys.destroy(runId);
    const missing = await cipher.decrypt(runId, "core.run", runId, {
      v: 1,
      keyId: `run-content:${runId}:v1`,
      nonce: Buffer.alloc(12).toString("base64url"),
      ct: Buffer.from("missing").toString("base64url"),
      tag: Buffer.alloc(16).toString("base64url")
    }).catch((error: unknown) => error);
    expect(missing).toMatchObject({
      name: "RunContentKeyUnresolvedError",
      message: "RUN_CONTENT_KEY_UNRESOLVED"
    });
    expect(String(missing)).not.toContain(runId);
    expect(String(missing)).not.toContain(userId);
    expect(String(missing)).not.toContain(ownerRef);

    const users = new MemoryUserDekStore();
    await users.store(userId, generateDek());
    const resolverStore = new MemoryRunContentKeyStore(users, async () => {
      throw new Error(`resolver leaked ${ownerRef}`);
    });
    const resolverCipher = new ContentCipher(resolverStore, Buffer.alloc(32, 0x22));
    await resolverCipher.provisionRun(runId, { userId, ownerRef });
    const resolverFailure = await resolverCipher.encrypt(runId, "core.run", runId, {})
      .catch((error: unknown) => error);
    expect(resolverFailure).toMatchObject({
      name: "RunContentKeyUnresolvedError",
      message: "RUN_CONTENT_KEY_UNRESOLVED"
    });
    expect(String(resolverFailure)).not.toContain(ownerRef);
  });

  it("uses an owner-scoped deterministic blind index without storing the question", async () => {
    const { cipher } = await fixture();
    const owner = randomUUID();
    const same = cipher.questionBlindIndex(owner, "  Should Memory Still Match?  ");
    expect(cipher.questionBlindIndex(owner, "should memory still match?")).toEqual(same);
    expect(cipher.questionBlindIndex(randomUUID(), "should memory still match?")).not.toEqual(same);
    expect(cipher.questionBlindIndex(owner, "a different question")).not.toEqual(same);
    expect(same.toString("utf8")).not.toContain("memory");
  });

  it("persists only a wrapped per-run key in the external mode-0600 secret store", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-store-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    await users.store(userId, generateDek());
    const store = new FileRunContentKeyStore(root, users, async (candidate) => {
      if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
      return userId;
    });
    const cipher = new ContentCipher(store, Buffer.alloc(32, 0x3c));
    await cipher.provisionRun(runId, { userId, ownerRef });
    const location = join(root, "runs", runId, "content-key.v1.json");
    const serialized = await readFile(location, "utf8");

    expect((await stat(location)).mode & 0o777).toBe(0o600);
    expect(serialized).toContain(`\"run_id\":\"${runId}\"`);
    expect(serialized).toContain(`\"owner_ref\":\"${ownerRef}\"`);
    expect(serialized).not.toContain(userId);
    expect(serialized).not.toContain("private question");
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, "runs"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, "runs", runId))).mode & 0o777).toBe(0o700);
    const loaded = await store.load(runId);
    expect(loaded).toMatchObject({ runId, ownerRef });
    expect("userId" in loaded).toBe(false);
    loaded.key.fill(0);
    const envelope = await cipher.encrypt(runId, "core.run", runId, {
      questionLine: "private question survives a process restart"
    });
    const restarted = new ContentCipher(new FileRunContentKeyStore(
      root,
      users,
      async (candidate) => {
        if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
        return userId;
      }
    ), Buffer.alloc(32, 0x3c));
    await expect(restarted.decrypt(runId, "core.run", runId, envelope))
      .resolves.toEqual({ questionLine: "private question survives a process restart" });
    await restarted.destroyRunKey(runId);
    await expect(stat(location)).rejects.toMatchObject({ code: "ENOENT" });
    await rm(root, { recursive: true, force: true });
  });

  it("durably publishes a run key by syncing the temporary file and containing directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-durability-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    const events: string[] = [];
    await users.store(userId, generateDek());
    const store = fileRunContentKeyStoreWithIo(
      root,
      users,
      async (candidate) => candidate === ownerRef ? userId : "unresolved",
      observingRunKeyFileSystem(events)
    );
    try {
      await store.store(runId, { userId, ownerRef }, generateDek());
      expect(events).toEqual([
        "open-temp",
        "sync-temp",
        "close-temp",
        "rename",
        "open-directory",
        "sync-directory",
        "close-directory"
      ]);
      const location = join(root, "runs", runId, "content-key.v1.json");
      expect((await stat(location)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes an unpublished run-key directory after a temporary-file fsync crash", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-temp-crash-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    const events: string[] = [];
    await users.store(userId, generateDek());
    const store = fileRunContentKeyStoreWithIo(
      root,
      users,
      async () => userId,
      observingRunKeyFileSystem(events, new Set(["temp-sync"]))
    );
    try {
      await expect(store.store(runId, { userId, ownerRef }, generateDek()))
        .rejects.toThrow("S6_INJECTED_TEMP_FSYNC_FAILURE");
      expect(events).toContain("cleanup");
      await expect(stat(join(root, "runs", runId))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces cleanup failure instead of swallowing it after an unpublished write fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-cleanup-crash-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    await users.store(userId, generateDek());
    const store = fileRunContentKeyStoreWithIo(
      root,
      users,
      async () => userId,
      observingRunKeyFileSystem([], new Set(["temp-sync", "cleanup"]))
    );
    try {
      await expect(store.store(runId, { userId, ownerRef }, generateDek()))
        .rejects.toMatchObject({
          code: "RUN_CONTENT_KEY_STORE_CLEANUP_FAILED",
          message: "Run content-key publication cleanup did not complete"
        });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports uncertain durability without deleting a key that was already renamed", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-directory-crash-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    await users.store(userId, generateDek());
    const store = fileRunContentKeyStoreWithIo(
      root,
      users,
      async () => userId,
      observingRunKeyFileSystem([], new Set(["directory-sync"]))
    );
    try {
      await expect(store.store(runId, { userId, ownerRef }, generateDek()))
        .rejects.toMatchObject({
          code: "RUN_CONTENT_KEY_STORE_DURABILITY_UNCERTAIN",
          message: "Run content-key durability could not be confirmed"
        });
      expect((await stat(join(root, "runs", runId, "content-key.v1.json"))).isFile()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults content encryption off and fails closed when enablement lacks key paths", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", undefined);
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", undefined);
    stubApiEnvironment();
    expect(loadApiEnvironment().CONTENT_ENCRYPTION_ENABLED).toBe("false");
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", "true");
    expect(() => loadApiEnvironment()).toThrow("CONTENT_BLIND_INDEX_KEY_PATH_REQUIRED");

    vi.unstubAllEnvs();
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", undefined);
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", undefined);
    vi.stubEnv("USER_DEK_STORE_PATH", undefined);
    stubRunnerEnvironment();
    expect(loadRunnerEnvironment().CONTENT_ENCRYPTION_ENABLED).toBe("false");
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", "true");
    expect(() => loadRunnerEnvironment()).toThrow("CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED");
  });

  it("never accepts a KEK handle as the content blind-index key", async () => {
    const users = new MemoryUserDekStore();
    const store = new MemoryRunContentKeyStore(users, async () => randomUUID());
    const kek = loadKek(generateDek());
    expect(() => new ContentCipher(store, kek as unknown as Uint8Array)).toThrow("CONTENT_BLIND_INDEX_KEY_INVALID");
  });

  it("zeroes transient run keys after provisioning, use, and provisioning failure", async () => {
    const runId = randomUUID();
    const ownerRef = randomUUID();
    const userId = randomUUID();
    let provisioned: Uint8Array | undefined;
    let loaded: Buffer | undefined;
    const store: RunContentKeyStore = {
      async store(_runId: string, _identity: RunContentKeyIdentity, key: Uint8Array) {
        provisioned = key;
      },
      async load(): Promise<LoadedRunContentKey> {
        loaded = generateDek();
        return { runId, ownerRef, key: loaded };
      },
      async destroy() {}
    };
    const cipher = new ContentCipher(store, Buffer.alloc(32, 0x1a));
    await cipher.provisionRun(runId, { userId, ownerRef });
    expect([...provisioned!].every((byte) => byte === 0)).toBe(true);
    await cipher.encrypt(runId, "core.run", runId, { questionLine: "zero me" });
    expect([...loaded!].every((byte) => byte === 0)).toBe(true);

    let failedKey: Uint8Array | undefined;
    const failing = new ContentCipher({
      async store(_runId, _identity, key) {
        failedKey = key;
        throw new Error("SECRET_STORE_WRITE_FAILED");
      },
      async load() { throw new Error("unused"); },
      async destroy() {}
    }, Buffer.alloc(32, 0x1b));
    await expect(failing.provisionRun(randomUUID(), { userId, ownerRef }))
      .rejects.toThrow("SECRET_STORE_WRITE_FAILED");
    expect([...failedKey!].every((byte) => byte === 0)).toBe(true);
  });

  it("zeroes a prepared run key immediately on close and cannot reuse it", async () => {
    const runId = randomUUID();
    const ownerRef = randomUUID();
    let loaded: Buffer | undefined;
    const cipher = new ContentCipher({
      async store() {},
      async load(): Promise<LoadedRunContentKey> {
        loaded = generateDek();
        return { runId, ownerRef, key: loaded };
      },
      async destroy() {}
    }, Buffer.alloc(32, 0x1c));
    const prepared = await cipher.prepareRun(runId);
    expect([...loaded!].some((byte) => byte !== 0)).toBe(true);
    prepared.encrypt("core.run", runId, { questionLine: "prepared lifetime" });
    prepared.close();
    expect([...loaded!].every((byte) => byte === 0)).toBe(true);
    expect(() => prepared.encrypt("core.run", runId, { questionLine: "must fail" }))
      .toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    prepared.close();
  });
});
