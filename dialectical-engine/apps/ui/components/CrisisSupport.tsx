"use client";

import * as React from "react";
import { ContractHttpError, CRISIS_SUPPORT_OFFERED, detectCrisis, warmCrisisCheck } from "@debateai/contract";
import { useModalSurface } from "@/components/consent/modalSemantics";
import {
  CRISIS_LINES,
  FIND_A_HELPLINE_URL,
  crisisCountryOptions,
  formatCrisisHours,
  resolveCrisisCountry,
  type CrisisLine
} from "@/lib/crisisLines";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** True when the API refused a debate because the question reads as a person in crisis. */
export function isCrisisSupportRefusal(failure: unknown): boolean {
  return failure instanceof ContractHttpError && failure.status === 422
    && failure.serverCode === CRISIS_SUPPORT_OFFERED;
}

/**
 * Crisis check (V, 2026-09-30): "help numbers instead of debates for people who seem to be in a
 * crisis". `offerIfCrisis(question)` runs the same phrase check the API runs, before any other
 * step — before the consent screen, before the session is even checked — and, when it trips,
 * opens the help screen and answers `true`: the caller starts nothing. `offer()` opens it when
 * the API refused (`isCrisisSupportRefusal`). `dialog` is rendered by the caller.
 *
 * `flags(question)` lets a caller enable its Start control for a question too short to be a
 * debate that still trips the check ("我想死", "死にたい", "kys"), so pressing Start opens
 * the help screen instead of doing nothing. It answers `false` until the patterns are warm, so
 * a keystroke never waits for the first compile; the caller's Start runs `offerIfCrisis`
 * first either way.
 */
export function useCrisisSupport({
  catalog,
  locale,
  countryHint = null
}: Readonly<{ catalog: MessageCatalog; locale: string; countryHint?: string | null }>): Readonly<{
  offerIfCrisis: (question: string) => boolean;
  flags: (question: string) => boolean;
  offer: () => void;
  dialog: React.ReactElement | null;
}> {
  const [open, setOpen] = React.useState(false);
  // The first check compiles every pattern (close to a second). Do it in idle slices after the
  // composer appears, so the press of "Start" never waits for it.
  // `warm` re-renders the caller once every pattern is compiled, so a question that was already
  // in the field (a /new?topic= link) gets its Start control enabled by `flags`.
  const [warm, setWarm] = React.useState(false);
  React.useEffect(() => warmInIdleSlices(() => setWarm(true)), []);

  const offerIfCrisis = (question: string): boolean => {
    if (!detectCrisis(question).crisis) return false;
    setOpen(true);
    return true;
  };

  const dialog = open ? (
    <CrisisSupportDialog
      catalog={catalog}
      locale={locale}
      countryHint={countryHint}
      onBack={() => setOpen(false)}
    />
  ) : null;
  const flags = (question: string): boolean =>
    question.trim().length > 0 && (warm || warmCrisisCheck(() => false)) && detectCrisis(question).crisis;

  return { offerIfCrisis, flags, offer: () => setOpen(true), dialog };
}

function warmInIdleSlices(onWarm: () => void): () => void {
  let cancelled = false;
  let handle: ReturnType<typeof setTimeout> | undefined;
  const step = (): void => {
    if (cancelled) return;
    const until = performance.now() + 8;
    if (warmCrisisCheck(() => performance.now() < until)) onWarm();
    else handle = setTimeout(step, 16);
  };
  handle = setTimeout(step, 200);
  return () => {
    cancelled = true;
    if (handle !== undefined) clearTimeout(handle);
  };
}

/**
 * A phone number kept left to right inside right-to-left text (Arabic, Hebrew): without the
 * isolate, "800 725462" reads back as "725462 800".
 */
function isolate(number: string): string {
  return `\u2066${number}\u2069`;
}

/** The message with its `{number}` as a call link, for the emergency line. */
function withCallLink(message: string, number: string): React.ReactNode {
  const [before, after] = message.split("{number}", 2);
  if (after === undefined) return message;
  return (
    <>
      {before}
      <a className="crisisSupportEmergencyCall" href={`tel:${number}`}>{isolate(number)}</a>
      {after}
    </>
  );
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
}

