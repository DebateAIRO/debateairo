import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import {
  isSupportLanguage,
  supportLocaleNames,
  type SupportCorpusLanguage,
  type SupportLanguage,
} from "@debateai/support-kb/catalog";
import type { SupportKeyPort } from "./keys.js";
import { redactSupportMessage } from "./session.js";
import {
  parseSupportCaseSummaryDraft,screenSupportModelText
} from "./response-policy.js";
import { SHREDDED_NOTICE } from "./templates.js";

export type SupportCasePredicate = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8";
export type SupportCaseState = "NEW" | "WAITING_ON_V" | "WAITING_ON_USER" | "CLOSED";
export type SupportCaseActor = "user" | "V" | "system";

export type SupportCaseToolCall = Readonly<{
  name: string;
  at: Date;
  outcome: string;
}>;

export type SupportCaseOpenInput = Readonly<{
  caseId: string;
  tokenSha256: string;
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  createdAt: Date;
  triggerPredicate: SupportCasePredicate;
  toolCalls: readonly SupportCaseToolCall[];
  kbVersion: string;
  slaHours: number;
}>;

export type SupportCaseRecord = Readonly<{
  caseId: string;
  sessionId: string;
  identityOwnerRef: string | null;
  language: SupportLanguage;
  createdAt: Date;
  triggerPredicate: SupportCasePredicate;
  kbVersion: string;
  slaHours: number;
  state: SupportCaseState;
}>;

export const SUPPORT_SUMMARY_PROMPT =
  "Return only JSON with exactly kind, text, sourceIds, and actionIds. "
  + "kind must be case_summary; sourceIds and actionIds must both be empty arrays. "
  + "Summarize the user's problem in one paragraph of at most 80 words. "
  + "Do not state or guess who the user is, whether they are the account owner, "
  + "or whether their request is legitimate.";

const SUPPORT_SUMMARY_REPLACEMENT: Readonly<Record<SupportCorpusLanguage,string>> = Object.freeze({
  en: "The advisory summary was omitted because it did not pass Support safety checks.",
  ro: "Rezumatul consultativ a fost omis deoarece nu a trecut verificările de siguranță ale Asistenței."
});

export type SupportCaseSummaryRecord = Readonly<{
  caseId: string;
  status: "DONE" | "TIMED_OUT";
  summaryCiphertext: Uint8Array | null;
  summaryAt: Date;
  summaryAuthoritative: false;
}>;

export type SupportAdvisorySummaryPort = Readonly<{
  summarize(input: Readonly<{
    caseId: string;
    language: SupportLanguage;
    transcript: string;
    createdAt: Date;
  }>): Promise<void>;
}>;

function boundedSummary(text: string): string | null {
  const paragraph = text.replace(/\s+/gu," ").trim();
  if (paragraph === "") return null;
  const words = paragraph.split(" ");
  if (words.length <= 80) return paragraph;
  const firstEighty = words.slice(0,80);
  const boundary = firstEighty.findLastIndex((word) => /[.!?]$/u.test(word));
  return boundary < 0 ? null : firstEighty.slice(0,boundary + 1).join(" ");
}

function storedSupportLanguage(value: unknown): SupportLanguage {
  if (!isSupportLanguage(value)) throw new TypeError("SUPPORT_LANGUAGE_INVALID");
  return value;
}

