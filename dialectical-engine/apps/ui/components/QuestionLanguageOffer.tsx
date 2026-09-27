"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { dismissLanguageOffer, languageOfferDismissed, subscribeLanguageOffer, writeLocaleCookie } from "@/lib/i18n/localeChoice";
import type { LocaleCode, LocaleDefinition } from "@/lib/i18n/locales";
import { languageOfferLocale } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * A catalogue sentence with its {language} placeholder filled by the language's
 * own name, isolated as its own run of text (`<bdi>`, in that language), so an
 * Arabic name inside an English sentence, or a Latin one inside a Hebrew
 * sentence, keeps its own direction.
 */
function withLanguageName(template: string, target: LocaleDefinition): ReactNode {
  const parts = template.split("{language}");
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? <bdi lang={target.code}>{target.nativeName}</bdi> : null}
    </Fragment>
  ));
}

/**
 * The offer to show the debate page in the question's language (spec
 * 2026-09-26 §14.3). It shows only when the question's locale is one of the 35
 * and differs from the interface locale, and it is written in the INTERFACE
 * locale (`catalog` is the page's `chrome` catalogue). Switching writes dev's
 * locale cookie and reloads, exactly as the language switcher does. "No,
 * thanks" hides it for the rest of the browser session; the story panel and
 * the report then stay in the question's language, the rest of the page in
 * the reader's.
 */
export function QuestionLanguageOffer({
  questionLocale,
  interfaceLocale,
  catalog
}: {
  questionLocale: LocaleCode | null;
  interfaceLocale: LocaleCode;
  catalog: MessageCatalog;
}) {
  const target = languageOfferLocale(questionLocale, interfaceLocale);
  const dismissed = useSyncExternalStore(
    subscribeLanguageOffer,
    () => target !== null && languageOfferDismissed(target.code as LocaleCode),
    () => false
  );
  if (target === null || dismissed) return null;
  const code = target.code as LocaleCode;
  return (
    <section className="languageOffer" aria-label={t(catalog, "chrome.languageOffer.label")}>
      <p className="languageOfferText">{withLanguageName(t(catalog, "chrome.languageOffer.text"), target)}</p>
      <div className="languageOfferActions">
        <button
          type="button"
          className="languageOfferSwitch"
          onClick={() => {
            writeLocaleCookie(code);
            window.location.reload();
          }}
        >
          {withLanguageName(t(catalog, "chrome.languageOffer.switch"), target)}
        </button>
        <button type="button" className="languageOfferDismiss" onClick={() => dismissLanguageOffer(code)}>
          {t(catalog, "chrome.languageOffer.dismiss")}
        </button>
      </div>
    </section>
  );
}
