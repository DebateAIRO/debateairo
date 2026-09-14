"use client";

import { useEffect,useRef,useState,type FormEvent,type ReactNode } from "react";
import { redactSupportText } from "@debateai/kernel";
import {
  SUPPORT_CAPABILITIES,
  type SupportAction,
  type SupportActionId
} from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { BrandMark } from "../TopBar.js";
import { ModeToggle } from "../ModeToggle.js";
import { ConsentToggle } from "./ConsentToggle.js";
import { DebatePicker } from "./DebatePicker.js";
import { supportPost } from "./http.js";

export type SupportAssistantLanguage = "en" | "ro";
export type SupportAssistantOutcome =
  | "ANSWER_GROUNDED"
  | "NO_SOURCE"
  | "REFUSE_ZONE"
  | "REFUSE_INJECTION"
  | "REFUSE_SAFETY"
  | "DEGRADED"
  | "DISABLED"
  | "RATE_LIMITED"
  | "SHREDDED"
  | "CONSENT_NEEDED"
  | "ANON_CONTEXT"
  | "REFUSE_OTHER_USER"
  | "ANSWER_OWN_STATE"
  | "ANSWER_INCIDENT"
  | "NO_INCIDENT"
  | "CASE_OPENED"
  | "CASE_ALREADY_OPENED";

const SUPPORT_ASSISTANT_OUTCOMES = new Set<SupportAssistantOutcome>([
  "ANSWER_GROUNDED","NO_SOURCE","REFUSE_ZONE","REFUSE_INJECTION","REFUSE_SAFETY",
  "DEGRADED","DISABLED","RATE_LIMITED","SHREDDED","CONSENT_NEEDED","ANON_CONTEXT",
  "REFUSE_OTHER_USER","ANSWER_OWN_STATE","ANSWER_INCIDENT","NO_INCIDENT","CASE_OPENED",
  "CASE_ALREADY_OPENED"
]);

type SupportSession = Readonly<{
  sessionId: string;
  token: string;
  identityBound: boolean;
}>;
export type SupportCaseAcknowledgement = Readonly<{
  text: string;
  token: string;
  slaHours: number;
  link: string;
}>;
type SupportSource = Readonly<{ id: string;label: string }>;
type SupportReply = Readonly<{
  messageId: string;
  outcome: SupportAssistantOutcome;
  text: string;
  link?: string;
  sources?: readonly SupportSource[];
  actions?: readonly SupportAction[];
  caseAcknowledgement?: SupportCaseAcknowledgement;
}>;
type SupportSessionStart = SupportSession | SupportReply;
type OwnContextSelection = Readonly<{ runId: string }> | Readonly<{ latest: true }>;

export type SupportAssistantClient = Readonly<{
  createSession(language: SupportAssistantLanguage): Promise<SupportSessionStart>;
  sendMessage(
    session: SupportSession,
    text: string,
    language: SupportAssistantLanguage,
    context?: OwnContextSelection
  ): Promise<SupportReply>;
  isSignedIn?(): Promise<boolean>;
  setConsent?(session: SupportSession,on: boolean): Promise<SupportReply | null>;
  rate(
    session: SupportSession,messageId: string,rating: "yes" | "no"
  ): Promise<SupportCaseAcknowledgement | SupportReply | null>;
  escalate(session: SupportSession,language: SupportAssistantLanguage): Promise<SupportReply | Readonly<{
    token: string;
    text: string;
  }>>;
}>;

const DISCLOSURE = Object.freeze({
  en: "Hi — I'm the Dialectical Engine support assistant, an AI. I can explain how the product works and point you to the right page. I can't sign you in, change your account, or reset anything. For those, use the links I give you, or ask for a person.",
  ro: "Bună — sunt asistentul de suport Dialectical Engine, o inteligență artificială. Pot explica cum funcționează produsul și te pot îndruma către pagina potrivită. Nu pot să te autentific, să îți modific contul sau să resetez ceva. Pentru acestea folosește linkurile pe care ți le dau sau cere să vorbești cu o persoană."
});

const WORDS = Object.freeze({
  en: Object.freeze({
    label: "Message",send: "Send",human: "Talk to a human",yes: "Yes",no: "No",
    close: "Close help"
  }),
  ro: Object.freeze({
    label: "Mesaj",send: "Trimite",human: "Vorbește cu o persoană",yes: "Da",no: "Nu",
    close: "Închide ajutorul"
  })
});

// Points inward, back toward the dock corner the panel folds into.
const CLOSE_ARROW = <svg
  width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
