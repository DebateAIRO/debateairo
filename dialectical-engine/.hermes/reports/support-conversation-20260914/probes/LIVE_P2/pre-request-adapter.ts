import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createHelpCorpusSnapshotLookup,loadHelpCorpus,type HelpCorpusLanguage
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/index.ts";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES
} from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/catalog.ts";
import { buildSupportKnowledgeContext } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/context.ts";
import { resolveSupportActions } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/packages/support-kb/src/navigation.ts";
import { redactSupportMessage } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/support-conversation-cp1/dialectical-engine/apps/api/src/support/session.ts";
import { classifySupportResponseEvidence } from "./response-evidence.mjs";

const MAX_SYSTEM_CODE_POINTS = 24_000;
const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_REVISION = /^[0-9a-f]{40}$/u;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code: string): never {
  throw new Error(code);
}

function structuredInstruction(language: HelpCorpusLanguage): string {
  const shape = '{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}';
  return language === "ro"
    ? `Returnează numai un singur obiect JSON, fără alte chei și fără text înainte sau după: ${shape}. kind trebuie să fie answer. Secțiunea finală OUTPUT CONTRACT enumeră singurele sourceIds și actionIds permise; înlocuiește exemplele și copiază identificatorii exact, citând cel puțin un sourceId. Nu scrie niciodată identificatori de surse, acțiuni sau capabilități, rute ori căi în text; exprimă navigarea numai prin actionIds. Poți explica limite și condiții despre setările de securitate, dar nu solicita, primi, transforma, verifica sau repeta niciodată parole, coduri ori alte date de autentificare și nu afirma că ai efectuat o schimbare de securitate.`
    : `Return only one JSON object, with no other keys and no text before or after it: ${shape}. kind must be answer. The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds; replace the examples and copy identifiers exactly, citing at least one sourceId. Never write source IDs, action IDs, capability IDs, routes, or paths inside text; express navigation only through actionIds. You may explain limitations and prerequisites for security settings, but never request, receive, transform, validate, or repeat passwords, codes, or other credentials, and never claim that you performed a security change.`;
}

type SnapshotReceipt = Readonly<{
  finalCommit: string;
  snapshot: Readonly<{ kbVersion: string;entryCount: number }>;
  files: Readonly<Record<string,Readonly<{ absolute: string;sha256: string }>>>;
  logicalRecords: readonly Readonly<{ logicalKey: string;fallbackSha256: string }>[];
}>;

export type SafePinnedReceipt = Readonly<{
  sequence: number;
  language: HelpCorpusLanguage;
  topic: "creation" | "settings" | "export";
  kbVersion: string;
  pinnedSourceId: string;
  fallbackSha256: string;
}>;

export type LiveP2Pin = Readonly<{
  safeReceipt(sequence: number,topic: SafePinnedReceipt["topic"]): SafePinnedReceipt;
  classifyResponse(response: Readonly<{
    outcome: string;
    text: string;
    sourceIds: readonly string[];
  }>): Readonly<{ terminal: "GROUNDED" | "REFUSAL" | "INCOMPATIBLE";reviewedFallbackMatch: boolean }>;
}>;

