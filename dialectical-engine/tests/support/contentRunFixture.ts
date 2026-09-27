import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek
} from "../../packages/crypto/src/index.js";
import { RunRepository, configureContentEncryption, migrate } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "./discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";

/**
 * Model scorecard (migration 0072) — ONE embedded database with the content
 * cipher configured and one active owner: the shape
 * tests/integration/v6-remaining-content-carriers.test.ts builds inline, shared
 * by the scorecard suites so the encrypted-run recipe cannot drift between them.
 * The envelope basis is a real computed structural ceiling (4 attempts), so a
 * run made here can also go through the runner's gateway factory.
 */
export interface ContentRunFixture {
  readonly database: TestDatabase;
  readonly cipher: ContentCipher;
  readonly userId: string;
  readonly ownerRef: string;
  createEncryptedRun(questionLine: string): Promise<string>;
  createLegacyRun(questionLine: string): Promise<string>;
  /** Marks the run's private content erased, exactly as the V-6 erasure case does (0040's cleanup intent). */
  eraseRunContent(runId: string): Promise<void>;
  stop(): Promise<void>;
}

type StartRunInput = Parameters<RunRepository["startRun"]>[0];

export async function startContentRunFixture(label: string): Promise<ContentRunFixture> {
  const database = await startTestDatabase();
  await migrate(database.pool);
  const secretRoot = await mkdtemp(join(tmpdir(), `debateai-${label}-`));
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const authSessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `${label}-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [authSessionId, userId, `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const cipher = new ContentCipher(new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  }));
  configureContentEncryption(database.pool, cipher);
  const runs = new RunRepository(database.pool);
  const input = (
    questionLine: string,
    principal: StartRunInput["principal"],
    sessionId: string
  ): StartRunInput => ({
    questionLine,
    askContract: { audience: label },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-26T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: `${label}:integration`,
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: `${label}:integration`,
    batteryRows: []
  });
  return Object.freeze({
    database,
    cipher,
    userId,
    ownerRef,
    createEncryptedRun: (questionLine: string) =>
      runs.startRun(input(questionLine, { kind: "server", userId, ownerRef }, authSessionId)),
    createLegacyRun: (questionLine: string) =>
      runs.startRun(input(
        questionLine, { kind: "legacy", legacyAskerId: `legacy-${label}-${randomUUID()}` }, randomUUID()
      )),
    eraseRunContent: async (runId: string) => {
      await database.pool.query(
        `INSERT INTO serve.private_run_key_cleanup_intent (
           request_ref,user_id,run_id,requested_at,cleanup_publication_refs
         ) VALUES ($1,$2,$3,now(),'{}')`,
        [randomUUID(), userId, runId]
      );
    },
    stop: async () => {
      await database.stop();
      await rm(secretRoot, { recursive: true, force: true });
    }
  });
}