><path d="M3 8h10" /><path d="M9 4l4 4-4 4" /></svg>;

const PERSON_MARK = <svg
  width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
><circle cx="8" cy="5.4" r="2.6" /><path d="M3 13.6c.6-2.6 2.6-4.1 5-4.1s4.4 1.5 5 4.1" /></svg>;

const HELP_TOPICS = Object.freeze([
  Object.freeze({ key: "getting-started",label: "Getting started",count: 6,tone: "gold",
    prompt: "How do I start my first debate?" }),
  Object.freeze({ key: "reading",label: "Reading a debate tree",count: 9,tone: "reasoning",
    prompt: "What does a condition mark mean?" }),
  Object.freeze({ key: "scores",label: "Scores, reviews & verdicts",count: 11,tone: "pro",
    prompt: "How should I read scores, reviews, and verdicts?" }),
  Object.freeze({ key: "publishing",label: "Publishing & visibility",count: 5,tone: "con",
    prompt: "Can I unpublish a debate?" }),
  Object.freeze({ key: "account",label: "Account, MFA & sessions",count: 8,tone: "muted",
    prompt: "How do I manage MFA and active sessions?" }),
  Object.freeze({ key: "privacy",label: "Privacy & your data",count: 7,tone: "agree",
    prompt: "How is my support conversation protected?" })
]);

const HELP_SUGGESTIONS = Object.freeze([
  "Report a bug in this debate",
  "What does a condition mark mean?",
  "Can I unpublish a debate?"
]);

type SupportPageStatus = Readonly<{
  available: boolean;
  relayState: string;
  shippedDocs: number | null;
}>;

const REQUEST_UNAVAILABLE = Object.freeze({
  en: "Support is unavailable right now. Please try again or choose 'Talk to a human'.",
  ro: "Serviciul de suport nu este disponibil acum. Încearcă din nou sau alege „Vorbește cu o persoană”."
});

const MAX_RESPONSE_DECORATIONS = 3;
const SUPPORT_SOURCE_IDS = new Set(
  SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
);

const STATIC_ROUTES = new Set(["/","/new","/login","/sign-up","/settings","/help"]);
const PUBLIC_DEBATE = /^\/public\/debate\/[A-Za-z0-9_-]+$/u;
const SUPPORT_CASE = /^\/help[?]case=[A-Za-z0-9_-]{43}$/u;

function safeFirstPartyLink(link: string | undefined): string | null {
  if (link === undefined) return null;
  return STATIC_ROUTES.has(link) || PUBLIC_DEBATE.test(link) || SUPPORT_CASE.test(link) ? link : null;
}

function caseAcknowledgement(body: Readonly<Record<string,unknown>>): SupportCaseAcknowledgement | null {
  if (typeof body.case_acknowledgement !== "string"
    || typeof body.case_token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(body.case_token)
    || typeof body.sla_hours !== "number" || !Number.isSafeInteger(body.sla_hours)
    || typeof body.link !== "string" || body.link !== `/help?case=${body.case_token}`) return null;
  return Object.freeze({
    text: body.case_acknowledgement,token: body.case_token,
    slaHours: body.sla_hours,link: body.link
  });
}

function hasExactKeys(value: Readonly<Record<string,unknown>>,keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value,key));
}

function sourcesFrom(value: unknown): readonly SupportSource[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_RESPONSE_DECORATIONS) return null;
  const seen = new Set<string>();
  const sources: SupportSource[] = [];
  for (const member of value) {
    if (member === null || typeof member !== "object" || Array.isArray(member)) return null;
    const source = member as Readonly<Record<string,unknown>>;
    if (!hasExactKeys(source,["id","label"])
      || typeof source.id !== "string" || !SUPPORT_SOURCE_IDS.has(source.id)
      || typeof source.label !== "string" || source.label.length === 0
      || seen.has(source.id)) return null;
    seen.add(source.id);
    sources.push(Object.freeze({ id: source.id,label: source.label }));
  }
  return Object.freeze(sources);
}

function actionsFrom(
  value: unknown,
  context: Readonly<{ signedIn: boolean;language: SupportAssistantLanguage }> | undefined
): readonly SupportAction[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_RESPONSE_DECORATIONS) return null;
  if (value.length > 0 && context === undefined) return null;
  const seen = new Set<string>();
  const actions: SupportAction[] = [];
  for (const member of value) {
    if (member === null || typeof member !== "object" || Array.isArray(member)) return null;
    const action = member as Readonly<Record<string,unknown>>;
    if (!hasExactKeys(action,["id","label","href"])
      || typeof action.id !== "string" || typeof action.label !== "string"
      || typeof action.href !== "string" || seen.has(action.id)) return null;
    const canonical = resolveSupportActions([action.id as SupportActionId],context!);
    if (canonical.length !== 1 || canonical[0]!.id !== action.id
      || canonical[0]!.label !== action.label || canonical[0]!.href !== action.href) return null;
    seen.add(action.id);
    actions.push(canonical[0]!);
  }
  return Object.freeze(actions);
}

