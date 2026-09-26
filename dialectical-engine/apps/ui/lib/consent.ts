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
  nameKey: string;
  tagKey: string;
  descriptionKey: string;
  detailKey: string;
  detailVars: Readonly<Record<string, string | number>>;
  locked: boolean;
  defaultOn: boolean;
};

/**
 * The three category records preserve the design's ordering and behavior
 * (`design-data.js:87-91`, decoded per SPEC §Copy). Their semantic message keys
 * point to the consent catalogue, so no copy string is inlined in a component.
 *
 * The three `detail` lines name five cookies this product does not set — it sets
 * `__Host-debateai-session` and `__Host-debateai-csrf` (`apps/api/src/index.ts:169-170`).
 * The protected cookie identifiers remain interpolation values because they
 * must not be translated.
 */
export const COOKIE_CATEGORIES: readonly CookieCategory[] = [
  {
    id: "essential",
    nameKey: "consent.category.essential.name",
    tagKey: "consent.category.alwaysOn",
    descriptionKey: "consent.category.essential.description",
    detailKey: "consent.category.essential.detail",
    detailVars: { cookies: "de_session · de_mfa · de_device" },
    locked: true,
    defaultOn: true
  },
  {
    id: "quality",
    nameKey: "consent.category.quality.name",
    tagKey: "consent.category.optional",
    descriptionKey: "consent.category.quality.description",
    detailKey: "consent.category.optional.detail",
    detailVars: { cookie: "de_quality" },
    locked: false,
    defaultOn: true
  },
  {
    id: "analytics",
    nameKey: "consent.category.analytics.name",
    tagKey: "consent.category.optional",
    descriptionKey: "consent.category.analytics.description",
    detailKey: "consent.category.optional.detail",
    detailVars: { cookie: "de_analytics" },
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
 * The exact shape `new Date().toISOString()` emits — millisecond precision, `Z`
 * suffix — which S01-R01 names as `decidedAt`'s only form.
 */
const ISO_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * A *valid stored decision* parses to a non-array object with **exactly the
 * five members and no others**, `v === 1`, `essential === true`, `quality` and
 * `analytics` boolean, and `decidedAt` matching {@link ISO_UTC_MS}. Anything
 * else re-asks, because re-asking is the conservative reading of consent
 * (S01-R01, S01-R02, S01-R03; row **V-19** default (a), which extends the
 * earlier `essential !== true` ruling from its instance to its whole class).
 *
 * The two members V-19 added — a sixth key, and a `decidedAt` that is a string
 * but not that instant — cannot arrive from this product: nothing else writes
 * the key. They arrive from DevTools, a hand edit or an extension, and a record
 * whose timestamp cannot be parsed cannot answer "when was consent given".
 */
function isDecision(value: unknown): value is ConsentDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 5 &&
    record.v === CONSENT_VERSION &&
    record.essential === true &&
    typeof record.quality === "boolean" &&
    typeof record.analytics === "boolean" &&
    typeof record.decidedAt === "string" &&
    ISO_UTC_MS.test(record.decidedAt)
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
 *
 * **`save-choices` REQUIRES the toggles, and the compiler is the guard.** An
 * omitted argument used to coerce to `false`/`false`, so a wiring mistake wrote
 * a full denial for a visitor who had left the optional quality toggle ON — a
 * silent, type-legal denial of consent that no test in this slice could see
 * (`reviews/CODE-REV-S01-C1C2-r1.md` **N2**; orchestrator ruling on ticket
 * `t_117e7f43`). The overloads below make `decisionFor("save-choices")` a
 * compile error, so absence can no longer read as denial.
 */
export function decisionFor(
  control: "accept-all" | "essential-only",
  toggles?: ConsentToggles
): ConsentDecision;
export function decisionFor(control: "save-choices", toggles: ConsentToggles): ConsentDecision;
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

/**
 * A COMPILER PIN, never called and never exported.
 *
 * The two overloads above are enforced by the type checker and by nothing else:
 * deleting both — a complete regression of the fix they exist to deliver — left
 * every gate in this repo green, measured (`apps/ui` tsc exit 0, root typecheck
 * 0 diagnostics outside the pin, the C2 and C4 suites green). The reason is that
 * the only OTHER call that would catch it lives in a `.tsx` test, and the root
 * `tsconfig.json` takes `tests/**` as `.ts` only while excluding `apps/ui`, so
 * all three of this mission's `.tsx` tests are typechecked by no project at all
 * (`reviews/CODE-REV-S01-C3C4-r1.md` **N7**).
 *
 * This directive is the guard: with the overloads present the call below is an
 * error and the directive is used; delete them and the call becomes legal, which
 * makes the directive itself `error TS2578: Unused '@ts-expect-error' directive.`
 * under `apps/ui`'s own project — the arm COMMON §10.30 already runs after every
 * commit. (Part 2, teaching the ROOT tsconfig about `tests/**` + `.tsx`, is the
 * orchestrator's ticket `t_94c9010a`, not this file's business.)
 */
function pinSaveChoicesRequiresToggles(): void {
  // @ts-expect-error `save-choices` may not be called without its toggles: an
  // omitted argument coerced to false/false and wrote a full denial of consent
  // for a visitor who had left the optional quality toggle ON.
  decisionFor("save-choices");
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
