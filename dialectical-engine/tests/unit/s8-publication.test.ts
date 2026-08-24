import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, open, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type Answer } from "@debateai/contract";
import type { Pool } from "pg";
import {
  FilePublicationKeyStore,
  MemoryPublicationKeyStore,
  PublicationCipher,
  PublicationKeyUnresolvedError,
  assertPublicationSecretDomains,
  loadKek,
  type LoadedPublicationKey,
  type PublicationKeyFileSystem,
  type PublicationKeyStore
} from "../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { PostgresPublicationRepository } from "@debateai/db";

const roots: string[] = [];

function publicDebate(publicationRef: string) {
  return {
    public_ref: publicationRef,
    author_pseudonym: "Stable Public Name",
    question: "Should the public see this?",
    published_at: "2026-08-24T00:00:00.000Z",
    answer: {
      terminal: "SERVED",
      verdict: "SUPPORTED",
      verdict_available: true,
      confidence_band: "moderate",
      summary_segments: [{ text: "Only presentation text crosses the boundary." }],
      badges: [], residual_objections: [], reversal_point: "Contrary public evidence",
      as_of: "2026-08-24T00:00:00.000Z"
    }
  } as const;
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("S8 publication crypto and projection", () => {
  it("rejects equal material, inode aliases, and symlink-resolved secret-store overlap", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s8-domain-"));
    roots.push(root);
    const privateKekPath = join(root, "private.kek");
    const corpusKekPath = join(root, "corpus.kek");
    const aliasKekPath = join(root, "alias.kek");
    const equalKekPath = join(root, "equal.kek");
    const privateStorePath = join(root, "private-store");
    const publicationStorePath = join(root, "publication-store");
    const aliasedPublicationStore = join(root, "publication-store-alias");
    await writeFile(privateKekPath, Buffer.alloc(32, 0x11), { mode: 0o600 });
    await writeFile(corpusKekPath, Buffer.alloc(32, 0x22), { mode: 0o600 });
    await writeFile(equalKekPath, Buffer.alloc(32, 0x11), { mode: 0o600 });
    await mkdir(privateStorePath);
    await mkdir(publicationStorePath);
    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(corpusKekPath),
      privateKekPath, corpusKekPath, privateStorePath, publicationStorePath
    })).not.toThrow();

    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(equalKekPath),
      privateKekPath, corpusKekPath: equalKekPath, privateStorePath, publicationStorePath
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    await link(privateKekPath, aliasKekPath);
    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(aliasKekPath),
      privateKekPath, corpusKekPath: aliasKekPath, privateStorePath, publicationStorePath
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    await symlink(privateStorePath, aliasedPublicationStore);
    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(corpusKekPath),
      privateKekPath, corpusKekPath, privateStorePath,
      publicationStorePath: aliasedPublicationStore
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    const nestedPrivateKekPath = join(privateStorePath, "private.kek");
    await writeFile(nestedPrivateKekPath, Buffer.alloc(32, 0x11), { mode: 0o600 });
    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(nestedPrivateKekPath), corpusKek: loadKek(corpusKekPath),
      privateKekPath: nestedPrivateKekPath, corpusKekPath,
      privateStorePath, publicationStorePath
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    const nestedCorpusKekPath = join(publicationStorePath, "corpus.kek");
    await writeFile(nestedCorpusKekPath, Buffer.alloc(32, 0x22), { mode: 0o600 });
    expect(() => assertPublicationSecretDomains({
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(nestedCorpusKekPath),
      privateKekPath, corpusKekPath: nestedCorpusKekPath,
      privateStorePath, publicationStorePath
    })).toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");
  });

  it("wraps each publication key under only the corpus KEK and destroys it independently", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s8-publication-"));
    roots.push(root);
    const publicationRef = randomUUID();
    const runId = randomUUID();
    const corpus = new PublicationCipher(new FilePublicationKeyStore(
      root,
      loadKek(Buffer.alloc(32, 0xa8))
    ));
    const prepared = await corpus.create(publicationRef, runId);
    const envelope = prepared.encrypt(publicDebate(publicationRef));
    prepared.close();
    const keyRecord = await readFile(
      join(root, "publications", publicationRef, "publication-key.v1.json"),
      "utf8"
    );
    expect(keyRecord).toContain(`publication-key:${publicationRef}:v1`);
    expect(keyRecord).not.toContain("Only presentation text");

    const wrongDomain = new PublicationCipher(new FilePublicationKeyStore(
      root,
      loadKek(Buffer.alloc(32, 0xb8))
    ));
    await expect(wrongDomain.open(publicationRef, runId))
      .rejects.toBeInstanceOf(PublicationKeyUnresolvedError);
    const opened = await corpus.open(publicationRef, runId);
    expect(opened.decrypt(envelope)).toEqual(publicDebate(publicationRef));
    opened.close();
    await corpus.destroy(publicationRef);
    await expect(corpus.open(publicationRef, runId))
      .rejects.toBeInstanceOf(PublicationKeyUnresolvedError);
  });

  it("binds snapshot ciphertext to run identity and rejects decrypted row-identity mismatch", async () => {
    const publicationRef = randomUUID();
    const runId = randomUUID();
    const otherRunId = randomUUID();
    const cipher = new PublicationCipher(
      new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd1)))
    );
    const prepared = await cipher.create(publicationRef, runId);
    const envelope = prepared.encrypt(publicDebate(publicationRef));
    prepared.close();
    const relocated = await cipher.open(publicationRef, otherRunId);
    expect(() => relocated.decrypt(envelope)).toThrow();
    relocated.close();

    const mismatchedCandidates = [
      publicDebate(randomUUID()),
      {
        ...publicDebate(publicationRef),
        published_at: "2026-08-24T00:00:01.000Z"
      }
    ];
    for (const candidate of mismatchedCandidates) {
      const mismatchPrepared = await cipher.open(publicationRef, runId);
      const mismatchedEnvelope = mismatchPrepared.encrypt(candidate);
      mismatchPrepared.close();
      const revalidatePublic = vi.fn(async () => true);
      const repository = {
        readPublic: async () => ({
          publicationRef, runId, contentCiphertext: mismatchedEnvelope,
          createdAt: new Date("2026-08-24T00:00:00.000Z")
        }),
        revalidatePublic
      } as unknown as PostgresPublicationRepository;
      await expect(new PostgresPublicationApplication(repository, cipher).readPublicDebate(publicationRef))
        .resolves.toBeNull();
      expect(revalidatePublic).not.toHaveBeenCalled();
    }
  });

  it("zeroizes loaded per-publication key material when a prepared cipher closes", async () => {
    class TrackingStore implements PublicationKeyStore {
      stored: Buffer | undefined;
      loaded: Buffer | undefined;
      async store(_publicationRef: string, key: Uint8Array): Promise<void> {
        this.stored = Buffer.from(key);
      }
      async load(publicationRef: string): Promise<LoadedPublicationKey> {
        this.loaded = Buffer.from(this.stored!);
        return Object.freeze({ publicationRef, key: this.loaded });
      }
      async destroy(): Promise<void> { this.stored?.fill(0); this.stored = undefined; }
    }
    const store = new TrackingStore();
    const cipher = new PublicationCipher(store);
    const publicationRef = randomUUID();
    const runId = randomUUID();
    const created = await cipher.create(publicationRef, runId);
    created.close();
    const opened = await cipher.open(publicationRef, runId);
    opened.close();
    expect(store.loaded).toEqual(Buffer.alloc(32));
  });

  it("surfaces publication-key cleanup failure instead of swallowing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s8-key-cleanup-"));
    roots.push(root);
    const fileSystem = {
      mkdir, chmod, readFile, rename, stat,
      open: async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        return new Proxy(handle, {
          get(target, property, receiver) {
            if (property === "sync") return async () => { throw new Error("TEMP_FSYNC_FAILED"); };
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          }
        });
      },
      rm: async () => { throw new Error("CLEANUP_FAILED"); }
    } as unknown as PublicationKeyFileSystem;
    const store = new FilePublicationKeyStore(
      root,
      loadKek(Buffer.alloc(32, 0xc1)),
      fileSystem
    );
    await expect(store.store(randomUUID(), Buffer.alloc(32, 0xc2))).rejects.toMatchObject({
      code: "PUBLICATION_KEY_STORE_CLEANUP_FAILED"
    });
  });

  it("authorizes visibility before opening a key and revalidates after decryption", async () => {
    class TrackingStore implements PublicationKeyStore {
      stored: Buffer | undefined;
      loaded: Buffer | undefined;
      readonly calls: string[] = [];
      async store(_publicationRef: string, key: Uint8Array): Promise<void> {
        this.stored = Buffer.from(key);
      }
      async load(publicationRef: string): Promise<LoadedPublicationKey> {
        this.calls.push("load");
        this.loaded = Buffer.from(this.stored!);
        return Object.freeze({ publicationRef, key: this.loaded });
      }
      async destroy(): Promise<void> {}
    }
    const store = new TrackingStore();
    const cipher = new PublicationCipher(store);
    const publicationRef = randomUUID();
    const runId = randomUUID();
    const createdAt = new Date("2026-08-24T00:00:00.000Z");
    const prepared = await cipher.create(publicationRef, runId);
    const contentCiphertext = prepared.encrypt(publicDebate(publicationRef));
    prepared.close();
    const repository = {
      readPublic: async () => {
        store.calls.push("readPublic");
        return { publicationRef, runId, contentCiphertext, createdAt };
      },
      revalidatePublic: async () => {
        store.calls.push("revalidatePublic");
        return false;
      }
    } as unknown as PostgresPublicationRepository;
    const application = new PostgresPublicationApplication(repository, cipher);
    await expect(application.readPublicDebate(publicationRef)).resolves.toBeNull();
    expect(store.calls).toEqual(["readPublic", "load", "revalidatePublic"]);
    expect(store.loaded).toEqual(Buffer.alloc(32));
  });

  it("rejects an invalid grant before either audit KDF or publication-key provisioning", async () => {
    const hashSourceIp = vi.fn(async () => "must-not-run");
    const hashUserAgent = vi.fn(async () => "must-not-run");
    const databaseRepository = new PostgresPublicationRepository({
      query: vi.fn(async () => ({ rows: [{ live: false }] }))
    } as unknown as Pool, { hashSourceIp, hashUserAgent } as never);
    await expect(databaseRepository.publish({
      runId: randomUUID(), userId: randomUUID(), ownerRef: randomUUID(),
      sessionId: randomUUID(), grantTokenHash: `sha256:${"1".repeat(64)}`,
      occurredAt: new Date(), source: { ip: "192.0.2.1", userAgent: "UA", requestId: "r" },
      publicationRef: randomUUID(), expectedPseudonym: "opaque",
      contentCiphertext: { v: 1, keyId: "x", nonce: "x", ct: "x", tag: "x" }
    })).resolves.toBe(false);
    expect(hashSourceIp).not.toHaveBeenCalled();
    expect(hashUserAgent).not.toHaveBeenCalled();

    let stores = 0;
    const store: PublicationKeyStore = {
      store: async () => { stores += 1; },
      load: async () => { throw new PublicationKeyUnresolvedError(); },
      destroy: async () => undefined
    };
    const application = new PostgresPublicationApplication({
      preflightGrant: async () => false,
      readAuthorPseudonym: async () => { throw new Error("must not resolve owner"); }
    } as unknown as PostgresPublicationRepository, new PublicationCipher(store));
    const runId = randomUUID();
    await expect(application.publish({
      runId,
      answer: { run_ref: runId, terminal: "SERVED" } as Answer,
      authenticated: {
        userId: randomUUID(), ownerRef: randomUUID(),
        session: { session_id: randomUUID() }
      } as AuthenticatedSession,
      grantToken: "g".repeat(43),
      source: { ip: "192.0.2.1", userAgent: "UA", requestId: "r" }
    })).resolves.toBeNull();
    expect(stores).toBe(0);
  });

  it("keeps failed unpublish key cleanup pending and makes reconciliation idempotently retryable", async () => {
    const publicationRef = randomUUID();
    let failDestroy = true;
    let completed = false;
    const store: PublicationKeyStore = {
      store: async () => undefined,
      load: async () => { throw new PublicationKeyUnresolvedError(); },
      destroy: async () => {
        if (failDestroy) throw new Error("SECRET_STORE_DELETE_FAILED");
      }
    };
    const repository = {
      listPendingKeyCleanup: async () => completed ? [] : [publicationRef],
      completeKeyCleanup: async (candidate: string) => {
        expect(candidate).toBe(publicationRef);
        completed = true;
        return true;
      }
    } as unknown as PostgresPublicationRepository;
    const application = new PostgresPublicationApplication(
      repository,
      new PublicationCipher(store),
      () => new Date("2026-08-24T00:00:00.000Z")
    );
    await expect(application.reconcileKeyCleanup()).rejects.toThrow("SECRET_STORE_DELETE_FAILED");
    expect(completed).toBe(false);
    failDestroy = false;
    await expect(application.reconcileKeyCleanup()).resolves.toBe(1);
    await expect(application.reconcileKeyCleanup()).resolves.toBe(0);
  });

  it("strictly rejects owner/internal fields at the anonymous boundary", () => {
    const candidate = publicDebate(randomUUID());
    for (const forbidden of [
      "asker_id", "owner_ref", "user_id", "run_ref", "answer_id",
      "memory_disclosure", "ledger_digest_handle", "inspection_handle",
      "cost_envelope", "tier_provenance_ref"
    ]) {
      expect(PublicDebateSchema.safeParse({ ...candidate, [forbidden]: "leak" }).success).toBe(false);
    }
  });
});
