import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TypedDomainError,redactSupportText } from "@debateai/kernel";
import type { SupportKeyPort } from "./keys.js";
import type { SupportCasePredicate, SupportCaseToolCall } from "./cases.js";
import type { SupportAdvisorySummaryPort } from "./cases.js";
import type { SupportLanguage, SupportOutcome } from "./templates.js";
import type { SupportConfigurationValues } from "@debateai/register";

const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export class SupportSessionError extends TypedDomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SupportSessionError";
  }
}

export type SupportSessionRecord = Readonly<{
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  state: "OPEN" | "LOCKED" | "CLOSED";
  kbVersion: string;
  createdAt: Date;
  consentOwnContextAt: Date | null;
  shreddedAt?: Date | null;
}>;

export type SupportDomainStatus = Readonly<{
  callsToday: number;
  callsLast7Days?: number;
  inputTokensToday?: number;
  outputTokensToday?: number;
  costUsdToday?: number;
  inputTokensLast7Days?: number;
  outputTokensLast7Days?: number;
  costUsdLast7Days?: number;
  relayState?: "AVAILABLE" | "UNAVAILABLE";
  relayUnavailableSince?: Date;
  deflection7Days: number | null;
  deflection30Days: number | null;
  ratingResolution7Days: number | null;
  ratingResolution30Days: number | null;
  openSessions: number;
  newCases: number;
}>;

export interface SupportSessionPort {
  create(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string | null;
    language: SupportLanguage;
    kbVersion: string;
    createdAt: Date;
  }>): Promise<SupportSessionRecord>;
  read(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    lockAfterInjections?: number;
  }>): Promise<SupportSessionRecord | null>;
  setConsent?(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string;
    on: boolean;
    at: Date;
  }>): Promise<SupportSessionRecord | null>;
  admitMessage(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    injection: boolean;
    messageSha256: string;
    ipSha256: string;
    at: Date;
    lockAfterInjections: number;
    identityOwnerRef: string | null;
    characterCount: number;
    limits: Pick<SupportConfigurationValues,
      "supportLimitSessionMessages" | "supportLimitMessageCharacters" |
      "supportLimitAnonMessages10m" | "supportLimitAnonMessages24h" |
      "supportLimitAccountMessages10m" | "supportLimitAccountMessages24h">;
  }>): Promise<"ADMITTED" | "RATE_LIMITED" | "LOCKED" | "SHREDDED" | "NOT_FOUND">;
  admitIpSession?(input: Readonly<{
    ipSha256: string;
    at: Date;
    cooldownMinutes: number;
    sessionLimit: number;
  }>): Promise<"ADMITTED" | "COOLDOWN" | "RATE_LIMITED">;
  finalizeInjectionLock?(input: Readonly<{
    sessionId: string;
    lockAfterInjections: number;
  }>): Promise<void>;
  recordRateLimit(input: Readonly<{
    sessionId: string;
    messageSha256: string;
    ipSha256: string;
    at: Date;
  }>): Promise<void>;
  rateMessage?(input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    messageId: string;
    rating: "yes" | "no" | "human";
    at: Date;
  }>): Promise<readonly ("yes" | "no" | "human")[] | null>;
  status(): Promise<SupportDomainStatus>;
}

export type SupportMessageRole = "user" | "assistant";

export type SupportMessageMetadata = Readonly<{
  messageId: string;
  sessionId: string;
  role: SupportMessageRole;
  outcome: SupportOutcome;
  language: SupportLanguage;
  detectedLanguage: SupportLanguage;
  overrideLanguage: SupportLanguage | null;
  redacted: boolean;
  receivedAt: Date;
  firstTokenAt: Date | null;
  completedAt: Date | null;
  modelCalled?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  degradedReason?: "relay" | "cap";
}>;

export type SupportEncryptedMessage = SupportMessageMetadata & Readonly<{
  contentCiphertext: Uint8Array;
}>;

export type SupportEncryptedMessageRead = SupportEncryptedMessage & Readonly<{
  wrappedKey: Uint8Array;
}>;

