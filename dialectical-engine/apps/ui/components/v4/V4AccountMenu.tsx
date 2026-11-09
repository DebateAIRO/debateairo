"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { currentMode, switchMode } from "@/components/ModeToggle";
import { contractClient } from "@/lib/api";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { currentReturnPath, signInHrefFor } from "@/lib/signInWayBack";
import type { ReadingLevel } from "@/lib/v4/types";
import { allMapsHref } from "./V4MapShelf";

/*
 * V4 screen review (owner's picks, 3 Nov 2026):
 *   - ask-d6 A: the one V4 header ends in one round account button with the person's initial. It opens the site's account
 *     menu (AccountMenu: its keyboard, focus and sign-out rules) with the V4 items, in the record's order: "My questions"
 *     (the owner's answer to question 13, 5 Nov: C, ask-d6's own word; it opens ask-d5 B's "All my maps"), "Language",
 *     "Light or dark", "Settings", then "Sign out". Signed out: "Sign in" in its place, with the way back to this page.
 *   - journey-f19 / ask-f6: "Open in the classic view" lives in this menu, once, just above "Sign out", whenever the page
 *     gives its classic address. Question 12 B (5 Nov: in the account menu only, the small links go) is done: the waiting,
 *     paused and failed screens draw no classic link of their own, so this menu is the one place it lives.
 *   - The reading-level ruling (5 Nov): no link here carries a level; the level prop is accepted and unused.
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

export function V4AccountMenu({ catalog, classicHref, session }: Readonly<{
  catalog: MessageCatalog;
  /** Accepted and unused (the 5 Nov reading-level ruling: no link carries a level). */
  level?: ReadingLevel | null;
  /** The classic view of this page, shown once in the menu; null: the page has none here. */
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
          // The way back keeps this page's address as it is (its question, its picks). Only shown once the session is known,
          // so never in the server's first paint.
          signInHref={signInHrefFor(currentReturnPath())}
          signInClassName="v4Link v4HdrSignIn"
          look={{
            trigger: { className: "v4HdrAccountButton", label: t(catalog, "v4.header.account"), content: <AccountFace /> },
            signInLabel: t(catalog, "v4.ask.signIn"),
            logoutLabel: t(catalog, "v4.header.menu.signOut"),
            items: (close) => (
              <>
                <a role="menuitem" href={allMapsHref()} onClick={() => close(false)}>{t(catalog, "v4.maps.menu")}</a>
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
                  // ACCESS-13 (the wave-2 checks, 4 Nov): its name also says what a press does ("Light or dark: switch to
                  // dark"), keeping the words it shows first (WCAG 2.5.3). The menu draws its items only when open, so the
                  // page's mode is read then.
                  aria-label={t(catalog, currentMode() === "chamber" ? "v4.header.menu.themeToLight" : "v4.header.menu.themeToDark")}
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
