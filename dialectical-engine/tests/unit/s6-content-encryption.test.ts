import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ContentCipher,
  FileRunContentKeyStore,
  MemoryRunContentKeyStore,
  generateDek,
  loadKek,
  type LoadedRunContentKey,
  type ReadableUserDekStore,
  type RunContentKeyFileSystem,
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

  async exists(userId: string): Promise<boolean> {
    return this.#keys.has(userId);
  }

  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}

type RunKeyFileSystemFailure = "temp-sync" | "directory-sync" | "parent-sync" | "cleanup";

function observingRunKeyFileSystem(
  events: string[],
  failures: ReadonlySet<RunKeyFileSystemFailure> = new Set()
) {
  return {
    mkdir,
    chmod,
    lstat,
    stat,
    readFile,
    readdir,
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
      const kind = !directory ? "temp" : basename(path)==="runs" ? "parent" : "directory";
      events.push(`open-${kind}`);
      return {
        writeFile: handle.writeFile.bind(handle),
        async sync() {
          events.push(`sync-${kind}`);
          if (!directory && failures.has("temp-sync")) {
            throw new Error("S6_INJECTED_TEMP_FSYNC_FAILURE");
          }
          if (kind==="directory" && failures.has("directory-sync")) {
            throw new Error("S6_INJECTED_DIRECTORY_FSYNC_FAILURE");
          }
          if (kind==="parent" && failures.has("parent-sync")) {
            throw new Error("S6_INJECTED_PARENT_FSYNC_FAILURE");
          }
          await handle.sync();
        },
        async close() {
          events.push(`close-${kind}`);
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
  const cipher = new ContentCipher(keys);
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
    ERASURE_DATABASE_URL: "postgresql://erasure:pass@127.0.0.1:5432/debateai",
    ACCOUNT_ERASURE_GRACE_MS: "604800000",
    CONTENT_PROVISION_DATABASE_URL:
      "postgresql://content:pass@127.0.0.1:5432/debateai",
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
    const cipher = new ContentCipher(keys);
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
    const resolverCipher = new ContentCipher(resolverStore);
    await resolverCipher.provisionRun(runId, { userId, ownerRef });
    const resolverFailure = await resolverCipher.encrypt(runId, "core.run", runId, {})
      .catch((error: unknown) => error);
    expect(resolverFailure).toMatchObject({
      name: "RunContentKeyUnresolvedError",
      message: "RUN_CONTENT_KEY_UNRESOLVED"
    });
    expect(String(resolverFailure)).not.toContain(ownerRef);
  });

  it("derives a row-bound non-decrypting envelope attestation that is destroyed with the run key", async () => {
    const { cipher, runId, userId, ownerRef } = await fixture();
    const sameOwnerOtherRun = randomUUID();
    await cipher.provisionRun(sameOwnerOtherRun, { userId, ownerRef });
    const prepared = await cipher.prepareRun(runId);
    const envelope = prepared.encrypt("core.run",runId,{ questionLine: "private" });
    const same = prepared.attestEnvelope("core.run",runId,"content_ciphertext",envelope);
    expect(prepared.attestEnvelope("core.run",runId,"content_ciphertext",envelope)).toEqual(same);
    expect(prepared.attestEnvelope("memory.question_key",runId,"content_ciphertext",envelope)).not.toEqual(same);
    expect(prepared.attestEnvelope("core.run",randomUUID(),"content_ciphertext",envelope)).not.toEqual(same);
    expect(prepared.attestEnvelope("core.run",runId,"other_purpose",envelope)).not.toEqual(same);
    expect(same.toString("utf8")).not.toContain("private");
    prepared.close();
    await cipher.destroyRunKey(runId);
    await expect(cipher.prepareRun(runId)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
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
    const cipher = new ContentCipher(store);
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
    ));
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
        "close-directory",
        "open-parent",
        "sync-parent",
        "close-parent"
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

  it("reports uncertain durability when the run-directory parent entry cannot be synced", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s6-key-parent-crash-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    await users.store(userId,generateDek());
    const store = fileRunContentKeyStoreWithIo(
      root,users,async () => userId,
      observingRunKeyFileSystem([],new Set(["parent-sync"]))
    );
    try {
      await expect(store.store(runId,{ userId,ownerRef },generateDek()))
        .rejects.toMatchObject({ code: "RUN_CONTENT_KEY_STORE_DURABILITY_UNCERTAIN" });
      expect((await stat(join(root,"runs",runId,"content-key.v1.json"))).isFile()).toBe(true);
    } finally {
      await rm(root,{ recursive: true,force: true });
    }
  });

  it("publishes run-key absence only after unlink, parent fsync, and lstat readback", async () => {
    for (const failure of ["unlink","parent","readback"] as const) {
      const root = await mkdtemp(join(tmpdir(),`debateai-s10-run-destroy-${failure}-`));
      const users = new MemoryUserDekStore();
      const userId = randomUUID();
      const ownerRef = randomUUID();
      const runId = randomUUID();
      await users.store(userId,generateDek());
      await new FileRunContentKeyStore(root,users,async () => userId)
        .store(runId,{ userId,ownerRef },generateDek());
      const io = {
        mkdir,chmod,lstat,readFile,readdir,rename,stat,
        async rm(path: string,options: { recursive: boolean; force: boolean }) {
          if (failure==="unlink") throw new Error("RUN_KEY_UNLINK_FAILED");
          if (failure!=="readback") await rm(path,options);
        },
        async open(path: string,flags: string,mode?: number) {
          const handle = await open(path,flags,mode);
          if (failure!=="parent") return handle;
          return new Proxy(handle,{
            get(target,property,receiver) {
              if (property==="sync") return async () => { throw new Error("RUN_KEY_PARENT_FSYNC_FAILED"); };
              const value = Reflect.get(target,property,receiver);
              return typeof value==="function" ? value.bind(target) : value;
            }
          });
        }
      } as unknown as RunContentKeyFileSystem;
      try {
        const faulted = new FileRunContentKeyStore(root,users,async () => userId,io);
        await expect(faulted.destroy(runId)).rejects.toThrow(
          failure==="unlink" ? "RUN_KEY_UNLINK_FAILED"
            : failure==="parent" ? "RUN_KEY_PARENT_FSYNC_FAILED"
              : "Secret-store directory still exists after durable removal"
        );
        const fresh = new FileRunContentKeyStore(root,users,async () => userId);
        if (failure==="parent") {
          await expect(fresh.exists(runId)).resolves.toBe(false);
          await expect(fresh.load(runId)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
        } else {
          await expect(fresh.exists(runId)).resolves.toBe(true);
        }
      } finally {
        await rm(root,{ recursive: true,force: true });
      }
    }

    const root = await mkdtemp(join(tmpdir(),"debateai-s10-run-destroy-green-"));
    const users = new MemoryUserDekStore();
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const runId = randomUUID();
    try {
      await users.store(userId,generateDek());
      const store = new FileRunContentKeyStore(root,users,async () => userId);
      await store.store(runId,{ userId,ownerRef },generateDek());
      await expect(store.destroy(runId)).resolves.toBe("DESTROYED");
      const fresh = new FileRunContentKeyStore(root,users,async () => userId);
      await expect(fresh.exists(runId)).resolves.toBe(false);
      await expect(fresh.load(runId)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
      await expect(fresh.destroy(runId)).resolves.toBe("ALREADY_ABSENT");
    } finally {
      await rm(root,{ recursive: true,force: true });
    }
  });

  it("defaults content encryption off, retires the v1 blind-index path, and requires wrapping-key paths", () => {
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", undefined);
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", undefined);
    stubApiEnvironment();
    expect(loadApiEnvironment().CONTENT_ENCRYPTION_ENABLED).toBe("false");
    vi.stubEnv("CONTENT_PROVISION_DATABASE_URL", undefined);
    expect(() => loadApiEnvironment()).toThrow();
    vi.stubEnv(
      "CONTENT_PROVISION_DATABASE_URL",
      "postgresql://content:pass@127.0.0.1:5432/debateai"
    );
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", "true");
    expect(() => loadApiEnvironment()).not.toThrow();
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", "/retired/v1.key");
    expect(() => loadApiEnvironment()).toThrow("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");

    vi.unstubAllEnvs();
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", undefined);
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", undefined);
    vi.stubEnv("USER_DEK_STORE_PATH", undefined);
    stubRunnerEnvironment();
    expect(loadRunnerEnvironment().CONTENT_ENCRYPTION_ENABLED).toBe("false");
    vi.stubEnv("CONTENT_ENCRYPTION_ENABLED", "true");
    expect(() => loadRunnerEnvironment()).toThrow("CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED");
    vi.stubEnv("CONTENT_BLIND_INDEX_KEY_PATH", "/retired/v1.key");
    expect(() => loadRunnerEnvironment()).toThrow("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");
  });

  it("never accepts a KEK handle as the content blind-index key", async () => {
    const users = new MemoryUserDekStore();
    const store = new MemoryRunContentKeyStore(users, async () => randomUUID());
    const kek = loadKek(generateDek());
    expect(() => new ContentCipher(store)).not.toThrow();
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
      async exists() { return true; },
      async ownerRef() { return ownerRef; },
      async listByOwner() { return []; },
      async destroy() { return "DESTROYED" as const; }
    };
    const cipher = new ContentCipher(store);
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
      async exists() { return false; },
      async ownerRef() { throw new Error("unused"); },
      async listByOwner() { return []; },
      async destroy() { return "ALREADY_ABSENT" as const; }
    });
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
      async exists() { return true; },
      async ownerRef() { return ownerRef; },
      async listByOwner() { return []; },
      async destroy() { return "DESTROYED" as const; }
    });
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