export interface SupportMessageRepositoryPort {
  readSessionKey(input: Readonly<{ sessionId: string }>): Promise<Uint8Array | null>;
  write(input: SupportEncryptedMessage): Promise<void>;
  read(input: Readonly<{
    sessionId: string;
    messageId: string;
  }>): Promise<SupportEncryptedMessageRead | null>;
  listSession(input: Readonly<{
    sessionId: string;
  }>): Promise<readonly SupportEncryptedMessageRead[]>;
}

export type SupportMessagePlaintextInput = Omit<
  SupportMessageMetadata,
  "redacted"
> & Readonly<{ text: string }>;

export type SupportMessagePlaintextRecord = SupportMessageMetadata & Readonly<{
  text: string;
}>;

export interface SupportMessageCipherPort {
  write(input: SupportMessagePlaintextInput): Promise<SupportMessagePlaintextRecord>;
  writeAndTransit(
    input: SupportMessagePlaintextInput,
    transit: (redactedText: string) => Promise<void>
  ): Promise<SupportMessagePlaintextRecord>;
  read(input: Readonly<{
    sessionId: string;
    messageId: string;
  }>): Promise<SupportMessagePlaintextRecord | null>;
  listSession(input: Readonly<{
    sessionId: string;
  }>): Promise<readonly SupportMessagePlaintextRecord[]>;
}

export function redactSupportMessage(text: string): Readonly<{
  text: string;
  redacted: boolean;
}> {
  return redactSupportText(text);
}

export function createSupportMessageCipher(
  keys: Pick<SupportKeyPort,"unwrapDataKey" | "sealContent" | "openContent">,
  repository: SupportMessageRepositoryPort
): SupportMessageCipherPort {
  async function decrypt(
    encrypted: SupportEncryptedMessageRead
  ): Promise<SupportMessagePlaintextRecord> {
    const wrapped = Buffer.from(encrypted.wrappedKey);
    const ciphertext = Buffer.from(encrypted.contentCiphertext);
    let dataKey: Buffer | undefined;
    let plaintext: Buffer | undefined;
    try {
      dataKey = await keys.unwrapDataKey(
        { kind: "session",ref: encrypted.sessionId },
        wrapped
      );
      plaintext = keys.openContent(
        {
          kind: "session-message",sessionId: encrypted.sessionId,
          messageId: encrypted.messageId,role: encrypted.role,outcome: encrypted.outcome,
          purpose: "content"
        },
        dataKey,
        ciphertext
      );
      const { contentCiphertext: _ciphertext,wrappedKey: _wrapped,...metadata } = encrypted;
      return Object.freeze({ ...metadata,text: plaintext.toString("utf8") });
    } catch (error) {
      if (error instanceof TypedDomainError) throw error;
      throw new SupportSessionError(
        "SUPPORT_MESSAGE_READ_FAILED",
        "Support message could not be read"
      );
    } finally {
      wrapped.fill(0);
      ciphertext.fill(0);
      dataKey?.fill(0);
      plaintext?.fill(0);
    }
  }

  async function write(
    input: SupportMessagePlaintextInput
  ): Promise<SupportMessagePlaintextRecord> {
    const prepared = redactSupportMessage(input.text);
    const plaintext = Buffer.from(prepared.text,"utf8");
    let wrapped: Uint8Array | null = null;
    let dataKey: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    try {
      wrapped = await repository.readSessionKey({ sessionId: input.sessionId });
      if (wrapped === null) {
        throw new SupportSessionError(
          "SUPPORT_MESSAGE_SESSION_NOT_FOUND",
          "Support message session was not found"
        );
      }
      dataKey = await keys.unwrapDataKey(
        { kind: "session",ref: input.sessionId },
        wrapped
      );
      ciphertext = keys.sealContent(
        {
          kind: "session-message",sessionId: input.sessionId,messageId: input.messageId,
          role: input.role,outcome: input.outcome,purpose: "content"
        },
        dataKey,
        plaintext
      );
      const metadata: SupportMessageMetadata = Object.freeze({
        messageId: input.messageId,
        sessionId: input.sessionId,
        role: input.role,
        outcome: input.outcome,
        language: input.language,
        detectedLanguage: input.detectedLanguage,
        overrideLanguage: input.overrideLanguage,
        redacted: prepared.redacted,
        receivedAt: input.receivedAt,
        firstTokenAt: input.firstTokenAt,
        completedAt: input.completedAt,
        ...(input.modelCalled === undefined ? {} : { modelCalled: input.modelCalled }),
        ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
        ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
        ...(input.costUsd === undefined ? {} : { costUsd: input.costUsd }),
        ...(input.degradedReason === undefined ? {} : { degradedReason: input.degradedReason })
      });
      await repository.write({ ...metadata,contentCiphertext: ciphertext });
      return Object.freeze({ ...metadata,text: prepared.text });
    } catch (error) {
      if (error instanceof TypedDomainError) throw error;
      throw new SupportSessionError(
        "SUPPORT_MESSAGE_WRITE_FAILED",
        "Support message could not be persisted"
      );
    } finally {
      plaintext.fill(0);
      dataKey?.fill(0);
      ciphertext?.fill(0);
      if (wrapped instanceof Uint8Array) wrapped.fill(0);
    }
  }

  return Object.freeze({
    write,
    writeAndTransit: async (
      input: SupportMessagePlaintextInput,
      transit: (redactedText: string) => Promise<void>
    ) => {
      const stored = await write(input);
      try {
        await transit(stored.text);
      } catch (error) {
        if (error instanceof TypedDomainError) throw error;
        throw new SupportSessionError(
          "SUPPORT_MESSAGE_TRANSIT_FAILED",
          "Support message could not be relayed"
        );
      }
      return stored;
    },
    read: async (input: Readonly<{ sessionId: string; messageId: string }>) => {
      let encrypted: SupportEncryptedMessageRead | null;
      try {
        encrypted = await repository.read(input);
      } catch (error) {
        if (error instanceof TypedDomainError) throw error;
        throw new SupportSessionError(
          "SUPPORT_MESSAGE_READ_FAILED",
          "Support message could not be read"
        );
      }
      if (encrypted === null) return null;
      return decrypt(encrypted);
    },
    listSession: async (input: Readonly<{ sessionId: string }>) => {
      let encrypted: readonly SupportEncryptedMessageRead[];
      try {
        encrypted = await repository.listSession(input);
      } catch (error) {
        if (error instanceof TypedDomainError) throw error;
        throw new SupportSessionError(
          "SUPPORT_MESSAGE_READ_FAILED",
          "Support messages could not be read"
        );
      }
      return Promise.all(encrypted.map(decrypt));
    }
  });
}

