"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { switchMode } from "@/components/ModeToggle";
import { contractClient } from "@/lib/api";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { currentReturnPath, signInHrefFor } from "@/lib/signInWayBack";
import { levelHref } from "@/lib/v4/storage";
import type { ReadingLevel } from "@/lib/v4/types";
import { allMapsHref } from "./V4MapShelf";

/*
 * V4 screen review (owner's picks, 3 Nov 2026):
 *   - ask-d6 A: the one V4 header ends in one round account button with the person's initial. It opens the site's account
 *     menu (AccountMenu: its keyboard, focus and sign-out rules) with the V4 items, in the record's order: "My maps"
 *     (ask-d5 B's "All my maps"), "Language", "Light or dark", "Settings", then "Sign out". Signed out: "Sign in" in its
 *     place, with the way back to this page.
 *   - journey-f19 / ask-f6: "Open in the classic view" lives in this menu, once, just above "Sign out"; a page that already
 *     shows it in its body (the waiting, paused and failed screens, the report's foot) passes none, so a page has it once.
 * Nothing is kept in the browser here: the language and the mode are the site's own existing choices (the language cookie,
 * the mode preference), changed the way the old top bar changed them.
 */

/** The page's own knowledge of the session, when it has one (the ask page learns it beside the page). */
export type V4HeaderSession = "CHECKING" | "IN" | "OUT";

/** The first letter or digit of the address's name part, as a capital ("maria@…" → "M"); null when there is none. */
export function initialOf(email: string): string | null {
  const name = email.split("@", 1)[0] ?? "";
  const first = Array.from(name).find((character) => /[\p{L}\p{N}]/u.test(character));
  return first === undefined ? null : first.toLocaleUpperCase();
}

/**
 * The round button's face: the person's initial, read from the account's address once the menu knows the person is signed
 * in (this part mounts only then). A failed read shows a plain person mark instead; the address itself is never kept.
 */
function AccountFace() {
  const [initial, setInitial] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void contractClient.readAccountEmail().then(
      (account) => { if (active) setInitial(initialOf(account.email)); },
      () => { if (active) setInitial(null); }
    );
    return () => { active = false; };
  }, []);
  return initial === null
    ? <span className="v4HdrAccountMark" aria-hidden="true" />
    : <span className="v4HdrAccountInitial" aria-hidden="true">{initial}</span>;
}

export function V4AccountMenu({ catalog, level, classicHref, session }: Readonly<{
  catalog: MessageCatalog;
  /** The reading level the page's links carry (null: none chosen). */
  level: ReadingLevel | null;
  /** The classic view of this page, shown once in the menu; null: the page shows it elsewhere, or has none. */
  classicHref: string | null;
  /** The page's own knowledge of the session; absent: the menu reads it itself. */
  session?: V4HeaderSession;
}>) {
  // The site's menu keeps its own few words (a failed sign-out) in the site's chrome words; every V4 word goes in `look`.
  const { catalog: chromeCatalog } = useChromeI18n();
  const slot = useRef<HTMLSpanElement>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const closeLanguage = useCallback((returnFocus: boolean) => {
    setLanguageOpen(false);
    if (returnFocus) slot.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  // A page that knows the session is still checking keeps the button's place empty, so nothing flashes.
  const authenticated = session === undefined || session === "CHECKING" ? undefined : session === "IN";
  return (
    <span className="v4HdrAccount" ref={slot}>
      {session === "CHECKING" ? null : (
        <AccountMenu
          catalog={chromeCatalog}
          {...(authenticated === undefined ? {} : { authenticated })}
          // The way back keeps this page's address (its question, its picks) with the level the page's links carry. Only
          // shown once the session is known, so never in the server's first paint.
          signInHref={signInHrefFor(levelHref(currentReturnPath(), level))}
          signInClassName="v4Link v4HdrSignIn"
          look={{
            trigger: { className: "v4HdrAccountButton", label: t(catalog, "v4.header.account"), content: <AccountFace /> },
            signInLabel: t(catalog, "v4.ask.signIn"),
            logoutLabel: t(catalog, "v4.header.menu.signOut"),
            items: (close) => (
              <>
                <a role="menuitem" href={allMapsHref(level)} onClick={() => close(false)}>{t(catalog, "v4.maps.menu")}</a>
                <button
                  role="menuitem"
                  type="button"
                  aria-haspopup="dialog"
                  data-v4-menu="language"
                  onClick={() => {
                    close(false);
                    // After the menu has closed and settled, so its focus rules never take the focus back from the list.
                    window.setTimeout(() => setLanguageOpen(true), 0);
                  }}
                >
                  {t(catalog, "v4.header.menu.language")}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  data-v4-menu="mode"
                  onClick={(event) => {
                    const source = event.currentTarget;
                    close();
                    switchMode(source, { instant: true });
                  }}
                >
                  {t(catalog, "v4.header.menu.theme")}
                </button>
                <a role="menuitem" href="/settings" onClick={() => close(false)}>{t(catalog, "v4.header.menu.settings")}</a>
                {classicHref === null ? null : (
                  <a role="menuitem" href={classicHref} data-v4-menu="classic" onClick={() => close(false)}>{t(catalog, "v4.common.classicView")}</a>
                )}
              </>
            )
          }}
        />
      )}
      <LanguageSwitcher opener={{ open: languageOpen, onClose: closeLanguage, anchor: slot }} />
    </span>
  );
}