export function createAdvisorySummaryService(input: Readonly<{
  complete(request: Readonly<{
    system: string;
    messages: readonly Readonly<{ role: "user";content: string }>[];
    language: SupportLanguage;
    signal: AbortSignal;
  }>): Promise<string>;
  seal(caseId: string,summary: string): Promise<Uint8Array>;
  persist(record: SupportCaseSummaryRecord): Promise<void>;
  clock?: () => Date;
  timeoutMs?: number;
}>): SupportAdvisorySummaryPort {
  const clock = input.clock ?? (() => new Date());
  const timeoutMs = input.timeoutMs ?? 60_000;
  return Object.freeze({
    summarize: async (request) => {
      const { english,native } = supportLocaleNames(request.language);
      const createdAtMs = request.createdAt.getTime();
      if (!Number.isFinite(createdAtMs)
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
        throw new SupportCaseError("SUPPORT_SUMMARY_CLOCK_INVALID");
      }
      const deadlineAt = new Date(createdAtMs + timeoutMs);
      const signal = AbortSignal.timeout(timeoutMs);
      const completion = input.complete({
        system: `${SUPPORT_SUMMARY_PROMPT} Write text in ${english} (${native}). kind stays case_summary.`,
        messages: [{ role: "user",content: request.transcript }],
        language: request.language,signal
      }).then((text) => Object.freeze({ kind: "DONE" as const,text }));
      const timeout = new Promise<Readonly<{ kind: "TIMED_OUT" }>>((resolve) => {
        signal.addEventListener("abort",() => resolve(Object.freeze({ kind: "TIMED_OUT" })),{
          once: true
        });
      });
      const result = await Promise.race([completion,timeout]);
      const observedAt = clock();
      if (!Number.isFinite(observedAt.getTime())) {
        throw new SupportCaseError("SUPPORT_SUMMARY_CLOCK_INVALID");
      }
      const timedOut = result.kind === "TIMED_OUT"
        || signal.aborted || observedAt.getTime() > deadlineAt.getTime();
      const draft = result.kind === "DONE" && !timedOut
        ? parseSupportCaseSummaryDraft(result.text) : null;
      const candidate = draft === null ? null : boundedSummary(draft.text);
      const summary = timedOut ? null
        : candidate ?? SUPPORT_SUMMARY_REPLACEMENT[
          request.language === "ro" ? "ro" : "en"
        ];
      if (timedOut) {
        try {
          await input.persist({
            caseId: request.caseId,status: "TIMED_OUT",summaryCiphertext: null,
            summaryAt: deadlineAt,summaryAuthoritative: false
          });
        } catch {
          throw new SupportCaseError("SUPPORT_SUMMARY_PERSIST_FAILED");
        }
        return;
      }
      if (summary === null) throw new SupportCaseError("SUPPORT_SUMMARY_INVALID");
      let ciphertext: Uint8Array;
      try {
        ciphertext = await input.seal(request.caseId,summary);
      } catch {
        throw new SupportCaseError("SUPPORT_SUMMARY_SEAL_FAILED");
      }
      try {
        try {
          await input.persist({
            caseId: request.caseId,status: "DONE",summaryCiphertext: ciphertext,
            summaryAt: observedAt,summaryAuthoritative: false
          });
        } catch {
          throw new SupportCaseError("SUPPORT_SUMMARY_PERSIST_FAILED");
        }
      } finally {
        ciphertext.fill(0);
      }
    }
  });
}

export function createSupportSummarySealer(
  keys: Pick<SupportKeyPort,"unwrapDataKey" | "sealContent">,
  readCaseKey: (caseId: string) => Promise<Uint8Array | null>
) {
  return async (caseId: string,summary: string): Promise<Uint8Array> => {
    const wrapped = await readCaseKey(caseId);
    if (wrapped === null) throw new SupportCaseError("SUPPORT_CASE_NOT_FOUND");
    const plaintext = Buffer.from(summary,"utf8");
    let dataKey: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    try {
      dataKey = await keys.unwrapDataKey({ kind: "case",ref: caseId },wrapped);
      ciphertext = keys.sealContent(
        { kind: "case-summary",caseId,purpose: "summary" },dataKey,plaintext
      );
      return Buffer.from(ciphertext);
    } finally {
      wrapped.fill(0);
      plaintext.fill(0);
      dataKey?.fill(0);
      ciphertext?.fill(0);
    }
  };
}

type SupportCaseViewFields = Readonly<{
  caseId: string;
  language: SupportLanguage;
  state: SupportCaseState;
  slaHours: number;
  messages: readonly Readonly<{ id: string;role: "user" | "assistant" | "V";text: string }>[];
  summary: string | null;
  nextCursor: string | null;
}>;

export type SupportCaseViewRecord =
  | (SupportCaseViewFields & Readonly<{ kind: "READABLE" }>)
  | (SupportCaseViewFields & Readonly<{ kind: "SHREDDED";notice: string }>);