export function CrisisSupportDialog({
  catalog,
  locale,
  countryHint,
  onBack
}: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint: string | null;
  onBack: () => void;
}>): React.ReactElement {
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const titleRef = React.useRef<HTMLElement | null>(null);
  const [country, setCountry] = React.useState<string>(() =>
    resolveCrisisCountry({ hint: countryHint, browserLanguages: browserLanguages(), locale }) ?? "");
  const options = crisisCountryOptions(locale);
  const entry = country === "" ? undefined : CRISIS_LINES[country];
  // Esc and "Back to my question" close it. The backdrop does not: a stray click must not take
  // the numbers away from someone who needs them.
  useModalSurface(true, { containerRef: dialogRef, initialFocusRef: titleRef, onClose: onBack });

  return (
    <div className="policyScrim">
      <div
        className="policyBezel crisisSupport"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crisis-support-title"
        aria-describedby="crisis-support-lede"
        data-dialog="crisis-support"
        ref={(node) => { dialogRef.current = node; }}
      >
        <div className="policyCore">
          <span className="policyTab" aria-hidden="true" />
          <div className="policyHead">
            <div className="policyHeadText">
              <div className="policyEyebrow">{t(catalog, "home.crisisSupport.eyebrow")}</div>
              <h2
                id="crisis-support-title"
                className="policyTitle"
                tabIndex={-1}
                ref={(node) => { titleRef.current = node; }}
              >
                {t(catalog, "home.crisisSupport.title")}
              </h2>
              <p id="crisis-support-lede" className="crisisSupportLede">
                {t(catalog, "home.crisisSupport.lede")}
              </p>
            </div>
          </div>
          <div className="crisisSupportBody">
            <label className="crisisSupportCountry">
              <span>{t(catalog, "home.crisisSupport.countryLabel")}</span>
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                {country === "" ? <option value="">—</option> : null}
                {options.map((option) => (
                  <option key={option.code} value={option.code}>{option.name}</option>
                ))}
              </select>
            </label>

            {entry === undefined ? (
              <p className="crisisSupportNote">{t(catalog, "home.crisisSupport.chooseCountry")}</p>
            ) : entry.lines.length === 0 ? (
              <p className="crisisSupportNote">
                {withCallLink(t(catalog, "home.crisisSupport.noVerifiedLine"), entry.emergency)}
              </p>
            ) : (
              <ul className="crisisSupportLines">
                {entry.lines.map((line) => (
                  <CrisisLineCard
                    key={`${line.name}-${line.phone ?? line.website}`}
                    catalog={catalog}
                    locale={locale}
                    line={line}
                  />
                ))}
              </ul>
            )}

            <p className="crisisSupportEmergency" role="note">
              {entry === undefined
                ? t(catalog, "home.crisisSupport.emergencyAnywhere")
                : withCallLink(t(catalog, "home.crisisSupport.emergency"), entry.emergency)}
            </p>
            <a className="crisisSupportElsewhere" href={FIND_A_HELPLINE_URL} target="_blank" rel="noopener noreferrer">
              {t(catalog, "home.crisisSupport.elsewhere")}
            </a>
            <p className="crisisSupportFine">
              {t(catalog, "home.crisisSupport.notSaved")} {t(catalog, "home.crisisSupport.misread")}
            </p>
          </div>
          <div className="policyFoot">
            <span className="policyFootSpacer" />
            <button type="button" className="crisisSupportBack" onClick={onBack}>
              {t(catalog, "home.crisisSupport.back")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CrisisLineCard({
  catalog,
  locale,
  line
}: Readonly<{ catalog: MessageCatalog; locale: string; line: CrisisLine }>): React.ReactElement {
  return (
    <li className="crisisSupportLine">
      <div className="crisisSupportLineHead">
        <span className="crisisSupportLineName">{line.name}</span>
        <span className="crisisSupportLineTags">
          {line.open247 ? <span>{t(catalog, "home.crisisSupport.open247")}</span> : null}
          {!line.open247 && line.hours !== null ? <span>{formatCrisisHours(line.hours, locale)}</span> : null}
          {line.free === true ? <span>{t(catalog, "home.crisisSupport.free")}</span> : null}
        </span>
      </div>
      <div className="crisisSupportLineActions">
        {line.phone !== null && line.tel !== null ? (
          <a className="crisisSupportCall" href={`tel:${line.tel}`}>
            {t(catalog, "home.crisisSupport.call", { number: isolate(line.phone) })}
          </a>
        ) : null}
        {line.sms !== null ? (
          <a className="crisisSupportAction" href={`sms:${line.sms.replace(/[^\d+]/g, "")}`}>
            {t(catalog, "home.crisisSupport.text", { number: isolate(line.sms) })}
          </a>
        ) : null}
        {line.chatUrl !== null ? (
          <a className="crisisSupportAction" href={line.chatUrl} target="_blank" rel="noopener noreferrer">
            {t(catalog, "home.crisisSupport.chat")}
          </a>
        ) : null}
        <a className="crisisSupportAction" href={line.website} target="_blank" rel="noopener noreferrer">
          {t(catalog, "home.crisisSupport.website")}
        </a>
      </div>
    </li>
  );
}
