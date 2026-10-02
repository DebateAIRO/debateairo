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

function onActionKey(event: ReactKeyboardEvent<HTMLButtonElement>, action: () => void): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

export function RegionField({ catalog, locale, value, onChange, disabled }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  value: RegionPick;
  onChange: (next: RegionPick) => void;
  disabled: boolean;
}>): JSX.Element {
  const [open, setOpen] = useState(false);
  const [continent, setContinent] = useState<RegionContinent | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  const firstContinentRef = useRef<HTMLButtonElement | null>(null);
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
    setOpen(true);
  }

  function showCountries(next: RegionContinent): void {
    if (disabled) return;
    setContinent(next);
    queueMicrotask(() => backRef.current?.focus());
  }

  function showContinents(): void {
    if (disabled) return;
    setContinent(null);
    queueMicrotask(() => firstContinentRef.current?.focus());
  }

  function pickCountry(code: string): void {
    if (disabled) return;
    onChange({ country: code, usState: code === "US" ? value.usState : "" });
    setOpen(false);
    queueMicrotask(() => triggerRef.current?.focus());
  }

  return (
    <div className="authField regionField" ref={wrapperRef} onBlur={(event) => {
      if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }} onKeyDown={(event) => {
      if (!open || event.key !== "Tab") return;
      const last = wrapperRef.current?.querySelector(".regionContinent:last-of-type, .regionCountry:last-of-type");
      if ((!event.shiftKey && event.target === last) || (event.shiftKey && event.target === triggerRef.current)) setOpen(false);
    }}>
      <label htmlFor="signup-region-trigger">{t(catalog, "auth.region.label")}</label>
      <div className="regionPicker">
      <button
        type="button"
        id="signup-region-trigger"
        className="regionTrigger"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={open ? "signup-region-popover" : undefined}
        disabled={disabled}
        onClick={toggle}
      >
        {value.country === null ? null : <span className="regionFlag">{regionFlag(value.country)}</span>}
        <span className="regionName">{value.country === null ? t(catalog, "auth.region.placeholder") : regionCountryName(value.country, locale)}</span>
        {value.country === null || pickedContinent === null ? null : <span className="regionPath">{continentName(catalog, pickedContinent)} · {value.country}</span>}
        <span className="regionChevron" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="regionPopover" id="signup-region-popover">
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
                  onKeyDown={(event) => onActionKey(event, () => showCountries(row))}
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
                <button type="button" className="regionBack" ref={backRef} disabled={disabled} onClick={showContinents} onKeyDown={(event) => onActionKey(event, showContinents)}>{t(catalog, "auth.region.back")}</button>
                <span className="regionContinentTitle">{continentName(catalog, continent)}</span>
              </div>
              <div className="regionGrid">
                {regionCountriesOf(continent, locale).map(({ code }) => (
                  <button type="button" className="regionCountry" data-code={code} data-picked={String(code === value.country)} key={code} disabled={disabled} onClick={() => pickCountry(code)} onKeyDown={(event) => onActionKey(event, () => pickCountry(code))}>
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
      {value.country === "US" ? (
        <div className="regionState">
          <label htmlFor="signup-region-state">{t(catalog, "auth.region.stateLabel")}</label>
          <select id="signup-region-state" name="us-state" className="regionStateSelect" data-state={value.usState === "" ? "bad" : "ok"} value={value.usState} disabled={disabled} onChange={(event) => onChange({ country: "US", usState: event.target.value })}>
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
