"use client";

import { useEffect,useRef,useState,type FormEvent,type ReactNode } from "react";
import { redactSupportText } from "@debateai/kernel";
import {
  SUPPORT_CAPABILITIES,
  type SupportAction,
  type SupportActionId
} from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { requestPreferences } from "../../lib/consent.js";
import { BrandMark } from "../TopBar.js";
import { ModeToggle } from "../ModeToggle.js";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { isLocale,type LocaleCode } from "../../lib/i18n/locales";
import { t } from "../../lib/i18n/translate";
import { AiNotice } from "../AiNotice";
import { supportPost } from "./http.js";

export type SupportAssistantLanguage = LocaleCode;
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
  language?: SupportAssistantLanguage;
  firstMessage?: string;
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
export type SupportAssistantClient = Readonly<{
  createSession(language: SupportAssistantLanguage): Promise<SupportSessionStart>;
  sendMessage(session: SupportSession,text: string): Promise<SupportReply>;
  isSignedIn?(): Promise<boolean>;
  rate(
    session: SupportSession,messageId: string,rating: "yes" | "no"
  ): Promise<SupportCaseAcknowledgement | SupportReply | null>;
  escalate(session: SupportSession,language: SupportAssistantLanguage): Promise<SupportReply | Readonly<{
    token: string;
    text: string;
  }>>;
}>;

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
  Object.freeze({ key: "getting-started",labelKey: "support.topic.gettingStarted",count: 6,
    tone: "gold",promptKey: "support.topic.gettingStarted.prompt" }),
  Object.freeze({ key: "reading",labelKey: "support.topic.reading",count: 9,
    tone: "reasoning",promptKey: "support.topic.reading.prompt" }),
  Object.freeze({ key: "scores",labelKey: "support.topic.scores",count: 11,
    tone: "pro",promptKey: "support.topic.scores.prompt" }),
  Object.freeze({ key: "publishing",labelKey: "support.topic.publishing",count: 5,
    tone: "con",promptKey: "support.topic.publishing.prompt" }),
  Object.freeze({ key: "account",labelKey: "support.topic.account",count: 8,
    tone: "muted",promptKey: "support.topic.account.prompt" }),
  Object.freeze({ key: "privacy",labelKey: "support.topic.privacy",count: 7,
    tone: "agree",promptKey: "support.topic.privacy.prompt" })
]);

const HELP_SUGGESTIONS = Object.freeze([
  "support.suggestion.bug",
  "support.suggestion.condition",
  "support.suggestion.unpublish"
]);

type SupportPageStatus = Readonly<{
  available: boolean;
  relayState: string;
  shippedDocs: number | null;
}>;

const MAX_RESPONSE_DECORATIONS = 3;
const SUPPORT_SOURCE_IDS = new Set(
  SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
);

