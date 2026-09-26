"use client";

import { useEffect,useRef,useState,type FormEvent,type ReactNode } from "react";
import { redactSupportText } from "@debateai/kernel";
import type { SupportAction } from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { requestPreferences } from "../../lib/consent.js";
import { BrandMark } from "../TopBar.js";
import { ModeToggle } from "../ModeToggle.js";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import type { LocaleCode } from "../../lib/i18n/locales";
import { t } from "../../lib/i18n/translate";
import { AiBanner } from "../AiNotice";
import { supportCaseLink } from "./caseLink.js";
import {
  browserSupportConversationStorage,
  clearStoredSupportConversation,
  hasExactKeys,
  restoreSupportConversation,
  supportActionsFrom,
  supportSourcesFrom,
  writeStoredSupportConversation,
  SUPPORT_CONVERSATION_STORAGE_KEY,
  type SupportConversationMessage,
  type SupportSource
} from "./conversation.js";
import { isStaleSupportSession, supportPost, SupportHttpError } from "./http.js";

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
  /** The language the session was opened in; its actions resolve in it. */
  language?: SupportAssistantLanguage;
  firstMessage?: string;
}>;
export type SupportCaseAcknowledgement = Readonly<{
  text: string;
  token: string;
  slaHours: number;
  link: string;
}>;
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

const SUPPORT_EMAIL = "support@dezbatere.ro";

/** The agent's own state words, each with its own label key (never collapsed). */
const SUPPORT_STATUS_LABEL_KEYS = Object.freeze({
  UNAVAILABLE: "support.status.unavailable",
  CHECKING: "support.status.checking",
  ONLINE: "support.status.online"
} as const);

/**
 * The model-fleet row states what the relay reported, as dev did with the raw
 * `relay_state`: each known state has its own label, CHECKING only while no
 * status has arrived, and an unknown state is shown as reported rather than
 * mapped onto a state the page did not observe.
 */
const RELAY_STATE_LABEL_KEYS: Readonly<Record<string,string>> = Object.freeze({
  AVAILABLE: "support.status.available",
  UNAVAILABLE: "support.status.unavailable"
});

function relayStateLabel(
  catalog: Readonly<Record<string,string>>,relayState: string | undefined
): string {
  if (relayState === undefined) return t(catalog,"support.status.checking");
  const key = RELAY_STATE_LABEL_KEYS[relayState];
  return key === undefined ? relayState : t(catalog,key);
}

