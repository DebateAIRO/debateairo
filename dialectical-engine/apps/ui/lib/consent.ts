/**
 * Browser-local consent preferences — the whole model of the bounded context
 * S01 owns: the decision record, its codec, and nothing else yet.
 *
 * The contract this file implements is `docs/architecture/01-decisions/
 * ADR-0021-consent-storage-contract.md`; the requirements are S01-R01..R05.
 * Nothing in the product reads the stored booleans today (S01-R23): storing a
 * preference loads nothing, unloads nothing and gates nothing.
 */

/** The one key. `debateai.mode` (apps/ui/app/layout.tsx:39) is the namespace's other member. */
export const CONSENT_KEY = "debateai.consent";

/** The integer schema version carried inside the value, never in the key name. */
export const CONSENT_VERSION = 1;

/** One stored decision: exactly these five members, and no others (S01-R01). */
export type ConsentDecision = {
  v: typeof CONSENT_VERSION;
  /** Always true, and stored explicitly rather than omitted, so the record is self-describing. */
  essential: true;
  quality: boolean;
  analytics: boolean;
  /** `new Date().toISOString()` at the moment THIS decision was taken; a re-save overwrites it. */
  decidedAt: string;
};

/** One category as the preferences card renders it. `id` is the decision member it governs. */
export type CookieCategory = {
  id: "essential" | "quality" | "analytics";
  name: string;
  tag: string;
  description: string;
  detail: string;
  locked: boolean;
  defaultOn: boolean;
};

/**
 * The three category records, verbatim from the design (`design-data.js:87-91`,
 * decoded per SPEC §Copy, which is the authority). Every string the two consent
 * surfaces show lives here and nowhere else (S01-R28): no copy string is inlined
 * in a component, so a ruling on the cookie names is a one-line data edit.
 *
 * The three `detail` lines name five cookies this product does not set — it sets
 * `__Host-debateai-session` and `__Host-debateai-csrf` (`apps/api/src/index.ts:169-170`).
 * They are pinned verbatim because the SPEC requires it, and routed to V as
 * contested row Q7-01; V's ruling changes these three strings and nothing else.
 */
export const COOKIE_CATEGORIES: readonly CookieCategory[] = [
  {
    id: "essential",
    name: "Essential",
    tag: "ALWAYS ON",
    description:
      "Session, MFA state and the device record that lets you spot a login you do not recognise.",
    detail: "de_session · de_mfa · de_device — 30 days",
    locked: true,
    defaultOn: true
  },
  {
    id: "quality",
    name: "Model quality telemetry",
    tag: "OPTIONAL",
    description:
      "Which arguments you challenge or flag, used to tune judge panels. Never tied to your debates’ text.",
    detail: "de_quality — 90 days · first-party",
    locked: false,
    defaultOn: true
  },
  {
    id: "analytics",
    name: "Product analytics",
    tag: "OPTIONAL",
    description:
      "Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.",
    detail: "de_analytics — 90 days · first-party",
    locked: false,
    defaultOn: false
  }
];

/** The three controls that write a decision. Two surfaces offer `essential-only`. */
export type ConsentControl = "accept-all" | "essential-only" | "save-choices";

/** The two operable category toggles, as the preferences card currently shows them. */
export type ConsentToggles = {
  quality: boolean;
  analytics: boolean;
};

/**
 * A *valid stored decision* parses, carries `v === 1`, and holds all five
 * members at their declared types. Anything else — including a record whose
 * `essential` is not `true`, which this module never writes — is no decision,
 * because re-asking is the conservative reading of consent (S01-R02, S01-R03).
 */
function isDecision(value: unknown): value is ConsentDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.v === CONSENT_VERSION &&
    record.essential === true &&
    typeof record.quality === "boolean" &&
    typeof record.analytics === "boolean" &&
    typeof record.decidedAt === "string"
  );
}

/**
 * Reads the stored decision, or `null` when there is none.
 *
 * A value whose `v` is not the integer {@link CONSENT_VERSION} is no decision:
 * the caller re-asks and the next decision overwrites the key. There is no v0 to
 * carry forward, so no code here branches on any other version (S01-R02).
 *
 * A read that throws — a browser refusing storage, an opaque origin — is also no
 * decision, so the visitor is asked rather than trapped (S01-R03).
 */
export function readConsent(): ConsentDecision | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDecision(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores one decision under {@link CONSENT_KEY}.
 *
 * A refused write is swallowed: the surface still closes and the decision lives
 * in React state for the lifetime of the page, and the bar returns on the next
 * full load. Blocking a visitor because their browser refuses storage is worse
 * than re-asking (S01-R03). House precedent: `ModeToggle.tsx:23-27`.
 */
export function writeConsent(decision: ConsentDecision): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(decision));
  } catch {
    // Deliberately empty; see the contract above.
  }
}

/**
 * The decision a control writes — S01-R04's four rows, and the only place they
 * live. `essential-only` ignores `toggles` on purpose: it is offered by the bar
 * and by the card, and both must produce the identical object, so the entry
 * point is never a discriminator of behaviour.
 */
export function decisionFor(control: ConsentControl, toggles?: ConsentToggles): ConsentDecision {
  const chosen: Pick<ConsentDecision, "quality" | "analytics"> =
    control === "accept-all"
      ? { quality: true, analytics: true }
      : control === "essential-only"
        ? { quality: false, analytics: false }
        : { quality: toggles?.quality === true, analytics: toggles?.analytics === true };

  return {
    v: CONSENT_VERSION,
    essential: true,
    quality: chosen.quality,
    analytics: chosen.analytics,
    decidedAt: new Date().toISOString()
  };
}

/** Notified when some distant component asks for the preferences card. */
export type PreferenceRequestListener = (opener: HTMLElement | null) => void;

const preferenceRequestListeners = new Set<PreferenceRequestListener>();

/**
 * Asks the consent surface to open the preferences card, from anywhere in the
 * tree. `opener` is carried only so focus can be returned to it on close — it is
 * never a discriminator of behaviour (S01-R21; the states table keys every row
 * on the stored decision, never on the entry point).
 *
 * A module-level store rather than React context: S01-R07 pins the consent mount
 * as a SIBLING placed after `{children}`, and a sibling cannot provide context to
 * `{children}`. The mechanism is forced by the requirement, not chosen.
 *
 * A request with no subscriber is a no-op, so a Settings panel rendered before
 * the consent surface has mounted cannot throw.
 */
export function requestPreferences(opener: HTMLElement | null): void {
  for (const listener of [...preferenceRequestListeners]) listener(opener);
}

/** Subscribes to preference requests. The returned function unsubscribes, and is idempotent. */
export function subscribeToPreferenceRequests(listener: PreferenceRequestListener): () => void {
  preferenceRequestListeners.add(listener);
  return () => {
    preferenceRequestListeners.delete(listener);
  };
}
