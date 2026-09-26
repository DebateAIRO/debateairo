import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type {
  HelpCorpusEntry,HelpCorpusSnapshotLookup,LoadedHelpCorpus
} from "@debateai/support-kb";
import {
  selectSupportRecoveryEntry,supportSourceIdsSatisfyPolicy
} from "@debateai/support-kb";
import {
  SUPPORT_ACTION_IDS,SUPPORT_CAPABILITIES,supportLocaleNames,
  type SupportAction,type SupportCorpusLanguage
} from "@debateai/support-kb/catalog";
import { buildSupportKnowledgeContext } from "@debateai/support-kb/context";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { redactSupportMessage, type SupportMessageCipherPort } from "./session.js";
import { SupportModelError, type SupportModelPort, type SupportModelUsage } from "./model.js";
import { buildSupportAnswerPrompt,buildSupportDraftAnswerPrompt } from "./prompt.js";
import { supportTemplate, type SupportLanguage } from "./templates.js";
import { supportIntentSurface } from "./classify.js";
import {
  applyIncidentNotice,type SupportIncidentRepositoryPort
} from "./incidents.js";
import { SupportQueueError,type SupportRelayQueue } from "./queue.js";
import type { SupportDegradedPort } from "./degraded.js";
import {
  bindSupportDraftAuthority,diagnoseSupportDraft,parseSupportDraft,screenSupportModelText,
  type SupportDraftReport,validateSupportDraft
} from "./response-policy.js";
import {
  createSupportModelReferenceFactory,translateSupportDraftReferences,
  type SupportModelReferenceFactory
} from "./model-references.js";

