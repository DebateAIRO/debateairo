import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type {
  HelpCorpusEntry,HelpCorpusSnapshotLookup
} from "@debateai/support-kb";
import {
  SUPPORT_CAPABILITIES,type SupportAction
} from "@debateai/support-kb/catalog";
import { buildSupportKnowledgeContext } from "@debateai/support-kb/context";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { redactSupportMessage, type SupportMessageCipherPort } from "./session.js";
import { SupportModelError, type SupportModelPort, type SupportModelUsage } from "./model.js";
import { supportTemplate, type SupportLanguage } from "./templates.js";
import { supportIntentSurface } from "./classify.js";
import {
  applyIncidentNotice,type SupportIncidentRepositoryPort
} from "./incidents.js";
import { SupportQueueError,type SupportRelayQueue } from "./queue.js";
import type { SupportDegradedPort } from "./degraded.js";
import { parseSupportDraft,validateSupportDraft } from "./response-policy.js";

const MAX_RETRIEVED_ENTRIES = 3;
const MAX_SYSTEM_CODE_POINTS = 12_000;
// Leave explicit time for queue/durable cleanup inside the frozen one-second
// caller-visible half-open budget.
const HALF_OPEN_PROBE_TIMEOUT_MS = 850;
const STOP_WORDS = new Set([
  "a", "about", "am", "an", "and", "are", "cum", "de", "do", "does", "este", "how",
  "i", "in", "is", "it", "la", "much", "of", "on", "or", "să", "sa", "the", "to",
  "un", "unei", "what", "with"
]);
const SERVER_SOURCE_LINE = /^\s*(?:Source|Sursă):.*$/gimu;
const INTENT_SIGNALS: Readonly<Record<string,readonly RegExp[]>> = Object.freeze({
  "browse-public-debates": [/\bbrowse\b/u,/anonymous visitor/u,/\brasfoi/u,/vizitator anonim/u],
  "budget-tier-choice": [/\bbudget(?: tier)?\b/u,/nivel(?:ul)? de buget/u],
  "debate-topic-and-description": [/\btopic\b/u,/\bdescription\b/u,/subiectul dezbaterii/u,/informatii.*descriere/u],
  "delete-a-private-debate": [/\bdelete\b.*\bprivate debates?\b/u,/\bsterg\b.*dezbater.*privat/u],
  "getting-started-debate": [/\bstart\b.*\bfirst debate\b/u,/\bnew here\b/u,/la inceput/u,/\bpornesc\b.*prima.*dezbatere/u],
  "guide-how-it-works": [/what happens after.*submit/u,/debate process/u,/how.*debate.*work/u,/ce se intampla dupa/u,/cum functioneaza procesul/u],
  "public-answer-disclosure": [/before.*(?:read|reading).*public answer/u,/public answer.*(?:know|disclosure)/u,/inainte.*(?:citesc|citire).*raspuns public/u],
  "publish-a-debate": [/\bpublish\b/u,/\bimi public\b/u,/\bpublic dezbaterea\b/u],
  "risk-tier-choice": [/\brisk tier\b/u,/nivel(?:ul)? de risc/u],
  "unpublish-a-debate": [/\bunpublish\b/u,/private again/u,/fac.*din nou privata/u],
  "unsupported-capabilities": [/\bcannot do\b/u,/\bcan't do\b/u,/\bnot do yet\b/u,/\bnu poate face\b/u,/lucruri.*nu poate/u],
  "view-public-debate": [/\bview\b.*public debate/u,/\bopen\b.*public debate/u,/public link/u,/shared with me/u,/unde.*vad.*dezbaterea publica/u,/deschid.*dezbatere publica/u,/distribuit/u]
});

export type SupportAnswerResult = Readonly<{
  messageId: string;
  outcome: "ANSWER_GROUNDED" | "NO_SOURCE" | "REFUSE_SAFETY" | "DEGRADED" | "DISABLED";
  text: string;
  canEscalate: true;
  sources?: readonly Readonly<{ id: string;label: string }>[];
  actions?: readonly SupportAction[];
  usage?: SupportModelUsage;
}>;

export interface SupportAnswerPort {
  respond(input: Readonly<{
    sessionId: string;
    text: string;
    language: SupportLanguage;
    detectedLanguage: SupportLanguage;
    overrideLanguage: SupportLanguage | null;
    modelRef: string;
    kbVersion?: string;
    signedIn?: boolean;
    receivedAt: Date;
    onQueueProgress?: (notice: string) => void;
  }>): Promise<SupportAnswerResult>;
}

function tokens(value: string): ReadonlySet<string> {
  const normalized = normalizedText(value);
  return new Set((normalized.match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((token) => token.endsWith("s") && token.length > 4 ? token.slice(0,-1) : token)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)));
}

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("en-US");
}

