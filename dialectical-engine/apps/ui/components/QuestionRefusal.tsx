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
type RefusalScreen = QuestionNotStarted | "UNAVAILABLE";

export function useQuestionRefusal({ catalog, locale, countryHint = null }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint?: string | null;
}>): Readonly<{ offer(failure: unknown): boolean; dialog: React.ReactNode }> {
  const [screen, setScreen] = React.useState<RefusalScreen | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const offer = (failure: unknown): boolean => {
    if (!(failure instanceof ContractHttpError)) return false;
    if (failure.status === 422 && failure.questionNotStarted !== null) {
      setHelpOpen(false);
      setScreen(failure.questionNotStarted);
      return true;
    }
    if (failure.serverCode === "QUESTION_CHECK_UNAVAILABLE") {
      setHelpOpen(false);
      setScreen("UNAVAILABLE");
      return true;
    }
    return false;
  };
  const dialog = helpOpen ? <CrisisSupportDialog catalog={catalog} locale={locale} countryHint={countryHint} onBack={() => setHelpOpen(false)} />
    : screen !== null ? <QuestionRefusalDialog
      catalog={catalog} locale={locale} countryHint={countryHint} screen={screen}
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

function QuestionRefusalDialog({ catalog, locale, countryHint, screen, onBack, onHelpNumbers }: Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint: string | null;
  screen: RefusalScreen;
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
      aria-labelledby="question-refusal-title" data-dialog="question-refusal"
      ref={(node) => { dialogRef.current = node; }}>
      <div className="policyCore">
        <span className="policyTab" aria-hidden="true" />
        <div className="policyHead"><div className="policyHeadText">
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
            {t(catalog, "home.questionRefusal.back")}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