type SupportCaseMessagePage = Readonly<{
  limit: number;
  beforeAt?: Date;
  beforeId?: string;
}>;

export interface SupportCaseAccessRepositoryPort {
  listOwnCases(identityOwnerRef: string): Promise<readonly Readonly<Record<string,unknown>>[]>;
  readCaseEncrypted(input: Readonly<{
    caseId?: string;
    tokenSha256?: string;
    page?: SupportCaseMessagePage;
  }>): Promise<Readonly<Record<string,unknown>> | null>;
  appendCaseMessage(input: Readonly<{
    caseId: string;
    messageId: string;
    role: "user" | "V";
    contentCiphertext: Uint8Array;
    redacted: boolean;
    messageLimit: number;
    at: Date;
  }>): Promise<"WAITING_ON_V" | "WAITING_ON_USER" | "LIMIT_REACHED" | "SHREDDED" | null>;
}

export type SupportCaseAccessPort = Readonly<{
  listOwn(identityOwnerRef: string): Promise<readonly Readonly<{
    caseId: string;
    state: SupportCaseState;
    language: SupportLanguage;
    createdAt: Date;
  }>[] >;
  readByToken(tokenSha256: string,pagination?: Readonly<{
    limit: number;
    cursor?: string;
  }>): Promise<SupportCaseViewRecord | null>;
  replyByToken(input: Readonly<{
    tokenSha256: string;
    text: string;
    at: Date;
    messageByteLimit: number;
    caseMessageLimit: number;
  }>): Promise<SupportCaseState | Readonly<{ kind: "SHREDDED";notice: string }> | null>;
}>;

const CASE_CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function decodeCaseCursor(cursor: string | undefined): Readonly<{
  beforeAt?: Date;beforeId?: string;
}> {
  if (cursor === undefined) return Object.freeze({});
  if (cursor.length < 1 || cursor.length > 256 || !/^[A-Za-z0-9_-]+$/u.test(cursor)) {
    throw new SupportCaseError("SUPPORT_CASE_CURSOR_INVALID");
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2
      || typeof parsed[0] !== "string" || typeof parsed[1] !== "string"
      || !CASE_CURSOR_ID.test(parsed[1])) {
      throw new SupportCaseError("SUPPORT_CASE_CURSOR_INVALID");
    }
    const beforeAt = new Date(parsed[0]);
    if (!Number.isFinite(beforeAt.getTime()) || beforeAt.toISOString() !== parsed[0]) {
      throw new SupportCaseError("SUPPORT_CASE_CURSOR_INVALID");
    }
    return Object.freeze({ beforeAt,beforeId: parsed[1] });
  } catch {
    throw new SupportCaseError("SUPPORT_CASE_CURSOR_INVALID");
  }
}

function encodeCaseCursor(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const cursor = value as Readonly<Record<string,unknown>>;
  if (!(cursor.at instanceof Date) || typeof cursor.id !== "string") return null;
  return Buffer.from(JSON.stringify([cursor.at.toISOString(),cursor.id]),"utf8").toString("base64url");
}

function encryptedBytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) throw new SupportCaseError("SUPPORT_CASE_NOT_FOUND");
  return Buffer.from(value);
}

function shreddedRow(row: Readonly<Record<string,unknown>>): boolean {
  return row.shredded_at !== null || row.destroyed_at !== null;
}

