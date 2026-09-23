"use client";

import { useEffect,useRef,useState,type FormEvent,type ReactNode } from "react";
import { redactSupportText } from "@debateai/kernel";
import type { SupportAction } from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { requestPreferences } from "../../lib/consent.js";
import { BrandMark } from "../TopBar.js";
import { ModeToggle } from "../ModeToggle.js";
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
  /** The language the session was opened in; its actions resolve in it. */
  language?: SupportAssistantLanguage;
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

/**
 * DL1-F5c: what the stored transcript says about an open case, and what the
 * page shows once the bearer is gone — a reload, another tab, the next person
 * at a shared browser. The API's own acknowledgement sentence carries the
 * 30-day case capability twice (the code and the link); this one carries it
 * nowhere, so it is what rests in `sessionStorage`.
 */
const CASE_OPENED_NOTICE = Object.freeze({
  en: "A case is open for a person to read. Its code is never kept in this browser, so it is not shown here — use the case link from when it was opened, or ask for a person again.",
  ro: "Un caz este deschis pentru ca o persoană să îl citească. Codul lui nu este păstrat în acest browser, așa că nu este afișat aici — folosește linkul cazului de la deschidere sau cere din nou o persoană."
});

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
    return Object.freeze({
      sessionId: String(session.session_id),token: String(body.session_token),
      identityBound: session.identity_bound === true,language
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
  index: number,language: SupportAssistantLanguage
): ConversationMessage {
  return Object.freeze({
    id: `case-${index}`,role: "assistant" as const,
    text: CASE_OPENED_NOTICE[language],caseOpened: true as const
  });
}

export { SUPPORT_CONVERSATION_STORAGE_KEY };

export function Assistant({
  client = supportAssistantClient,signedIn,onLanguageChange,
  fullPage = false,auxiliaryContent,onClose
}: Readonly<{
  client?: SupportAssistantClient;
  signedIn?: boolean;
  onLanguageChange?: (language: SupportAssistantLanguage) => void;
  fullPage?: boolean;
  auxiliaryContent?: ReactNode;
  onClose?: () => void;
}>) {
  const persistent = client === supportAssistantClient;
  const [language,setLanguage] = useState<SupportAssistantLanguage>("en");
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
  const [messages,setMessages] = useState<readonly ConversationMessage[]>([
    { id: "disclosure",role: "assistant",text: DISCLOSURE.en }
  ]);
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

  useEffect(() => {
    onLanguageChange?.(language);
  },[language,onLanguageChange]);

  // DL3-F3: the transcript is restored once, against the identity that produced
  // it. A transcript belonging to anyone else is erased on the way past.
  useEffect(() => {
    if (!persistent || restored || !identityResolved) return;
    setRestored(true);
    const conversation = restoreSupportConversation(
      browserSupportConversationStorage(),identityAvailable
    );
    if (conversation === null) return;
    setLanguage(conversation.language);
    if (conversation.messages.length > 0) setMessages(conversation.messages);
  },[identityAvailable,identityResolved,persistent,restored]);

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

  function chooseLanguage(next: SupportAssistantLanguage): void {
    if (next === language) return;
    setSession(null);
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
    // DL1-F5c: the bearer goes with the transcript it belongs to.
    setCaseBearer(null);
    setMessages([{ id: "disclosure",role: "assistant",text: DISCLOSURE[language] }]);
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
      ...(acknowledgement === undefined ? [] : [caseOpenedMessage(current.length + 1,language)])
    ]);
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
      const opened = await withSupportSession((active) => client.escalate(active,language));
      if (opened === null) return;
      if (isSupportReply(opened)) {
        appendReply(opened);
      } else {
        setCaseBearer(caseBearerOf(opened.token,opened.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,language)]);
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
        setCaseBearer(caseBearerOf(acknowledgement.token,acknowledgement.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,language)]);
      }
    } catch {
      appendReply({ messageId: "",outcome: "DEGRADED",text: REQUEST_UNAVAILABLE[language] });
    }
  }

  const languageControls = <div className="supportLanguage" aria-label="Language override">
    <button type="button" aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>EN</button>
    <button type="button" aria-pressed={language === "ro"} onClick={() => chooseLanguage("ro")}>RO</button>
  </div>;

  /**
   * DL1-F5c: the acknowledgement the in-memory bearer belongs to — the newest
   * one, which is the case this page just opened. Every other acknowledgement,
   * and all of them after a reload or in another tab, render the stored
   * token-free notice with no link, because the code is not there to render.
   */
  const liveCaseMessageId = caseBearer === null ? null : messages.reduce<string | null>(
    (newest,message) => message.caseOpened === true ? message.id : newest,null
  );

  const conversation = <div className="supportConversation" aria-label="Support conversation" aria-live="polite">
    {messages.map((message) => {
      const bearer = caseBearer !== null && message.id === liveCaseMessageId ? caseBearer : null;
      const text = bearer === null ? message.text : bearer.text;
      const link = bearer === null ? safeFirstPartyLink(message.link) : supportCaseLink(bearer.token);
      const sources = message.sources ?? Object.freeze([]);
      const actions = message.actions ?? Object.freeze([]);
      const hasFooter = link !== null || sources.length > 0 || actions.length > 0;
      return <article className={`supportMessage supportMessage--${message.role}`} key={message.id} data-role={message.role}>
        {message.role === "assistant" ? <div className="supportMessageShell">
          <div className="supportMessageTab" aria-hidden />
          <div className="supportMessageCore">
            <p>{text}</p>
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
        </div> : <p>{text}</p>}
      </article>;
    })}
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
  const privacyShortcut = resolveSupportActions(["privacy-preferences"],{
    signedIn: identityAvailable,language
  }).at(0);

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
            <p>Answers from public product guidance, cites its source, and hands off to a person when it cannot.</p>
          </div>
          <button className="supportNewConversation" type="button" onClick={beginNewConversation}>New conversation</button>
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
          <p className="supportTimestamp">Today · Support conversation</p>
          {conversation}
          <div ref={conversationEndRef} data-support-conversation-end aria-hidden />
          {ratingControls}
          <div className="supportSuggestions" aria-label="Suggested questions">
            {HELP_SUGGESTIONS.map((suggestion) => <button
              type="button" key={suggestion} disabled={busy}
              onClick={() => void sendRequest(suggestion)}
            >{suggestion}</button>)}
          </div>
        </div>

        <div className="supportComposerDock">
          {composer}
        </div>
      </section>

      <aside className="supportRail supportRightRail" aria-label="Conversation details">
        <section className="supportSideCard">
          <p className="supportEyebrow">This conversation</p>
          <dl className="supportMetadata">
            <div><dt>Reference</dt><dd>{reference}</dd></div>
            <div><dt>Opened</dt><dd>This visit</dd></div>
            <div><dt>Data</dt><dd>Public product guidance only</dd></div>
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
            {privacyShortcut === undefined ? null : <li>
              <a href={privacyShortcut.href}>{privacyShortcut.label} <span>↗</span></a>
            </li>}
            <li><button type="button" onClick={(event) => requestPreferences(event.currentTarget)}>
              Cookie preferences <span>↗</span>
            </button></li>
            <li><a href="#service-status">Model fleet status <span>↗</span></a></li>
            <li><button type="button" onClick={() => primeComposer("Report a bug in this debate")}>Report a bug <span>→</span></button></li>
          </ul>
          <p className="supportShortcutNote">Opens a public product-guide conversation here.</p>
        </section>

        {auxiliaryContent === undefined ? null : <div className="supportAuxiliary">{auxiliaryContent}</div>}
      </aside>
    </div>
  </div>;
}
