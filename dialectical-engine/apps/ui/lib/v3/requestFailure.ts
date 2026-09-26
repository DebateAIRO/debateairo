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
  BUSY: "The coordinator is rate-limiting requests right now. Retry shortly.",
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