export function createSupportCaseAccessService(input: Readonly<{
  repository: SupportCaseAccessRepositoryPort;
  keys: Pick<SupportKeyPort,"unwrapDataKey" | "openContent" | "sealContent">;
}>): SupportCaseAccessPort {
  async function withDataKey<T>(row: Readonly<Record<string,unknown>>,
    use: (key: Buffer) => Promise<T> | T): Promise<T> {
    const caseId = String(row.case_id);
    const wrapped = encryptedBytes(row.wrapped_key);
    let dataKey: Buffer | undefined;
    try {
      dataKey = await input.keys.unwrapDataKey({ kind: "case",ref: caseId },wrapped);
      return await use(dataKey);
    } finally {
      wrapped.fill(0);
      dataKey?.fill(0);
    }
  }

  async function read(row: Readonly<Record<string,unknown>>): Promise<SupportCaseViewRecord> {
    const language = storedSupportLanguage(row.language);
    return withDataKey(row,(dataKey) => {
      const caseId = String(row.case_id);
      const transcriptCiphertext = encryptedBytes(row.transcript_snapshot_ciphertext);
      let transcriptPlaintext: Buffer | undefined;
      let summaryPlaintext: Buffer | undefined;
      const messages: Array<Readonly<{
        id: string;role: "user" | "assistant" | "V";text: string;
      }>> = [];
      try {
        transcriptPlaintext = input.keys.openContent(
          { kind: "case-snapshot",caseId,purpose: "transcript" },
          dataKey,transcriptCiphertext
        );
        const transcript = JSON.parse(transcriptPlaintext.toString("utf8")) as unknown;
        if (!Array.isArray(transcript)) throw new SupportCaseError("SUPPORT_CASE_NOT_FOUND");
        for (const [index,entry] of transcript.entries()) {
          if (typeof entry !== "object" || entry === null) continue;
          const message = entry as Readonly<Record<string,unknown>>;
          if ((message.role === "user" || message.role === "assistant")
            && typeof message.text === "string") {
            const prepared = redactSupportMessage(message.text);
            messages.push(Object.freeze({
              id: typeof message.messageId === "string" ? message.messageId : `snapshot-${index}`,
              role: message.role,text: prepared.text
            }));
          }
        }
        const caseMessages = Array.isArray(row.case_messages) ? row.case_messages : [];
        for (const entry of caseMessages) {
          if (typeof entry !== "object" || entry === null) continue;
          const message = entry as Readonly<Record<string,unknown>>;
          if ((message.role !== "user" && message.role !== "V")
            || typeof message.content_ciphertext !== "string") continue;
          const ciphertext = Buffer.from(message.content_ciphertext,"base64");
          let plaintext: Buffer | undefined;
          try {
            plaintext = input.keys.openContent({
              kind: "case-message",caseId,messageId: String(message.id),
              role: message.role,purpose: "content"
            },dataKey,ciphertext);
            const prepared = redactSupportMessage(plaintext.toString("utf8"));
            messages.push(Object.freeze({
              id: String(message.id),role: message.role,text: prepared.text
            }));
          } finally { ciphertext.fill(0);plaintext?.fill(0); }
        }
        const summaryCiphertext = row.summary_ciphertext instanceof Uint8Array
          ? Buffer.from(row.summary_ciphertext) : null;
        let summary: string | null = null;
        try {
          if (summaryCiphertext !== null) {
            summaryPlaintext = input.keys.openContent(
              { kind: "case-summary",caseId,purpose: "summary" },
              dataKey,summaryCiphertext
            );
            const opened = summaryPlaintext.toString("utf8");
            const bounded = boundedSummary(opened);
            summary = bounded !== null && screenSupportModelText(bounded)
              ? bounded : SUPPORT_SUMMARY_REPLACEMENT[language === "ro" ? "ro" : "en"];
          }
        } finally { summaryCiphertext?.fill(0); }
        return Object.freeze({
          kind: "READABLE",caseId,
          language,state: row.state as SupportCaseState,
          slaHours: Number(row.sla_hours),messages: Object.freeze(messages),summary,
          nextCursor: encodeCaseCursor(row.case_message_next_cursor)
        });
      } finally {
        transcriptCiphertext.fill(0);
        transcriptPlaintext?.fill(0);
        summaryPlaintext?.fill(0);
      }
    });
  }

  return Object.freeze({
    listOwn: async (identityOwnerRef) => Object.freeze(
      (await input.repository.listOwnCases(identityOwnerRef)).map((row) => {
        const language = storedSupportLanguage(row.language);
        return Object.freeze({
          caseId: String(row.case_id),
          state: String(row.state) as SupportCaseState,
          language,
          createdAt: new Date(String(row.created_at))
        });
      })
    ),
    readByToken: async (tokenSha256,pagination) => {
      const cursor = decodeCaseCursor(pagination?.cursor);
      const row = await input.repository.readCaseEncrypted({
        tokenSha256,
        page: { limit: pagination?.limit ?? 40,...cursor }
      });
      if (row === null) return null;
      const language = storedSupportLanguage(row.language);
      if (shreddedRow(row)) {
        return Object.freeze({
          kind: "SHREDDED",caseId: String(row.case_id),language,
          state: row.state as SupportCaseState,slaHours: Number(row.sla_hours),
          messages: Object.freeze([]),summary: null,nextCursor: null,
          notice: SHREDDED_NOTICE[language]
        });
      }
      return read(row);
    },
    replyByToken: async (request) => {
      if (!Number.isSafeInteger(request.messageByteLimit) || request.messageByteLimit < 1
        || Buffer.byteLength(request.text,"utf8") > request.messageByteLimit) {
        throw new SupportCaseError("SUPPORT_CASE_MESSAGE_TOO_LARGE");
      }
      if (!Number.isSafeInteger(request.caseMessageLimit) || request.caseMessageLimit < 1) {
        throw new SupportCaseError("SUPPORT_CASE_MESSAGE_LIMIT");
      }
      const row = await input.repository.readCaseEncrypted({ tokenSha256: request.tokenSha256 });
      if (row === null) return null;
      const language = storedSupportLanguage(row.language);
      if (shreddedRow(row)) return Object.freeze({
        kind: "SHREDDED" as const,notice: SHREDDED_NOTICE[language]
      });
      const prepared = redactSupportMessage(request.text);
      const plaintext = Buffer.from(prepared.text,"utf8");
      const messageId = randomUUID();
      let ciphertext: Buffer | undefined;
      try {
        ciphertext = await withDataKey(row,(dataKey) => input.keys.sealContent(
          {
            kind: "case-message",caseId: String(row.case_id),messageId,
            role: "user",purpose: "content"
          },dataKey,plaintext
        ));
        const appended = await input.repository.appendCaseMessage({
          caseId: String(row.case_id),messageId,role: "user",contentCiphertext: ciphertext,
          redacted: prepared.redacted,messageLimit: request.caseMessageLimit,at: request.at
        });
        if (appended === "LIMIT_REACHED") {
          throw new SupportCaseError("SUPPORT_CASE_MESSAGE_LIMIT");
        }
        if (appended === "SHREDDED") return Object.freeze({
          kind: "SHREDDED" as const,notice: SHREDDED_NOTICE[language]
        });
        return appended;
      } finally { plaintext.fill(0);ciphertext?.fill(0); }
    }
  });
}

