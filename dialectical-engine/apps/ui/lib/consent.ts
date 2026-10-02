/**
 * The cookie notice's one browser record — its value, its predicate, and the request
 * channel that opens the storage card from anywhere.
 *
 * The contract is `docs/architecture/01-decisions/ADR-0032-cookie-notice-acknowledgement-and-storage-inventory.md`
 * (which supersedes decisions 1, 2, 3 and 5 of ADR-0021); the requirements are SPEC-v2 R06
 * and R08 of mission `cookie-compliance`. DebateAI stores only strictly necessary items, so
 * the notice asks for no consent: pressing its acknowledgement records that the visitor has
 * seen it, and nothing in the product reads that record except the notice itself.
 */

/** The one key. `debateai.mode` (apps/ui/app/layout.tsx) is the namespace's other local-storage member. */
export const CONSENT_KEY = "debateai.consent";

/** The integer schema version carried inside the value, never in the key name. */
export const CONSENT_VERSION = 2;

/** The one stored value: exactly these two members, and no others (SPEC-v2 R06). */
export type ConsentAcknowledgement = { v: typeof CONSENT_VERSION; acknowledgedAt: string };

/** The exact shape `new Date().toISOString()` emits — millisecond precision, `Z` suffix. */
const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * ACK, after `JSON.parse`: a non-null object that is not an array, whose own keys are exactly
 * `v` and `acknowledgedAt` (any order), whose `v` is the number 2 (not the string "2"), and
 * whose `acknowledgedAt` is a string in the {@link ISO_UTC_MS} form. Anything else is no
 * acknowledgement, the bar shows, and the next press overwrites the key.
 */
export function isAcknowledgement(value: unknown): value is ConsentAcknowledgement {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === 2 &&
    keys.includes("v") &&
    keys.includes("acknowledgedAt") &&
    typeof record.v === "number" &&
    record.v === CONSENT_VERSION &&
    typeof record.acknowledgedAt === "string" &&
    ISO_UTC_MS.test(record.acknowledgedAt)
  );
}

/**
 * Reads the stored acknowledgement, or `null` when there is none: absent, unparseable, not
 * ACK, or a read that throws (a browser refusing storage is shown the notice, never trapped).
 */
export function readConsent(): ConsentAcknowledgement | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAcknowledgement(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores one acknowledgement under {@link CONSENT_KEY}.
 *
 * A refused write is swallowed: the bar still closes for the life of the page and returns on
 * the next full load. Blocking a visitor because their browser refuses storage is worse than
 * showing the notice again. House precedent: `ModeToggle.tsx`.
 */
export function writeConsent(record: ConsentAcknowledgement): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Deliberately empty; see the contract above.
  }
}

/** The value the acknowledgement writes, stamped at the moment of the press. */
export function acknowledgementNow(): ConsentAcknowledgement {
  return { v: CONSENT_VERSION, acknowledgedAt: new Date().toISOString() };
}

/** Notified when some distant component asks for the storage card. */
export type PreferenceRequestListener = (opener: HTMLElement | null) => void;

const preferenceRequestListeners = new Set<PreferenceRequestListener>();

/**
 * Asks the consent surface to open the storage card, from anywhere in the tree (the footer,
 * Settings → Privacy, /cookies, the Help panel). `opener` is carried only so focus can be
 * returned to it on close — it is never a discriminator of behaviour.
 *
 * A module-level store rather than React context: the consent mount is a SIBLING placed after
 * `{children}` in the root layout, and a sibling cannot provide context to `{children}`.
 *
 * A request with no subscriber is a no-op, so a panel rendered before the consent surface has
 * mounted cannot throw.
 */
export function requestPreferences(opener: HTMLElement | null): void {
  for (const listener of [...preferenceRequestListeners]) listener(opener);
}

/** Subscribes to card requests. The returned function unsubscribes, and is idempotent. */
export function subscribeToPreferenceRequests(listener: PreferenceRequestListener): () => void {
  preferenceRequestListeners.add(listener);
  return () => {
    preferenceRequestListeners.delete(listener);
  };
}
