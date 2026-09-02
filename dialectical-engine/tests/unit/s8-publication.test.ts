import { randomUUID } from "node:crypto";
import {
  chmod,link,lstat,mkdir,mkdtemp,open,readFile,rename,rm,stat,symlink,writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDebateSchema, type Answer, type Node } from "@debateai/contract";
import type { Pool } from "pg";
import {
  FilePublicationKeyStore,
  MemoryPublicationKeyStore,
  PublicationCipher,
  PublicationKeyUnresolvedError,
  assertPublicationSecretDomains,
  loadKek,
  type LoadedPublicationKey,
  type CryptoEnvelope,
  type PublicationKeyFileSystem,
  type PublicationKeyStore
} from "../../packages/crypto/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import {
  assertPublicationDatabaseRoleSeparation,
  PostgresPublicationRepository
} from "@debateai/db";

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

const PUBLICATION_RUN_ID = "11111111-1111-4111-8111-111111111111";
const REDACTED_OWNER_ONLY = "REDACTED_OWNER_ONLY";
const HANDLE_MARKERS = Object.freeze([
  "real-replay-ptr-base-b2c1",
  "real-replay-ptr-final-b2c1",
  "real-replay-ptr-edge-b2c1",
  "real-ledger-ptr-9f2a"
]);

const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:44444444-4444-4444-8444-444444444444",
    session_id: "55555555-5555-4555-8555-555555555555",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "66666666-6666-4666-8666-666666666666",
  ownerRef: "44444444-4444-4444-8444-444444444444",
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

function labeledNumber(replayHandle: string) {
  return {
    value: 0.75,
    kind: "probability",
    source: "test source",
    producer: "test producer",
    provenance_ref: "provenance:labeled-number",
    replay_handle: replayHandle
  };
}