const STATIC_ROUTES = new Set(["/","/new","/login","/sign-up","/settings","/help"]);
const PUBLIC_DEBATE = /^\/public\/debate\/[A-Za-z0-9_-]+$/u;
const SUPPORT_CASE = /^\/help[?]case=[A-Za-z0-9_-]{43}$/u;
const SUPPORT_EMAIL = "support@dezbatere.ro";

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
    const firstMessage = body.first_message !== null && typeof body.first_message === "object"
      && (body.first_message as Record<string,unknown>).role === "assistant"
      && typeof (body.first_message as Record<string,unknown>).text === "string"
      ? String((body.first_message as Record<string,unknown>).text)
      : undefined;
    return Object.freeze({
      sessionId: String(session.session_id),token: String(body.session_token),
      identityBound: session.identity_bound === true,language,
      ...(firstMessage === undefined ? {} : { firstMessage })
    });
  },
  async sendMessage(session,text) {
    const body = await readJson(await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/messages`,
      { text },session.token
    ));
    const reply = replyFrom(body,{ signedIn: session.identityBound,language: session.language ?? "en" });
    if (reply === null) throw new Error("SUPPORT_RESPONSE_INVALID");
    return reply;
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
}>;

function readStoredConversation(expectedLanguage: SupportAssistantLanguage): StoredConversation | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<StoredConversation>;
    if (!isLocale(value.language) || value.language !== expectedLanguage
      || !Array.isArray(value.messages)) return null;
    const storedLanguage = value.language;
    const session = value.session === null ? null
      : value.session !== undefined && typeof value.session.sessionId === "string"
        && typeof value.session.token === "string"
        && typeof value.session.identityBound === "boolean"
        && (value.session.language === undefined || value.session.language === storedLanguage)
        ? Object.freeze({
          ...value.session,
          language: storedLanguage
        }) : null;
    const messages = value.messages.map((message): ConversationMessage | null => {
      if (message === null || typeof message !== "object" || Array.isArray(message)) return null;
      const record = message as Readonly<Record<string,unknown>>;
      if (typeof record.id !== "string" || typeof record.text !== "string"
        || (record.role !== "assistant" && record.role !== "user")) return null;
      if (record.role === "user") {
        return Object.freeze({ id: record.id,role: "user" as const,text: record.text });
      }
      const messageLanguage = isLocale(record.language) ? record.language : storedLanguage;
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
    return Object.freeze({
      language: storedLanguage,session,
      messages: Object.freeze(messages as ConversationMessage[])
    });
  } catch {
    return null;
  }
}

export function Assistant({
  client = supportAssistantClient,signedIn,
  fullPage = false,auxiliaryContent,onClose
}: Readonly<{
  client?: SupportAssistantClient;
  signedIn?: boolean;
  fullPage?: boolean;
  auxiliaryContent?: ReactNode;
  onClose?: () => void;
}>) {
  const { catalog: chromeCatalog,locale: language } = useChromeI18n();
  const persistent = client === supportAssistantClient;
  const [stored] = useState(() => persistent ? readStoredConversation(language) : null);
  const [session,setSession] = useState<SupportSession | null>(stored?.session ?? null);
  const [messages,setMessages] = useState<readonly ConversationMessage[]>(stored?.messages ?? []);
  const [busy,setBusy] = useState(false);
  const [identityAvailable,setIdentityAvailable] = useState(signedIn ?? false);
  const [activeTopic,setActiveTopic] = useState("reading");
  const [pageStatus,setPageStatus] = useState<SupportPageStatus | null>(null);
  const [statusUnavailable,setStatusUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);

  useEffect(() => {
    if (!persistent || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY,JSON.stringify({
      language,session,messages
    }));
  },[language,messages,persistent,session]);

  useEffect(() => {
    if (!fullPage || !followLatestRef.current) return;
    const end = conversationEndRef.current;
    if (end !== null && typeof end.scrollIntoView === "function") {
      end.scrollIntoView({ block:"end",behavior:"smooth" });
    }
  },[fullPage,messages.length]);

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

  function primeComposer(prompt: string): void {
    if (inputRef.current === null) return;
    inputRef.current.value = prompt;
    inputRef.current.focus();
  }

  function beginNewConversation(): void {
    setSession(null);
    setMessages([]);
    setActiveTopic("reading");
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

  function appendFirstMessage(started: SupportSession): void {
    const firstMessage = started.firstMessage;
    if (firstMessage === undefined) return;
    setMessages((current) => {
      const message: ConversationMessage = {
      id: `session-${started.sessionId}-${current.length}`,role: "assistant",
      text: redactSupportText(firstMessage).text,language
      };
      const last = current.at(-1);
      return last?.role === "user"
        ? [...current.slice(0,-1),message,last]
        : [...current,message];
    });
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
    appendFirstMessage(started);
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
        response = await client.sendMessage(active,request);
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
          response = await client.sendMessage(restarted,request);
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
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
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
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
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
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
    }
  }

  const conversation = <div className="supportConversation"
    aria-label={t(chromeCatalog,"support.conversation")} aria-live="polite">
    {messages.map((message) => {
      const link = safeFirstPartyLink(message.link);
      const generated = message.role === "assistant" && message.outcome === "ANSWER_GROUNDED";
      const sources = message.sources ?? Object.freeze([]);
      const actions = message.actions ?? Object.freeze([]);
      const hasFooter = link !== null || sources.length > 0 || actions.length > 0;
      return <article className={`supportMessage supportMessage--${message.role}`} key={message.id} data-role={message.role}
        data-ai-generated={generated ? "true" : undefined}
        data-content-origin={message.role === "user" ? "user" : generated ? "ai" : "automated"}>
        {message.role === "assistant" ? <div className="supportMessageShell">
          <div className="supportMessageTab" aria-hidden />
            <div className="supportMessageCore">
              <p>{message.text}</p>
            {!hasFooter ? null : <footer className="supportCitation">
              {sources.length === 0 ? null : <div role="list" aria-label={t(chromeCatalog,"support.sources")}>
                {sources.map((source) => <span role="listitem" key={source.id}>{source.label}</span>)}
              </div>}
              {actions.length === 0 ? null : <nav aria-label={t(chromeCatalog,"support.actions")}>
                {actions.map((action) => <a href={action.href} key={action.id}>{action.label}</a>)}
              </nav>}
              {link === null ? null : <>
                <span>{generated ? "AI · " : ""}{t(chromeCatalog,"support.publicGuidance")}</span>
                <a href={link}>{t(chromeCatalog,"support.sources")} →</a>
              </>}
            </footer>}
          </div>
        </div> : <p>{message.text}</p>}
      </article>;
    })}
  </div>;

  const ratingControls = canRate && last !== undefined ? (
    <div className="supportRating" aria-label={t(chromeCatalog,"support.ratingQuestion")}>
      <span>{t(chromeCatalog,"support.ratingQuestion")}</span>
      <button type="button" onClick={() => void rateLast(last.id,"yes")}>{t(chromeCatalog,"support.yes")}</button>
      <button type="button" onClick={() => void rateLast(last.id,"no")}>{t(chromeCatalog,"support.no")}</button>
    </div>
  ) : null;

  const composer = <form className="supportComposer" onSubmit={(event) => void submit(event)}>
    <label className="supportComposerLabel" htmlFor="support-message">{t(chromeCatalog,"support.message")}</label>
    <input
      ref={inputRef}
      id="support-message"
      name="support-message"
      autoComplete="off"
      placeholder={t(chromeCatalog,"support.placeholder")}
    />
    {fullPage ? <div className="supportComposerBar">
      <span className="supportComposerHint">{t(chromeCatalog,"support.aiLead")}</span>
      <button className="supportSend" type="submit" disabled={busy}>{t(chromeCatalog,"support.send")}</button>
    </div> : <div className="supportComposerBar supportComposerBar--compact">
      <button className="supportSend" type="submit" disabled={busy}>{t(chromeCatalog,"support.send")}</button>
    </div>}
  </form>;

  if (!fullPage) return (
    <section className="supportAssistantCompact" aria-label={t(chromeCatalog,"support.agentTitle")}>
      <div className="supportCompactHeader">
        {onClose === undefined ? null : <button
          type="button"
          className="supportCompactClose"
          aria-label={t(chromeCatalog,"support.close")}
          onClick={onClose}
        >{CLOSE_ARROW}</button>}
      </div>
      <AiNotice variant="banner" catalog={chromeCatalog} />
      {conversation}
      {ratingControls}
      <button
        type="button"
        className="supportEscalateCompact"
        disabled={busy}
        onClick={() => void escalate()}
      >{PERSON_MARK}<span>{t(chromeCatalog,"support.talkToHuman")}</span></button>
      {composer}
    </section>
  );

  const statusLabel = statusUnavailable || pageStatus?.available === false
    ? t(chromeCatalog,"support.status.unavailable")
    : pageStatus === null
      ? t(chromeCatalog,"support.status.checking")
      : t(chromeCatalog,"support.status.online");
  const reference = session === null ? "HLP—NEW" : `HLP-${session.sessionId.slice(0,4).toUpperCase()}`;
  const privacyShortcut = resolveSupportActions(["privacy-preferences"],{
    signedIn: identityAvailable,language
  }).at(0);

  return <div className="supportDesk" data-support-desk>
    <header className="supportHeader" data-support-header>
      <BrandMark />
      <span className="supportHeaderDivider" aria-hidden />
      <span className="supportHeaderTitle">{t(chromeCatalog, "chrome.help")}</span>
      <div className="supportHeaderActions">
        <LanguageSwitcher />
        <ModeToggle compact />
        <span className="supportIdentity">
          <span className="supportIdentityMark" aria-hidden>{identityAvailable ? "A" : "G"}</span>
          <span>{t(chromeCatalog, identityAvailable ? "chrome.signedInAsker" : "chrome.guestSession")}</span>
        </span>
      </div>
    </header>

    <div className="supportDeskBody">
      <nav className="supportRail supportTopicRail" aria-label={t(chromeCatalog,"support.browseByTopic")}>
        <p className="supportEyebrow">{t(chromeCatalog,"support.browseByTopic")}</p>
        <div className="supportTopicList">
          {HELP_TOPICS.map((topic) => <button
            type="button"
            key={topic.key}
            className="supportTopic"
            data-active={activeTopic === topic.key}
            aria-pressed={activeTopic === topic.key}
            onClick={() => {
              setActiveTopic(topic.key);
              primeComposer(t(chromeCatalog,topic.promptKey));
            }}
          >
            <span className={`supportTopicDiamond supportTone--${topic.tone}`} aria-hidden />
            <span>{t(chromeCatalog,topic.labelKey)}</span>
            <span className="supportTopicCount">{topic.count}</span>
          </button>)}
        </div>

        <section className="supportService" id="service-status"
          aria-label={t(chromeCatalog,"support.serviceStatus")}>
          <p className="supportEyebrow">{t(chromeCatalog,"support.serviceStatus")}</p>
          <div className="supportServiceRow">
            <span><i className={`supportStatusDot ${statusUnavailable ? "is-down" : "is-ok"}`} />
              {t(chromeCatalog,"support.debateEngine")}</span>
            <strong>{t(chromeCatalog,statusUnavailable ? "support.status.check" : "support.status.normal")}</strong>
          </div>
          <div className="supportServiceRow">
            <span><i className="supportStatusDot is-warn" />{t(chromeCatalog,"support.scoringQueue")}</span>
            <strong>{t(chromeCatalog,"support.status.inApp")}</strong>
          </div>
          <div className="supportServiceRow">
            <span><i className={`supportStatusDot ${pageStatus?.relayState === "AVAILABLE" ? "is-ok" : "is-warn"}`} />
              {t(chromeCatalog,"support.modelFleet")}</span>
            <strong>{t(chromeCatalog,pageStatus?.relayState === "AVAILABLE"
              ? "support.status.online" : "support.status.checking")}</strong>
          </div>
        </section>
      </nav>

      <section className="supportAgent" aria-label={t(chromeCatalog,"support.agentTitle")}>
        <header className="supportAgentHeader">
            <div className="supportAgentAvatar" aria-hidden>◆</div>
            <div className="supportAgentIdentity">
              <div><h1>{t(chromeCatalog,"support.agentTitle")}</h1>
                <span className="supportOnline">{statusLabel}</span></div>
            <p><strong>{t(chromeCatalog,"support.aiLead")}</strong>{" "}
              {t(chromeCatalog,"support.bannerBody")}</p>
          </div>
          <button className="supportNewConversation" type="button" onClick={beginNewConversation}>
            {t(chromeCatalog,"support.newConversation")}
          </button>
        </header>

        <div
          className="supportChatScroll"
          ref={conversationPaneRef}
          onScroll={() => {
            const pane = conversationPaneRef.current;
            if (pane === null) return;
            followLatestRef.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 48;
          }}
        >
          <AiNotice variant="banner" catalog={chromeCatalog} />
          <p className="supportTimestamp">{t(chromeCatalog,"support.timestamp")} · {t(chromeCatalog,"support.conversation")}</p>
          {conversation}
          <div ref={conversationEndRef} data-support-conversation-end aria-hidden />
          {ratingControls}
          <div className="supportSuggestions" aria-label={t(chromeCatalog,"support.suggestions")}>
            {HELP_SUGGESTIONS.map((suggestionKey) => <button
              type="button" key={suggestionKey} disabled={busy}
              onClick={() => void sendRequest(t(chromeCatalog,suggestionKey))}
            >{t(chromeCatalog,suggestionKey)}</button>)}
          </div>
        </div>

        <div className="supportComposerDock">
          {composer}
        </div>
      </section>

      <aside className="supportRail supportRightRail" aria-label={t(chromeCatalog,"support.thisConversation")}>
        <section className="supportSideCard">
          <p className="supportEyebrow">{t(chromeCatalog,"support.thisConversation")}</p>
          <dl className="supportMetadata">
            <div><dt>{t(chromeCatalog,"support.reference")}</dt><dd>{reference}</dd></div>
            <div><dt>{t(chromeCatalog,"support.opened")}</dt><dd>{t(chromeCatalog,"support.thisVisit")}</dd></div>
            <div><dt>{t(chromeCatalog,"support.data")}</dt><dd>{t(chromeCatalog,"support.publicGuidance")}</dd></div>
          </dl>
        </section>

        <section className="supportSideCard supportEscalation">
          <span className="supportEscalationTab" aria-hidden />
          <h2>{t(chromeCatalog,"support.needPerson")}</h2>
          <p>{t(chromeCatalog,"support.escalateBody")}</p>
          <button type="button" disabled={busy} onClick={() => void escalate()}>
            {t(chromeCatalog,"support.escalate")}
          </button>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </section>

        <section className="supportSideCard" aria-label={t(chromeCatalog,"support.shortcuts")}>
          <p className="supportEyebrow">{t(chromeCatalog,"support.shortcuts")}</p>
          <ul className="supportShortcuts">
            {privacyShortcut === undefined ? null : <li>
              <a href={privacyShortcut.href}>{privacyShortcut.label} <span>↗</span></a>
            </li>}
            <li><button type="button" onClick={(event) => requestPreferences(event.currentTarget)}>
              {t(chromeCatalog,"support.topic.privacy")} <span>↗</span>
            </button></li>
            <li><a href="#service-status">{t(chromeCatalog,"support.modelFleet")} <span>↗</span></a></li>
            <li><button type="button" onClick={() => primeComposer(t(chromeCatalog,"support.suggestion.bug"))}>
              {t(chromeCatalog,"support.suggestion.bug")} <span>→</span>
            </button></li>
          </ul>
          <p className="supportShortcutNote">{t(chromeCatalog,"support.publicGuidance")}</p>
        </section>

        {auxiliaryContent === undefined ? null : <div className="supportAuxiliary">{auxiliaryContent}</div>}
      </aside>
    </div>
  </div>;
}