const MAX_RETRIEVED_ENTRIES = 3;
const MAX_SYSTEM_CODE_POINTS = 24_000;
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
    detectedLanguage: SupportCorpusLanguage;
    overrideLanguage: SupportCorpusLanguage | null;
    modelRef: string;
    kbVersion?: string;
    snapshot?: LoadedHelpCorpus;
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
  corpusLocale: SupportCorpusLanguage
): readonly HelpCorpusEntry[] {
  const query = tokens(text);
  if (query.size === 0) return Object.freeze([]);
  const normalized = normalizedText(text);
  return Object.freeze(entries
    .filter((entry) => entry.lang === corpusLocale
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

/**
 * FW-B / B-I1 — THE OWNERS' INSTRUCTION SLOT for the chat answer, exported so
 * the injection corpus and the byte pins drive the text the engine really
 * sends rather than a fixture that resembles it.
 *
 * Byte for byte the system text this service has always built: the language
 * preamble and the retrieved, ratified entries, bounded at
 * `MAX_SYSTEM_CODE_POINTS`. It is INSTRUCTION only. The visitor's message used
 * to be a bare `user` turn beside it; it is material now, inside the fence, in
 * its own named field (`./prompt.ts`).
 *
 * FIX ROUND 1, MINOR 7. This was briefly a one-line wrapper around a private
 * `boundedSystem`, with the production call site still on the private one —
 * two names for one text, which is the drift a wrapper is supposed to prevent,
 * not create. There is one function now, and `respond` below calls THIS one, so
 * a test that pins these bytes pins what the vendor receives.
 */
export function supportAnswerInstruction(
  entries: readonly HelpCorpusEntry[],
  language: SupportLanguage
): string {
  // en and ro keep the reviewed bytes they always shipped (FW-B pins); the
  // other interface locales name their language in the English template.
  const preamble = language === "ro"
    ? "Răspunde numai în română și numai cu fapte din intrările furnizate. Nu inventa surse și nu include linii Sursă."
    : language === "en"
      ? "Answer only in English and only with facts from the supplied entries. Do not invent sources or include Source lines."
      : `Answer only in ${supportLocaleNames(language).english} (${supportLocaleNames(language).native}) and only with facts from the supplied entries. Do not invent sources or include Source lines.`;
  const joined = entries.map((entry) => [
    `ENTRY ${entry.id}`,
    `TITLE ${entry.title}`,
    entry.body
  ].join("\n")).join("\n\n");
  return [...`${preamble}\n\n${joined}`].slice(0,MAX_SYSTEM_CODE_POINTS).join("");
}

/**
 * dev's reviewed structured-draft preamble — the OWNERS' instruction slot of
 * `support.chat-answer.v2` (SYNC3, R1), ahead of the reviewed context and its
 * OUTPUT CONTRACT. It restates the JSON shape the code-owned form states; the
 * form, not this text, is what an edit can never remove.
 */
export function structuredInstruction(language: SupportLanguage): string {
  const shape = '{"kind":"answer","text":"<grounded answer>","sourceIds":["<allowed source reference>"],"actionIds":[]}';
  // en and ro keep dev's reviewed v2 bytes (SYNC3 / R1 pins); the other
  // interface locales get the English contract plus a prose-language line.
  if (language === "ro") {
    return `Returnează numai un singur obiect JSON, fără alte chei și fără text înainte sau după: ${shape}. kind trebuie să fie answer. Secțiunea finală OUTPUT CONTRACT enumeră singurele sourceIds și actionIds permise; înlocuiește exemplele și copiază identificatorii exact, citând cel puțin un sourceId. Nu scrie niciodată identificatori de surse, acțiuni sau capabilități, rute ori căi în text; exprimă navigarea numai prin actionIds. Poți explica limite și condiții despre setările de securitate, dar nu solicita, primi, transforma, verifica sau repeta niciodată parole, coduri ori alte date de autentificare și nu afirma că ai efectuat o schimbare de securitate.`;
  }
  if (language === "en") {
    return `Return only one JSON object, with no other keys and no text before or after it: ${shape}. kind must be answer. The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds; replace the examples and copy identifiers exactly, citing at least one sourceId. Never write source IDs, action IDs, capability IDs, routes, or paths inside text; express navigation only through actionIds. You may explain limitations and prerequisites for security settings, but never request, receive, transform, validate, or repeat passwords, codes, or other credentials, and never claim that you performed a security change.`;
  }
  const { english,native } = supportLocaleNames(language);
  return `Write the text field in ${english} (${native}). Keep JSON keys (kind, text, sourceIds, actionIds), the literal kind "answer", source ids, action ids, routes, and paths in English exactly as specified; never translate an identifier or literal. Return only one JSON object, with no other keys and no text before or after it: ${shape}. kind must be answer. The final OUTPUT CONTRACT lists the only allowed sourceIds and actionIds; replace the examples and copy identifiers exactly, citing at least one sourceId. Never write source IDs, action IDs, capability IDs, routes, or paths inside text; express navigation only through actionIds. You may explain limitations and prerequisites for security settings, but never request, receive, transform, validate, or repeat passwords, codes, or other credentials, and never claim that you performed a security change.`;
}

/**
 * The v2 instruction slot exactly as `respond` sends it, exported so the byte
 * pins and the injection corpus drive the text the engine really sends. Bounded
 * at `MAX_SYSTEM_CODE_POINTS`; the code-owned frame follows it in the packet.
 */
export function supportDraftAnswerInstruction(context: string,language: SupportLanguage): string {
  const system = `${structuredInstruction(language)}\n\n${context}`;
  if ([...system].length > MAX_SYSTEM_CODE_POINTS) {
    throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
  }
  return system;
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
  requireStructuredDraft?: true;
  messages: SupportMessageCipherPort;
  modelFor: (modelRef: string) => SupportModelPort;
  queue?: Pick<SupportRelayQueue,"execute">;
  degraded?: SupportDegradedPort;
  incidents?: Pick<SupportIncidentRepositoryPort,"readActiveIncidents">;
  reportDraftDiagnostic?: (diagnostic: SupportDraftReport) => void;
  modelReferenceFactory?: () => SupportModelReferenceFactory;
  clock?: () => Date;
}>): SupportAnswerPort {
  const clock = input.clock ?? (() => new Date());
  return Object.freeze({
    respond: async (request: Parameters<SupportAnswerPort["respond"]>[0]) => {
      const corpusLocale: SupportCorpusLanguage = request.language === "ro" ? "ro" : "en";
      const prepared = redactSupportMessage(request.text);
      const routeSnapshot = request.snapshot !== undefined
        && typeof request.snapshot.kbVersion === "string"
        && Array.isArray(request.snapshot.entries) ? request.snapshot : undefined;
      const snapshot = routeSnapshot ?? (request.kbVersion === undefined
        ? undefined : input.snapshots?.get(request.kbVersion));
      const structured = input.requireStructuredDraft === true || input.snapshots !== undefined;
      const eligibleEntries = structured ? snapshot?.entries ?? [] : input.entries;
      const availableActionIds = resolveSupportActions(SUPPORT_ACTION_IDS,{
        signedIn: request.signedIn === true,language: request.language
      }).map(({ id }) => id);
      const modelReferenceFactory = structured
        ? (input.modelReferenceFactory ?? createSupportModelReferenceFactory)() : undefined;
      const context = structured ? buildSupportKnowledgeContext({
        entries: eligibleEntries,
        capabilities: SUPPORT_CAPABILITIES,
        language: request.language,
        query: prepared.text,
        historyText: "",
        availableActionIds,
        referenceFor: modelReferenceFactory!.referenceFor,
        maxCodePoints: MAX_SYSTEM_CODE_POINTS
          - [...`${structuredInstruction(request.language)}\n\n`].length
      }) : undefined;
      const entries = structured
        ? context!.sourceIds.flatMap((id) => {
          const entry = eligibleEntries.find((candidate) =>
            candidate.lang === corpusLocale && candidate.id === id
          );
          return entry === undefined ? [] : [entry];
        })
        : retrieve(eligibleEntries,prepared.text,corpusLocale);
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
      const recoveryEntry = structured
        ? selectSupportRecoveryEntry(
          entries,context!.sourcePolicy,context!.recoverySourceIds
        ) : undefined;
      const sourceActionIds = recoveryEntry === undefined ? Object.freeze([]) : Object.freeze(
        context!.requestedActionIds.filter((id) => SUPPORT_CAPABILITIES.some(({ articleIds,actionIds }) =>
          articleIds.includes(recoveryEntry.id) && actionIds.includes(id)
        ))
      );

      let completion: Awaited<ReturnType<SupportModelPort["complete"]>> | undefined;
      let firstTokenAt: Date | undefined;
      let completedAt: Date | undefined;
      let modelCalled = false;
      let circuitShortCircuited = false;
      let halfOpenProbe = false;
      const attemptId = randomUUID();
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
          /**
           * FW-B / B-I1 + D-I3 — the visitor's turn goes through the frame.
           *
           * Built ONCE, outside `complete`, because the queue may run the
           * operation again: the fence is minted per CALL, not per attempt, so
           * a retry re-sends the same bytes (`buildFramedPrompt`, layer 2).
           * `safeText` is the redacted visitor message — untrusted, and now
           * inside the fenced `visitor_message` field instead of beside the
           * instruction as a bare `user` turn.
           *
           * SYNC3 / R1: the structured path — the one the API root composes —
           * is framed under `support.chat-answer.v2`, whose locked form states
           * the JSON shape the parse below enforces; the prose path keeps v1.
           */
          const framed = structured
            ? buildSupportDraftAnswerPrompt({
              instruction: supportDraftAnswerInstruction(context!.text,request.language),
              visitorMessage: safeText
            })
            : buildSupportAnswerPrompt({
              instruction: supportAnswerInstruction(entries,request.language),
              visitorMessage: safeText
            });
          const complete = (signal?: AbortSignal) => {
            modelCalled = true;
            return input.modelFor(request.modelRef).complete({
              packet: framed.packet,language: request.language,
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
        const diagnostic = structured ? diagnoseSupportDraft(
          completion.text,
          context!.sourceReferences.map(({ reference }) => reference),
          context!.actionReferences.map(({ reference }) => reference),
          [
            ...context!.sourceIds,...context!.requestedActionIds,
            ...context!.sourceReferences.map(({ reference }) => reference),
            ...context!.actionReferences.map(({ reference }) => reference)
          ]
        ) : undefined;
        if (diagnostic !== undefined && diagnostic.code !== "ACCEPTED") {
          input.reportDraftDiagnostic?.(Object.freeze({ attemptId,...diagnostic }));
        }
        const parsed = structured
          ? parseSupportDraft(completion.text,[
            ...context!.sourceIds,...context!.requestedActionIds,
            ...context!.sourceReferences.map(({ reference }) => reference),
            ...context!.actionReferences.map(({ reference }) => reference)
          ]) : undefined;
        const referenceDraft = !structured ? undefined
          : parsed === null || parsed === undefined ? null
          : validateSupportDraft(
            parsed,
            context!.sourceReferences.map(({ reference }) => reference),
            context!.actionReferences.map(({ reference }) => reference)
          );
        const translatedDraft = !structured ? undefined
          : referenceDraft === null || referenceDraft === undefined ? null
          : translateSupportDraftReferences(referenceDraft,{
            sources:context!.sourceReferences,actions:context!.actionReferences
          });
        const authorityDraft = !structured ? undefined
          : translatedDraft === null || translatedDraft === undefined ? null
          : bindSupportDraftAuthority(
            translatedDraft,context!.sourceIds,context!.requestedActionIds,request.language
          );
        const draft = !structured ? undefined
          : authorityDraft === null || authorityDraft === undefined
            || !supportSourceIdsSatisfyPolicy(
              authorityDraft.sourceIds,context!.sourcePolicy
            ) ? null : authorityDraft;
        const rejected = structured && draft === null;
        const recovered = rejected
          && recoveryEntry?.fallback !== undefined
          && screenSupportModelText(recoveryEntry.fallback);
        const modelText = structured
          ? recovered ? recoveryEntry.fallback
          : rejected ? supportTemplate("REFUSE_SAFETY",request.language) : draft!.text
          : withoutModelSources(completion.text);
        if (modelText === "") throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
        input.degraded?.markAvailable();
        const groundedText = structured ? modelText
          : `${modelText}\n${sourceLines(entries,request.language)}`;
        const text = rejected || input.incidents === undefined ? groundedText : applyIncidentNotice(
          groundedText,supportIntentSurface(request.text),
          await input.incidents.readActiveIncidents(),request.language
        );
        const outcome = rejected && !recovered ? "REFUSE_SAFETY" as const : "ANSWER_GROUNDED" as const;
        const sources = rejected && !recovered ? Object.freeze([]) : Object.freeze((recovered
          ? [recoveryEntry!] : entries.filter((entry) => structured ? draft!.sourceIds.includes(entry.id) : true))
          .map((entry) => Object.freeze({ id: entry.id,label: entry.title })));
        const actions = rejected && !recovered || !structured ? Object.freeze([]) : resolveSupportActions(
          recovered ? sourceActionIds : draft!.actionIds,
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
