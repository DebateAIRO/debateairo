import { LOCALE_COOKIE, type LocaleCode } from "./locales.js";

/**
 * The reader's language choices in the browser.
 *
 * The interface locale is dev's cookie (components/LanguageSwitcher.tsx): the
 * server reads it on every page. Both the switcher and the offer to show a
 * debate in its own language (spec 2026-09-26 §14.3) write it here, the one
 * way the site stores that choice.
 */
export function writeLocaleCookie(code: LocaleCode): void {
  document.cookie = `${LOCALE_COOKIE}=${code}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/**
 * "No, thanks" on that offer holds for the rest of the browser session, per
 * language: sessionStorage, never a cookie, so nothing about it reaches the
 * server. Where storage is refused (a private window, a full quota) the choice
 * is kept in memory, so the offer still goes away and stays away on this page.
 */
export const LANGUAGE_OFFER_DISMISSED_KEY = "debateai.languageOffer.dismissed";

const dismissedInMemory = new Set<string>();
const listeners = new Set<() => void>();

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function storedDismissals(): readonly string[] {
  try {
    const raw = sessionStore()?.getItem(LANGUAGE_OFFER_DISMISSED_KEY) ?? null;
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function languageOfferDismissed(locale: LocaleCode): boolean {
  return dismissedInMemory.has(locale) || storedDismissals().includes(locale);
}

export function dismissLanguageOffer(locale: LocaleCode): void {
  dismissedInMemory.add(locale);
  try {
    sessionStore()?.setItem(LANGUAGE_OFFER_DISMISSED_KEY, JSON.stringify([...new Set([...storedDismissals(), locale])]));
  } catch {
    // Storage refused: the in-memory choice above still holds on this page.
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: the offer reads its state again after a dismissal. */
export function subscribeLanguageOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
