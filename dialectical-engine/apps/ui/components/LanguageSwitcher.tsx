"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
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
  LOCALE_PREFERENCES,
  type LocaleCode
} from "@/lib/i18n/locales";
import { writeLocaleCookie } from "@/lib/i18n/localeChoice";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import {
  handleLanguageSwitcherKey,
  highlightedLocaleIndex,
  languageSwitcherCaret
} from "./languageSwitcherState";

export function LanguageSwitcher() {
  const { locale, catalog } = useChromeI18n();
  const current = getLocale(locale);
  const panelId = useId();
  const listId = `${panelId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 12, width: 470 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterLocales(query), [query]);
  const filteredCodes = useMemo(() => filtered.map(({ code }) => code as LocaleCode), [filtered]);
  const [highlightedCode, setHighlightedCode] = useState<LocaleCode>(locale);
  // A pointer press is under way: the blur it causes is the person's own click, never a focus loss to repair.
  const pressed = useRef(false);

  const close = useCallback((returnFocus = false): void => {
    setOpen(false);
    setQuery("");
    setHighlightedCode(locale);
    if (returnFocus) queueMicrotask(() => buttonRef.current?.focus());
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect(); if (!rect) return;
      const width = Math.min(470, window.innerWidth - 24);
      const height = panelRef.current?.offsetHeight ?? 424;
      setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)), left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width });
    };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    searchRef.current?.focus();
    pressed.current = false;
    const onPointerDown = (event: PointerEvent) => {
      pressed.current = true;
      if (rootRef.current?.contains(event.target as Node) || panelRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    const release = () => { pressed.current = false; };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("pointerup", release); document.addEventListener("pointercancel", release);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("pointerup", release); document.removeEventListener("pointercancel", release); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [close, open]);

  useEffect(() => {
    if (filteredCodes.length === 0) return;
    if (!filteredCodes.includes(highlightedCode)) setHighlightedCode(filteredCodes[0]);
  }, [filteredCodes, highlightedCode]);

  function select(code: LocaleCode): void {
    writeLocaleCookie(code);
    // The chosen row (or the search field) unmounts before the reload lands: focus waits on the trigger, not <body>.
    close(true);
    window.location.reload();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Tab" && panelRef.current?.contains(event.target as Node)) {
      // The panel sits at the end of <body>, so Tab out of it would leave the page: it closes and the step starts
      // from the trigger instead (Tab then moves on past it; Shift+Tab stays on it, the panel's place in the order).
      close(false);
      buttonRef.current?.focus();
      if (event.shiftKey) event.preventDefault();
      return;
    }
    const currentIndex = highlightedLocaleIndex(filteredCodes, highlightedCode);
    const result = handleLanguageSwitcherKey(event.key, currentIndex, filtered.length);
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", "Escape"].includes(event.key)) return;
    if (event.key === "Enter" && event.target !== searchRef.current) return;
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
    <div
      className="languageSwitcher"
      ref={rootRef}
      onKeyDown={open ? onKeyDown : undefined}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (rootRef.current?.contains(next) || panelRef.current?.contains(next)) return;
        // Focus that left for nowhere (no relatedTarget, no press: it would land on <body>) goes back to the
        // trigger; a Tab or click to another control keeps the person's own focus.
        close(open && next === null && !pressed.current);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="languageSwitcherButton"
        title={t(catalog, "chrome.changeLanguage")}
        aria-label={t(catalog, "chrome.changeLanguage")}
        aria-describedby={`${panelId}-current`}
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
        <span className="languageSwitcherCode" aria-hidden="true">{current.code.toUpperCase()}</span>
        {/* The button's description: the language in use, named in that language. */}
        <span id={`${panelId}-current`} className="srOnly" lang={current.code}>{current.nativeName}</span>
        <span className="languageSwitcherCaret" aria-hidden>{languageSwitcherCaret(open)}</span>
      </button>

      {open ? createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: position.top, left: position.left, right: "auto", bottom: "auto", width: position.width }}
          id={panelId}
          className="languageSwitcherPanel"
          role="dialog"
          aria-modal="false"
          aria-label={t(catalog, "chrome.interfaceLanguage")}
        >
          <div className="languageSwitcherHead">
            <span className="languageSwitcherTitle">{t(catalog, "chrome.interfaceLanguage")}</span>
            <span className="languageSwitcherCount">{LOCALE_PREFERENCES.length}</span>
            <span className="languageSwitcherCurrent">
              <span>{current.code.toUpperCase()}</span>
            </span>
          </div>
          <div className="languageSwitcherSearch">
            <span aria-hidden>⌕</span>
            <input
              ref={searchRef}
              type="search"
              role="combobox"
              value={query}
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filteredCodes.length > 0
                ? `${listId}-${filteredCodes.includes(highlightedCode) ? highlightedCode : filteredCodes[0]}`
                : undefined}
              aria-label={t(catalog, "chrome.searchLanguage")}
              placeholder={t(catalog, "chrome.searchLanguage")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="languageSwitcherList" id={listId} role="listbox">
            <div className="languageSwitcherGrid">
              {filtered.map((candidate) => {
                const selected = candidate.code === locale;
                const highlighted = candidate.code === highlightedCode;
                return (
                  <button
                    type="button"
                    key={candidate.code}
                    id={`${listId}-${candidate.code}`}
                    className="languageSwitcherRow"
                    role="option"
                    tabIndex={-1}
                    data-current={selected || undefined}
                    data-highlighted={highlighted || undefined}
                    aria-selected={selected}
                    aria-current={selected ? "true" : undefined}
                    onFocus={() => setHighlightedCode(candidate.code as LocaleCode)}
                    onClick={() => select(candidate.code as LocaleCode)}
                  >
                    <span className="languageSwitcherRowCode" aria-hidden="true">{candidate.code.toUpperCase()}</span>
                    {/* Each name in its own language, so a screen reader speaks it with that voice. */}
                    <span className="languageSwitcherName" lang={candidate.code}>{candidate.nativeName}</span>
                    <span className="languageSwitcherCheck" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>, document.body
      ) : null}
    </div>
  );
}
