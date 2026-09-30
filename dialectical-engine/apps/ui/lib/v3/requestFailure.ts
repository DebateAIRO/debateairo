import { ContractHttpError } from "@debateai/contract";
import { t,type MessageCatalog } from "../i18n/translate.js";

/**
 * DL3-F7. One typed decision for what a page's error banner says, so no text a
 * server wrote ever becomes page content.
 *
 * Two banners used to render the contract client's `message` — which is built
 * from the API's `error` and `message` fields (`packages/contract/src/client.ts`
 * `contractErrorForResponse`) — or, failing that, whatever `error.message` a
 * fetch layer, a driver or a thrown string happened to carry. React escapes it,
 * so it was never XSS; it is the same defect F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED
 * closed in `tokenUnlock.ts`: the page asserts a sentence nobody wrote for a
 * user, and an API that ever echoed input would echo it into the page.
 *
 * The alphabet here is closed: one constant clause per SUBJECT, one constant
 * clause per KIND, and the sentence is their concatenation. Nothing is derived
 * from the caught object beyond the contract client's own typed discriminants.
 *
 * DR-115 holds throughout: a kind that did not observe an outcome says the
 * outcome is unknown, and never that something was refused.
 */

export const REQUEST_FAILURE_SUBJECTS = Object.freeze([
  "DEBATE_READ",
  "DEBATE_CREATE",
  "SESSION_DEFAULTS",
  "SCORING_READ",
  "ADAPTIVE_DEPTH_READ"
] as const);

export type RequestFailureSubject = typeof REQUEST_FAILURE_SUBJECTS[number];

export type RequestFailureKind =
  /** The coordinator answered, and it declined this request. */
  | "REFUSED"
  /** The coordinator answered: it holds nothing at that address. */
  | "MISSING"
  /** The coordinator answered: too many requests, this one was not attempted. */
  | "BUSY"
  /**
   * Task M8 (spec 2026-09-26 §14.4.7). The coordinator answered: today's
   * capacity for NEW debates is used up (429 `DAILY_COST_ENVELOPE_REACHED`).
   * It resets at the next UTC midnight and the reply carries `Retry-After`;
   * the page says "tomorrow" and computes no hour.
   */
  | "DAILY_LIMIT_REACHED"
  /** No answer arrived. What happened upstream is UNKNOWN, not failed. */
  | "UNREACHABLE"
  /** The coordinator answered with a failure of its own. */
  | "SERVER_FAILED"
  /** The coordinator answered with something this client cannot read. */
  | "UNREADABLE"
  /** SYNC3: the coordinator refused the ask's plan tier (dev's debate tiers, 422). */
  | "PLAN_TIER_INVALID"
  /** SYNC3: the coordinator refused the ask: a model its plan needs is not available (422). */
  | "PLAN_TIER_UNAVAILABLE"
  /** Something failed that this seam cannot classify; say exactly that. */
  | "UNCLASSIFIED";

export type RequestFailure = Readonly<{
  subject: RequestFailureSubject;
  kind: RequestFailureKind;
  message: string;
}>;

const SUBJECT_CLAUSE: Readonly<Record<RequestFailureSubject, string>> = Object.freeze({
  DEBATE_READ: "Loading this debate did not complete.",
  DEBATE_CREATE: "Starting this debate did not complete.",
  SESSION_DEFAULTS: "Reading your session's defaults did not complete.",
  SCORING_READ: "Loading scoring did not complete.",
  ADAPTIVE_DEPTH_READ: "Loading the adaptive-depth dry run did not complete."
});

const KIND_CLAUSE: Readonly<Record<RequestFailureKind, string>> = Object.freeze({
  REFUSED: "The coordinator answered and refused it. Sign in again, then retry.",
  MISSING: "The coordinator holds nothing at that address.",
  BUSY: "There have been too many requests in a short time. Please wait a little, then try again.",
  DAILY_LIMIT_REACHED: "We've reached today's limit for new debates. Please try again tomorrow.",
  UNREACHABLE: "The coordinator could not be reached, so the outcome is unknown.",
  SERVER_FAILED: "The coordinator failed while handling it, so the outcome is unknown.",
  UNREADABLE: "The coordinator's reply could not be read, so the outcome is unknown.",
  PLAN_TIER_INVALID: "The coordinator refused the plan choice. Choose Free or Premium, then retry.",
  PLAN_TIER_UNAVAILABLE:
    "The coordinator refused it: a model this plan needs is not available right now. "
    + "Retry later, or choose the other plan.",
  UNCLASSIFIED:
    "It failed before any answer arrived, so the outcome is unknown. "
    + "This is not a decision the coordinator made."
});

/** Every kind the classifier can return: each has its words in every catalogue that reads them. */
export const REQUEST_FAILURE_KINDS: readonly RequestFailureKind[] = Object.freeze(
  Object.keys(KIND_CLAUSE) as RequestFailureKind[]
);

/**
 * Task M8 (spec 2026-09-26 §14.4.7). The only ask refusal answered with 429:
 * the day's spend would not admit one more run (`askRefusalStatus` in
 * `apps/api`; every other ask refusal is a 422, and the figures are withheld).
 * Every other 429, the hourly per-owner limit (`ADMISSION_RATE_LIMITED`)
 * included, stays BUSY.
 */
