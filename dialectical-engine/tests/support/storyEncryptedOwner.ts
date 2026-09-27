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
import { RunRepository, configureContentEncryption, type Pool } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "./discoveredPanel.js";

/**
 * Verdict story test support: ONE active account whose runs are encrypted, and
 * the minimum lawful runs for the story suites. The account and cipher set-up
 * is the one `tests/integration/v6-remaining-content-carriers.test.ts` uses,
 * held here so the repository, enrichment and budget suites do not each carry a
 * private copy of it.
 */
export interface StoryEncryptedOwner {
  readonly userId: string;
  readonly ownerRef: string;
  readonly sessionId: string;
  readonly secretRoot: string;
}

type StartRunInput = Parameters<RunRepository["startRun"]>[0];

export async function provisionStoryEncryptedOwner(pool: Pool): Promise<StoryEncryptedOwner> {
  const secretRoot = await mkdtemp(join(tmpdir(), "debateai-story-owner-"));
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `story-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [sessionId, userId, `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  configureContentEncryption(pool, new ContentCipher(new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    if (candidate !== ownerRef) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  })));
  return Object.freeze({ userId, ownerRef, sessionId, secretRoot });
}

export async function releaseStoryEncryptedOwner(owner: StoryEncryptedOwner): Promise<void> {
  await rm(owner.secretRoot, { recursive: true, force: true });
}

function storyRunInput(input: {
  readonly questionLine: string;
  readonly principal: StartRunInput["principal"];
  readonly sessionId: string;
  readonly maxModelAttempts: number;
  readonly language?: Readonly<{ tag: string; name: string }>;
}): StartRunInput {
  return {
    questionLine: input.questionLine,
    ...(input.language === undefined
      ? {}
      : { argumentLanguageTag: input.language.tag, argumentLanguageName: input.language.name }),
    askContract: { audience: "story-test" },
    principal: input.principal,
    sessionId: input.sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-26T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "story:integration",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: fixtureStructuralCeiling(input.maxModelAttempts),
    registerVersion: 1,
    batteryVersion: "story:integration",
    batteryRows: []
  };
}

/** `language` is the run's question language (core.run.argument_language_*); dev's default "und" when absent. */
export function createEncryptedStoryRun(
  pool: Pool,
  owner: StoryEncryptedOwner,
  questionLine: string,
  language?: Readonly<{ tag: string; name: string }>
): Promise<string> {
  return new RunRepository(pool).startRun(storyRunInput({
    questionLine,
    principal: { kind: "server", userId: owner.userId, ownerRef: owner.ownerRef },
    sessionId: owner.sessionId,
    maxModelAttempts: 10,
    ...(language === undefined ? {} : { language })
  }));
}

export function createLegacyStoryRun(
  pool: Pool,
  questionLine: string,
  legacyAskerId: string,
  maxModelAttempts = 10
): Promise<string> {
  return new RunRepository(pool).startRun(storyRunInput({
    questionLine,
    principal: { kind: "legacy", legacyAskerId },
    sessionId: randomUUID(),
    maxModelAttempts
  }));
}
