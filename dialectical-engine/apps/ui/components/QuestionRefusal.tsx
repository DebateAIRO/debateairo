"use client";

import * as React from "react";
import { ContractHttpError, type QuestionNotStarted } from "@debateai/contract";
import { useModalSurface } from "@/components/consent/modalSemantics";
import { useHideOutside } from "@/components/dialogSurface";
import { CrisisSupportDialog } from "@/components/CrisisSupport";
import { HarmHelpLine } from "@/components/HarmHelpLine";
import { resolveCrisisCountry } from "@/lib/crisisLines";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** V, 2026-10-28: a refusal carries its subject, its screen and whether to show the emergency number; nothing is kept. */
export type RefusalScreen = QuestionNotStarted | "UNAVAILABLE";

/** The question check's answer a failed ask carries: its subject's screen, "UNAVAILABLE" (503), or null when it is not the check's. */
export function questionRefusalOf(failure: unknown): RefusalScreen | null {
  if (!(failure instanceof ContractHttpError)) return null;
  if (failure.status === 422 && failure.questionNotStarted !== null) return failure.questionNotStarted;
  return failure.serverCode === "QUESTION_CHECK_UNAVAILABLE" ? "UNAVAILABLE" : null;
}

export function useQuestionRefusal({ catalog, locale, countryHint = null, backLabel }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint?: string | null;
  /**
   * V4 start step, Task 76 (ask-f7): the way back's words when the screen opens before the question's page step is done
   * (V4's step 2: "Edit my question"); absent, today's label for every other caller.
   */
  backLabel?: string;
}>): Readonly<{ offer(failure: unknown, about?: React.ReactNode): boolean; dialog: React.ReactNode }> {
  const [screen, setScreen] = React.useState<RefusalScreen | null>(null);
  const [about, setAbout] = React.useState<React.ReactNode>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  // V4 screen review (dig-f9, 3 Nov): `about` names what the screen is about when it opens a while after the press that
  // led to it (a V4 dig is sent 10 seconds after its click). Absent: the screen is as before.
  const offer = (failure: unknown, aboutLine?: React.ReactNode): boolean => {
    const refusal = questionRefusalOf(failure);
    if (refusal === null) return false;
    setHelpOpen(false);
    setAbout(aboutLine ?? null);
    setScreen(refusal);
    return true;
  };
  const dialog = helpOpen ? <CrisisSupportDialog catalog={catalog} locale={locale} countryHint={countryHint} onBack={() => setHelpOpen(false)} />
    : screen !== null ? <QuestionRefusalDialog
      catalog={catalog} locale={locale} countryHint={countryHint} screen={screen} about={about} backLabel={backLabel}
      onBack={() => setScreen(null)} onHelpNumbers={() => { setScreen(null); setHelpOpen(true); }}
    /> : null;
  return { offer, dialog };
}

// The complaint route is the Terms paragraph headed **Complaining about a decision.**
const COMPLAINT_ADDRESS = "office@dezbatere.ro";

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean);
}

function QuestionRefusalDialog({ catalog, locale, countryHint, screen, about = null, backLabel, onBack, onHelpNumbers }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint: string | null;
  screen: RefusalScreen;
  /** What the screen is about, said first (null: nothing, as before). */
  about?: React.ReactNode;
  /** The way back's words (absent: today's "Back to my question"). */
  backLabel?: string | undefined;
  onBack: () => void;
  onHelpNumbers: () => void;
}>): React.ReactElement {
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const titleRef = React.useRef<HTMLElement | null>(null);
  useHideOutside(dialogRef);
  useModalSurface(true, { containerRef: dialogRef, initialFocusRef: titleRef, onClose: onBack });
  const unavailable = screen === "UNAVAILABLE";
  const title = t(catalog, unavailable ? "home.questionRefusal.unavailableTitle" : "home.questionRefusal.title");
  const complain = t(catalog, "home.questionRefusal.complain", { months: t(catalog, "home.questionRefusal.months") });
  const [beforeAddress, afterAddress] = complain.split("{address}", 2);
  const refusal = unavailable ? null : screen;
  const country = refusal?.emergencyNumber === true
    ? resolveCrisisCountry({ hint: countryHint, browserLanguages: browserLanguages(), locale }) : null;
  return <div className="policyScrim">
    <div className="policyBezel questionRefusal" role="dialog" aria-modal="true"
      aria-labelledby={about !== null ? "question-refusal-about question-refusal-title" : "question-refusal-title"} data-dialog="question-refusal"
      ref={(node) => { dialogRef.current = node; }}>
      <div className="policyCore">
        <span className="policyTab" aria-hidden="true" />
        <div className="policyHead"><div className="policyHeadText">
          {about !== null ? <p id="question-refusal-about" className="crisisSupportLede" data-part="about">{about}</p> : null}
          <h2 id="question-refusal-title" className="policyTitle" tabIndex={-1}
            ref={(node) => { titleRef.current = node; }}>{title}</h2>
          <p className="crisisSupportLede" data-part="not-started">{t(catalog, "home.questionRefusal.notStarted")}</p>
          {unavailable ? <p className="crisisSupportLede" data-part="try-again">{t(catalog, "home.questionRefusal.unavailable")}</p>
            : <p className="crisisSupportLede" data-part="automatic">{t(catalog, "home.questionRefusal.automatic")}</p>}
        </div></div>
        <div className="crisisSupportBody">
          {refusal !== null ? (
            <>
              <p className="questionRefusalRule" data-part="rule">{t(catalog, "home.questionRefusal.rule")}</p>
              <p className="questionRefusalComplain" data-part="complain">
                {beforeAddress}<a className="crisisSupportAction" href={`mailto:${COMPLAINT_ADDRESS}`}>{COMPLAINT_ADDRESS}</a>{afterAddress}
              </p>
              {refusal.emergencyNumber ? <HarmHelpLine catalog={catalog} locale={locale} country={country} /> : null}
            </>
          ) : null}
          {(unavailable || refusal?.screen === "SENSITIVE") ? (
            <a className="crisisSupportElsewhere" data-part="help-numbers" href="#"
              onClick={(event) => { event.preventDefault(); onHelpNumbers(); }}>
              {t(catalog, "home.questionRefusal.helpNumbers")}
            </a>
          ) : null}
        </div>
        <div className="policyFoot">
          <span className="policyFootSpacer" />
          <button className="crisisSupportBack" type="button" data-part="back" onClick={onBack}>
            {backLabel ?? t(catalog, "home.questionRefusal.back")}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