export type CreateWrappedSessionKey = (sessionId: string) => Promise<Uint8Array>;
export type CreateCaseMaterial = (caseId: string) => Promise<Readonly<{
  wrappedKey: Uint8Array;
  transcriptSnapshotCiphertext: Uint8Array;
}>>;

export function createWrappedSupportSessionKey(
  keys: Pick<SupportKeyPort, "createDataKey">
): CreateWrappedSessionKey {
  return async (sessionId) => {
    const lease = await keys.createDataKey({ kind: "session", ref: sessionId });
    try {
      return Buffer.from(lease.wrapped.bytes);
    } finally {
      lease.close();
    }
  };
}

export function createSupportCaseMaterial(
  keys: Pick<SupportKeyPort, "createDataKey" | "sealContent">,
  transcriptSnapshot: Uint8Array
): CreateCaseMaterial {
  return async (caseId) => {
    const lease = await keys.createDataKey({ kind: "case", ref: caseId });
    try {
      return Object.freeze({
        wrappedKey: Buffer.from(lease.wrapped.bytes),
        transcriptSnapshotCiphertext: Buffer.from(keys.sealContent(
          { kind: "case-snapshot",caseId,purpose: "transcript" },
          lease.dataKey,transcriptSnapshot
        ))
      });
    } finally {
      lease.close();
    }
  };
}

export type SupportCaseRecord = Readonly<{
  caseId: string;
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  createdAt: Date;
  triggerPredicate: SupportCasePredicate;
  toolCalls: readonly SupportCaseToolCall[];
  kbVersion: string;
  slaHours: number;
  state: "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED";
}>;

