import {
  SUPPORT_CAPABILITIES,
  type SupportAction,
  type SupportActionId
} from "@debateai/support-kb/catalog";
import { resolveSupportActions } from "@debateai/support-kb/navigation";
import type { SupportAssistantLanguage, SupportAssistantOutcome } from "./Assistant.js";
import { isLocale } from "../../lib/i18n/locales.js";

/**
 * DL3-F3. What the support widget is allowed to leave behind in the browser.
 *
 * Before this seam existed the widget wrote `{language, session, messages,
 * ownContext}` into `sessionStorage` on every change — session capability token
 * included — and restored all of it on mount. Three things followed, all of
 * them wrong on a shared browser:
 *
 *  1. The capability outlived the page that minted it. It is useless without
 *     the owner's cookie (the API's `sessionOwnerMatches`), but a bearer that
 *     rests on disk for the life of a tab is a bearer that can be read.
 *  2. Logging out did not touch it, so the next person to sign in on that tab
 *     opened Help and read the previous person's support conversation.
 *  3. Their first message reused the previous owner's bound capability, the API
 *     answered 404 as it must, and the compact widget — which has no "New
 *     conversation" control — said "Support is unavailable" forever.
 *
 * So: the capability is held in React state and nowhere else, the transcript is
 * stored against the identity that produced it and erased the moment that
 * identity changes, and the reader refuses (and erases) any payload written by
 * the pre-fix build. Every entry point tolerates a storage that is absent,
 * full, or throwing — private-mode browsers do all three.
 *
 * DL1-F5c, final review. The SESSION capability was kept out and the CASE
 * bearer walked straight back in: the acknowledgement message the widget
 * appends carried the 30-day, cookie-free case token three times over — in its
 * id (`case-<token>`), in the API's sentence, and in its `/help#case=<token>`
 * link — and the whole `messages` array is what this module writes. That bearer
 * reads a whole case and replies as the reporter for thirty days, to anyone
 * holding it, which is a stronger capability than the one that was removed. So
 * the transcript stores a token-free acknowledgement, and both doors — write
 * AND read, for a tab that was open across the deploy — strip anything shaped
 * like a bearer. `Assistant.tsx` keeps the token in React state, renders the
 * code and the link from there, and shows a token-free notice once it is gone.
 *
 * SYNC3 (dev's reviewed-response rework). An assistant message now carries the
 * reviewed `sources` and canonical `actions` the API bound to it, and the
 * language it was answered in. They join the whitelist through the SAME
 * validators the response boundary uses (`supportSourcesFrom`,
 * `supportActionsFrom`, dev's `sourcesFrom`/`actionsFrom` moved here so there is
 * one of each): a decoration that is not a reviewed source id or not the exact
 * canonical action for its language and identity is refused on write, and a
 * stored payload that carries one is erased on read. The private-context
 * selection this module used to store is gone with the feature.
 */

export const SUPPORT_CONVERSATION_STORAGE_KEY = "debateai.support.conversation.v2";

/**
 * DL1-F5c, fix round 1. The names no build may read again, erased on every
 * read. `v1` is the pre-fix key: its payload could carry a case bearer in an
 * id, a sentence and a link, and a tab that was open across the deploy keeps
 * its `sessionStorage` until it is closed — so reusing the name would have left
 * the decision to a reader, and a reader only governs what it hands to the
 * page. Retiring the name is what removes the bearer.
 */
const RETIRED_STORAGE_KEYS = Object.freeze(["debateai.support.conversation.v1"]);

export type SupportSource = Readonly<{ id: string; label: string }>;

export type SupportConversationMessage = Readonly<{
  id: string;
  role: "assistant" | "user";
  text: string;
  link?: string;
  outcome?: SupportAssistantOutcome;
  /** The language this assistant message was answered in. */
  language?: SupportAssistantLanguage;
  /** Reviewed help sources the API bound to this answer (never more than three). */
  sources?: readonly SupportSource[];
  /** Canonical first-party actions, exactly as `resolveSupportActions` builds them. */
  actions?: readonly SupportAction[];
  /**
   * DL1-F5c: this message says that a case was opened — and says only that.
   * The code itself and its link are rendered from the bearer the tab holds in
   * memory; a transcript restored without that bearer shows the notice alone.
   */
  caseOpened?: true;
}>;

export type StoredSupportConversation = Readonly<{
  language: SupportAssistantLanguage;
  /** The identity this transcript belongs to: signed-in, or anonymous. */
  identityBound: boolean;
  messages: readonly SupportConversationMessage[];
}>;

/** The slice of the Storage interface this module uses, so tests need no DOM. */
export type SupportConversationStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}>;

export function browserSupportConversationStorage(): SupportConversationStorage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

function isMessage(value: unknown): value is SupportConversationMessage {
  if (value === null || typeof value !== "object") return false;
  const message = value as Partial<SupportConversationMessage>;
  return typeof message.id === "string" && typeof message.text === "string"
    && (message.role === "assistant" || message.role === "user");
}