function answerWithTree(): Answer {
  const nodeId = "node:public-tree";
  return {
    answer_id: "answer:s01",
    answer_version: 1,
    run_ref: PUBLICATION_RUN_ID,
    question_line: "What may be public?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "TEST_LAYER_CEILING",
      basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "test:S01",
      lift_path: "test:public"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{
      segment_id: "segment:s01",
      text: "Only the strict public summary.",
      load_bearing: true,
      served_number_refs: []
    }],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: [{
      node_id: nodeId,
      claim: "The public tree is useful.",
      way_of_knowing: "LOOKED_UP",
      base_score: labeledNumber(HANDLE_MARKERS[0]!),
      final_strength: labeledNumber(HANDLE_MARKERS[1]!),
      provenance_ref: "provenance:node",
      maker_lineage: null,
      review: null,
      locator: null,
      stranger_restatement: {
        check_status: "PASS",
        secret_extra: "LEAK-ME-RESTATEMENT",
        owner_note: "do-not-publish"
      } as Node["stranger_restatement"],
      defeater_refs: [],
      defeater_exhaustion_marked: true,
      disagreement: {
        internal_note: "LEAK-ME-DISAGREEMENT",
        ledger_ptr: "secret-ptr-9f2a"
      },
      condition_marks: [],
      abstention: {
        kind: "not searched",
        question_class: "empirical",
        risk_tier: "standard",
        price: 0.5,
        register_row_key: "abstentionPolicy",
        register_version: 1,
        register_source_ref: "register:S01",
        unlock_condition: "Search the primary sources.",
        ledger_unknown_ref: HANDLE_MARKERS[3]!
      },
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-24T00:00:00.000Z"
    }, {
      node_id: "node:public-tree-2",
      claim: "A second node proves per-node projection.",
      way_of_knowing: "REASONING",
      base_score: labeledNumber("second-node-replay-handle"),
      final_strength: null,
      provenance_ref: "provenance:node-2",
      maker_lineage: null,
      review: null,
      locator: null,
      stranger_restatement: { check_status: "NOT_SAMPLED" },
      defeater_refs: [],
      defeater_exhaustion_marked: false,
      disagreement: null,
      condition_marks: [],
      abstention: null,
      staleness_state: "FRESH",
      relevant_as_of: "2026-08-24T00:00:00.000Z"
    }],
    edges: [{
      edge_id: "edge:public-tree",
      from_node_ref: nodeId,
      target_kind: "NODE",
      target_ref: nodeId,
      relation: "support",
      strength: {
        status: "PRESENT",
        number: labeledNumber(HANDLE_MARKERS[2]!)
      },
      provenance_ref: "provenance:edge",
      placeholder: false
    }],
    badges: [],
    residual_objections: [],
    value_hinges: [],
    condition_marks: [],
    condition_mark_records: [],
    reversal_point: "Contrary public evidence.",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "test:S01",
    cost_envelope: {
      basis: { source_ref: "test:S01" },
      state: "WITHIN",
      consumed_model_attempts: 1,
      protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low",
    conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:private",
    inspection_handle: "inspection:private",
    as_of: "2026-08-24T00:00:00.000Z",
    staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

function publicationHarness() {
  const createdAt = new Date("2026-08-24T00:00:00.000Z");
  const cipher = new PublicationCipher(
    new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd2)))
  );
  let storedSnapshot: Readonly<{
    publicationRef: string;
    runId: string;
    contentCiphertext: CryptoEnvelope;
    createdAt: Date;
  }> | null = null;
  const repository = {
    preflightGrant: async () => true,
    readAuthorPseudonym: async () => "Stable Public Name",
    prepareKeyProvision: async () => true,
    publish: async (input: Readonly<{
      publicationRef: string;
      runId: string;
      contentCiphertext: CryptoEnvelope;
      occurredAt: Date;
    }>) => {
      storedSnapshot = {
        publicationRef: input.publicationRef,
        runId: input.runId,
        contentCiphertext: input.contentCiphertext,
        createdAt: input.occurredAt
      };
      return true;
    },
    abandonKeyProvision: async () => true,
    withContentLease: async <T>(_publicationRef: string, use: () => Promise<T>) => use(),
    readPublic: async (publicationRef: string) =>
      storedSnapshot?.publicationRef === publicationRef ? storedSnapshot : null,
    listPublicRefs: async () => ({
      refs: storedSnapshot === null ? [] : [storedSnapshot.publicationRef],
      total: storedSnapshot === null ? 0 : 1
    }),
    revalidatePublic: async () => true
  } as unknown as PostgresPublicationRepository;
  const application = new PostgresPublicationApplication(
    repository,
    cipher,
    () => createdAt
  );
  return {
    application,
    async storeLegacy() {
      const publicationRef = randomUUID();
      const prepared = await cipher.create(publicationRef, PUBLICATION_RUN_ID);
      try {
        storedSnapshot = {
          publicationRef,
          runId: PUBLICATION_RUN_ID,
          contentCiphertext: prepared.encrypt(publicDebate(publicationRef)),
          createdAt
        };
      } finally {
        prepared.close();
      }
      return publicationRef;
    },
    async publish(answer: Answer) {
      const transition = await application.publish({
        runId: answer.run_ref,
        answer,
        authenticated,
        grantToken: "g".repeat(43),
        source: { ip: "192.0.2.1", userAgent: "S01 test", requestId: "request:S01" }
      });
      if (transition === null) throw new TypeError("S01_TEST_PUBLICATION_FAILED");
      const snapshot = storedSnapshot;
      if (snapshot === null) throw new TypeError("S01_TEST_SNAPSHOT_MISSING");
      const prepared = await cipher.open(snapshot.publicationRef, snapshot.runId);
      try {
        return {
          transition,
          debate: PublicDebateSchema.parse(prepared.decrypt(snapshot.contentCiphertext))
        };
      } finally {
        prepared.close();
      }
    }
  };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("S8 publication crypto and projection", () => {
  it("rejects superuser, SET ROLE, and grant-table capabilities independently in the boot witness", async () => {
    const publication = {
      session_principal: "publication_login",
      principal: "publication_login",
      session_principal_is_superuser: false,
      principal_is_superuser: false,
      can_transition: true,
      can_rotate_after_step_up: false,
      is_authorization_member: false,
      can_select_grant: false,
      can_insert_grant: false,
      can_update_grant: false,
      can_delete_grant: false
    };
    const authorization = {
      ...publication,
      session_principal: "authorization_login",
      principal: "authorization_login",
      can_rotate_after_step_up: true,
      is_authorization_member: true
    };
    const pool = (row: typeof publication): Pool => ({
      query: async () => ({ rows: [row] })
    }) as unknown as Pool;
    await expect(assertPublicationDatabaseRoleSeparation(
      pool(publication), pool(authorization)
    )).resolves.toBeUndefined();
    for (const mutant of [
      { ...publication, principal_is_superuser: true },
      { ...publication, session_principal_is_superuser: true },
      { ...publication, principal: "debateai_runtime" }
    ]) await expect(assertPublicationDatabaseRoleSeparation(
      pool(mutant), pool(authorization)
    )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
    for (const mutant of [
      { ...authorization, principal_is_superuser: true },
      { ...authorization, session_principal_is_superuser: true },
      { ...authorization, principal: "debateai_authorization_runtime" },
      { ...authorization, can_select_grant: true },
      { ...authorization, can_insert_grant: true },
      { ...authorization, can_update_grant: true },
      { ...authorization, can_delete_grant: true }
    ]) await expect(assertPublicationDatabaseRoleSeparation(
      pool(publication), pool(mutant)
    )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
  });

  it("rejects equal material, inode aliases, and symlink-resolved secret-store overlap", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-s8-domain-"));
    roots.push(root);
    const privateKekPath = join(root, "private.kek");
    const corpusKekPath = join(root, "corpus.kek");
    const aliasKekPath = join(root, "alias.kek");
    const equalKekPath = join(root, "equal.kek");
    const privateStorePath = join(root, "private-store");
    const publicationStorePath = join(root, "publication-store");
    const blindIndexPath = join(root, "blind-index.key");
    const contentBlindIndexPath = join(root, "content-blind-index.key");
    const auditSourceSaltPath = join(root, "audit-source-salt.key");
    const auditStorePath = join(root, "audit-store");
    const aliasedPublicationStore = join(root, "publication-store-alias");
    await writeFile(privateKekPath, Buffer.alloc(32, 0x11), { mode: 0o600 });
    await writeFile(corpusKekPath, Buffer.alloc(32, 0x22), { mode: 0o600 });
    await writeFile(equalKekPath, Buffer.alloc(32, 0x11), { mode: 0o600 });
    await mkdir(privateStorePath);
    await mkdir(publicationStorePath);
    await mkdir(auditStorePath);
    await writeFile(blindIndexPath, Buffer.alloc(32, 0x33), { mode: 0o600 });
    await writeFile(contentBlindIndexPath, Buffer.alloc(32, 0x44), { mode: 0o600 });
    await writeFile(auditSourceSaltPath, Buffer.alloc(32, 0x55), { mode: 0o600 });
    const additionalSecrets = [
      { path: blindIndexPath, material: Buffer.alloc(32, 0x33) },
      { path: contentBlindIndexPath, material: Buffer.alloc(32, 0x44) },
      { path: auditSourceSaltPath, material: Buffer.alloc(32, 0x55) }
    ];
    const baseline = {
      privateKek: loadKek(privateKekPath), corpusKek: loadKek(corpusKekPath),
      privateKekPath, corpusKekPath, privateStorePath, publicationStorePath,
      additionalSecrets, additionalStorePaths: [auditStorePath]
    };
    expect(() => assertPublicationSecretDomains(baseline)).not.toThrow();

    const equalAuxiliaryMaterial = {
      ...baseline,
      additionalSecrets: [
        { path: blindIndexPath, material: Buffer.alloc(32, 0x22) },
        ...additionalSecrets.slice(1)
      ]
    };
    expect(() => assertPublicationSecretDomains(equalAuxiliaryMaterial))
      .toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    const auxiliaryHardlinkPath = join(root, "blind-index-hardlink.key");
    await link(corpusKekPath, auxiliaryHardlinkPath);
    const auxiliaryHardlink = {
      ...baseline,
      additionalSecrets: [
        { path: auxiliaryHardlinkPath, material: Buffer.alloc(32, 0x66) },
        ...additionalSecrets.slice(1)
      ]
    };
    expect(() => assertPublicationSecretDomains(auxiliaryHardlink))
      .toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    const aliasedAuditStore = join(root, "audit-store-alias");
    await symlink(publicationStorePath, aliasedAuditStore);
    const auxiliaryStoreAlias = {
      ...baseline,
      additionalStorePaths: [aliasedAuditStore]
    };
    expect(() => assertPublicationSecretDomains(auxiliaryStoreAlias))
      .toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

    const nestedAuditSaltPath = join(auditStorePath, "nested-audit-salt.key");
    await writeFile(nestedAuditSaltPath, Buffer.alloc(32, 0x77), { mode: 0o600 });
    const auxiliaryNesting = {
      ...baseline,
      additionalSecrets: [
        ...additionalSecrets.slice(0, 2),
        { path: nestedAuditSaltPath, material: Buffer.alloc(32, 0x77) }
      ]
    };
    expect(() => assertPublicationSecretDomains(auxiliaryNesting))
      .toThrow("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");

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

  it("publishes corpus keys only after file, child-directory, and parent-directory fsync", async () => {
    const root = await mkdtemp(join(tmpdir(),"debateai-s10-publication-durability-"));
    roots.push(root);
    const publicationRef = randomUUID();
    const events: string[] = [];
    const io = {
      mkdir,chmod,lstat,readFile,rename,rm,stat,
      async open(path: string,flags: string,mode?: number) {
        const handle = await open(path,flags,mode);
        const kind = path.endsWith(".tmp") ? "temp"
          : path===join(root,"publications") ? "parent" : "directory";
        events.push(`open-${kind}`);
        return {
          writeFile: handle.writeFile.bind(handle),
          async sync() { events.push(`sync-${kind}`); await handle.sync(); },
          async close() { events.push(`close-${kind}`); await handle.close(); }
        };
      }
    } as unknown as PublicationKeyFileSystem;
    const kekBytes = Buffer.alloc(32,0xa9);
    const store = new FilePublicationKeyStore(root,loadKek(kekBytes),io);
    await store.store(publicationRef,Buffer.alloc(32,0xaa));
    expect(events).toEqual([
      "open-temp","sync-temp","close-temp",
      "open-directory","sync-directory","close-directory",
      "open-parent","sync-parent","close-parent"
    ]);
    const loaded = await new FilePublicationKeyStore(root,loadKek(kekBytes)).load(publicationRef);
    expect(loaded.key).toEqual(Buffer.alloc(32,0xaa));
    loaded.key.fill(0);
  });

  it("fails closed at every corpus-key publication fsync stage", async () => {
    for (const failure of ["temp","directory","parent"] as const) {
      const root = await mkdtemp(join(tmpdir(),`debateai-s10-publication-${failure}-`));
      roots.push(root);
      const publicationRef = randomUUID();
      const io = {
        mkdir,chmod,lstat,readFile,rename,rm,stat,
        async open(path: string,flags: string,mode?: number) {
          const handle = await open(path,flags,mode);
          const kind = path.endsWith(".tmp") ? "temp"
            : path===join(root,"publications") ? "parent" : "directory";
          return {
            writeFile: handle.writeFile.bind(handle),
            async sync() {
              if (kind===failure) throw new Error(`PUBLICATION_${failure.toUpperCase()}_FSYNC_FAILED`);
              await handle.sync();
            },
            close: handle.close.bind(handle)
          };
        }
      } as unknown as PublicationKeyFileSystem;
      const store = new FilePublicationKeyStore(root,loadKek(Buffer.alloc(32,0xab)),io);
      if (failure==="temp") {
        await expect(store.store(publicationRef,Buffer.alloc(32,0xac)))
          .rejects.toThrow("PUBLICATION_TEMP_FSYNC_FAILED");
        await expect(lstat(join(root,"publications",publicationRef)))
          .rejects.toMatchObject({ code: "ENOENT" });
      } else {
        await expect(store.store(publicationRef,Buffer.alloc(32,0xac)))
          .rejects.toMatchObject({ code: "PUBLICATION_KEY_STORE_DURABILITY_UNCERTAIN" });
        expect((await stat(join(
          root,"publications",publicationRef,"publication-key.v1.json"
        ))).isFile()).toBe(true);
      }
    }
  });

  it("publishes corpus-key absence only after unlink, parent fsync, and lstat readback", async () => {
    for (const failure of ["unlink","parent","readback"] as const) {
      const root = await mkdtemp(join(tmpdir(),`debateai-s10-publication-destroy-${failure}-`));
      roots.push(root);
      const publicationRef = randomUUID();
      const kekBytes = Buffer.alloc(32,0xad);
      await new FilePublicationKeyStore(root,loadKek(kekBytes))
        .store(publicationRef,Buffer.alloc(32,0xae));
      const io = {
        mkdir,chmod,lstat,readFile,rename,stat,
        async rm(path: string,options: { recursive: boolean; force: boolean }) {
          if (failure==="unlink") throw new Error("PUBLICATION_UNLINK_FAILED");
          if (failure!=="readback") await rm(path,options);
        },
        async open(path: string,flags: string,mode?: number) {
          const handle = await open(path,flags,mode);
          if (failure!=="parent") return handle;
          return new Proxy(handle,{
            get(target,property,receiver) {
              if (property==="sync") return async () => { throw new Error("PUBLICATION_PARENT_FSYNC_FAILED"); };
              const value = Reflect.get(target,property,receiver);
              return typeof value==="function" ? value.bind(target) : value;
            }
          });
        }
      } as unknown as PublicationKeyFileSystem;
      const faulted = new FilePublicationKeyStore(root,loadKek(kekBytes),io);
      await expect(faulted.destroy(publicationRef)).rejects.toThrow(
        failure==="unlink" ? "PUBLICATION_UNLINK_FAILED"
          : failure==="parent" ? "PUBLICATION_PARENT_FSYNC_FAILED"
            : "Secret-store directory still exists after durable removal"
      );
      const fresh = new FilePublicationKeyStore(root,loadKek(kekBytes));
      if (failure==="parent") {
        await expect(fresh.exists(publicationRef)).resolves.toBe(false);
        await expect(fresh.load(publicationRef)).rejects
          .toBeInstanceOf(PublicationKeyUnresolvedError);
      } else {
        await expect(fresh.exists(publicationRef)).resolves.toBe(true);
      }
    }

    const root = await mkdtemp(join(tmpdir(),"debateai-s10-publication-destroy-green-"));
    roots.push(root);
    const publicationRef = randomUUID();
    const kekBytes = Buffer.alloc(32,0xaf);
    const store = new FilePublicationKeyStore(root,loadKek(kekBytes));
    await store.store(publicationRef,Buffer.alloc(32,0xb0));
    await expect(store.destroy(publicationRef)).resolves.toBe("DESTROYED");
    const fresh = new FilePublicationKeyStore(root,loadKek(kekBytes));
    await expect(fresh.exists(publicationRef)).resolves.toBe(false);
    await expect(fresh.load(publicationRef)).rejects
      .toBeInstanceOf(PublicationKeyUnresolvedError);
    await expect(fresh.destroy(publicationRef)).resolves.toBe("ALREADY_ABSENT");
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
        withContentLease: async <T>(_publicationRef: string,use: () => Promise<T>) => use(),
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
      async exists(): Promise<boolean> { return this.stored !== undefined; }
      async destroy(): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
        if (this.stored === undefined) return "ALREADY_ABSENT";
        this.stored.fill(0);
        this.stored = undefined;
        return "DESTROYED";
      }
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
      code: "PUBLICATION_KEY_STORE_DURABILITY_UNCERTAIN"
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
      async exists(): Promise<boolean> { return this.stored !== undefined; }
      async destroy(): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
        return this.stored === undefined ? "ALREADY_ABSENT" : "DESTROYED";
      }
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
      withContentLease: async <T>(_publicationRef: string,use: () => Promise<T>) => use(),
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
      exists: async () => stores > 0,
      destroy: async () => "DESTROYED"
    };
    const auditPreflightDenial = vi.fn(async () => true);
    const application = new PostgresPublicationApplication({
      preflightGrant: async () => false,
      auditAuthenticatedPreflightDenial: auditPreflightDenial,
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
    expect(auditPreflightDenial).toHaveBeenCalledOnce();
  });

  it("keeps failed unpublish key cleanup pending and makes reconciliation idempotently retryable", async () => {
    const publicationRef = randomUUID();
    let failDestroy = true;
    let noOpDestroy = true;
    let completed = false;
    let present = true;
    const store: PublicationKeyStore = {
      store: async () => undefined,
      load: async () => { throw new PublicationKeyUnresolvedError(); },
      exists: async () => present,
      destroy: async () => {
        if (failDestroy) throw new Error("SECRET_STORE_DELETE_FAILED");
        if (noOpDestroy) return "DESTROYED";
        present = false;
        return "DESTROYED";
      }
    };
    const repository = {
      withContentLease: async <T>(_publicationRef: string,use: () => Promise<T>) => use(),
      claimKeyCleanup: async () => completed ? [] : [{
        publicationRef,claimToken: "claim-token"
      }],
      completeKeyCleanup: async (
        candidate: string,claimToken: string,destroyResult: string
      ) => {
        expect(candidate).toBe(publicationRef);
        expect(claimToken).toBe("claim-token");
        expect(destroyResult).toBe("DESTROYED");
        completed = true;
        return true;
      }
    } as unknown as PostgresPublicationRepository;
    const application = new PostgresPublicationApplication(
      repository,
      new PublicationCipher(store),
      () => new Date("2026-08-24T00:00:00.000Z")
    );
    await expect(application.reconcileKeyCleanup()).resolves.toBe(0);
    expect(completed).toBe(false);
    failDestroy = false;
    await expect(application.reconcileKeyCleanup()).resolves.toBe(0);
    expect(completed).toBe(false);
    noOpDestroy = false;
    await expect(application.reconcileKeyCleanup()).resolves.toBe(1);
    await expect(application.reconcileKeyCleanup()).resolves.toBe(0);
  });

  it("publishes the tree without leaking owner-only fields", async () => {
    const answer = answerWithTree();
    const { debate } = await publicationHarness().publish(answer);
    const expectedNodes = answer.nodes.map((inputNode) => ({
      ...inputNode,
      base_score: {
        ...inputNode.base_score,
        source: REDACTED_OWNER_ONLY,
        provenance_ref: REDACTED_OWNER_ONLY,
        replay_handle: REDACTED_OWNER_ONLY
      },
      final_strength: inputNode.final_strength === null
        ? null
          : {
            ...inputNode.final_strength,
            source: REDACTED_OWNER_ONLY,
            provenance_ref: REDACTED_OWNER_ONLY,
            replay_handle: REDACTED_OWNER_ONLY
          },
      provenance_ref: REDACTED_OWNER_ONLY,
      review: inputNode.review === null
        ? null
        : {
            ...inputNode.review,
            provenance_ref: REDACTED_OWNER_ONLY
          },
      abstention: inputNode.abstention === null
        ? null
        : { ...inputNode.abstention, ledger_unknown_ref: REDACTED_OWNER_ONLY },
      stranger_restatement: {
        check_status: inputNode.stranger_restatement.check_status
      },
      disagreement: null
    }));
    const expectedEdges = answer.edges.map((inputEdge) => ({
      ...inputEdge,
      strength: inputEdge.strength.status === "PRESENT"
        ? {
            ...inputEdge.strength,
            number: {
              ...inputEdge.strength.number,
              provenance_ref: REDACTED_OWNER_ONLY,
              replay_handle: REDACTED_OWNER_ONLY
            }
          }
        : inputEdge.strength,
      provenance_ref: REDACTED_OWNER_ONLY
    }));

    expect(debate.answer.nodes).toEqual(expectedNodes);
    expect(debate.answer.edges).toEqual(expectedEdges);
    expect(debate.answer.tree_included).toBe(true);
  });

  it("redacts only ledger_unknown_ref's abstention value, leaving the rest of the record intact", async () => {
    const answer = answerWithTree();
    const inputAbstention = answer.nodes[0]!.abstention!;
    const { ledger_unknown_ref: _secret, ...publicAbstention } = inputAbstention;
    const { debate } = await publicationHarness().publish(answer);
    const publishedNode = debate.answer.nodes?.find(
      (node) => node.node_id === answer.nodes[0]!.node_id
    );

    expect(publishedNode).toBeDefined();
    expect.soft(publishedNode!.abstention).toEqual({
      ...publicAbstention,
      ledger_unknown_ref: REDACTED_OWNER_ONLY
    });
    expect(publishedNode!.abstention!.ledger_unknown_ref).not.toBe(inputAbstention.ledger_unknown_ref);
  });

  it("redacts replay_handle on node scores and present edge strength numbers", async () => {
    const answer = answerWithTree();
    const inputNode = answer.nodes[0]!;
    const inputEdge = answer.edges[0]!;
    const { debate } = await publicationHarness().publish(answer);
    const publishedNode = debate.answer.nodes?.find((node) => node.node_id === inputNode.node_id);
    const publishedEdge = debate.answer.edges?.find((edge) => edge.edge_id === inputEdge.edge_id);

    expect(publishedNode).toBeDefined();
    expect(publishedNode!.base_score).toEqual({
      ...inputNode.base_score,
      source: REDACTED_OWNER_ONLY,
      provenance_ref: REDACTED_OWNER_ONLY,
      replay_handle: REDACTED_OWNER_ONLY
    });
    expect(publishedNode!.final_strength).toEqual({
      ...inputNode.final_strength!,
      source: REDACTED_OWNER_ONLY,
      provenance_ref: REDACTED_OWNER_ONLY,
      replay_handle: REDACTED_OWNER_ONLY
    });
    expect(publishedEdge?.strength.status).toBe("PRESENT");
    if (publishedEdge?.strength.status !== "PRESENT" || inputEdge.strength.status !== "PRESENT") {
      throw new TypeError("S01_TEST_PRESENT_EDGE_MISSING");
    }
    expect(publishedEdge.strength.number).toEqual({
      ...inputEdge.strength.number,
      provenance_ref: REDACTED_OWNER_ONLY,
      replay_handle: REDACTED_OWNER_ONLY
    });
  });

  it("redacts aliased edge provenance_ref values before publication", async () => {
    const secret = "edge-prov-alias-HANDLE-9f2a-SHOULD-NOT-LEAK";
    const answer = answerWithTree();
    const inputEdge = answer.edges[0]!;
    if (inputEdge.strength.status !== "PRESENT") {
      throw new TypeError("S01_TEST_PRESENT_EDGE_MISSING");
    }
    inputEdge.strength.number.provenance_ref = secret;
    inputEdge.strength.number.replay_handle = secret;
    inputEdge.provenance_ref = secret;

    const { debate } = await publicationHarness().publish(answer);
    const publishedEdge = debate.answer.edges?.find((edge) => edge.edge_id === inputEdge.edge_id);
    expect(publishedEdge?.strength.status).toBe("PRESENT");
    if (publishedEdge?.strength.status !== "PRESENT") {
      throw new TypeError("S01_TEST_PRESENT_EDGE_MISSING");
    }

    expect.soft(publishedEdge.strength.number.replay_handle).toBe(REDACTED_OWNER_ONLY);
    expect.soft(publishedEdge.strength.number.provenance_ref).toBe(REDACTED_OWNER_ONLY);
    expect.soft(publishedEdge.provenance_ref).toBe(REDACTED_OWNER_ONLY);
    expect(JSON.stringify(debate)).not.toContain(secret);
  });

  it("redacts derivable base score provenance_ref values before publication", async () => {
    const provenanceRef = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const replayHandle = `judgement:${provenanceRef}`;
    const answer = answerWithTree();
    answer.nodes[0]!.base_score.provenance_ref = provenanceRef;
    answer.nodes[0]!.base_score.replay_handle = replayHandle;

    const { debate } = await publicationHarness().publish(answer);
    const publishedBaseScore = debate.answer.nodes?.find(
      (node) => node.node_id === answer.nodes[0]!.node_id
    )?.base_score;

    expect(publishedBaseScore).toBeDefined();
    expect.soft(publishedBaseScore!.replay_handle).toBe(REDACTED_OWNER_ONLY);
    expect.soft(publishedBaseScore!.provenance_ref).toBe(REDACTED_OWNER_ONLY);
    expect(`judgement:${publishedBaseScore!.provenance_ref}`).not.toBe(replayHandle);
  });

  it("redacts node and review provenance_ref values before publication", async () => {
    const answer = answerWithTree();
    const inputNode = answer.nodes[0]!;
    inputNode.provenance_ref = "node-raw-artifact-id-SHOULD-NOT-LEAK";
    inputNode.review = {
      outcome: "agree",
      reasons: ["The evidence supports this node."],
      provenance_ref: "review-raw-artifact-id-SHOULD-NOT-LEAK",
      reviewer_lineage: {
        maker: "reviewer",
        model_id: "review-model",
        transport: "test",
        provider_ref: "development:review-provider"
      }
    };

    const { debate } = await publicationHarness().publish(answer);
    const publishedNode = debate.answer.nodes?.find((node) => node.node_id === inputNode.node_id);

    expect(publishedNode).toBeDefined();
    expect.soft(publishedNode!.provenance_ref).toBe(REDACTED_OWNER_ONLY);
    expect.soft(publishedNode!.review).toEqual({
      outcome: inputNode.review.outcome,
      reasons: inputNode.review.reasons,
      provenance_ref: REDACTED_OWNER_ONLY,
      reviewer_lineage: inputNode.review.reviewer_lineage
    });
    expect(JSON.stringify(debate)).not.toContain("raw-artifact-id-SHOULD-NOT-LEAK");
  });

  it("redacts aliased base_score.source and final_strength.source without redacting edge source", async () => {
    const rawArtifactRef = "raw-artifact-id-SHARED-BY-node-prov-and-score-sources";
    const edgeSource = "EVIDENCE_VERIFIER";
    const answer = answerWithTree();
    const inputNode = answer.nodes[0]!;
    const inputEdge = answer.edges[0]!;
    if (inputNode.final_strength === null || inputEdge.strength.status !== "PRESENT") {
      throw new TypeError("S01_TEST_SOURCE_ALIAS_FIXTURE_INCOMPLETE");
    }
    inputNode.provenance_ref = rawArtifactRef;
    inputNode.base_score.source = rawArtifactRef;
    inputNode.final_strength.source = rawArtifactRef;
    inputEdge.strength.number.source = edgeSource;

    const { debate } = await publicationHarness().publish(answer);
    const publishedNode = debate.answer.nodes?.find((node) => node.node_id === inputNode.node_id);
    const publishedEdge = debate.answer.edges?.find((edge) => edge.edge_id === inputEdge.edge_id);

    expect(publishedNode).toBeDefined();
    expect.soft(publishedNode!.base_score.source).toBe(REDACTED_OWNER_ONLY);
    expect.soft(publishedNode!.final_strength?.source).toBe(REDACTED_OWNER_ONLY);
    expect.soft(JSON.stringify(debate)).not.toContain(rawArtifactRef);
    expect(publishedEdge?.strength.status).toBe("PRESENT");
    if (publishedEdge?.strength.status !== "PRESENT") {
      throw new TypeError("S01_TEST_PRESENT_EDGE_MISSING");
    }
    expect(publishedEdge.strength.number.source).toBe(edgeSource);
  });

  it("strips residual handle marker values from the published JSON", async () => {
    const { debate } = await publicationHarness().publish(answerWithTree());
    const serialized = JSON.stringify(debate);

    for (const marker of HANDLE_MARKERS) expect.soft(serialized).not.toContain(marker);
  });

  it("projects stranger_restatement to its public check_status only", async () => {
    const answer = answerWithTree();
    const { debate } = await publicationHarness().publish(answer);
    const restatement = debate.answer.nodes?.find(
      (node) => node.node_id === answer.nodes[0]!.node_id
    )?.stranger_restatement;
    const serialized = JSON.stringify(debate);

    expect.soft(restatement).toEqual({ check_status: "PASS" });
    expect.soft(Object.keys(restatement ?? {})).toEqual(["check_status"]);
    expect.soft(serialized).not.toContain("LEAK-ME-RESTATEMENT");
    expect(serialized).not.toContain("do-not-publish");
  });

  it("nulls disagreement instead of publishing its open record", async () => {
    const answer = answerWithTree();
    const { debate } = await publicationHarness().publish(answer);
    const disagreement = debate.answer.nodes?.find(
      (node) => node.node_id === answer.nodes[0]!.node_id
    )?.disagreement;
    const serialized = JSON.stringify(debate);

    expect.soft(disagreement).toBeNull();
    expect.soft(serialized).not.toContain("LEAK-ME-DISAGREEMENT");
    expect(serialized).not.toContain("secret-ptr-9f2a");
  });

  it("reading a published debate restores the same public tree that was published", async () => {
    const answer = answerWithTree();
    const harness = publicationHarness();
    const published = await harness.publish(answer);
    const read = await harness.application.readPublicDebate(published.transition.public_ref);

    expect(read).not.toBeNull();
    expect.soft(read!.answer.nodes).toEqual(published.debate.answer.nodes);
    expect.soft(read!.answer.edges).toEqual(published.debate.answer.edges);
    expect(PublicDebateSchema.safeParse(read).success).toBe(true);
  });

  it("lists each published model once in first-seen order", async () => {
    const answer = answerWithTree();
    const first = {
      ...answer.nodes[0]!,
      maker_lineage: {
        maker: "OpenAI",
        model_id: "gpt-5.6-sol",
        transport: "responses",
        provider_ref: "provider:openai"
      }
    };
    answer.nodes = [
      first,
      { ...first, node_id: "node:public-tree-duplicate" },
      {
        ...first,
        node_id: "node:public-tree-claude",
        maker_lineage: {
          maker: "Anthropic",
          model_id: "claude-opus-5",
          transport: "responses",
          provider_ref: "provider:anthropic"
        }
      }
    ];
    const harness = publicationHarness();
    await harness.publish(answer);

    const listed = await harness.application.list(20, 0);

    expect(listed.items[0]?.models).toEqual([
      "gpt-5.6-sol",
      "claude-opus-5"
    ]);
  });

  it("reads a legacy answer-only snapshot without fabricating a tree", async () => {
    const harness = publicationHarness();
    const publicationRef = await harness.storeLegacy();
    const read = await harness.application.readPublicDebate(publicationRef);

    expect(read).not.toBeNull();
    expect.soft(read!.answer.tree_included).toBeUndefined();
    expect.soft(read!.answer.nodes).toBeUndefined();
    expect(read!.answer.edges).toBeUndefined();
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
