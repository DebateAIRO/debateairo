"use client";

import {
  ClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState
} from "react";
import {
  checkDob,
  DOB_MIN_YEAR,
  parseDobPaste,
  type DobErrorCode,
  type DobPart,
  type DobParts
} from "@debateai/kernel";
import { dobErrorMessage, type DobLocale } from "@/lib/dob/dobLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export const EMPTY_DOB: DobParts = Object.freeze({ d: "", m: "", y: "" });

/** The id every failing input points at with aria-describedby (8l). */
export const DOB_MESSAGE_ID = "dob-msg";

const MAX_LENGTH: Readonly<Record<DobPart, number>> = { d: 2, m: 2, y: 4 };
const AUTOCOMPLETE: Readonly<Record<DobPart, string>> = { d: "bday-day", m: "bday-month", y: "bday-year" };

/** Which inputs a failed check marks (8f): the empty ones, the day and month, or the year. */
function flaggedParts(error: DobErrorCode, value: DobParts): ReadonlySet<DobPart> {
  switch (error) {
    case "incomplete":
      return new Set((["d", "m", "y"] as const).filter((part) =>
        part === "y" ? value.y.length < 4 : value[part].length === 0
      ));
    case "impossible":
      return new Set(["d", "m"]);
    case "before":
    case "future":
      return new Set(["y"]);
  }
}

type Cell = Readonly<{ text: string; value: string; disabled: boolean }>;

function pickerCells(part: DobPart, localeTag: string, decade: number, currentYear: number): readonly Cell[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (part === "d") {
    return Array.from({ length: 31 }, (_, i) => ({ text: String(i + 1), value: pad(i + 1), disabled: false }));
  }
  if (part === "m") {
    let format: Intl.DateTimeFormat;
    try {
      format = new Intl.DateTimeFormat(localeTag, { month: "short", timeZone: "UTC" });
    } catch {
      format = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
    }
    return Array.from({ length: 12 }, (_, i) => ({
      text: format.format(new Date(Date.UTC(2000, i, 1))),
      value: pad(i + 1),
      disabled: false
    }));
  }
  return Array.from({ length: 10 }, (_, i) => {
    const year = decade + i;
    return { text: String(year), value: String(year), disabled: year < DOB_MIN_YEAR || year > currentYear };
  });
}

const COLUMNS: Readonly<Record<DobPart, number>> = { d: 7, m: 3, y: 5 };

/**
 * The date-of-birth field — design document Turn 8 · 8d (typed + select), 8f
 * (states), 8g (order and script) and 8l (accessibility contract).
 *
 * Controlled: the parent owns the three parts and the submit-time error, and
 * clears the error on every edit (`onChange`). The ✓ line shows live once the
 * three parts make a valid date; errors show only after the parent sets one.
 */