function retrieve(
  entries: readonly HelpCorpusEntry[],
  text: string,
  language: SupportLanguage
): readonly HelpCorpusEntry[] {
  const query = tokens(text);
  if (query.size === 0) return Object.freeze([]);
  const normalized = normalizedText(text);
  return Object.freeze(entries
    .filter((entry) => entry.lang === language
      && entry.status === "shipped"
      && entry.ratifiedBy === "V"
      && entry.ratifiedOn !== "")
    .map((entry) => {
      const searchable = tokens(`${entry.id} ${entry.title} ${entry.body}`);
      const lexicalScore = [...query].reduce(
        (total,token) => total + (searchable.has(token) ? 1 : 0),0
      );
      const intentScore = (INTENT_SIGNALS[entry.id] ?? [])
        .reduce((total,signal) => total + (signal.test(normalized) ? 1 : 0),0);
      const score = intentScore === 0 ? 0 : intentScore * 100 + lexicalScore;
      return { entry,score };
    })
    .filter(({ score }) => score > 0)
    .sort((left,right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0,MAX_RETRIEVED_ENTRIES)
    .map(({ entry }) => entry));
}

function boundedSystem(entries: readonly HelpCorpusEntry[], language: SupportLanguage): string {
  const preamble = language === "ro"
    ? "Răspunde numai în română și numai cu fapte din intrările furnizate. Nu inventa surse și nu include linii Sursă."
    : "Answer only in English and only with facts from the supplied entries. Do not invent sources or include Source lines.";
  const joined = entries.map((entry) => [
    `ENTRY ${entry.id}`,
    `TITLE ${entry.title}`,
    entry.body
  ].join("\n")).join("\n\n");
  return [...`${preamble}\n\n${joined}`].slice(0,MAX_SYSTEM_CODE_POINTS).join("");
}

function boundedStructuredSystem(context: string,language: SupportLanguage): string {
  const instruction = language === "ro"
    ? "Returnează numai JSON cu exact cheile kind, text, sourceIds și actionIds. kind trebuie să fie answer. Citează cel puțin un sourceId furnizat și folosește numai actionIds solicitate. Nu include URL-uri, HTML, Markdown, parole, coduri ori afirmații despre resetări."
    : "Return only JSON with exactly the keys kind, text, sourceIds, and actionIds. kind must be answer. Cite at least one supplied sourceId and use only requested actionIds. Include no URLs, HTML, Markdown, passwords, codes, or reset claims.";
  return [...`${instruction}\n\n${context}`].slice(0,MAX_SYSTEM_CODE_POINTS).join("");
}

function withoutModelSources(text: string): string {
  return text.replace(SERVER_SOURCE_LINE,"").replace(/\n{3,}/gu,"\n\n").trim();
}

function strictAfter(previous: Date, clock: () => Date): Date {
  const observed = clock().getTime();
  return new Date(Number.isFinite(observed) && observed > previous.getTime()
    ? observed : previous.getTime() + 1);
}

function sourceLines(entries: readonly HelpCorpusEntry[], language: SupportLanguage): string {
  return entries.map((entry) => supportTemplate("SOURCE_LINE",language)
    .replace("{title}",entry.title)
    .replace("{id}",entry.id)).join("\n");
}

async function completeWithoutQueue<T>(
  signal: AbortSignal | undefined,
  operation: (signal?: AbortSignal) => Promise<T>
): Promise<T> {
  const running = operation(signal);
  if (signal === undefined) return await running;
  let abort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_resolve,reject) => {
      abort = () => reject(new SupportModelError("SUPPORT_MODEL_UNAVAILABLE"));
      if (signal.aborted) abort();
      else signal.addEventListener("abort",abort,{ once: true });
    });
    return await Promise.race([running,aborted]);
  } finally {
    if (abort !== undefined) signal.removeEventListener("abort",abort);
  }
}