function replyFrom(
  body: Readonly<Record<string,unknown>>,
  context?: Readonly<{ signedIn: boolean;language: SupportAssistantLanguage }>
): SupportReply | null {
  if (typeof body.outcome !== "string"
    || !SUPPORT_ASSISTANT_OUTCOMES.has(body.outcome as SupportAssistantOutcome)
    || typeof body.text !== "string") return null;
  const acknowledgement = caseAcknowledgement(body);
  const sources = sourcesFrom(body.sources);
  const actions = actionsFrom(body.actions,context);
  if (sources === null || actions === null) return null;
  const responseLink = typeof body.refusal_link === "string"
    ? body.refusal_link
    : acknowledgement === null && typeof body.link === "string" ? body.link : undefined;
  return Object.freeze({
    messageId: String(body.message_id ?? ""),
    outcome: body.outcome as SupportAssistantOutcome,
    text: body.text,
    sources,
    actions,
    ...(responseLink === undefined ? {} : { link: responseLink }),
    ...(acknowledgement === null ? {} : { caseAcknowledgement: acknowledgement })
  });
}

function isSupportReply(value: unknown): value is SupportReply {
  return value !== null && typeof value === "object" && "outcome" in value
    && typeof value.outcome === "string"
    && SUPPORT_ASSISTANT_OUTCOMES.has(value.outcome as SupportAssistantOutcome)
    && "text" in value && typeof value.text === "string";
}

class SupportSnapshotUnavailableError extends Error {
  constructor() {
    super("SUPPORT_KB_SNAPSHOT_UNAVAILABLE");
    this.name = "SupportSnapshotUnavailableError";
  }
}

async function readJson(response: Response): Promise<Record<string,unknown>> {
  const value = await response.json() as unknown;
  const body = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string,unknown> : {};
  if (response.status === 409 && hasExactKeys(body,["error","restart_session"])
    && body.error === "SUPPORT_KB_SNAPSHOT_UNAVAILABLE" && body.restart_session === true) {
    throw new SupportSnapshotUnavailableError();
  }
  if (!response.ok
    && (typeof body.outcome !== "string" || typeof body.text !== "string")) {
    throw new Error("SUPPORT_REQUEST_UNAVAILABLE");
  }
  return body;
}

