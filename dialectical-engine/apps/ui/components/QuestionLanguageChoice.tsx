"use client";

import * as React from "react";
import type { QuestionLanguageOffer } from "@debateai/contract";
import { backdropCloseHandler, useModalSurface } from "@/components/consent/modalSemantics";
import { catalogLocale, type LocaleCode } from "@/lib/i18n/locales";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/** The person's answer to a real-mix offer. Esc, the backdrop and [Edit] are all "EDIT": nothing is sent. */
export type QuestionLanguageAnswer = "USE" | "KEEP" | "EDIT";

type NamedLanguage = QuestionLanguageOffer["main_language"];

/**
 * A language's name in the page's language (`Intl.DisplayNames`), or the server's English name when
 * the browser cannot name it. Greek running text writes language names in lower case, while CLDR
 * gives them capitalised ("Αγγλικά"), so for `el` the filled names are lowered (P2L Task 18).
 */
function languageName(language: NamedLanguage, locale: LocaleCode): string {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([locale], { type: "language", fallback: "none" }).of(language.code);
  } catch {
    name = undefined;
  }
  if (name === undefined || name.trim().length === 0 || name.toLowerCase() === language.code.toLowerCase()) {
    return language.name;
  }
  return catalogLocale(locale) === "el" ? name.toLocaleLowerCase("el") : name;
}

function languageList(names: readonly string[], locale: LocaleCode): string {
  try {
    return new Intl.ListFormat([locale], { type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/**
 * Question language (spec 2026-10-13, D1). When the server finds a real mix in the question, /new
 * shows this pop-up once per press of "Start debate": the languages it saw, named in the page's
 * language, and the server's one-language version, which the person can use, refuse, or go back
 * and edit. `ensureChoice` resolves with the person's answer; `dialog` is rendered by the caller.
 */
export function useQuestionLanguageChoice({
  catalog,
  locale
}: Readonly<{ catalog: MessageCatalog; locale: LocaleCode }>): Readonly<{
  ensureChoice: (offer: QuestionLanguageOffer) => Promise<QuestionLanguageAnswer>;
  dialog: React.ReactNode;
}> {
  const pending = React.useRef<((answer: QuestionLanguageAnswer) => void) | null>(null);
  const [offer, setOffer] = React.useState<QuestionLanguageOffer | null>(null);

  const settle = (answer: QuestionLanguageAnswer): void => {
    setOffer(null);
    const resolve = pending.current;
    pending.current = null;
    resolve?.(answer);
  };

  const ensureChoice = (next: QuestionLanguageOffer): Promise<QuestionLanguageAnswer> => {
    // One pop-up at a time: an unanswered earlier one counts as "Edit".
    pending.current?.("EDIT");
    setOffer(next);
    return new Promise<QuestionLanguageAnswer>((resolve) => { pending.current = resolve; });
  };

  const dialog = offer === null
    ? null
    : <QuestionLanguageChoiceDialog catalog={catalog} locale={locale} offer={offer} onAnswer={settle} />;
  return { ensureChoice, dialog };
}

function QuestionLanguageChoiceDialog({
  catalog,
  locale,
  offer,
  onAnswer
}: Readonly<{
  catalog: MessageCatalog;
  locale: LocaleCode;
  offer: QuestionLanguageOffer;
  onAnswer: (answer: QuestionLanguageAnswer) => void;
}>): React.ReactElement {
  const scrimRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const primaryRef = React.useRef<HTMLElement | null>(null);
  const edit = (): void => onAnswer("EDIT");
  // Esc, the backdrop and [Edit] all go back to the question: no dismissal sends anything.
  useModalSurface(true, { containerRef: dialogRef, initialFocusRef: primaryRef, onClose: edit });

  const body = t(catalog, "newDebate.languageCheck.body", {
    languages: languageList(offer.languages_seen.map((language) => languageName(language, locale)), locale),
    language: languageName(offer.main_language, locale)
  });

  return (
    <div className="policyScrim" ref={scrimRef} onClick={(event) => backdropCloseHandler(scrimRef.current, edit)(event)}>
      <div
        className="policyBezel sensitiveConsent questionLanguage"
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-language-title"
        aria-describedby="question-language-body"
        data-dialog="question-language"
        ref={(node) => { dialogRef.current = node; }}
      >
        <div className="policyCore">
          <span className="policyTab" aria-hidden="true" />
          <div className="policyHead">
            <div className="policyHeadText">
              <h2 id="question-language-title" className="policyTitle">{t(catalog, "newDebate.languageCheck.title")}</h2>
              <p id="question-language-body" className="policyLede">{body}</p>
            </div>
          </div>
          {/* The consent screen's body and statement styles: the proposal reads as the one thing to weigh. */}
          <div className="sensitiveConsentBody">
            {/* The label keeps the page's language; only the rewrite is in its own (and lines up by its own direction). */}
            <blockquote
              className="sensitiveConsentStatement questionLanguageProposal"
              aria-label={t(catalog, "newDebate.languageCheck.proposalLabel")}
            >
              <bdi lang={offer.main_language.code} dir="auto">{offer.proposed_question}</bdi>
            </blockquote>
          </div>
          <div className="policyFoot">
            <button
              type="button"
              className="policyPrimary"
              onClick={() => onAnswer("USE")}
              ref={(node) => { primaryRef.current = node; }}
            >
              {t(catalog, "newDebate.languageCheck.use")}
            </button>
            <button type="button" className="sensitiveConsentDecline questionLanguageKeep" onClick={() => onAnswer("KEEP")}>
              {t(catalog, "newDebate.languageCheck.keep")}
            </button>
            <button type="button" className="sensitiveConsentDecline questionLanguageEdit" onClick={edit}>
              {t(catalog, "newDebate.languageCheck.edit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