const DAILY_LIMIT_SERVER_CODE = "DAILY_COST_ENVELOPE_REACHED";

/**
 * SYNC3 (map section 2, item 4). dev's debate tiers refuse an ask its plan
 * cannot serve with a 422 carrying the refusal's own typed code. That is an
 * OBSERVED refusal, so it is named as one — in a constant clause, never the
 * server's sentence, which lists the unavailable models by name.
 */
const PLAN_TIER_REFUSALS: Readonly<Record<string, RequestFailureKind>> = Object.freeze({
  ASK_PLAN_TIER_INVALID: "PLAN_TIER_INVALID",
  ASK_PLAN_TIER_MODEL_UNAVAILABLE: "PLAN_TIER_UNAVAILABLE"
});

function kindOf(error: unknown): RequestFailureKind {
  if (!(error instanceof ContractHttpError)) return "UNCLASSIFIED";
  if (error.status === 422 && error.serverCode !== null
    && Object.hasOwn(PLAN_TIER_REFUSALS, error.serverCode)) {
    return PLAN_TIER_REFUSALS[error.serverCode]!;
  }
  if (error.code === "RATE_LIMITED" && error.serverCode === DAILY_LIMIT_SERVER_CODE) {
    return "DAILY_LIMIT_REACHED";
  }
  if (error.serverCode === "API_UPSTREAM_UNREACHABLE" || [502, 503, 504].includes(error.status)) {
    return "UNREACHABLE";
  }
  switch (error.code) {
    case "SESSION_REQUIRED":
    case "FORBIDDEN":
      return "REFUSED";
    case "NOT_FOUND":
      return "MISSING";
    case "RATE_LIMITED":
      return "BUSY";
    case "NETWORK_FAILURE":
      return "UNREACHABLE";
    case "SERVER_FAILURE":
      return "SERVER_FAILED";
    case "MALFORMED_REQUEST":
    case "UNPROCESSABLE":
    case "INVALID_RESPONSE":
      return "UNREADABLE";
  }
}

export function classifyRequestFailure(
  subject: RequestFailureSubject,
  error: unknown
): RequestFailure {
  const kind = kindOf(error);
  return Object.freeze({
    subject,
    kind,
    message: `${SUBJECT_CLAUSE[subject]} ${KIND_CLAUSE[kind]}`
  });
}

/** The user-facing line for a banner. Never a sentence a server wrote. */
export function requestFailureMessage(
  subject: RequestFailureSubject,
  error: unknown,
  catalog?: MessageCatalog
): string {
  const classified = classifyRequestFailure(subject,error);
  if (catalog === undefined) return classified.message;
  return `${t(catalog,`requestFailure.subject.${classified.subject}`)} ${
    t(catalog,`requestFailure.kind.${classified.kind}`)
  }`;
}

/**
 * The only keys of the `newDebate` catalogue the home composer prints: today's
 * limit for new debates, in the words /new uses (Task M8, spec 2026-09-26
 * §14.4.7) — `requestFailureMessage("DEBATE_CREATE", …)` for DAILY_LIMIT_REACHED.
 */
const DAILY_LIMIT_MESSAGE_KEYS = Object.freeze([
  "requestFailure.subject.DEBATE_CREATE",
  "requestFailure.kind.DAILY_LIMIT_REACHED"
] as const);

/**
 * The part of a `newDebate` catalogue the home composer needs, and nothing
 * more. The composer is a client component, so every prop it is handed ships
 * to the browser: the home page hands it these two values, not the whole
 * catalogue.
 */
export function dailyLimitMessageCatalog(catalog: MessageCatalog): MessageCatalog {
  return pickMessages(catalog, DAILY_LIMIT_MESSAGE_KEYS);
}

/**
 * The only keys of the `newDebate` catalogue the blocking accept screen prints
 * (paid plans L4, spec 2026-09-29 §2.3.2): its "checking" line and its own
 * thirteen sentences.
 */
const LEGAL_GATE_MESSAGE_KEYS = Object.freeze([
  "newDebate.checkingSession",
  "newDebate.legalGate.eyebrow",
  "newDebate.legalGate.title",
  "newDebate.legalGate.body",
  "newDebate.legalGate.readTerms",
  "newDebate.legalGate.readPrivacy",
  "newDebate.legalGate.done",
  "newDebate.legalGate.accept",
  "newDebate.legalGate.accepting",
  "newDebate.legalGate.failed",
  "newDebate.legalGate.stale",
  "newDebate.legalGate.manageAccount",
  "newDebate.legalGate.signOut",
  "newDebate.legalGate.signOutFailed"
] as const);

/**
 * The part of a `newDebate` catalogue the home page hands the accept screen, a
 * client component, when documents are owed: these values, as M8's rule wants,
 * not the whole catalogue.
 */
export function legalGateMessageCatalog(catalog: MessageCatalog): MessageCatalog {
  return pickMessages(catalog, LEGAL_GATE_MESSAGE_KEYS);
}

function pickMessages(catalog: MessageCatalog, keys: readonly string[]): MessageCatalog {
  return Object.freeze(Object.fromEntries(
    keys.flatMap((key) => (Object.hasOwn(catalog, key) ? [[key, catalog[key]!]] : []))
  ));
}
