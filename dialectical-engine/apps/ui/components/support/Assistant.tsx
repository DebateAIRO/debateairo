"use client";

import { AccountMenu } from "@/components/AccountMenu";
import { useEffect,useLayoutEffect,useRef,useState,type FormEvent,type ReactNode } from "react";
import { flushSync } from "react-dom";
import { redactSupportText } from "@debateai/kernel";
import type { SupportAction } from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import { requestPreferences } from "../../lib/consent.js";
import { BrandMark } from "../TopBar.js";
import { ModeToggle } from "../ModeToggle.js";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { useChromeI18n } from "../../lib/i18n/I18nProvider";
import { catalogLocale, type LocaleCode } from "../../lib/i18n/locales";
import { t } from "../../lib/i18n/translate";
import { AiBanner } from "../AiNotice";
import { supportCaseLink } from "./caseLink.js";
import {
  browserSupportConversationStorage,
  clearStoredSupportConversation,
  hasExactKeys,
  restoreSupportConversation,
  serverTimeFromDateHeader,
  storedConversationVerdict,
  supportActionsFrom,
  supportSourcesFrom,
  writeStoredSupportConversation,
  SUPPORT_CONVERSATION_STORAGE_KEY,
  type SupportConversationMessage,
  type SupportSource,
  type WakeFacts
} from "./conversation.js";
import { isStaleSupportSession, supportPost, SupportHttpError } from "./http.js";
import {
  onConversationReset,
  onConversationWake,
  readWakeFacts,
  scheduleRecheck,
  settleStoredConversation,
  UNKNOWN_WAKE_FACTS
} from "./sessionChange.js";

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
  /** S04-R05: whole seconds from the UI server's `Date` header of the response that opened the session. */
  serverTime?: number;
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
  /** S04-R05: whole seconds from the UI server's `Date` header of this response. */
  serverTime?: number;
}>;
/** S04-R05: the server time a support response carried, when its `Date` header could be read. */
type ServerTimed = Readonly<{ serverTime?: number }>;
type SupportSessionStart = SupportSession | SupportReply;
export type SupportAssistantClient = Readonly<{
  createSession(language: SupportAssistantLanguage): Promise<SupportSessionStart>;
  sendMessage(session: SupportSession,text: string): Promise<SupportReply>;
  isSignedIn?(): Promise<boolean>;
  /**
   * Paid plans G3a: false when this address may not use the support assistant. The API refuses
   * there anyway; asking first lets the panel say so instead of offering a composer.
   */
  isOpenHere?(): Promise<boolean>;
  rate(
    session: SupportSession,messageId: string,rating: "yes" | "no"
  ): Promise<(SupportCaseAcknowledgement & ServerTimed) | SupportReply | null>;
  escalate(session: SupportSession,language: SupportAssistantLanguage): Promise<SupportReply | Readonly<{
    token: string;
    text: string;
    serverTime?: number;
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

const STATIC_ROUTES = new Set(["/","/new","/login","/sign-up","/settings","/help","/recover"]);
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

/**
 * S04-R05 (D-S04-15): the one field the stored transcript may gain — the UI server's `Date` header of the newest
 * support response, in whole seconds, never the browser's clock. Omitted when the header is absent or unreadable
 * (a transport that hands back a response with no headers carries no server time).
 */
function withServerTime<T extends object>(value: T,response: Response): T & ServerTimed {
  const serverTime = serverTimeFromDateHeader(response.headers?.get("date") ?? null);
  return serverTime === undefined ? value : Object.freeze({ ...value,serverTime });
}

export const supportAssistantClient: SupportAssistantClient = Object.freeze({
  /**
   * FIX p1 (SD-B1): only a 401 — the API's SESSION_REQUIRED — means signed out. Any other refusal, or a 5xx from
   * the proxy while the API restarts, is not an answer: it rejects, and the panel treats the identity as unknown.
   */
  async isSignedIn() {
    const response = await fetch("/api/v1/session",{
      method: "GET",cache: "no-store",credentials: "same-origin"
    });
    if (response.status === 401) return false;
    if (!response.ok) throw new Error("SUPPORT_IDENTITY_UNKNOWN");
    return true;
  },
  /** Like the sign-up page, a failed check shows the composer: the API applies the same gate. */
  async isOpenHere() {
    try {
      const response = await fetch("/api/v1/geo/availability",{
        method: "GET",cache: "no-store",credentials: "same-origin"
      });
      if (!response.ok) return true;
      const body = await response.json() as unknown;
      return !(body !== null && typeof body === "object" && (body as Record<string,unknown>).service === false);
    } catch {
      return true;
    }
  },
  async createSession(language) {
    const response = await supportPost("/api/v1/support/sessions",{ language });
    const body = await readJson(response);
    const terminal = replyFrom(body);
    if (terminal !== null) return withServerTime(terminal,response);
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
    return withServerTime(Object.freeze({
      sessionId: String(session.session_id),token: String(body.session_token),
      identityBound: session.identity_bound === true,language,
      ...(firstMessage === undefined ? {} : { firstMessage })
    }),response);
  },
  async sendMessage(session,text) {
    const response = await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/messages`,
      { text },session.token
    );
    const body = await readJson(response);
    const reply = replyFrom(body,{ signedIn: session.identityBound,language: session.language ?? "en" });
    if (reply === null) throw new Error("SUPPORT_RESPONSE_INVALID");
    return withServerTime(reply,response);
  },
  async rate(session,messageId,rating) {
    const response = await supportPost(
      `/api/v1/support/messages/${encodeURIComponent(messageId)}/rating`,
      { session_id: session.sessionId,rating },session.token
    );
    const body = await readJson(response);
    const result = replyFrom(body) ?? caseAcknowledgement(body);
    return result === null ? null : withServerTime(result,response);
  },
  async escalate(session,language) {
    const response = await supportPost(
      `/api/v1/support/sessions/${encodeURIComponent(session.sessionId)}/escalate`,
      { language },session.token
    );
    const body = await readJson(response);
    const terminal = replyFrom(body,{ signedIn: session.identityBound,language });
    if (terminal !== null) return withServerTime(terminal,response);
    if (typeof body.case_token !== "string" || typeof body.text !== "string") {
      throw new Error("SUPPORT_RESPONSE_INVALID");
    }
    return withServerTime(Object.freeze({ token: body.case_token,text: body.text }),response);
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

type RestorePhase = "pending" | "settling" | "done" | "asleep" | "undecided";

const NO_MESSAGES: readonly ConversationMessage[] = Object.freeze([]);

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
  const { catalog: chromeCatalog,locale: uiLocale } = useChromeI18n();
  const language = catalogLocale(uiLocale);
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
  /**
   * FIX p1 (SD-B1): false while the sign-in state could not be read. Nothing is written under an unknown identity,
   * so a transcript is never stored as "signed out" for a person who is signed in.
   */
  const [identityKnown,setIdentityKnown] = useState(signedIn !== undefined);
  /**
   * FIX p1 (PT-B1): from a sleep until the wake's gate decides, the conversation is held in memory but not shown —
   * no message, no case link, no draft, no session reference. A keep shows it again; an erase discards it.
   * FIX p2 (CT2-B1): while concealed the panel is busy — no control acts on what it holds.
   */
  const [concealed,setConcealed] = useState(false);
  /** Paid plans G3a: the support assistant is not offered at this address (the sign-up rule). */
  const [countryClosed,setCountryClosed] = useState(false);
  /**
   * S04 (PLAN S3.2): the stored transcript is restored only through the gate. "pending" waits for the identity,
   * "settling" awaits the gate, "done" lets the write effect run, "asleep" is a parked page: no gate, no fetch,
   * no write until it wakes. "undecided" (FIX p2, PT2-B1): the sign-in state could not be read, so nothing is
   * decided — hidden, untouched, nothing saved or sent — until a re-check reads it.
   */
  const [restorePhase,setRestorePhase] = useState<RestorePhase>("pending");
  /** Incremented by a session change or a wake, so the identity effect resolves again on facts read now (B1). */
  const [identityEpoch,setIdentityEpoch] = useState(0);
  /** S04-R05: the server time of the newest support response, written with the transcript. */
  const [serverTime,setServerTime] = useState<number | undefined>(undefined);
  const [activeTopic,setActiveTopic] = useState("reading");
  const [pageStatus,setPageStatus] = useState<SupportPageStatus | null>(null);
  const [statusUnavailable,setStatusUnavailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  /**
   * S04 (D-S04-17): the conversation's generation — one more whenever the conversation is discarded (a session
   * change, or a wake whose gate erases). Every async path captures it before its first await and applies nothing
   * when it moved. A sleep does not move it (PT-B1): a reply that lands while parked is held with the rest.
   */
  const generationRef = useRef(0);
  /**
   * S04 (D-S04-24): the restore gate's generation — one more on every session change, sleep and wake. A gate run
   * that began before one of them applies nothing; the newer one owns the phase.
   */
  const gateRef = useRef(0);
  /**
   * S04 (D-S04-32, D-ORCH-ARCHREV3): set before the sleep's flushSync, cleared on wake. React flushes the last
   * commit's pending effects inside that flushSync; without this ref a restore effect left pending there runs the
   * gate on the old facts and puts the old transcript on screen while the page sleeps. The ref keeps it off the
   * screen; the module's wake bump (sessionChange.ts) keeps its verdict out of storage. Both are required.
   */
  const parkedRef = useRef(false);
  /**
   * PT-B1: what a sleep holds — null when nothing is held. `restored` when the gate had finished before it; then
   * the identity the conversation was last KNOWN under and its server time, which the wake judges (PT2-N1). A
   * sleep before any identity was known holds `restored: false`, and the wake judges what storage holds instead.
   */
  const heldRef = useRef<Readonly<
    { restored: false } | { restored: true; identityBound: boolean; serverTime: number | undefined }
  > | null>(null);
  /**
   * FIX p3 (V-24, pt B1): the identity last read successfully. A later failed read (a Send during an API restart)
   * leaves it as it was, so an unknown answer is never carried into a sleep as a decision (D-ORCH-REV3).
   */
  const knownIdentityRef = useRef<boolean | null>(null);
  if (identityKnown) knownIdentityRef.current = identityAvailable;
  /** PT2-N4: the reading position at the sleep, put back on a keep. */
  const scrollAtSleepRef = useRef<number | null>(null);
  const pendingScrollRef = useRef<number | null>(null);
  /** CT2-B1: mirrors `concealed` for handlers that run before the next render. */
  const concealedRef = useRef(false);
  /** PT2-B1: re-checks made since the sign-in state became unreadable (the backoff index). */
  const recheckAttemptRef = useRef(0);
  /** The values a reset listener reads; it is installed once, so it reads them here, not from its closure. */
  const latestRef = useRef({ serverTime });
  latestRef.current = { serverTime };
  /** PT-B1: the unsent draft, taken off the screen at the sleep and put back on a keep. */
  const draftRef = useRef("");
  /**
   * SD-N1: set by every reset BEFORE any state call, cleared when the next gate is done. A write effect still
   * holding the previous commit's closure runs after the receiver's erase; this keeps it from writing the old
   * conversation back.
   */
  const writeBlockedRef = useRef(false);
  const restorePhaseRef = useRef<RestorePhase>("pending");
  const mountedRef = useRef(false);

  function enterPhase(phase: RestorePhase): void {
    restorePhaseRef.current = phase;
    setRestorePhase(phase);
  }

  function conceal(value: boolean): void {
    concealedRef.current = value;
    setConcealed(value);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  },[]);

  // DL3-F3 + S04 (PLAN S3.2): the transcript is restored against the identity
  // that produced it, and only after the gate has decided (R02 (a)-(c)). A
  // transcript belonging to anyone else is erased on the way past.
  useEffect(() => {
    if (!persistent || !identityResolved || restorePhase !== "pending") return;
    if (parkedRef.current) return;
    enterPhase("settling");
    const gate = gateRef.current;
    const stale = () => !mountedRef.current || gateRef.current !== gate;
    // sd N1: a re-check (attempt > 0) reads the facts now, never the verdict cached at the wake.
    void settleStoredConversation(readWakeFacts,{ fresh: recheckAttemptRef.current > 0 }).then(async (settled) => {
      // A sleep, wake or session change landed while the gate settled: the newer one owns the phase.
      if (stale()) return;
      const held = heldRef.current;
      const holding = held !== null && held.restored;
      let facts: WakeFacts | null = settled;
      if (holding && facts === null) {
        // Nothing stored to judge (site data blocked, or never written): the held conversation is judged (PT2-N1).
        facts = await readWakeFacts().catch(() => UNKNOWN_WAKE_FACTS);
        if (stale()) return;
      }
      if (!identityKnown || facts?.signedIn === "unknown") {
        // PT2-B1 (orchestrator ruling): decide later. Hidden, untouched, nothing saved or sent; re-checked below.
        conceal(true);
        enterPhase("undecided");
        return;
      }
      recheckAttemptRef.current = 0;
      heldRef.current = null;
      if (held !== null && held.restored && facts !== null) {
        const verdict = storedConversationVerdict({
          language,identityBound: held.identityBound,messages: [],
          ...(held.serverTime === undefined ? {} : { serverTime: held.serverTime })
        },facts);
        if (verdict === "keep") {
          // Kept: the held conversation is already in memory, whole (PT-B1).
          restoreDraft();
          pendingScrollRef.current = scrollAtSleepRef.current;
        } else {
          discardConversation(true);
        }
      } else {
        // The gate has judged what storage holds on facts read now.
        const conversation = restoreSupportConversation(
          browserSupportConversationStorage(),identityAvailable
        );
        if (conversation !== null && conversation.language !== language) {
          clearStoredSupportConversation(browserSupportConversationStorage());
          if (held !== null) discardConversation(true);
        } else if (conversation === null) {
          if (held !== null) discardConversation(true);
        } else {
          setMessages(conversation.messages);
          setServerTime(conversation.serverTime);
          if (held !== null) restoreDraft();
        }
      }
      scrollAtSleepRef.current = null;
      writeBlockedRef.current = false;
      conceal(false);
      enterPhase("done");
    });
  },[identityAvailable,identityKnown,identityResolved,language,persistent,restorePhase]);

  // FIX p2 (PT2-B1): while undecided, the gate runs again at the first of: back online, the page visible again,
  // or the backoff delay (1 s, 2 s, 4 s, 8 s, then every 15 s). The identity is read again with it.
  useEffect(() => {
    if (restorePhase !== "undecided") return;
    return scheduleRecheck(() => {
      recheckAttemptRef.current += 1;
      enterPhase("pending");
      setIdentityResolved(false);
      setIdentityEpoch((epoch) => epoch + 1);
    },recheckAttemptRef.current);
  },[restorePhase]);

  // PT2-N4: a kept conversation comes back at the reading position it had at the sleep.
  useLayoutEffect(() => {
    if (concealed || pendingScrollRef.current === null) return;
    const top = pendingScrollRef.current;
    pendingScrollRef.current = null;
    if (conversationPaneRef.current !== null) conversationPaneRef.current.scrollTop = top;
  },[concealed]);

  // DL3-F3: the transcript is written against the identity that produced it, and
  // never while the gate is pending, settling or the page is parked (B1), while
  // the identity is unknown (SD-B1), or after a reset until its gate is done (SD-N1).
  useEffect(() => {
    if (!persistent || restorePhase !== "done" || !identityKnown || writeBlockedRef.current) return;
    writeStoredSupportConversation(browserSupportConversationStorage(),{
      language,identityBound: identityAvailable,messages,
      ...(serverTime === undefined ? {} : { serverTime })
    });
  },[identityAvailable,identityKnown,language,messages,persistent,restorePhase,serverTime]);

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
      setIdentityKnown(true);
      setIdentityResolved(true);
      return;
    }
    if (client.isSignedIn === undefined) {
      setIdentityKnown(true);
      setIdentityResolved(true);
      return;
    }
    let active = true;
    void client.isSignedIn().then((available) => {
      if (!active) return;
      setIdentityAvailable(available);
      setIdentityKnown(true);
      setIdentityResolved(true);
    }).catch(() => {
      if (!active) return;
      // SD-B1: shown as a guest, but unknown — nothing is restored or written under it.
      setIdentityAvailable(false);
      setIdentityKnown(false);
      setIdentityResolved(true);
    });
    return () => { active = false; };
  },[client,signedIn,identityEpoch]);

  useEffect(() => {
    if (client.isOpenHere === undefined) return;
    let active = true;
    void client.isOpenHere().then((open) => {
      if (active) setCountryClosed(!open);
    });
    return () => { active = false; };
  },[client]);

  // S04 (PLAN S3.3, ADR-0033): a session change in any tab resets this panel to
  // "New conversation"; a sleep parks it at once — hidden, held in memory
  // (PT-B1); a wake re-resolves identity and runs the gate on facts read after
  // the wake, which shows the held conversation again or discards it.
  useEffect(() => {
    const stopReset = onConversationReset((reason) => {
      writeBlockedRef.current = true;
      gateRef.current += 1;
      if (reason === "sleep") {
        if (!parkedRef.current) {
          // The first sleep event holds the conversation; the harness sends a second one (pagehide, then freeze).
          if (heldRef.current === null) {
            const known = knownIdentityRef.current;
            heldRef.current = Object.freeze(restorePhaseRef.current === "done" && known !== null
              ? { restored: true,identityBound: known,serverTime: latestRef.current.serverTime }
              : { restored: false });
            draftRef.current = inputRef.current?.value ?? "";
            scrollAtSleepRef.current = conversationPaneRef.current?.scrollTop ?? null;
          } else {
            // Still undecided from an earlier wake: what was held stays held, and the newest text typed wins — the
            // composer holds only what was typed since that wake (ct N1, D-S04-NEWEST-TEXT).
            draftRef.current = inputRef.current?.value || draftRef.current;
          }
        }
        parkedRef.current = true;
        flushSync(() => {
          if (inputRef.current !== null) inputRef.current.value = "";
          conceal(true);
          enterPhase("asleep");
        });
        return;
      }
      discardConversation();
      enterPhase("pending");
      setIdentityResolved(false);
      setIdentityEpoch((epoch) => epoch + 1);
    });
    const stopWake = onConversationWake(() => {
      parkedRef.current = false;
      // CT-N2: while parkedRef holds no gate can begin between a sleep and this wake; this drops such a gate if the
      // ref is ever bypassed. Since FIX p2 A05's harness-order keep row also fails without it (the reading position
      // is lost; REV-S04-p3 ct R1).
      gateRef.current += 1;
      if (!persistent) {
        // A transport-injected panel has no gate to judge what it holds, so it errs toward erasing (D-S04-20).
        discardConversation();
        writeBlockedRef.current = false;
        return;
      }
      enterPhase("pending");
      setIdentityResolved(false);
      setIdentityEpoch((epoch) => epoch + 1);
    });
    return () => {
      stopReset();
      stopWake();
    };
  },[]);

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
    if (inputRef.current === null || concealedRef.current) return;
    inputRef.current.value = prompt;
    inputRef.current.focus();
  }

  /** The state "New conversation" leaves the panel in (S04-R03). */
  function clearConversationState(): void {
    setSession(null);
    // DL1-F5c: the bearer goes with the transcript it belongs to.
    setCaseBearer(null);
    setMessages([]);
    setActiveTopic("reading");
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  function beginNewConversation(): void {
    if (concealedRef.current) return;
    clearConversationState();
    if (persistent) clearStoredSupportConversation(browserSupportConversationStorage());
  }

  /**
   * A session change, or a wake whose gate erased: the old conversation goes whole — messages, support session,
   * case code and link, draft, topic — and a request in flight drops its result (S3.4, R03). At a wake the
   * composer holds only what was typed after the wake (the sleep emptied it), so `keepTyped` keeps that text.
   */
  function discardConversation(keepTyped = false): void {
    const typed = keepTyped ? inputRef.current?.value ?? "" : "";
    generationRef.current += 1;
    heldRef.current = null;
    draftRef.current = "";
    scrollAtSleepRef.current = null;
    pendingScrollRef.current = null;
    clearConversationState();
    if (typed !== "" && inputRef.current !== null) inputRef.current.value = typed;
    setServerTime(undefined);
    setBusy(false);
    conceal(false);
  }

  /**
   * On a keep, the draft held at the sleep comes back — unless something was typed since the wake (CT2-B1): the
   * newest text typed wins and the older held draft is dropped (pt N2, D-S04-NEWEST-TEXT).
   */
  function restoreDraft(): void {
    if (inputRef.current !== null && draftRef.current !== "" && inputRef.current.value === "") {
      inputRef.current.value = draftRef.current;
    }
    draftRef.current = "";
  }

  function rememberServerTime(value: number | undefined): void {
    if (value !== undefined) setServerTime(value);
  }

  /** S04 (D-S04-17): true once a session change, sleep or wake moved past `generation`. */
  function superseded(generation: number): boolean {
    return generationRef.current !== generation;
  }

  function appendReply(response: SupportReply): void {
    rememberServerTime(response.serverTime);
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

  async function activeSession(generation: number,discardCurrent = false): Promise<SupportSession | null> {
    let currentIdentity = identityAvailable;
    if (signedIn !== undefined) {
      currentIdentity = signedIn;
    } else if (client.isSignedIn !== undefined) {
      let known = true;
      try {
        currentIdentity = await client.isSignedIn();
      } catch {
        // SD-B1: unknown, not signed out — the server binds the session it opens; nothing is written until known.
        currentIdentity = false;
        known = false;
      }
      if (superseded(generation)) return null;
      setIdentityAvailable(currentIdentity);
      setIdentityKnown(known);
    }
    if (!discardCurrent && session !== null && session.identityBound === currentIdentity) {
      return session;
    }
    const started = await client.createSession(language);
    if (superseded(generation)) return null;
    rememberServerTime(started.serverTime);
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
    generation: number,run: (active: SupportSession) => Promise<T>
  ): Promise<T | null> {
    const active = await activeSession(generation);
    if (active === null) return null;
    try {
      return await run(active);
    } catch (failure) {
      if (superseded(generation)) return null;
      if (!isStaleSupportSession(failure)
        && !(failure instanceof SupportSnapshotUnavailableError)) throw failure;
      setSession(null);
      const fresh = await activeSession(generation,true);
      if (fresh === null) return null;
      try {
        return await run(fresh);
      } catch (retryFailure) {
        if (superseded(generation)) return null;
        if (retryFailure instanceof SupportSnapshotUnavailableError) setSession(null);
        throw retryFailure;
      }
    }
  }

  async function sendRequest(rawRequest: string,clearComposer?: () => void): Promise<void> {
    const request = redactSupportText(rawRequest.trim()).text;
    if (request.length === 0 || busy || concealedRef.current) return;
    const generation = generationRef.current;
    setBusy(true);
    clearComposer?.();
    setMessages((current) => [...current,{
      id: `user-${current.length}`,role: "user",text: request
    }]);
    try {
      const response = await withSupportSession(generation,(active) => client.sendMessage(active,request));
      if (superseded(generation)) return;
      if (response !== null) appendReply(response);
    } catch {
      if (superseded(generation)) return;
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
    } finally {
      if (!superseded(generation)) setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("support-message");
    if (!(field instanceof HTMLInputElement)) return;
    await sendRequest(field.value,() => { field.value = ""; });
  }

  async function escalate(): Promise<void> {
    if (busy || concealedRef.current) return;
    const generation = generationRef.current;
    setBusy(true);
    try {
      const opened = await withSupportSession(generation,(active) => client.escalate(active,language));
      if (superseded(generation) || opened === null) return;
      if (isSupportReply(opened)) {
        appendReply(opened);
      } else {
        rememberServerTime(opened.serverTime);
        setCaseBearer(caseBearerOf(opened.token,opened.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,chromeCatalog)]);
      }
    } catch {
      if (superseded(generation)) return;
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
    } finally {
      if (!superseded(generation)) setBusy(false);
    }
  }

  // CT2-B1: while concealed every control that acts on the conversation is busy (send, suggestions, escalate,
  // topics, shortcuts, "New conversation"); text typed in the composer stays where it is.
  const inert = busy || concealed || countryClosed;
  // PT-B1: while parked, and until the wake's gate decides, nothing of the conversation is on screen.
  const shownMessages = concealed ? NO_MESSAGES : messages;
  const last = shownMessages.at(-1);
  const canRate = last?.outcome === "ANSWER_GROUNDED" || last?.outcome === "NO_SOURCE";

  async function rateLast(messageId: string,rating: "yes" | "no"): Promise<void> {
    if (session === null || concealedRef.current) return;
    const generation = generationRef.current;
    try {
      const acknowledgement = await client.rate(session,messageId,rating);
      if (superseded(generation) || acknowledgement === null) return;
      if (isSupportReply(acknowledgement)) {
        appendReply(acknowledgement);
      } else {
        rememberServerTime(acknowledgement.serverTime);
        setCaseBearer(caseBearerOf(acknowledgement.token,acknowledgement.text));
        setMessages((current) => [...current,caseOpenedMessage(current.length,chromeCatalog)]);
      }
    } catch {
      if (superseded(generation)) return;
      appendReply({ messageId: "",outcome: "DEGRADED",text: t(chromeCatalog,"support.unavailable") });
    }
  }

  /**
   * DL1-F5c: the acknowledgement the in-memory bearer belongs to — the newest
   * one, which is the case this page just opened. Every other acknowledgement,
   * and all of them after a reload or in another tab, render the stored
   * token-free notice with no link, because the code is not there to render.
   */
  const liveCaseMessageId = caseBearer === null ? null : shownMessages.reduce<string | null>(
    (newest,message) => message.caseOpened === true ? message.id : newest,null
  );

  const conversation = <div className="supportConversation"
    aria-label={t(chromeCatalog,"support.conversation")} aria-live="polite">
    {shownMessages.map((message) => {
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
                {link === "/recover" ? null : <span>{generated ? "AI · " : ""}{t(chromeCatalog,"support.docsProductGuide")}</span>}
                <a href={link}>{t(chromeCatalog,link === "/recover" ? "support.recoverAccount" : "support.viewSource")} →</a>
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

  // Paid plans G3a: where support is not offered the sentence stands in for the composer.
  const composer = countryClosed ? <p className="supportComposer supportCountryUnavailable" role="status"
    data-support-country-unavailable><span>{t(chromeCatalog,"support.countryUnavailable")}</span></p>
    : <form className="supportComposer" onSubmit={(event) => void submit(event)}>
    <label className="supportComposerLabel" htmlFor="support-message">{t(chromeCatalog,"support.message")}</label>
    <input
      ref={inputRef}
      id="support-message"
      name="support-message"
      autoComplete="off"
      placeholder={t(chromeCatalog,"support.placeholder")}
    />
    {fullPage ? <div className="supportComposerBar">
      <button className="supportSend" type="submit" disabled={inert}>{t(chromeCatalog,"support.send")}</button>
    </div> : <div className="supportComposerBar supportComposerBar--compact">
      <button className="supportSend" type="submit" disabled={inert}>{t(chromeCatalog,"support.send")}</button>
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
        disabled={inert}
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
  const reference = session === null || concealed ? "HLP—NEW" : `HLP-${session.sessionId.slice(0,4).toUpperCase()}`;
  const privacyShortcut = resolveSupportActions(["privacy-preferences"],{
    signedIn: identityAvailable,language
  }).at(0);

  return <div className="supportDesk" data-support-desk>
    <header className="supportHeader" data-support-header>
      <BrandMark />
      <span className="supportHeaderDivider" aria-hidden />
      <span className="supportHeaderTitle">{t(chromeCatalog, "chrome.help")}</span>
      <div className="supportHeaderActions">
        <AccountMenu authenticated={identityAvailable} catalog={chromeCatalog} />
        <LanguageSwitcher />
        <ModeToggle compact />

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
            disabled={concealed}
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
          <button className="supportNewConversation" type="button" disabled={concealed} onClick={beginNewConversation}>
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
              type="button" key={suggestionKey} disabled={inert}
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
          <button type="button" disabled={inert} onClick={() => void escalate()}>
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
            <li><button type="button" disabled={concealed} onClick={() => primeComposer(t(chromeCatalog,"support.suggestion.bug"))}>
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