const STATIC_ROUTES = new Set(["/","/new","/login","/sign-up","/settings","/help"]);
const PUBLIC_DEBATE = /^\/public\/debate\/[A-Za-z0-9_-]+$/u;
/** The API's case-capability grammar (`apps/api/src/support/session.ts`). */
const CASE_BEARER = /^[A-Za-z0-9_-]{43}$/u;
const SUPPORT_CASE = /^\/help(?:[?]|#)case=([A-Za-z0-9_-]{43})$/u;

/**
 * DL3-F4: the single place a case link becomes an href. The API mints the
 * fragment form only (`apps/api/src/support/index.ts`, DL1-F5c), and the
 * retired `/help?case=…` form is still recognised here for one release, for a
 * link a person saved before the change — and rendered as `/help#case=…`,
 * because a bearer in the query string reaches the address bar, browser history
 * and any future access log, and a bearer in the fragment does not reach a
 * server at all. Corrected in the final-review fix wave: the sentence above
 * this function used to say the API still minted the query form.
 */
function safeFirstPartyLink(link: string | undefined): string | null {
  if (link === undefined) return null;
  const bearer = SUPPORT_CASE.exec(link);
  if (bearer !== null) return supportCaseLink(bearer[1]!);
  return STATIC_ROUTES.has(link) || PUBLIC_DEBATE.test(link) ? link : null;
}

function caseAcknowledgement(body: Readonly<Record<string,unknown>>): SupportCaseAcknowledgement | null {
  if (typeof body.case_acknowledgement !== "string"
    || typeof body.case_token !== "string" || !CASE_BEARER.test(body.case_token)
    || typeof body.sla_hours !== "number" || !Number.isSafeInteger(body.sla_hours)
    // DL1-F5c: the API mints the fragment form and nothing else, so the
    // tolerance for a query-string bearer from the server is gone. The
    // browser-side read of a `?case=` link a person saved stays for one
    // release, in `caseLink.ts`, where it belongs.
    || typeof body.link !== "string"
    || body.link !== supportCaseLink(body.case_token)) return null;
  return Object.freeze({
    text: body.case_acknowledgement,token: body.case_token,
    slaHours: body.sla_hours,link: supportCaseLink(body.case_token)
  });
}

function replyFrom(
  body: Readonly<Record<string,unknown>>,
  context?: Readonly<{ signedIn: boolean;language: SupportAssistantLanguage }>
): SupportReply | null {
  if (typeof body.outcome !== "string"
    || !SUPPORT_ASSISTANT_OUTCOMES.has(body.outcome as SupportAssistantOutcome)
    || typeof body.text !== "string") return null;
  const acknowledgement = caseAcknowledgement(body);
  const sources = supportSourcesFrom(body.sources);
  const actions = supportActionsFrom(body.actions,context);
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
  // dev: the exact restart envelope, and nothing wider, asks for a new session.
  if (response.status === 409 && hasExactKeys(body,["error","restart_session"])
    && body.error === "SUPPORT_KB_SNAPSHOT_UNAVAILABLE" && body.restart_session === true) {
    throw new SupportSnapshotUnavailableError();
  }
  if (!response.ok
    && (typeof body.outcome !== "string" || typeof body.text !== "string")) {
    // DL3-F3: the status travels with the failure so a stale session (404) can
    // be told apart from an outage and recovered from instead of dead-ending.
    throw new SupportHttpError(response.status);
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

type ConversationMessage = SupportConversationMessage;

/** DL1-F5c: the case capability, for as long as this page is on screen. */
type SupportCaseBearer = Readonly<{ token: string;text: string }>;

/**
 * The only door a case bearer takes into this component's memory. The
 * acknowledgement path has already checked the grammar; the escalate reply is a
 * bare `{case_token,text}`, and a link is built only from a value that reads
 * like the capability it claims to be.
 */
function caseBearerOf(token: string,text: string): SupportCaseBearer | null {
  return CASE_BEARER.test(token) ? Object.freeze({ token,text }) : null;
}

/**
 * The acknowledgement as it may rest in the browser: the fact that a case was
 * opened, never the code that opens it. The id is the message's position, so it
 * is a stable React key that carries nothing (it used to be `case-<token>`).
 */
function caseOpenedMessage(
  index: number,catalog: Readonly<Record<string,string>>
): ConversationMessage {
  return Object.freeze({
    id: `case-${index}`,role: "assistant" as const,
    text: t(catalog,"support.caseOpenedNotice"),caseOpened: true as const
  });
}

export { SUPPORT_CONVERSATION_STORAGE_KEY };

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
  // DL3-F3: the capability lives here and nowhere else. It is never written to
  // sessionStorage, so it cannot outlive the page that minted it.
  const [session,setSession] = useState<SupportSession | null>(null);
  /**
   * DL1-F5c: the case capability lives here and in the URL fragment, and in
   * neither `sessionStorage` nor the transcript: it reads a whole case and
   * replies as the reporter for thirty days, with no cookie, for anyone holding
   * it. The stored acknowledgement is the token-free notice; this is what puts
   * the code and its link back on screen for the page that opened the case.
   */
  const [caseBearer,setCaseBearer] = useState<SupportCaseBearer | null>(null);
  const [messages,setMessages] = useState<readonly ConversationMessage[]>([]);
  const [busy,setBusy] = useState(false);
  const [identityAvailable,setIdentityAvailable] = useState(signedIn ?? false);
  // DL3-F3: nothing stored is read back until the identity at the keyboard is
  // known, so a signed-out first paint can never show a signed-in transcript.
  const [identityResolved,setIdentityResolved] = useState(signedIn !== undefined);
  const [restored,setRestored] = useState(false);
  const [activeTopic,setActiveTopic] = useState("reading");
  const [pageStatus,setPageStatus] = useState<SupportPageStatus | null>(null);
  const [statusUnavailable,setStatusUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);

  // DL3-F3: the transcript is restored once, against the identity that produced
  // it. A transcript belonging to anyone else is erased on the way past.
  useEffect(() => {
    if (!persistent || restored || !identityResolved) return;
    setRestored(true);
    const conversation = restoreSupportConversation(
      browserSupportConversationStorage(),identityAvailable
    );
    if (conversation === null) return;
    if (conversation.language !== language) {
      clearStoredSupportConversation(browserSupportConversationStorage());
      return;
    }
    setMessages(conversation.messages);
  },[identityAvailable,identityResolved,language,persistent,restored]);

  // DL3-F3: the transcript is restored once, against the identity that produced
  // it. A transcript belonging to anyone else is erased on the way past.
  useEffect(() => {
    if (!persistent || !restored) return;
    writeStoredSupportConversation(browserSupportConversationStorage(),{
      language,identityBound: identityAvailable,messages
    });
  },[identityAvailable,language,messages,persistent,restored]);

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
      setIdentityResolved(true);
      return;
    }
    if (client.isSignedIn === undefined) {
      setIdentityResolved(true);
      return;
    }
    let active = true;
    void client.isSignedIn().then((available) => {
      if (!active) return;
      setIdentityAvailable(available);
      setIdentityResolved(true);
    }).catch(() => {
      if (!active) return;
      setIdentityAvailable(false);
      setIdentityResolved(true);
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
    // DL1-F5c: the bearer goes with the transcript it belongs to.
    setCaseBearer(null);
    setMessages([]);
    setActiveTopic("reading");
    if (inputRef.current !== null) inputRef.current.value = "";
    if (persistent) clearStoredSupportConversation(browserSupportConversationStorage());
  }

  function appendReply(response: SupportReply): void {
    if (response.outcome === "SHREDDED") setSession(null);
    const acknowledgement = response.caseAcknowledgement;
    // DL1-F5c: the code and the link go to memory, the fact goes to the transcript.
    if (acknowledgement !== undefined) {
      setCaseBearer(caseBearerOf(acknowledgement.token,acknowledgement.text));
    }
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
      ...(acknowledgement === undefined ? [] : [caseOpenedMessage(current.length + 1,chromeCatalog)])
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

  async function activeSession(discardCurrent = false): Promise<SupportSession | null> {
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
    if (!discardCurrent && session !== null && session.identityBound === currentIdentity) {
      return session;
    }
    const started = await client.createSession(language);
    if (isSupportReply(started)) {
      appendReply(started);
      return null;
    }
    appendFirstMessage(started);
    setSession(started);
    return started;
  }

  /**
   * DL3-F3: one attempt, and if the API says the capability is unknown (404 —
   * a stale identity-bound session on a shared tab, an expiry, a lock) one
   * retry on a brand-new session. Without this the compact widget answered
   * "Support is unavailable" for the life of the tab, with no reset control.
   *
   * dev's snapshot restart takes the same door: the API's exact 409
   * `SUPPORT_KB_SNAPSHOT_UNAVAILABLE` envelope retires the session the way a
   * stale 404 does, and the turn is retried once on a fresh session held in
   * memory — the session is never read back from, or written to, storage. A
   * second mismatch leaves no session held and surfaces as unavailable.
   */
  async function withSupportSession<T>(
    run: (active: SupportSession) => Promise<T>
  ): Promise<T | null> {
    const active = await activeSession();
    if (active === null) return null;
    try {
      return await run(active);
    } catch (failure) {
      if (!isStaleSupportSession(failure)
        && !(failure instanceof SupportSnapshotUnavailableError)) throw failure;
      setSession(null);
      const fresh = await activeSession(true);
      if (fresh === null) return null;
      try {
        return await run(fresh);
      } catch (retryFailure) {
        if (retryFailure instanceof SupportSnapshotUnavailableError) setSession(null);
        throw retryFailure;
      }
    }
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
      const response = await withSupportSession((active) => client.sendMessage(active,request));
      if (response !== null) appendReply(response);
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
      const opened = await withSupportSession((active) => client.escalate(active,language));
      if (opened === null) return;
      if (isSupportReply(opened)) {
        appendReply(opened);
      } else {
        setCaseBearer(caseBearerOf(opened.token,opened.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,chromeCatalog)]);
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
        setCaseBearer(caseBearerOf(acknowledgement.token,acknowledgement.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,chromeCatalog)]);
      }
    } catch {
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
    }
  }

  /**
   * DL1-F5c: the acknowledgement the in-memory bearer belongs to — the newest
   * one, which is the case this page just opened. Every other acknowledgement,
   * and all of them after a reload or in another tab, render the stored
   * token-free notice with no link, because the code is not there to render.
   */
  const liveCaseMessageId = caseBearer === null ? null : messages.reduce<string | null>(
    (newest,message) => message.caseOpened === true ? message.id : newest,null
  );

  const conversation = <div className="supportConversation"
    aria-label={t(chromeCatalog,"support.conversation")} aria-live="polite">
    {messages.map((message) => {
      const bearer = caseBearer !== null && message.id === liveCaseMessageId ? caseBearer : null;
      const text = bearer === null ? message.text : bearer.text;
      const link = bearer === null ? safeFirstPartyLink(message.link) : supportCaseLink(bearer.token);
      const sources = message.sources ?? Object.freeze([]);
      const actions = message.actions ?? Object.freeze([]);
      const hasFooter = link !== null || sources.length > 0 || actions.length > 0;
      const generated = message.role === "assistant" && message.outcome === "ANSWER_GROUNDED";
      return <article className={`supportMessage supportMessage--${message.role}`} key={message.id} data-role={message.role}
        data-ai-generated={generated ? "true" : undefined}
        data-content-origin={message.role === "user" ? "user" : generated ? "ai" : "automated"}>
        {message.role === "assistant" ? <div className="supportMessageShell">
          <div className="supportMessageTab" aria-hidden />
          <div className="supportMessageCore">
            <p>{text}</p>
            {!hasFooter ? null : <footer className="supportCitation">
              {sources.length === 0 ? null : <div role="list" aria-label={t(chromeCatalog,"support.sources")}>
                {sources.map((source) => <span role="listitem" key={source.id}>{source.label}</span>)}
              </div>}
              {actions.length === 0 ? null : <nav aria-label={t(chromeCatalog,"support.actions")}>
                {actions.map((action) => <a href={action.href} key={action.id}>{action.label}</a>)}
              </nav>}
              {link === null ? null : <>
                <span>{generated ? "AI · " : ""}{t(chromeCatalog,"support.docsProductGuide")}</span>
                <a href={link}>{t(chromeCatalog,"support.viewSource")} →</a>
              </>}
            </footer>}
          </div>
        </div> : <p>{text}</p>}
      </article>;
    })}
  </div>;

  const ratingControls = canRate && last !== undefined ? (
    <div className="supportRating" aria-label={t(chromeCatalog,"support.answerRating")}>
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
      <button className="supportSend" type="submit" disabled={busy}>{t(chromeCatalog,"support.send")}</button>
    </div> : <div className="supportComposerBar supportComposerBar--compact">
      <button className="supportSend" type="submit" disabled={busy}>{t(chromeCatalog,"support.send")}</button>
    </div>}
  </form>;

  if (!fullPage) return (
    <section className="supportAssistantCompact" aria-label={t(chromeCatalog,"support.assistantLabel")}>
      <div className="supportCompactHeader">
        {onClose === undefined ? null : <button
          type="button"
          className="supportCompactClose"
          aria-label={t(chromeCatalog,"support.close")}
          onClick={onClose}
        >{CLOSE_ARROW}</button>}
      </div>
      <AiBanner catalog={chromeCatalog} />
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

  // The modifier class keys on the untranslated state, so dev's
  // `.supportOnline--unavailable` styling applies in every locale.
  const statusState = statusUnavailable || pageStatus?.available === false
    ? "UNAVAILABLE" : pageStatus === null ? "CHECKING" : "ONLINE";
  const statusLabel = t(chromeCatalog,SUPPORT_STATUS_LABEL_KEYS[statusState]);
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
            <strong>{relayStateLabel(chromeCatalog,pageStatus?.relayState)}</strong>
          </div>
        </section>
      </nav>

      <section className="supportAgent" aria-label={t(chromeCatalog,"support.agentConversation")}>
        <header className="supportAgentHeader">
            <div className="supportAgentAvatar" aria-hidden>◆</div>
            <div className="supportAgentIdentity">
              <div><h1>{t(chromeCatalog,"support.agentTitle")}</h1>
                <span className={`supportOnline supportOnline--${statusState.toLowerCase()}`}>{statusLabel}</span></div>
            <p><strong>{t(chromeCatalog,"support.aiLead")}</strong>{" "}
              {t(chromeCatalog,"support.agentLead")}</p>
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
          <AiBanner catalog={chromeCatalog} />
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

      <aside className="supportRail supportRightRail" aria-label={t(chromeCatalog,"support.conversationDetails")}>
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

        <section className="supportSideCard" aria-label={t(chromeCatalog,"support.shortcutsLabel")}>
          <p className="supportEyebrow">{t(chromeCatalog,"support.shortcuts")}</p>
          <ul className="supportShortcuts">
            {privacyShortcut === undefined ? null : <li>
              <a href={privacyShortcut.href}>{t(chromeCatalog,"support.privacyPreferences")} <span>↗</span></a>
            </li>}
            <li><button type="button" onClick={(event) => requestPreferences(event.currentTarget)}>
              {t(chromeCatalog,"support.cookiePreferences")} <span>↗</span>
            </button></li>
            <li><a href="#service-status">{t(chromeCatalog,"support.modelFleetStatus")} <span>↗</span></a></li>
            <li><button type="button" onClick={() => primeComposer(t(chromeCatalog,"support.suggestion.bug"))}>
              {t(chromeCatalog,"support.reportBug")} <span>→</span>
            </button></li>
          </ul>
          <p className="supportShortcutNote">{t(chromeCatalog,"support.shortcutNote")}</p>
        </section>

        {auxiliaryContent === undefined ? null : <div className="supportAuxiliary">{auxiliaryContent}</div>}
      </aside>
    </div>
  </div>;
}
