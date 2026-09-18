import type { SupportAssistantLanguage, SupportAssistantOutcome } from "./Assistant.js";

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
 */

export const SUPPORT_CONVERSATION_STORAGE_KEY = "debateai.support.conversation.v1";

export type SupportConversationMessage = Readonly<{
  id: string;
  role: "assistant" | "user";
  text: string;
  link?: string;
  outcome?: SupportAssistantOutcome;
}>;

export type SupportOwnContext = Readonly<{ runId: string }> | Readonly<{ latest: true }>;

export type StoredSupportConversation = Readonly<{
  language: SupportAssistantLanguage;
  /** The identity this transcript belongs to: signed-in, or anonymous. */
  identityBound: boolean;
  messages: readonly SupportConversationMessage[];
  ownContext: SupportOwnContext;
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

function ownContextOf(value: unknown): SupportOwnContext {
  return value !== null && typeof value === "object" && "runId" in value
    && typeof (value as { runId: unknown }).runId === "string"
    ? { runId: (value as { runId: string }).runId }
    : { latest: true };
}

/**
 * The stored transcript, or null. A payload from the pre-fix build carries a
 * `session` — that is a capability, so it is erased rather than ignored: a tab
 * that was open across the deploy keeps its sessionStorage.
 */
export function readStoredSupportConversation(
  storage: SupportConversationStorage | null
): StoredSupportConversation | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(SUPPORT_CONVERSATION_STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<StoredSupportConversation> & { session?: unknown };
    if (value.session !== undefined) {
      clearStoredSupportConversation(storage);
      return null;
    }
    if ((value.language !== "en" && value.language !== "ro")
      || typeof value.identityBound !== "boolean"
      || !Array.isArray(value.messages) || !value.messages.every(isMessage)) return null;
    return Object.freeze({
      language: value.language,
      identityBound: value.identityBound,
      messages: Object.freeze([...value.messages]),
      ownContext: ownContextOf(value.ownContext)
    });
  } catch {
    return null;
  }
}

/**
 * Writes exactly the four stored fields and nothing else. The whitelist is the
 * control: a caller holding a live session cannot persist it by accident.
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
      messages: conversation.messages,
      ownContext: conversation.ownContext
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
    // Nothing further to do: the key is tab-scoped and holds no capability.
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