/** The most sources, and the most actions, one answer may carry. */
const MAX_RESPONSE_DECORATIONS = 3;
const SUPPORT_SOURCE_IDS = new Set(
  SUPPORT_CAPABILITIES.flatMap(({ articleIds }) => articleIds)
);

export function hasExactKeys(
  value: Readonly<Record<string, unknown>>, keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * dev's response-boundary validator for the reviewed sources: at most three,
 * each exactly `{id,label}`, the id one of the reviewed help articles, no
 * duplicates. Anything else is null — the whole list, never a partial one.
 * Absent is an empty list.
 */
export function supportSourcesFrom(value: unknown): readonly SupportSource[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_RESPONSE_DECORATIONS) return null;
  const seen = new Set<string>();
  const sources: SupportSource[] = [];
  for (const member of value) {
    if (member === null || typeof member !== "object" || Array.isArray(member)) return null;
    const source = member as Readonly<Record<string, unknown>>;
    if (!hasExactKeys(source, ["id", "label"])
      || typeof source.id !== "string" || !SUPPORT_SOURCE_IDS.has(source.id)
      || typeof source.label !== "string" || source.label.length === 0
      || seen.has(source.id)) return null;
    seen.add(source.id);
    sources.push(Object.freeze({ id: source.id, label: source.label }));
  }
  return Object.freeze(sources);
}

/**
 * dev's response-boundary validator for the actions: each one must be EXACTLY
 * the canonical action `resolveSupportActions` builds for this identity and
 * language — id, label and href — so a response (or a stored transcript) can
 * never carry an href of its own choosing.
 */
export function supportActionsFrom(
  value: unknown,
  context: Readonly<{ signedIn: boolean; language: SupportAssistantLanguage }> | undefined
): readonly SupportAction[] | null {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_RESPONSE_DECORATIONS) return null;
  if (value.length > 0 && context === undefined) return null;
  const seen = new Set<string>();
  const actions: SupportAction[] = [];
  for (const member of value) {
    if (member === null || typeof member !== "object" || Array.isArray(member)) return null;
    const action = member as Readonly<Record<string, unknown>>;
    if (!hasExactKeys(action, ["id", "label", "href"])
      || typeof action.id !== "string" || typeof action.label !== "string"
      || typeof action.href !== "string" || seen.has(action.id)) return null;
    const canonical = resolveSupportActions([action.id as SupportActionId], context!);
    if (canonical.length !== 1 || canonical[0]!.id !== action.id
      || canonical[0]!.label !== action.label || canonical[0]!.href !== action.href) return null;
    seen.add(action.id);
    actions.push(canonical[0]!);
  }
  return Object.freeze(actions);
}

/**
 * DL1-F5c. A run of the API's case-capability alphabet at least as long as a
 * case bearer (43 base64url characters, `apps/ui/components/support/
 * caseLink.ts`), wherever it appears: in a sentence, in a link, or welded to a
 * prefix as the acknowledgement's `case-<token>` id was. The whole run goes, so
 * no fragment of a bearer is left behind. Stripping here is the CONTROL, not a
 * courtesy — `Assistant.tsx` already appends a token-free acknowledgement, and
 * this is what makes that true of every caller, including a payload left behind
 * by the build that did not.
 */
const CASE_BEARER = /[A-Za-z0-9_-]{43,}/gu;

function withoutBearer(value: string): string {
  return value.replace(CASE_BEARER, "");
}

/**
 * The reviewed decorations of one assistant message as they may rest in the
 * browser, or null when they are not the reviewed shapes. Each is kept only if
 * the message carries it, so a message without decorations round-trips as it
 * was. A source label is display text from the API, so it goes through the
 * bearer strip like every other text here; a label a bearer ran through is not
 * a label.
 */
function storedDecorations(
  message: SupportConversationMessage,
  identityBound: boolean,
  fallbackLanguage: SupportAssistantLanguage
): Readonly<{
  language?: SupportAssistantLanguage;
  sources?: readonly SupportSource[];
  actions?: readonly SupportAction[];
}> | null {
  const language = isLocale(message.language)
    ? message.language : undefined;
  const sources = message.sources === undefined ? undefined : supportSourcesFrom(message.sources);
  const actions = message.actions === undefined ? undefined : supportActionsFrom(
    message.actions, { signedIn: identityBound, language: language ?? fallbackLanguage }
  );
  if (sources === null || actions === null
    || sources?.some(({ label }) => withoutBearer(label) !== label) === true) return null;
  return Object.freeze({
    ...(language === undefined ? {} : { language }),
    ...(sources === undefined ? {} : { sources }),
    ...(actions === undefined ? {} : { actions })
  });
}

/**
 * One message as it may rest in the browser: the known fields and nothing else,
 * with every bearer taken out. A link that carried one is dropped whole — half
 * a capability is not a link — and an id that carried one is replaced by its
 * position, so the transcript keeps distinct React keys. An assistant message's
 * decorations are the reviewed shapes or nothing: null here refuses the message.
 */
