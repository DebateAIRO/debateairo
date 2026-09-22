"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import {
  filterLocales,
  getLocale,
  LOCALES,
  LOCALE_COOKIE,
  type LocaleCode,
  type LocaleTier
} from "@/lib/i18n/locales";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import {
  handleLanguageSwitcherKey,
  highlightedLocaleIndex,
  languageSwitcherCaret
} from "./languageSwitcherState";

const TIERS: readonly LocaleTier[] = ["EUROPE", "ASIA", "MIDDLE EAST"];
const TIER_KEYS = {
  EUROPE: "chrome.europe",
  ASIA: "chrome.asia",
  "MIDDLE EAST": "chrome.middleEast"
} as const;

export function LanguageSwitcher() {
  const { locale, catalog } = useChromeI18n();
  const current = getLocale(locale);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterLocales(query), [query]);
  const filteredCodes = filtered.map(({ code }) => code as LocaleCode);
  const [highlightedCode, setHighlightedCode] = useState<LocaleCode>(locale);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (filteredCodes.length === 0) return;
    if (!filteredCodes.includes(highlightedCode)) setHighlightedCode(filteredCodes[0]);
  }, [filteredCodes, highlightedCode]);

  function close(returnFocus = false): void {
    setOpen(false);
    setQuery("");
    setHighlightedCode(locale);
    if (returnFocus) queueMicrotask(() => buttonRef.current?.focus());
  }

  function select(code: LocaleCode): void {
    document.cookie = `${LOCALE_COOKIE}=${code}; Path=/; SameSite=Lax; Max-Age=31536000`;
    close(false);
    window.location.reload();
  }

  function onKeyDown(event: KeyboardEvent): void {
    const currentIndex = highlightedLocaleIndex(filteredCodes, highlightedCode);
    const result = handleLanguageSwitcherKey(event.key, currentIndex, filtered.length);
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (result.close) {
      close(true);
      return;
    }
    const highlighted = filtered[result.highlightedIndex];
    if (highlighted !== undefined) setHighlightedCode(highlighted.code as LocaleCode);
    if (result.selectIndex !== null) {
      const selected = filtered[result.selectIndex];
      if (selected !== undefined) select(selected.code as LocaleCode);
    }
  }

  return (
    <div className="languageSwitcher" ref={rootRef} onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={buttonRef}
        type="button"
        className="languageSwitcherButton"
        title={t(catalog, "chrome.changeLanguage")}
        aria-label={t(catalog, "chrome.changeLanguage")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => {
          if (open) close(false);
          else {
            setHighlightedCode(locale);
            setOpen(true);
          }
        }}
      >
        <span className="languageSwitcherFlag" aria-hidden>{current.flag}</span>
        <span className="languageSwitcherCode">{current.code.toUpperCase()}</span>
        <span className="languageSwitcherCaret" aria-hidden>{languageSwitcherCaret(open)}</span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="languageSwitcherPanel"
          role="dialog"
          aria-modal="false"
          aria-label={t(catalog, "chrome.interfaceLanguage")}
        >
          <div className="languageSwitcherHead">
            <span className="languageSwitcherTitle">{t(catalog, "chrome.interfaceLanguage")}</span>
            <span className="languageSwitcherCount">{LOCALES.length}</span>
            <span className="languageSwitcherCurrent">
              <span aria-hidden>{current.flag}</span>
              <span>{current.code.toUpperCase()}</span>
            </span>
          </div>
          <div className="languageSwitcherSearch">
            <span aria-hidden>⌕</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label={t(catalog, "chrome.searchLanguage")}
              placeholder={t(catalog, "chrome.searchLanguage")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="languageSwitcherList">
            {TIERS.map((tier) => {
              const tierLocales = filtered.filter((candidate) => candidate.tier === tier);
              if (tierLocales.length === 0) return null;
              return (
                <section className="languageSwitcherGroup" key={tier} aria-label={t(catalog, TIER_KEYS[tier])}>
                  <div className="languageSwitcherGroupHead">
                    <span>{t(catalog, TIER_KEYS[tier])}</span>
                    <span className="languageSwitcherRule" aria-hidden />
                    <span>{tierLocales.length}</span>
                  </div>
                  <div className="languageSwitcherGrid">
                    {tierLocales.map((candidate) => {
                      const selected = candidate.code === locale;
                      const highlighted = candidate.code === highlightedCode;
                      return (
                        <button
                          type="button"
                          key={candidate.code}
                          className="languageSwitcherRow"
                          data-current={selected || undefined}
                          data-highlighted={highlighted || undefined}
                          aria-current={selected ? "true" : undefined}
                          onPointerMove={() => setHighlightedCode(candidate.code as LocaleCode)}
                          onFocus={() => setHighlightedCode(candidate.code as LocaleCode)}
                          onClick={() => select(candidate.code as LocaleCode)}
                        >
                          <span className="languageSwitcherFlag" aria-hidden>{candidate.flag}</span>
                          <span className="languageSwitcherRowCode">{candidate.code.toUpperCase()}</span>
                          <span className="languageSwitcherName">{candidate.nativeName}</span>
                          <span className="languageSwitcherCheck" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