export interface SupportCasesRepositoryPort {
  createCase(input: SupportCaseOpenInput): Promise<SupportCaseRecord>;
  transitionCase(input: Readonly<{
    caseId: string;
    toState: SupportCaseState;
    actor: SupportCaseActor;
    at: Date;
  }>): Promise<SupportCaseRecord | null>;
}

export class SupportCaseError extends TypedDomainError {
  constructor(code:
    | "SUPPORT_CASE_ILLEGAL_TRANSITION"
    | "SUPPORT_CASE_NOT_FOUND"
    | "SUPPORT_CASE_MESSAGE_TOO_LARGE"
    | "SUPPORT_CASE_MESSAGE_LIMIT"
    | "SUPPORT_CASE_CURSOR_INVALID"
    | "SUPPORT_SUMMARY_CLOCK_INVALID"
    | "SUPPORT_SUMMARY_INVALID"
    | "SUPPORT_SUMMARY_SEAL_FAILED"
    | "SUPPORT_SUMMARY_PERSIST_FAILED"
  ) {
    super(code,code);
    this.name = "SupportCaseError";
  }
}

export function createSupportCasesService(repository: SupportCasesRepositoryPort) {
  return Object.freeze({
    openCase: (input: SupportCaseOpenInput) => repository.createCase(input),
    transition: async (
      caseId: string,
      toState: SupportCaseState,
      actor: SupportCaseActor,
      at: Date
    ): Promise<SupportCaseRecord> => {
      const transitioned = await repository.transitionCase({ caseId,toState,actor,at });
      if (transitioned === null) throw new SupportCaseError("SUPPORT_CASE_ILLEGAL_TRANSITION");
      return transitioned;
    }
  });
}