export type SupportCaseCreateInput = SupportCaseRecord & Readonly<{
  tokenSha256: string;
  transcriptSnapshot: Uint8Array;
}>;

export interface SupportCasePort {
  open(input: Readonly<{
    sessionId: string;
    language: SupportLanguage;
    createdAt: Date;
    identityOwnerRef?: string | null;
    triggerPredicate?: SupportCasePredicate;
    toolCalls?: readonly SupportCaseToolCall[];
    kbVersion?: string;
    slaHours?: number;
  }>): Promise<Readonly<{
    record: SupportCaseRecord;
    token: string;
  }>>;
  openOnce?(input: Readonly<{
    sessionId: string;
    language: SupportLanguage;
    createdAt: Date;
    triggerGeneration: string;
    identityOwnerRef?: string | null;
    triggerPredicate?: SupportCasePredicate;
    toolCalls?: readonly SupportCaseToolCall[];
    kbVersion?: string;
    slaHours?: number;
  }>): Promise<
    | Readonly<{ kind: "OPENED";record: SupportCaseRecord;token: string }>
    | Readonly<{ kind: "ALREADY_OPENED";record: SupportCaseRecord }>
  >;
}

export function createSupportCaseService(input: Readonly<{
  messages: Pick<SupportMessageCipherPort,"listSession">;
  create: (request: SupportCaseCreateInput) => Promise<SupportCaseRecord>;
  createOnce?: (request: Readonly<{
    sessionId: string;
    identityOwnerRef: string | null;
    language: SupportLanguage;
    createdAt: Date;
    triggerPredicate: SupportCasePredicate;
    triggerGeneration: string;
    toolCalls: readonly SupportCaseToolCall[];
    kbVersion: string;
    slaHours: number;
    prepare(): Promise<SupportCaseCreateInput & Readonly<{ token: string }>>;
  }>) => Promise<
    | Readonly<{ kind: "OPENED";record: SupportCaseRecord;token: string }>
    | Readonly<{ kind: "ALREADY_OPENED";record: SupportCaseRecord }>
  >;
  summaries?: SupportAdvisorySummaryPort;
  reportSummaryFailure?: (diagnostic: Readonly<{ code: string;caseId: string }>) => void;
}>): SupportCasePort {
  if (input.summaries !== undefined && input.reportSummaryFailure === undefined) {
    throw new SupportSessionError(
      "SUPPORT_SUMMARY_REPORTER_REQUIRED",
      "Support summary failures require a reporting seam"
    );
  }
  async function prepare(request: Parameters<SupportCasePort["open"]>[0]) {
    const token = randomBytes(32).toString("base64url");
    const tokenSha256 = hashSupportCapability(token);
    if (tokenSha256 === null || !SHA256_PATTERN.test(tokenSha256)) {
      throw new SupportSessionError(
        "SUPPORT_CASE_CAPABILITY_GENERATION_FAILED",
        "Support case capability generation failed"
      );
    }
    const caseId = randomUUID();
    const messages = await input.messages.listSession({ sessionId: request.sessionId });
    const snapshot = Buffer.from(JSON.stringify(messages.map((message) => Object.freeze({
      messageId: message.messageId,
      role: message.role,
      text: message.text,
      outcome: message.outcome,
      language: message.language,
      detectedLanguage: message.detectedLanguage,
      overrideLanguage: message.overrideLanguage,
      redacted: message.redacted,
      receivedAt: message.receivedAt.toISOString(),
      firstTokenAt: message.firstTokenAt?.toISOString() ?? null,
      completedAt: message.completedAt?.toISOString() ?? null
    }))),"utf8");
    return Object.freeze({
      caseId,token,tokenSha256,sessionId: request.sessionId,language: request.language,
      createdAt: request.createdAt,state: "NEW" as const,transcriptSnapshot: snapshot,
      identityOwnerRef: request.identityOwnerRef ?? null,
      triggerPredicate: request.triggerPredicate ?? "E1",
      toolCalls: request.toolCalls ?? [],kbVersion: request.kbVersion ?? "0".repeat(64),
      slaHours: request.slaHours ?? 48,messages
    });
  }

  function scheduleSummary(prepared: Awaited<ReturnType<typeof prepare>>): void {
    if (input.summaries === undefined) return;
    const transcript = prepared.messages.map((message) =>
      `${message.role === "user" ? "USER" : "ASSISTANT"}> ${message.text}`
    ).join("\n");
    void input.summaries.summarize({
      caseId: prepared.caseId,language: prepared.language,
      transcript,createdAt: prepared.createdAt
    }).catch((error: unknown) => {
      const diagnostic = Object.freeze({
        code: error instanceof TypedDomainError ? error.code : "SUPPORT_SUMMARY_BACKGROUND_FAILED",
        caseId: prepared.caseId
      });
      input.reportSummaryFailure!(diagnostic);
    });
  }

  return Object.freeze({
    open: async (request: Parameters<SupportCasePort["open"]>[0]) => {
      const prepared = await prepare(request);
      try {
        const record = await input.create({
          caseId: prepared.caseId,tokenSha256: prepared.tokenSha256,
          sessionId: prepared.sessionId,language: prepared.language,
          createdAt: prepared.createdAt,state: "NEW",
          transcriptSnapshot: prepared.transcriptSnapshot,
          identityOwnerRef: prepared.identityOwnerRef,
          triggerPredicate: prepared.triggerPredicate,toolCalls: prepared.toolCalls,
          kbVersion: prepared.kbVersion,slaHours: prepared.slaHours
        });
        scheduleSummary(prepared);
        return Object.freeze({ record,token: prepared.token });
      } catch (error) {
        if (error instanceof TypedDomainError) throw error;
        throw new SupportSessionError(
          "SUPPORT_CASE_CREATE_FAILED",
          "Support case could not be created"
        );
      } finally {
        prepared.transcriptSnapshot.fill(0);
      }
    },
    openOnce: async (request: Parameters<NonNullable<SupportCasePort["openOnce"]>>[0]) => {
      if (input.createOnce === undefined) {
        const opened = await (createSupportCaseService({
          messages: input.messages,create: input.create,
          ...(input.summaries === undefined ? {} : {
            summaries: input.summaries,reportSummaryFailure: input.reportSummaryFailure!
          }),
          ...(input.reportSummaryFailure === undefined
            ? {} : { reportSummaryFailure: input.reportSummaryFailure })
        })).open(request);
        return Object.freeze({ kind: "OPENED" as const,...opened });
      }
      let prepared: Awaited<ReturnType<typeof prepare>> | undefined;
      try {
        const result = await input.createOnce({
          sessionId: request.sessionId,identityOwnerRef: request.identityOwnerRef ?? null,
          language: request.language,createdAt: request.createdAt,
          triggerPredicate: request.triggerPredicate ?? "E1",
          triggerGeneration: request.triggerGeneration,toolCalls: request.toolCalls ?? [],
          kbVersion: request.kbVersion ?? "0".repeat(64),slaHours: request.slaHours ?? 48,
          prepare: async () => {
            prepared = await prepare(request);
            return prepared;
          }
        });
        if (result.kind === "OPENED" && prepared !== undefined) scheduleSummary(prepared);
        return result;
      } finally {
        prepared?.transcriptSnapshot.fill(0);
      }
    }
  });
}

export type SupportSessionCapability = Readonly<{
  sessionId: string;
  token: string;
  tokenSha256: string;
}>;

export function hashSupportCapability(token: string): string | null {
  if (!CAPABILITY_PATTERN.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSupportSessionCapability(): SupportSessionCapability {
  const token = randomBytes(32).toString("base64url");
  const tokenSha256 = hashSupportCapability(token);
  if (tokenSha256 === null || !SHA256_PATTERN.test(tokenSha256)) {
    throw new SupportSessionError(
      "SUPPORT_SESSION_CAPABILITY_GENERATION_FAILED",
      "Support session capability generation failed"
    );
  }
  return Object.freeze({ sessionId: randomUUID(), token, tokenSha256 });
}
