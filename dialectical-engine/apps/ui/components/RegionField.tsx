"use client";

import { useEffect, useRef, useState, type JSX, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  REGION_CONTINENTS,
  REGION_COUNTRIES,
  US_STATES,
  regionContinentOf,
  regionFlag,
  regionCountryName,
  regionCountriesOf,
  type RegionContinent
} from "@debateai/kernel";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export type RegionPick = Readonly<{ country: string | null; usState: string }>;
export const EMPTY_REGION_PICK: RegionPick = { country: null, usState: "" };

function continentName(catalog: MessageCatalog, continent: RegionContinent): string {
  switch (continent) {
    case "Africa": return t(catalog, "auth.region.continent.africa");
    case "Asia": return t(catalog, "auth.region.continent.asia");
    case "Europe": return t(catalog, "auth.region.continent.europe");
    case "Middle East": return t(catalog, "auth.region.continent.middleEast");
    case "North America": return t(catalog, "auth.region.continent.northAmerica");
    case "South America": return t(catalog, "auth.region.continent.southAmerica");
    case "Oceania": return t(catalog, "auth.region.continent.oceania");
  }
}

/** How many columns the country grid shows as laid out (two; one in a narrow container), read from the page. */
function gridColumns(grid: HTMLElement | null): number {
  if (grid === null || typeof getComputedStyle !== "function") return 2;
  /* The resolved value is one length per column ("130px 130px"); a declared one may hold functions ("minmax(0, 1fr)"). */
  const tracks = getComputedStyle(grid).gridTemplateColumns.replace(/\([^()]*\)/g, "").trim();
  return tracks === "" || tracks === "none" ? 2 : tracks.split(/\s+/).length;
}

/** A name compared without case or accents, for typing a letter to jump to a country. */
function plain(text: string, locale: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase(locale);
}