export const supportAssistantClient: SupportAssistantClient = Object.freeze({
  async isSignedIn() {
    return (await fetch("/api/v1/session",{
      method: "GET",cache: "no-store",credentials: "same-origin"
    })).ok;
  },
  async createSession(language) {
    const body = await readJson(await supportPost("/api/v1/support/sessions",{ language }));
    const terminal = replyFrom(body);
    if (terminal !== null) return terminal;
    if (body.session === null || typeof body.session !== "object"
      || typeof (body.session as Record<string,unknown>).session_id !== "string"
      || typeof body.session_token !== "string") {
      throw new Error("SUPPORT_RESPONSE_INVALID");
    }
    const session = body.session as Record<string,unknown>;
    return Object.freeze({
      sessionId: String(session.session_id),token: String(body.session_token),
      identityBound: session.identity_bound === true
    });
  },
  async sendMessage(session,text,language,context) {
    const body = await readJson(await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/messages`,
      {
        text,language,
        ...(context !== undefined && "runId" in context ? { run_id: context.runId } : {}),
        ...(context !== undefined && "latest" in context ? { latest: true } : {})
      },session.token
    ));
    const reply = replyFrom(body,{ signedIn: session.identityBound,language });
    if (reply === null) throw new Error("SUPPORT_RESPONSE_INVALID");
    return reply;
  },
  async setConsent(session,on) {
    const body = await readJson(await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/consent`,
      { on },session.token
    ));
    return replyFrom(body);
  },
  async rate(session,messageId,rating) {
    const body = await readJson(await supportPost(
      `/api/v1/support/messages/${encodeURIComponent(messageId)}/rating`,
      { session_id: session.sessionId,rating },session.token
    ));
    return replyFrom(body) ?? caseAcknowledgement(body);
  },
  async escalate(session,language) {
    const body = await readJson(await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/escalate`,
      { language },session.token
    ));
    const terminal = replyFrom(body,{ signedIn: session.identityBound,language });
    if (terminal !== null) return terminal;
    if (typeof body.case_token !== "string" || typeof body.text !== "string") {
      throw new Error("SUPPORT_RESPONSE_INVALID");
    }
    return Object.freeze({ token: body.case_token,text: body.text });
  }
});

type ConversationMessage = Readonly<{
  id: string;
  role: "assistant" | "user";
  text: string;
  link?: string;
  outcome?: SupportAssistantOutcome;
  language?: SupportAssistantLanguage;
  sources?: readonly SupportSource[];
  actions?: readonly SupportAction[];
}>;

export const SUPPORT_CONVERSATION_STORAGE_KEY = "debateai.support.conversation.v1";

type StoredConversation = Readonly<{
  language: SupportAssistantLanguage;
  session: SupportSession | null;
  messages: readonly ConversationMessage[];
  ownContext: OwnContextSelection;
}>;

function readStoredConversation(): StoredConversation | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<StoredConversation>;
    if ((value.language !== "en" && value.language !== "ro")
      || !Array.isArray(value.messages)) return null;
    const storedLanguage = value.language;
    const session = value.session === null ? null
      : value.session !== undefined && typeof value.session.sessionId === "string"
        && typeof value.session.token === "string"
        && typeof value.session.identityBound === "boolean" ? value.session : null;
    const messages = value.messages.map((message): ConversationMessage | null => {
      if (message === null || typeof message !== "object" || Array.isArray(message)) return null;
      const record = message as Readonly<Record<string,unknown>>;
      if (typeof record.id !== "string" || typeof record.text !== "string"
        || (record.role !== "assistant" && record.role !== "user")) return null;
      if (record.role === "user") {
        return Object.freeze({ id: record.id,role: "user" as const,text: record.text });
      }
      const messageLanguage = record.language === "en" || record.language === "ro"
        ? record.language : storedLanguage;
      const sources = sourcesFrom(record.sources);
      const actions = actionsFrom(record.actions,{
        signedIn: session?.identityBound ?? false,language: messageLanguage
      });
      if (sources === null || actions === null
        || (record.outcome !== undefined && (typeof record.outcome !== "string"
          || !SUPPORT_ASSISTANT_OUTCOMES.has(record.outcome as SupportAssistantOutcome)))
        || (record.link !== undefined && typeof record.link !== "string")) return null;
      return Object.freeze({
        id: record.id,role: "assistant" as const,text: record.text,language: messageLanguage,
        sources,actions,
        ...(record.outcome === undefined ? {} : { outcome: record.outcome as SupportAssistantOutcome }),
        ...(record.link === undefined ? {} : { link: record.link })
      });
    });
    if (messages.some((message) => message === null)) return null;
    const ownContext = value.ownContext !== undefined && "runId" in value.ownContext
      && typeof value.ownContext.runId === "string"
      ? { runId: value.ownContext.runId } as const : { latest: true } as const;
    return Object.freeze({
      language: storedLanguage,session,
      messages: Object.freeze(messages as ConversationMessage[]),ownContext
    });
  } catch {
    return null;
  }
}

export function Assistant({
  client = supportAssistantClient,signedIn,onLanguageChange,initialContext,
  fullPage = false,auxiliaryContent,onClose
}: Readonly<{
  client?: SupportAssistantClient;
  signedIn?: boolean;
  onLanguageChange?: (language: SupportAssistantLanguage) => void;
  initialContext?: Readonly<{ runId: string }>;
  fullPage?: boolean;
  auxiliaryContent?: ReactNode;
  onClose?: () => void;
}>) {
  const persistent = client === supportAssistantClient;
  const [stored] = useState(() => persistent ? readStoredConversation() : null);
  const [language,setLanguage] = useState<SupportAssistantLanguage>(stored?.language ?? "en");
  const [session,setSession] = useState<SupportSession | null>(stored?.session ?? null);
  const [messages,setMessages] = useState<readonly ConversationMessage[]>(stored?.messages ?? [
    { id: "disclosure",role: "assistant",text: DISCLOSURE[stored?.language ?? "en"] }
  ]);
  const [busy,setBusy] = useState(false);
  const [identityAvailable,setIdentityAvailable] = useState(signedIn ?? false);
  const [ownContext,setOwnContext] = useState<OwnContextSelection>(
    initialContext ?? stored?.ownContext ?? { latest: true }
  );
  const [activeTopic,setActiveTopic] = useState("reading");
  const [contextOpen,setContextOpen] = useState(false);
  const [pageStatus,setPageStatus] = useState<SupportPageStatus | null>(null);
  const [statusUnavailable,setStatusUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialContext !== undefined) setOwnContext({ runId: initialContext.runId });
  },[initialContext?.runId]);

  useEffect(() => {
    onLanguageChange?.(language);
  },[language,onLanguageChange]);

  useEffect(() => {
    if (!persistent || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language,session,messages,ownContext
    }));
  },[language,messages,ownContext,persistent,session]);

  useEffect(() => {
    if (signedIn !== undefined) {
      setIdentityAvailable(signedIn);
      return;
    }
    let active = true;
    void client.isSignedIn?.().then((available) => {
      if (active) setIdentityAvailable(available);
    }).catch(() => {
      if (active) setIdentityAvailable(false);
    });
    return () => { active = false; };
  },[client,signedIn]);

  useEffect(() => {
    if (!fullPage || !persistent) return;
    let active = true;
    void fetch("/api/v1/support/status",{
      method: "GET",cache: "no-store",credentials: "same-origin"
    }).then(async (response) => {
      if (!response.ok) throw new Error("SUPPORT_STATUS_UNAVAILABLE");
      return response.json() as Promise<Record<string,unknown>>;
    }).then((body) => {
      if (!active) return;
      const loaded = typeof body.kb_loaded === "object" && body.kb_loaded !== null
        ? body.kb_loaded as Record<string,unknown> : null;
      const configuration = typeof body.configuration === "object" && body.configuration !== null
        ? body.configuration as Record<string,unknown> : null;
      setPageStatus(Object.freeze({
        available: configuration?.kind === "AVAILABLE",
        relayState: typeof body.relay_state === "string" ? body.relay_state : "AVAILABLE",
        shippedDocs: typeof loaded?.shipped === "number" ? loaded.shipped : null
      }));
      setStatusUnavailable(false);
    }).catch(() => {
      if (active) setStatusUnavailable(true);
    });
    return () => { active = false; };
  },[fullPage,persistent]);

  function chooseLanguage(next: SupportAssistantLanguage): void {
    setLanguage(next);
    onLanguageChange?.(next);
    setMessages((current) => current.map((message,index) => index === 0
      ? { ...message,text: DISCLOSURE[next] }
      : message));
  }

  function primeComposer(prompt: string): void {
    if (inputRef.current === null) return;
    inputRef.current.value = prompt;
    inputRef.current.focus();
  }

  function beginNewConversation(): void {
    setSession(null);
    setMessages([{ id: "disclosure",role: "assistant",text: DISCLOSURE[language] }]);
    setOwnContext({ latest: true });
    setActiveTopic("reading");
    setContextOpen(false);
    if (inputRef.current !== null) inputRef.current.value = "";
    if (persistent && typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(SUPPORT_CONVERSATION_STORAGE_KEY);
    }
  }

  function appendReply(response: SupportReply): void {
    if (response.outcome === "SHREDDED") setSession(null);
    setMessages((current) => [
      ...current,
      {
        id: response.messageId || `assistant-${current.length}`,
        role: "assistant",text: redactSupportText(response.text).text,
        outcome: response.outcome,language,
        sources: response.sources ?? Object.freeze([]),
        actions: response.actions ?? Object.freeze([]),
        ...(response.link === undefined ? {} : { link: response.link })
      },
      ...(response.caseAcknowledgement === undefined ? [] : [{
        id: `case-${response.caseAcknowledgement.token}`,role: "assistant" as const,
        text: response.caseAcknowledgement.text,link: response.caseAcknowledgement.link
      }])
    ]);
  }

  async function activeSession(): Promise<SupportSession | null> {
    let currentIdentity = identityAvailable;
    if (signedIn !== undefined) {
      currentIdentity = signedIn;
    } else if (client.isSignedIn !== undefined) {
      try {
        currentIdentity = await client.isSignedIn();
        setIdentityAvailable(currentIdentity);
      } catch {
        currentIdentity = false;
        setIdentityAvailable(false);
      }
    }
    if (session !== null && session.identityBound === currentIdentity) return session;
    const started = await client.createSession(language);
    if (isSupportReply(started)) {
      appendReply(started);
      return null;
    }
    setSession(started);
    return started;
  }

  async function sendRequest(rawRequest: string,clearComposer?: () => void): Promise<void> {
    const request = redactSupportText(rawRequest.trim()).text;
    if (request.length === 0 || busy) return;
    setBusy(true);
    clearComposer?.();
    setMessages((current) => [...current,{
      id: `user-${current.length}`,role: "user",text: request
    }]);
    try {
      const active = await activeSession();
      if (active === null) return;
      let response: SupportReply;
      try {
        response = isOwnContextRequest(request)
          ? await client.sendMessage(active,request,language,ownContext)
          : await client.sendMessage(active,request,language);
      } catch (error) {
        if (!(error instanceof SupportSnapshotUnavailableError)) throw error;
        setSession(null);
        if (persistent && typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(SUPPORT_CONVERSATION_STORAGE_KEY);
        }
        const restarted = await client.createSession(language);
        if (isSupportReply(restarted)) {
          appendReply(restarted);
          return;
        }
        setSession(restarted);
        try {
          response = isOwnContextRequest(request)
            ? await client.sendMessage(restarted,request,language,ownContext)
            : await client.sendMessage(restarted,request,language);
        } catch (retryError) {
          if (retryError instanceof SupportSnapshotUnavailableError) {
            setSession(null);
            if (persistent && typeof sessionStorage !== "undefined") {
              sessionStorage.removeItem(SUPPORT_CONVERSATION_STORAGE_KEY);
            }
          }
          throw retryError;
        }
      }
      appendReply(response);
    } catch {
      appendReply({ messageId: "",outcome: "DEGRADED",text: REQUEST_UNAVAILABLE[language] });
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("support-message");
    if (!(field instanceof HTMLInputElement)) return;
    await sendRequest(field.value,() => { field.value = ""; });
  }

  async function escalate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const active = await activeSession();
      if (active === null) return;
      const opened = await client.escalate(active,language);
      if (isSupportReply(opened)) {
        appendReply(opened);
      } else {
        setMessages((current) => [...current,{
          id: `case-${opened.token}`,role: "assistant",text: opened.text
        }]);
      }
    } catch {
      appendReply({ messageId: "",outcome: "DEGRADED",text: REQUEST_UNAVAILABLE[language] });
    } finally {
      setBusy(false);
    }
  }

  const last = messages.at(-1);
  const canRate = last?.outcome === "ANSWER_GROUNDED" || last?.outcome === "NO_SOURCE";

  async function rateLast(messageId: string,rating: "yes" | "no"): Promise<void> {
    if (session === null) return;
    try {
      const acknowledgement = await client.rate(session,messageId,rating);
      if (acknowledgement === null) return;
      if (isSupportReply(acknowledgement)) {
        appendReply(acknowledgement);
      } else {
        setMessages((current) => [...current,{
          id: `case-${acknowledgement.token}`,role: "assistant",
          text: acknowledgement.text,link: acknowledgement.link
        }]);
      }
    } catch {
      appendReply({ messageId: "",outcome: "DEGRADED",text: REQUEST_UNAVAILABLE[language] });
    }
  }

  async function changeConsent(on: boolean): Promise<void> {
    const active = await activeSession();
    if (active === null) return;
    if (client.setConsent === undefined) throw new Error("SUPPORT_CONSENT_UNAVAILABLE");
    try {
      const result = await client.setConsent(active,on);
      if (result !== null) appendReply(result);
    } catch (error) {
      appendReply({ messageId: "",outcome: "DEGRADED",text: REQUEST_UNAVAILABLE[language] });
      throw error;
    }
  }

  const languageControls = <div className="supportLanguage" aria-label="Language override">
    <button type="button" aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>EN</button>
    <button type="button" aria-pressed={language === "ro"} onClick={() => chooseLanguage("ro")}>RO</button>
  </div>;

  const conversation = <div className="supportConversation" aria-label="Support conversation" aria-live="polite">
    {messages.map((message) => {
      const link = safeFirstPartyLink(message.link);
      const sources = message.sources ?? Object.freeze([]);
      const actions = message.actions ?? Object.freeze([]);
      const hasFooter = link !== null || sources.length > 0 || actions.length > 0;
      return <article className={`supportMessage supportMessage--${message.role}`} key={message.id} data-role={message.role}>
        {message.role === "assistant" ? <div className="supportMessageShell">
          <div className="supportMessageTab" aria-hidden />
          <div className="supportMessageCore">
            <p>{message.text}</p>
            {!hasFooter ? null : <footer className="supportCitation">
              {sources.length === 0 ? null : <div role="list" aria-label={language === "en" ? "Sources" : "Surse"}>
                {sources.map((source) => <span role="listitem" key={source.id}>{source.label}</span>)}
              </div>}
              {actions.length === 0 ? null : <nav aria-label={language === "en" ? "Actions" : "Acțiuni"}>
                {actions.map((action) => <a href={action.href} key={action.id}>{action.label}</a>)}
              </nav>}
              {link === null ? null : <>
                <span>DOCS · PRODUCT GUIDE</span>
                <a href={link}>View source →</a>
              </>}
            </footer>}
          </div>
        </div> : <p>{message.text}</p>}
      </article>;
    })}
  </div>;

  const contextControls = <div className="supportContextPanel" hidden={fullPage && !contextOpen}>
    <ConsentToggle
      signedIn={identityAvailable}
      language={language}
      onChange={changeConsent}
    />
    <DebatePicker
      signedIn={identityAvailable}
      language={language}
      onSelect={(runId) => setOwnContext({ runId })}
      onLatest={() => setOwnContext({ latest: true })}
    />
  </div>;

  const ratingControls = canRate && last !== undefined ? (
    <div className="supportRating" aria-label="Answer rating">
      <span>{language === "en" ? "Did this answer your question?" : "Ți-a răspuns la întrebare?"}</span>
      <button type="button" onClick={() => void rateLast(last.id,"yes")}>{WORDS[language].yes}</button>
      <button type="button" onClick={() => void rateLast(last.id,"no")}>{WORDS[language].no}</button>
    </div>
  ) : null;

  const composer = <form className="supportComposer" onSubmit={(event) => void submit(event)}>
    <label className="supportComposerLabel" htmlFor="support-message">{WORDS[language].label}</label>
    <input
      ref={inputRef}
      id="support-message"
      name="support-message"
      autoComplete="off"
      placeholder={language === "en" ? "Describe what happened…" : "Descrie ce s-a întâmplat…"}
    />
    {fullPage ? <div className="supportComposerBar">
      <button
        className="supportAttach"
        type="button"
        aria-expanded={contextOpen}
        onClick={() => setContextOpen((open) => !open)}
      >⌁ <span>Attach a debate</span></button>
      <span className="supportComposerHint">Your session and device details are attached automatically.</span>
      <button className="supportSend" type="submit" disabled={busy}>{WORDS[language].send}</button>
    </div> : <div className="supportComposerBar supportComposerBar--compact">
      <button className="supportSend" type="submit" disabled={busy}>{WORDS[language].send}</button>
    </div>}
  </form>;

  if (!fullPage) return (
    <section className="supportAssistantCompact" aria-label="Dialectical Engine support assistant">
      <div className="supportCompactHeader">
        {onClose === undefined ? null : <button
          type="button"
          className="supportCompactClose"
          aria-label={WORDS[language].close}
          onClick={onClose}
        >{CLOSE_ARROW}</button>}
        {languageControls}
      </div>
      {conversation}
      {contextControls}
      {ratingControls}
      <button
        type="button"
        className="supportEscalateCompact"
        disabled={busy}
        onClick={() => void escalate()}
      >{PERSON_MARK}<span>{WORDS[language].human}</span></button>
      {composer}
    </section>
  );

  const statusLabel = statusUnavailable || pageStatus?.available === false
    ? "UNAVAILABLE" : pageStatus === null ? "CHECKING" : "ONLINE";
  const reference = session === null ? "HLP—NEW" : `HLP-${session.sessionId.slice(0,4).toUpperCase()}`;
  const debateContext = "runId" in ownContext ? `Run ${ownContext.runId.slice(0,12)}` : "Latest debate when requested";

  return <div className="supportDesk" data-support-desk>
    <header className="supportHeader" data-support-header>
      <BrandMark />
      <span className="supportHeaderDivider" aria-hidden />
      <span className="supportHeaderTitle">Help</span>
      <div className="supportHeaderActions">
        <ModeToggle compact />
        <span className="supportIdentity">
          <span className="supportIdentityMark" aria-hidden>{identityAvailable ? "A" : "G"}</span>
          <span>{identityAvailable ? "Signed-in asker" : "Guest session"}</span>
        </span>
      </div>
    </header>

    <div className="supportDeskBody">
      <nav className="supportRail supportTopicRail" aria-label="Browse by topic">
        <p className="supportEyebrow">Browse by topic</p>
        <div className="supportTopicList">
          {HELP_TOPICS.map((topic) => <button
            type="button"
            key={topic.key}
            className="supportTopic"
            data-active={activeTopic === topic.key}
            aria-pressed={activeTopic === topic.key}
            onClick={() => {
              setActiveTopic(topic.key);
              primeComposer(topic.prompt);
            }}
          >
            <span className={`supportTopicDiamond supportTone--${topic.tone}`} aria-hidden />
            <span>{topic.label}</span>
            <span className="supportTopicCount">{topic.count}</span>
          </button>)}
        </div>

        <section className="supportService" id="service-status" aria-label="Service status">
          <p className="supportEyebrow">Service status</p>
          <div className="supportServiceRow">
            <span><i className={`supportStatusDot ${statusUnavailable ? "is-down" : "is-ok"}`} />Debate engine</span>
            <strong>{statusUnavailable ? "CHECK" : "NORMAL"}</strong>
          </div>
          <div className="supportServiceRow">
            <span><i className="supportStatusDot is-warn" />Scoring queue</span>
            <strong>IN APP</strong>
          </div>
          <div className="supportServiceRow">
            <span><i className={`supportStatusDot ${pageStatus?.relayState === "AVAILABLE" ? "is-ok" : "is-warn"}`} />Model fleet</span>
            <strong>{pageStatus?.relayState ?? "CHECKING"}</strong>
          </div>
        </section>
      </nav>

      <section className="supportAgent" aria-label="Support agent conversation">
        <header className="supportAgentHeader">
          <div className="supportAgentAvatar" aria-hidden>◆</div>
          <div className="supportAgentIdentity">
            <div><h1>Support agent</h1><span className={`supportOnline supportOnline--${statusLabel.toLowerCase()}`}>{statusLabel}</span></div>
            <p>Answers from the product docs and your account — cites its source, and hands off to a person when it cannot.</p>
          </div>
          <button className="supportNewConversation" type="button" onClick={beginNewConversation}>New conversation</button>
        </header>

        <div className="supportChatScroll">
          <p className="supportTimestamp">Today · Support conversation</p>
          {conversation}
          {ratingControls}
          <div className="supportSuggestions" aria-label="Suggested questions">
            {HELP_SUGGESTIONS.map((suggestion) => <button
              type="button" key={suggestion} disabled={busy}
              onClick={() => void sendRequest(suggestion)}
            >{suggestion}</button>)}
          </div>
        </div>

        <div className="supportComposerDock">
          {contextControls}
          {composer}
        </div>
      </section>

      <aside className="supportRail supportRightRail" aria-label="Conversation details">
        <section className="supportSideCard">
          <p className="supportEyebrow">This conversation</p>
          <dl className="supportMetadata">
            <div><dt>Reference</dt><dd>{reference}</dd></div>
            <div><dt>Debate</dt><dd>{debateContext}</dd></div>
            <div><dt>Opened</dt><dd>This visit</dd></div>
            <div><dt>Attached</dt><dd>{identityAvailable ? "Session · debate context" : "Device only · no account data"}</dd></div>
          </dl>
          <div className="supportSideLanguage"><span>Language</span>{languageControls}</div>
        </section>

        <section className="supportSideCard supportEscalation">
          <span className="supportEscalationTab" aria-hidden />
          <h2>Need a person?</h2>
          <p>Escalate and a human reads the whole thread. Weekdays, replies within one working day.</p>
          <button type="button" disabled={busy} onClick={() => void escalate()}>Escalate to a human</button>
          <a href="mailto:support@dezbatere.ro">support@dezbatere.ro</a>
        </section>

        <section className="supportSideCard" aria-label="Support shortcuts">
          <p className="supportEyebrow">Shortcuts</p>
          <ul className="supportShortcuts">
            <li><a href="/settings#privacy">Privacy policy <span>↗</span></a></li>
            <li><a href="/settings#cookies">Cookie preferences <span>↗</span></a></li>
            <li><a href="#service-status">Model fleet status <span>↗</span></a></li>
            <li><button type="button" onClick={() => primeComposer("Report a bug in this debate")}>Report a bug <span>→</span></button></li>
          </ul>
          <p className="supportShortcutNote">Opens a conversation here with your session and selected debate context attached.</p>
        </section>

        {auxiliaryContent === undefined ? null : <div className="supportAuxiliary">{auxiliaryContent}</div>}
      </aside>
    </div>
  </div>;
}

function isOwnContextRequest(message: string): boolean {
  const subject = /\b(?:my|mine|own|mea|mele|meu)\b|propri[au]/iu.test(message);
  const object = /\b(?:debate|debates|run|runs)\b|dezbat|rulare|rulări/iu.test(message);
  const state = /\b(?:current|status|state|stuck|progress|visibility|failure)\b|stare|blocat|progres|vizibil|eroare|ultim/iu.test(message);
  const list = /\b(?:list|show|enumerate)\b|listeaz|arat/iu.test(message);
  return (subject && object && (state || list))
    || /\b(?:this|selected|această|selectată)\s+(?:debate|run|dezbatere|rulare)\b/iu.test(message);
}