export function DateOfBirthField({
  catalog,
  locale,
  value,
  error,
  onChange,
  disabled = false
}: Readonly<{
  catalog: MessageCatalog;
  locale: DobLocale;
  value: DobParts;
  error: DobErrorCode | null;
  onChange: (next: DobParts) => void;
  disabled?: boolean;
}>) {
  const idBase = useId();
  const inputRefs = useRef<Partial<Record<DobPart, HTMLInputElement | null>>>({});
  const pastingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [openPart, setOpenPart] = useState<DobPart | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState(0);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  /* The newest value, for handlers that run after a render they did not see. */
  const valueRef = useRef(value);
  valueRef.current = value;

  const order = locale.order;
  const labels: Readonly<Record<DobPart, string>> = {
    d: t(catalog, "auth.dob.day"),
    m: t(catalog, "auth.dob.month"),
    y: t(catalog, "auth.dob.year")
  };
  const currentYear = new Date().getUTCFullYear();
  const flagged = error === null ? new Set<DobPart>() : flaggedParts(error, value);
  const live = checkDob(value);
  const message = error !== null
    ? `✗ ${dobErrorMessage(catalog, error, order)}`
    : live.code === "ok" ? t(catalog, "auth.dob.valid") : "";
  const messageState = error !== null ? "bad" : live.code === "ok" ? "ok" : "idle";

  const focusPart = (part: DobPart | undefined) => {
    if (part !== undefined) inputRefs.current[part]?.focus();
  };
  const step = (part: DobPart, direction: 1 | -1) => focusPart(order[order.indexOf(part) + direction]);

  /* The year grid opens on the typed year's decade, or two decades before this one. */
  const defaultDecade = value.y.length === 4
    ? Math.floor(Number(value.y) / 10) * 10
    : Math.floor(currentYear / 10) * 10 - 20;
  const openDecade = decade ?? defaultDecade;
  const cells = openPart === null ? [] : pickerCells(openPart, locale.tag, openDecade, currentYear);

  /* Outside click closes the popover (8d). */
  useEffect(() => {
    if (openPart === null) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const wrapper = wrapperRef.current?.querySelector(`[data-dob-part="${openPart}"]`);
      if (wrapper && !wrapper.contains(event.target as Node)) setOpenPart(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openPart]);

  /* Opening the popover (or turning the decade) puts focus on the active cell. */
  useEffect(() => {
    if (openPart !== null) cellRefs.current[activeCell]?.focus();
  }, [openPart, activeCell, openDecade]);

  function openPicker(part: DobPart): void {
    if (openPart === part) {
      setOpenPart(null);
      return;
    }
    setDecade(null);
    const list = pickerCells(part, locale.tag, defaultDecade, currentYear);
    const selected = list.findIndex((cell) => cell.value === value[part]);
    const firstEnabled = list.findIndex((cell) => !cell.disabled);
    setActiveCell(selected >= 0 ? selected : Math.max(firstEnabled, 0));
    setOpenPart(part);
  }

  function closePicker(returnFocusTo: DobPart): void {
    setOpenPart(null);
    focusPart(returnFocusTo);
  }

  function pick(part: DobPart, cell: Cell): void {
    if (cell.disabled) return;
    onChange({ ...valueRef.current, [part]: cell.value });
    setOpenPart(null);
    const next = order[order.indexOf(part) + 1];
    /* The popover unmounts with the focused cell in it; focus lands on the next field, or back
       on this one when it is the last. */
    queueMicrotask(() => focusPart(next ?? part));
  }

  function turnDecade(direction: 1 | -1): void {
    const target = openDecade + direction * 10;
    if (target + 9 < DOB_MIN_YEAR || target > currentYear) return;
    setDecade(target);
    const list = pickerCells("y", locale.tag, target, currentYear);
    const firstEnabled = list.findIndex((cell) => !cell.disabled);
    setActiveCell(Math.max(firstEnabled, 0));
  }

  function onCellKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, part: DobPart, index: number): void {
    const columns = COLUMNS[part];
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    if (event.key in moves) {
      event.preventDefault();
      let next = index + moves[event.key]!;
      while (next >= 0 && next < cells.length && cells[next]!.disabled) next += Math.sign(moves[event.key]!);
      if (next >= 0 && next < cells.length) setActiveCell(next);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const enabled = cells.map((cell, i) => (cell.disabled ? -1 : i)).filter((i) => i >= 0);
      if (enabled.length > 0) setActiveCell(event.key === "Home" ? enabled[0]! : enabled[enabled.length - 1]!);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(part, cells[index]!);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker(part);
      return;
    }
    if (event.key === "Tab") setOpenPart(null);
  }

  function onInputChange(part: DobPart, raw: string): void {
    const previous = valueRef.current[part];
    const pasted = pastingRef.current;
    pastingRef.current = false;
    let digits = raw.replace(/\D/g, "");
    if (digits.length > MAX_LENGTH[part]) {
      /* Autofill or a drop can put a whole date in one box. */
      const parsed = parseDobPaste(raw, order);
      if (parsed !== null) {
        onChange(parsed);
        return;
      }
      digits = digits.slice(0, MAX_LENGTH[part]);
    }
    const inserted = digits.length > previous.length;
    if (inserted && !pasted && digits.length === 1) {
      if (part === "d" && Number(digits) > 3) digits = `0${digits}`;
      if (part === "m" && Number(digits) > 1) digits = `0${digits}`;
    }
    onChange({ ...valueRef.current, [part]: digits });
    if (inserted && !pasted && digits.length === MAX_LENGTH[part]) step(part, 1);
  }

  function onInputPaste(event: ClipboardEvent<HTMLInputElement>): void {
    const parsed = parseDobPaste(event.clipboardData.getData("text"), order);
    if (parsed === null) {
      /* A partial paste goes in as typed, but never advances focus. */
      pastingRef.current = true;
      return;
    }
    event.preventDefault();
    onChange(parsed);
    focusPart(order[order.length - 1]);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, part: DobPart): void {
    if (event.key === "Backspace" && event.currentTarget.value === "") {
      event.preventDefault();
      step(part, -1);
      return;
    }
    if (event.key === "ArrowDown" && event.altKey) {
      event.preventDefault();
      openPicker(part);
      return;
    }
    if (event.key === "Escape" && openPart !== null) {
      event.preventDefault();
      setOpenPart(null);
    }
  }

  return (
    <fieldset className="dobFieldset" dir={locale.dir} disabled={disabled}>
      <legend className="dobLegend">{t(catalog, "auth.dob.legend")}</legend>
      <div className="dobRow" ref={wrapperRef}>
        {order.map((part) => {
          const inputId = `${idBase}-${part}`;
          const popoverId = `${idBase}-${part}-picker`;
          const label = labels[part];
          const invalid = flagged.has(part);
          const isOpen = openPart === part;
          return (
            <div className="dobPart" data-part={part} key={part}>
              <label className="dobPartLabel" htmlFor={inputId}>{label}</label>
              <div className="dobControl" data-dob-part={part}>
                <input
                  id={inputId}
                  ref={(element) => { inputRefs.current[part] = element; }}
                  className="dobInput"
                  name={`dob-${part}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={AUTOCOMPLETE[part]}
                  maxLength={MAX_LENGTH[part]}
                  dir="ltr"
                  value={value[part]}
                  aria-invalid={invalid ? "true" : undefined}
                  aria-describedby={invalid ? DOB_MESSAGE_ID : undefined}
                  onChange={(event) => onInputChange(part, event.target.value)}
                  onPaste={onInputPaste}
                  onKeyDown={(event) => onInputKeyDown(event, part)}
                />
                <button
                  type="button"
                  className="dobPickerToggle"
                  aria-label={label}
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? popoverId : undefined}
                  onClick={() => openPicker(part)}
                >
                  <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen ? (
                  /* The last field's grid opens back over the row (inline-end), so it never
                     runs past the form's edge on a phone. */
                  <div
                    className="dobPopover"
                    data-part={part}
                    data-anchor={order.indexOf(part) === order.length - 1 ? "end" : "start"}
                  >
                    {part === "y" ? (
                      <div className="dobDecade" dir="ltr">
                        <button
                          type="button"
                          className="dobDecadeButton"
                          aria-label={t(catalog, "auth.dob.previousDecade")}
                          disabled={openDecade - 10 + 9 < DOB_MIN_YEAR}
                          onClick={() => turnDecade(-1)}
                        >‹</button>
                        <span className="dobDecadeLabel">{`${openDecade}–${openDecade + 9}`}</span>
                        <button
                          type="button"
                          className="dobDecadeButton"
                          aria-label={t(catalog, "auth.dob.nextDecade")}
                          disabled={openDecade + 10 > currentYear}
                          onClick={() => turnDecade(1)}
                        >›</button>
                      </div>
                    ) : null}
                    <div
                      id={popoverId}
                      className="dobGrid"
                      role="listbox"
                      aria-label={label}
                      dir="ltr"
                      style={{ gridTemplateColumns: `repeat(${COLUMNS[part]}, 1fr)` }}
                    >
                      {cells.map((cell, index) => {
                        const selected = cell.value === value[part];
                        return (
                          <div
                            key={cell.value}
                            ref={(element) => { cellRefs.current[index] = element; }}
                            className="dobCell"
                            role="option"
                            aria-selected={selected}
                            aria-disabled={cell.disabled ? "true" : undefined}
                            data-selected={selected ? "true" : undefined}
                            tabIndex={index === activeCell ? 0 : -1}
                            onClick={() => pick(part, cell)}
                            onKeyDown={(event) => onCellKeyDown(event, part, index)}
                          >
                            {cell.text}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <p className="authValidity dobMessage" id={DOB_MESSAGE_ID} aria-live="polite" data-state={messageState}>
        {message}
      </p>
    </fieldset>
  );
}