export function createSupportAnswerService(input: Readonly<{
  entries: readonly HelpCorpusEntry[];
  snapshots?: HelpCorpusSnapshotLookup;
  messages: SupportMessageCipherPort;
  modelFor: (modelRef: string) => SupportModelPort;
  queue?: Pick<SupportRelayQueue,"execute">;
  degraded?: SupportDegradedPort;
  incidents?: Pick<SupportIncidentRepositoryPort,"readActiveIncidents">;
  clock?: () => Date;
}>): SupportAnswerPort {
  const clock = input.clock ?? (() => new Date());
  return Object.freeze({
    respond: async (request: Parameters<SupportAnswerPort["respond"]>[0]) => {
      const prepared = redactSupportMessage(request.text);
      const snapshot = request.kbVersion === undefined
        ? undefined : input.snapshots?.get(request.kbVersion);
      const structured = input.snapshots !== undefined;
      const eligibleEntries = structured ? snapshot?.entries ?? [] : input.entries;
      const context = structured ? buildSupportKnowledgeContext({
        entries: eligibleEntries,
        capabilities: SUPPORT_CAPABILITIES,
        language: request.language,
        query: prepared.text,
        historyText: "",
        maxCodePoints: MAX_SYSTEM_CODE_POINTS - 800
      }) : undefined;
      const entries = structured
        ? eligibleEntries.filter((entry) => entry.lang === request.language
          && context!.sourceIds.includes(entry.id))
        : retrieve(eligibleEntries,prepared.text,request.language);
      if (entries.length === 0) {
        const completedAt = strictAfter(request.receivedAt,clock);
        const text = supportTemplate("NO_SOURCE",request.language);
        const messageId = randomUUID();
        await input.messages.write({
          messageId: randomUUID(),sessionId: request.sessionId,role: "user",
          text: prepared.text,outcome: "NO_SOURCE",language: request.language,
          detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
          receivedAt: request.receivedAt,firstTokenAt: null,completedAt
        });
        const stored = await input.messages.write({
          messageId,sessionId: request.sessionId,role: "assistant",
          text,outcome: "NO_SOURCE",language: request.language,
          detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
          receivedAt: request.receivedAt,firstTokenAt: null,completedAt
        });
        return Object.freeze({
          messageId,outcome: "NO_SOURCE",text: stored.text,canEscalate: true as const,
          sources: Object.freeze([]),actions: Object.freeze([])
        });
      }

      let completion: Awaited<ReturnType<SupportModelPort["complete"]>> | undefined;
      let firstTokenAt: Date | undefined;
      let completedAt: Date | undefined;
      let modelCalled = false;
      let circuitShortCircuited = false;
      let halfOpenProbe = false;
      try {
        await input.messages.writeAndTransit({
          messageId: randomUUID(),sessionId: request.sessionId,role: "user",
          text: prepared.text,outcome: "ANSWER_GROUNDED",language: request.language,
          detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
          receivedAt: request.receivedAt,firstTokenAt: null,completedAt: null
        },async (safeText) => {
          if (input.degraded?.beginModelAttempt(request.receivedAt) === false) {
            circuitShortCircuited = true;
            throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
          }
          halfOpenProbe = input.degraded?.isDegraded().degraded === true;
          const attemptSignal = halfOpenProbe
            ? AbortSignal.timeout(HALF_OPEN_PROBE_TIMEOUT_MS) : undefined;
          const complete = (signal?: AbortSignal) => {
            modelCalled = true;
            return input.modelFor(request.modelRef).complete({
              system: structured
                ? boundedStructuredSystem(context!.text,request.language)
                : boundedSystem(entries,request.language),
              messages: [{ role: "user",content: safeText }],language: request.language,
              ...(signal === undefined ? {} : { signal })
            });
          };
          completion = input.queue === undefined
            ? await completeWithoutQueue(attemptSignal,complete)
            : await input.queue.execute({
            modelBacked: true,language: request.language,
            ...(attemptSignal === undefined ? {} : { signal: attemptSignal }),
            ...(request.onQueueProgress === undefined
              ? {} : { onProgress: request.onQueueProgress })
          },complete);
          firstTokenAt = strictAfter(request.receivedAt,clock);
          completedAt = strictAfter(firstTokenAt,clock);
        });
        if (completion === undefined || firstTokenAt === undefined || completedAt === undefined) {
          throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
        }
        const parsed = structured ? parseSupportDraft(completion.text) : undefined;
        const draft = !structured ? undefined
          : parsed === null || parsed === undefined ? null
          : validateSupportDraft(
            parsed,context!.sourceIds,context!.requestedActionIds
          );
        const rejected = structured && draft === null;
        const modelText = structured
          ? rejected ? supportTemplate("REFUSE_SAFETY",request.language) : draft!.text
          : withoutModelSources(completion.text);
        if (modelText === "") throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
        input.degraded?.markAvailable();
        const groundedText = structured ? modelText
          : `${modelText}\n${sourceLines(entries,request.language)}`;
        const text = rejected || input.incidents === undefined ? groundedText : applyIncidentNotice(
          groundedText,supportIntentSurface(request.text),
          await input.incidents.readActiveIncidents(),request.language
        );
        const outcome = rejected ? "REFUSE_SAFETY" as const : "ANSWER_GROUNDED" as const;
        const sources = rejected ? Object.freeze([]) : Object.freeze(entries
          .filter((entry) => structured ? draft!.sourceIds.includes(entry.id) : true)
          .map((entry) => Object.freeze({ id: entry.id,label: entry.title })));
        const actions = rejected || !structured ? Object.freeze([]) : resolveSupportActions(
          draft!.actionIds,
          { signedIn: request.signedIn === true,language: request.language }
        );
        const messageId = randomUUID();
        const stored = await input.messages.write({
          messageId,sessionId: request.sessionId,role: "assistant",
          text,outcome,language: request.language,
          detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
          receivedAt: request.receivedAt,firstTokenAt,completedAt,modelCalled: true,
          ...(completion.usage?.input_tokens === undefined
            ? {} : { inputTokens: completion.usage.input_tokens }),
          ...(completion.usage?.output_tokens === undefined
            ? {} : { outputTokens: completion.usage.output_tokens }),
          ...(completion.usage?.cost_usd === undefined
            ? {} : { costUsd: completion.usage.cost_usd })
        });
        return Object.freeze({
          messageId,outcome,text: stored.text,canEscalate: true as const,sources,actions,
          ...(completion.usage === undefined ? {} : { usage: completion.usage })
        });
      } catch (error) {
        if (!(error instanceof SupportModelError) && !(error instanceof SupportQueueError)) {
          input.degraded?.endModelAttempt();
          if (error instanceof TypedDomainError) throw error;
          throw error;
        }
        if (error instanceof SupportModelError && error.code === "SUPPORT_DISABLED") {
          input.degraded?.endModelAttempt();
          const disabledAt = strictAfter(request.receivedAt,clock);
          const text = supportTemplate("DISABLED",request.language);
          const messageId = randomUUID();
          const stored = await input.messages.write({
            messageId,sessionId: request.sessionId,role: "assistant",
            text,outcome: "DISABLED",language: request.language,
            detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
            receivedAt: request.receivedAt,firstTokenAt: null,completedAt: disabledAt,
            modelCalled: false
          });
          return Object.freeze({
            messageId,outcome: "DISABLED",text: stored.text,canEscalate: true as const,
            sources: Object.freeze([]),actions: Object.freeze([])
          });
        }
        const degradedAt = strictAfter(request.receivedAt,clock);
        if (error instanceof SupportModelError && !circuitShortCircuited) {
          input.degraded?.markUnavailable(degradedAt,"relay");
        } else if (error.code === "SUPPORT_DAILY_CAP") {
          input.degraded?.markUnavailable(degradedAt,"cap");
        } else if (halfOpenProbe) {
          input.degraded?.markUnavailable(degradedAt,"relay");
        } else {
          input.degraded?.endModelAttempt();
        }
        const degradedReason = error instanceof SupportModelError || halfOpenProbe ? "relay" as const
          : error.code === "SUPPORT_DAILY_CAP" ? "cap" as const : undefined;
        const text = supportTemplate("DEGRADED",request.language);
        const messageId = randomUUID();
        const stored = await input.messages.write({
          messageId,sessionId: request.sessionId,role: "assistant",
          text,outcome: "DEGRADED",language: request.language,
          detectedLanguage: request.detectedLanguage,overrideLanguage: request.overrideLanguage,
          receivedAt: request.receivedAt,firstTokenAt: null,completedAt: degradedAt,
          modelCalled,
          ...(degradedReason === undefined ? {} : { degradedReason })
        });
        return Object.freeze({
          messageId,outcome: "DEGRADED",text: stored.text,canEscalate: true as const,
          sources: Object.freeze([]),actions: Object.freeze([])
        });
      }
    }
  });
}
