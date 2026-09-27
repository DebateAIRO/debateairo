"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { dismissLanguageOffer, languageOfferDismissed, subscribeLanguageOffer, writeLocaleCookie } from "@/lib/i18n/localeChoice";
import type { LocaleCode, LocaleDefinition } from "@/lib/i18n/locales";
import { languageNameIn, languageOfferLocale } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * A catalogue sentence with its placeholders filled as React nodes, so the
 * language's own name can be isolated as a run of its own (`<bdi>`, in that
 * language): an Arabic name inside an English sentence, or a Latin one inside a
 * Hebrew sentence, keeps its own direction.
 */
function fill(template: string, values: Readonly<Record<string, ReactNode>>): ReactNode {
  return template.split(/(\{[A-Za-z]+\})/u).map((part, index) => {
    const name = /^\{([A-Za-z]+)\}$/u.exec(part)?.[1];
    return <Fragment key={index}>{name !== undefined && name in values ? values[name] : part}</Fragment>;
  });
}

/**
 * The offer itself, for a language the reader has not dismissed. It names the
 * language in the INTERFACE's words with its own name in brackets ("This debate
 * is in Romanian (Română)"); where the interface cannot name it, it names it
 * once, in its own words. Exported for the owner's static preview, which shows
 * the strip as a first-time reader sees it.
 */
export function LanguageOfferStrip({
  target,
  interfaceLocale,
  catalog
}: {
  target: LocaleDefinition;
  interfaceLocale: LocaleCode;
  catalog: MessageCatalog;
}) {
  const code = target.code as LocaleCode;
  const nativeName = <bdi lang={code}>{target.nativeName}</bdi>;
  const interfaceName = languageNameIn(code, interfaceLocale);
  const language = interfaceName ?? nativeName;
  const text = interfaceName === null
    ? fill(t(catalog, "chrome.languageOffer.textNative"), { language })
    : fill(t(catalog, "chrome.languageOffer.text"), { language, nativeName });
  return (
    <section className="languageOffer" aria-label={t(catalog, "chrome.languageOffer.label")}>
      <p className="languageOfferText">{text}</p>
      <div className="languageOfferActions">
        <button
          type="button"
          className="languageOfferSwitch"
          onClick={() => {
            writeLocaleCookie(code);
            window.location.reload();
          }}
        >
          {fill(t(catalog, "chrome.languageOffer.switch"), { language })}
        </button>
        <button type="button" className="languageOfferDismiss" onClick={() => dismissLanguageOffer(code)}>
          {t(catalog, "chrome.languageOffer.dismiss")}
        </button>
      </div>
    </section>
  );
}

type OfferState = "unchecked" | "offered" | "dismissed";

/**
 * The offer to show the debate page in the question's language (spec
 * 2026-09-26 §14.3). It shows only when the question's locale is one of the 35
 * and differs from the interface locale, and it is written in the INTERFACE
 * locale (`catalog` is the page's `chrome` catalogue). Switching writes dev's
 * locale cookie and reloads, exactly as the language switcher does. "No,
 * thanks" hides it for the rest of the browser session; the story panel and
 * the report then stay in the question's language, the rest of the page in
 * the reader's.
 *
 * The dismissal lives in the browser only, so the server renders nothing and
 * the offer appears once the browser has checked it (fix round 1): a reader who
 * said "No, thanks" never sees it flash in and out on a reload.
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
  const state = useSyncExternalStore<OfferState>(
    subscribeLanguageOffer,
    () => target === null || languageOfferDismissed(target.code as LocaleCode) ? "dismissed" : "offered",
    () => "unchecked"
  );
  if (target === null || state !== "offered") return null;
  return <LanguageOfferStrip target={target} interfaceLocale={interfaceLocale} catalog={catalog} />;
}