function storedMessage(
  message: SupportConversationMessage,
  index: number,
  identityBound: boolean,
  fallbackLanguage: SupportAssistantLanguage
): SupportConversationMessage | null {
  const id = withoutBearer(message.id);
  const link = message.link === undefined || withoutBearer(message.link) !== message.link
    ? undefined
    : message.link;
  const decorations = message.role === "assistant"
    ? storedDecorations(message, identityBound, fallbackLanguage) : undefined;
  if (decorations === null) return null;
  return Object.freeze({
    id: id === message.id ? id : `message-${index}`,
    role: message.role,
    text: withoutBearer(message.text),
    ...(link === undefined ? {} : { link }),
    ...(message.outcome === undefined ? {} : { outcome: message.outcome }),
    ...(decorations === undefined ? {} : decorations),
    ...(message.caseOpened === true ? { caseOpened: true as const } : {})
  });
}

/**
 * The stored transcript, or null — and nothing this function refuses is left
 * where it was. A payload from the pre-fix build carries a `session`, a shape
 * this build does not recognise, or JSON that will not parse; each of those can
 * still hold a capability as text, and "nothing reads it any more" is not the
 * same as "nothing holds it". So every path that does not return a transcript
 * erases first, and the retired keys go on every read.
 */
export function readStoredSupportConversation(
  storage: SupportConversationStorage | null
): StoredSupportConversation | null {
  if (storage === null) return null;
  for (const key of RETIRED_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // A storage that refuses to forget costs continuity, never correctness.
    }
  }
  try {
    const raw = storage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<StoredSupportConversation> & { session?: unknown };
    if (value.session !== undefined) {
      clearStoredSupportConversation(storage);
      return null;
    }
    if (!isLocale(value.language)
      || typeof value.identityBound !== "boolean"
      || !Array.isArray(value.messages) || !value.messages.every(isMessage)) {
      clearStoredSupportConversation(storage);
      return null;
    }
    const language = value.language;
    const identityBound = value.identityBound;
    // DL1-F5c: a tab open across the deploy keeps its sessionStorage, so the
    // reader takes a bearer out of it rather than handing it back to the page.
    const messages = value.messages.map((message, index) =>
      storedMessage(message, index, identityBound, language));
    // A forged decoration (an action pointing anywhere but its canonical href,
    // a source that is not a reviewed article) refuses the whole payload.
    if (messages.some((message) => message === null)) {
      clearStoredSupportConversation(storage);
      return null;
    }
    return Object.freeze({
      language,
      identityBound,
      messages: Object.freeze(messages as SupportConversationMessage[])
    });
  } catch {
    // Unparsable is still readable as text: erase it rather than step over it.
    clearStoredSupportConversation(storage);
    return null;
  }
}

/**
 * Writes exactly the three stored fields and nothing else, each message through
 * the same door. The whitelist is the control: a caller holding a live session
 * — or a live case bearer (DL1-F5c) — cannot persist it by accident. A message
 * whose decorations are not the reviewed shapes is not written at all.
 */
export function writeStoredSupportConversation(
  storage: SupportConversationStorage | null,
  conversation: StoredSupportConversation
): void {
  if (storage === null) return;
  try {
    storage.setItem(SUPPORT_CONVERSATION_STORAGE_KEY, JSON.stringify({
      language: conversation.language,
      identityBound: conversation.identityBound,
      messages: conversation.messages.flatMap((message, index) => {
        const stored = storedMessage(
          message, index, conversation.identityBound, conversation.language
        );
        return stored === null ? [] : [stored];
      })
    }));
  } catch {
    // A storage that refuses to write costs continuity, never correctness.
  }
}

/** What logout, revoke-all and revoking this session call. */
export function clearStoredSupportConversation(
  storage: SupportConversationStorage | null = browserSupportConversationStorage()
): void {
  if (storage === null) return;
  try {
    storage.removeItem(SUPPORT_CONVERSATION_STORAGE_KEY);
  } catch {
    /**
     * Nothing further to do. The key is tab-scoped, and what it holds is the
     * transcript: the session capability is in memory (DL3-F3) and so is the
     * case bearer (DL1-F5c), both stripped by `storedMessage` on the way in and
     * on the way out. That is an invariant this module enforces, not a claim
     * about the caller — the final review found the claim false while the
     * acknowledgement still carried a 30-day case token, which is why the
     * stripping exists rather than the sentence.
     */
  }
}

/**
 * The transcript for the identity now at the keyboard, or null — and when the
 * identity has changed, the stored transcript is erased on the way out. This
 * runs only once the identity is known, so a signed-out first paint can never
 * show a signed-in transcript.
 */
export function restoreSupportConversation(
  storage: SupportConversationStorage | null,
  identityAvailable: boolean
): StoredSupportConversation | null {
  const stored = readStoredSupportConversation(storage);
  if (stored === null) return null;
  if (stored.identityBound !== identityAvailable) {
    clearStoredSupportConversation(storage);
    return null;
  }
  return stored;
}