export function RegionField({
  catalog, locale, value, onChange, disabled, errorId, idPrefix = "signup-region", label, placeholder, askUsState = true
}: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  value: RegionPick;
  onChange: (next: RegionPick) => void;
  disabled: boolean;
  /** The id of the error shown under the picker, while one is shown. */
  errorId?: string;
  /** The ids' prefix, so a page other than sign-up (the pricing page) can hold its own picker. */
  idPrefix?: string;
  /** The visible label and the empty trigger's text; sign-up's "Region" and "Select your region" by default. */
  label?: string;
  placeholder?: string;
  /** Sign-up asks a US resident's state; the pricing page asks the postal code instead, as the checkout does. */
  askUsState?: boolean;
}>): JSX.Element {
  const triggerId = `${idPrefix}-trigger`;
  const popoverId = `${idPrefix}-popover`;
  const valueId = `${idPrefix}-value`;
  const stateId = `${idPrefix}-state`;
  const [open, setOpen] = useState(false);
  const [continent, setContinent] = useState<RegionContinent | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const firstContinentRef = useRef<HTMLButtonElement | null>(null);
  /* Keyboard audit round 4: the country grid is one Tab stop, moved with the arrow keys (roving tabindex). */
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [stopCode, setStopCode] = useState<string | null>(null);
  const pickedContinent = value.country === null ? null : regionContinentOf(value.country);

  useEffect(() => {
    if (!open) return undefined;
    const onOutsidePress = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    };
    document.addEventListener("mousedown", onOutsidePress);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutsidePress);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function toggle(): void {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    setContinent(pickedContinent);
    setStopCode(null);
    setOpen(true);
  }

  function showCountries(next: RegionContinent): void {
    if (disabled) return;
    setContinent(next);
    setStopCode(null);
    queueMicrotask(() => backRef.current?.focus());
  }

  function showContinents(): void {
    if (disabled) return;
    /* Back lands on the continent just left, not the first one (keyboard audit 2026-11-12). */
    const left = continent;
    setContinent(null);
    queueMicrotask(() => (wrapperRef.current?.querySelector<HTMLButtonElement>(`.regionContinent[data-continent="${left}"]`) ?? firstContinentRef.current)?.focus());
  }

  function pickCountry(code: string): void {
    if (disabled) return;
    onChange({ country: code, usState: code === "US" ? value.usState : "" });
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  const countries = continent === null ? [] : regionCountriesOf(continent, locale).map(({ code }) => code);
  /* The stop: where the arrows last left it, else the chosen country, else the first. */
  const stop = stopCode !== null && countries.includes(stopCode) ? stopCode
    : value.country !== null && countries.includes(value.country) ? value.country : countries[0] ?? null;

  function onCountryKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, code: string): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const at = countries.indexOf(code);
    const rtl = event.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
    const columns = gridColumns(gridRef.current);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight": next = at + (rtl ? -1 : 1); break;
      case "ArrowLeft": next = at + (rtl ? 1 : -1); break;
      case "ArrowDown": next = at + columns; break;
      case "ArrowUp": next = at - columns; break;
      case "Home": next = 0; break;
      case "End": next = countries.length - 1; break;
      default: {
        /* A letter jumps to the next country whose name starts with it (Space still picks). */
        if (event.key.length !== 1 || event.key.trim() === "") return;
        const letter = plain(event.key, locale);
        const order = [...countries.slice(at + 1), ...countries.slice(0, at + 1)];
        const found = order.find((candidate) => plain(regionCountryName(candidate, locale), locale).startsWith(letter));
        if (found === undefined) return;
        next = countries.indexOf(found);
      }
    }
    event.preventDefault();
    if (next < 0 || next >= countries.length) return;
    const target = countries[next]!;
    setStopCode(target);
    gridRef.current?.querySelector<HTMLButtonElement>(`.regionCountry[data-code="${target}"]`)?.focus();
  }

  return (
    <div className="authField regionField" ref={wrapperRef} onKeyDown={(event) => {
      if (!open || event.key !== "Tab") return;
      const last = wrapperRef.current?.querySelector(".regionContinent:last-of-type, .regionCountry:last-of-type");
      /* The country grid is one stop, so Tab from any country leaves the popover. */
      const fromCountry = event.target instanceof Element && event.target.classList.contains("regionCountry");
      if ((!event.shiftKey && (event.target === last || fromCountry)) || (event.shiftKey && event.target === triggerRef.current)) setOpen(false);
    }}>
      <label htmlFor={triggerId}>{label ?? t(catalog, "auth.region.label")}</label>
      <div className="regionPicker">
      <button
        type="button"
        id={triggerId}
        className="regionTrigger"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        // The label names the button "Region"; the chosen country (or the placeholder) and any error
        // are its description, so a screen reader says what is picked.
        aria-describedby={errorId ? `${valueId} ${errorId}` : valueId}
        disabled={disabled}
        onClick={toggle}
      >
        {value.country === null ? null : <span className="regionFlag">{regionFlag(value.country)}</span>}
        <span className="regionName" id={valueId}>{value.country === null ? placeholder ?? t(catalog, "auth.region.placeholder") : regionCountryName(value.country, locale)}</span>
        {value.country === null || pickedContinent === null ? null : <span className="regionPath">{continentName(catalog, pickedContinent)} · {value.country}</span>}
        <span className="regionChevron" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="regionPopover" id={popoverId}>
          {continent === null ? (
            <>
              <div className="regionHeader">{t(catalog, "auth.region.continentHeader")}</div>
              {REGION_CONTINENTS.map((row, index) => (
                <button
                  type="button"
                  className="regionContinent"
                  data-continent={row}
                  key={row}
                  disabled={disabled}
                  ref={index === 0 ? firstContinentRef : undefined}
                  onClick={() => showCountries(row)}
                >
                  <span className="regionContinentName">{continentName(catalog, row)}</span>
                  <span className="regionCount">{String(REGION_COUNTRIES.filter((country) => country.continent === row).length)}</span>
                  <span className="regionChevronRight" aria-hidden="true">›</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="regionTop">
                <button type="button" className="regionBack" ref={backRef} disabled={disabled} onClick={showContinents}>{t(catalog, "auth.region.back")}</button>
                <span className="regionContinentTitle" id={`${popoverId}-continent`}>{continentName(catalog, continent)}</span>
              </div>
              {/* Round 4 review: one Tab stop moved with the arrow keys, so a list a screen reader names and counts ("1 of 35"). */}
              <div className="regionGrid" ref={gridRef} role="listbox" aria-labelledby={`${popoverId}-continent`}>
                {countries.map((code) => (
                  <button type="button" role="option" aria-selected={code === value.country} className="regionCountry" data-code={code} data-picked={String(code === value.country)} key={code} disabled={disabled}
                    tabIndex={code === stop ? 0 : -1} onFocus={() => setStopCode(code)} onKeyDown={(event) => onCountryKeyDown(event, code)} onClick={() => pickCountry(code)}>
                    <span className="regionCellFlag">{regionFlag(code)}</span>
                    <span className="regionCellCode">{code}</span>
                    <span className="regionCellName">{regionCountryName(code, locale)}</span>
                    <span className="regionDiamond" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
      </div>
      {askUsState && value.country === "US" ? (
        <div className="regionState">
          <label htmlFor={stateId}>{t(catalog, "auth.region.stateLabel")}</label>
          <select id={stateId} name="us-state" className="regionStateSelect" data-state={value.usState === "" ? "bad" : "ok"} value={value.usState} disabled={disabled} onChange={(event) => onChange({ country: "US", usState: event.target.value })}>
            <option value="">{t(catalog, "auth.region.statePlaceholder")}</option>
            {US_STATES.map(({ code, name }) => <option value={code} key={code}>{name}</option>)}
          </select>
          {value.usState === ""
            ? <p className="authValidity" data-state="bad">{t(catalog, "auth.region.stateMissing")}</p>
            : <p className="authValidity" data-state="ok">{t(catalog, "auth.region.complete")}</p>}
        </div>
      ) : null}
    </div>
  );
}