export function createLiveP2SnapshotAdapter(input: Readonly<{
  productRoot: string;
  attestationReceiptPath: string;
  attestationReceiptSha256: string;
  productRevision: string;
}>) {
  if (!SHA256.test(input.attestationReceiptSha256) || !GIT_REVISION.test(input.productRevision)) {
    fail("LIVE_P2_ATTESTATION_INPUT_INVALID");
  }
  const receiptBytes = readFileSync(input.attestationReceiptPath);
  if (sha256(receiptBytes) !== input.attestationReceiptSha256) {
    fail("LIVE_P2_ATTESTATION_RECEIPT_HASH_MISMATCH");
  }
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as SnapshotReceipt;
  if (receipt.finalCommit !== input.productRevision || !SHA256.test(receipt.snapshot?.kbVersion)
    || receipt.snapshot.entryCount !== 36 || !Array.isArray(receipt.logicalRecords)) {
    fail("LIVE_P2_ATTESTATION_RECEIPT_INVALID");
  }
  const requiredFiles = ["component","review","catalogSource","loaderSource","rankingSource","productionApiSource"];
  for (const name of requiredFiles) {
    const file = receipt.files?.[name];
    if (file === undefined || !SHA256.test(file.sha256)
      || !resolve(file.absolute).startsWith(`${resolve(input.productRoot)}/`)
      || sha256(readFileSync(file.absolute)) !== file.sha256) {
      fail("LIVE_P2_ATTESTED_FILE_MISMATCH");
    }
  }
  const componentBytes = readFileSync(receipt.files.component.absolute);
  const reviewBytes = readFileSync(receipt.files.review.absolute);
  const corpus = loadHelpCorpus(resolve(input.productRoot,"packages/support-kb/content"),{
    reviewManifest:JSON.parse(reviewBytes.toString("utf8")),
    recoveryComponents:componentBytes,
    requireReviewedRecovery:true
  });
  if (corpus.kbVersion !== receipt.snapshot.kbVersion || corpus.entries.length !== 36) {
    fail("LIVE_P2_SNAPSHOT_MISMATCH");
  }
  const lookup = createHelpCorpusSnapshotLookup(corpus);
  if (lookup.currentVersion !== corpus.kbVersion || lookup.get(corpus.kbVersion) !== corpus) {
    fail("LIVE_P2_SNAPSHOT_LOOKUP_MISMATCH");
  }
  const rowHashes = new Map(receipt.logicalRecords.map((row) => [row.logicalKey,row.fallbackSha256]));
  if (rowHashes.size !== 36 || [...rowHashes.values()].some((value) => !SHA256.test(value))) {
    fail("LIVE_P2_REVIEW_ROWS_INVALID");
  }

  return Object.freeze({
    kbVersion:corpus.kbVersion,
    pin(request: Readonly<{
      sessionKbVersion: string;
      language: HelpCorpusLanguage;
      message: string;
    }>): LiveP2Pin {
      if (request.sessionKbVersion !== corpus.kbVersion) fail("LIVE_P2_SESSION_SNAPSHOT_MISMATCH");
      if (request.language !== "en" && request.language !== "ro") fail("LIVE_P2_LANGUAGE_INVALID");
      if (typeof request.message !== "string" || request.message.length === 0) fail("LIVE_P2_MESSAGE_INVALID");
      const prepared = redactSupportMessage(request.message);
      const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS,{
        signedIn:false,language:request.language
      }).map(({ id }) => id);
      const context = buildSupportKnowledgeContext({
        entries:corpus.entries,
        capabilities:SUPPORT_CAPABILITIES,
        language:request.language,
        query:prepared.text,
        historyText:"",
        availableActionIds,
        referenceFor:(kind,index) => `livep2-${kind}-${index}`,
        maxCodePoints:MAX_SYSTEM_CODE_POINTS
          - [...`${structuredInstruction(request.language)}\n\n`].length
      });
      const pinnedSourceId = context.sourceIds[0];
      if (pinnedSourceId === undefined) fail("LIVE_P2_TOP_SOURCE_UNAVAILABLE");
      const entry = corpus.entries.find((candidate) =>
        candidate.id === pinnedSourceId && candidate.lang === request.language);
      if (entry === undefined || entry.fallback === undefined || entry.fallback.length === 0
        || entry.recoveryReview === undefined) {
        fail("LIVE_P2_REVIEWED_FALLBACK_UNAVAILABLE");
      }
      const fallbackSha256 = sha256(entry.fallback);
      if (entry.recoveryReview.fallbackSha256 !== fallbackSha256
        || rowHashes.get(`${entry.id}.${entry.lang}`) !== fallbackSha256) {
        fail("LIVE_P2_REVIEWED_FALLBACK_MISMATCH");
      }
      const responseSnapshot = Object.freeze({
        requestVersion:request.sessionKbVersion,
        pinnedVersion:corpus.kbVersion,
        pinnedSourceId,
        reviewedFallback:Object.freeze({
          version:corpus.kbVersion,sourceId:pinnedSourceId,text:entry.fallback
        })
      });
      return Object.freeze({
        safeReceipt(sequence,topic) {
          if (!Number.isSafeInteger(sequence) || sequence < 1
            || !["creation","settings","export"].includes(topic)) {
            fail("LIVE_P2_SAFE_RECEIPT_INPUT_INVALID");
          }
          return Object.freeze({
            sequence,language:request.language,topic,kbVersion:corpus.kbVersion,
            pinnedSourceId,fallbackSha256
          });
        },
        classifyResponse(response) {
          return classifySupportResponseEvidence(response,responseSnapshot);
        }
      });
    }
  });
}
