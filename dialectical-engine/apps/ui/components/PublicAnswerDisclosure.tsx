import type { PublicDebate } from "@debateai/contract";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";

export function PublicAnswerDisclosure({
  answer,
  catalog,
  locale
}: {
  answer: PublicDebate["answer"];
  catalog: MessageCatalog;
  locale: LocaleCode;
}) {
  return <div aria-label={t(catalog, "public.disclosure.aria")}>
    <p>{t(catalog, "public.disclosure.indexing")}</p>
    <p>{t(catalog, "public.disclosure.answerStatus", { status: answer.terminal })}</p>
    {!answer.verdict_available
      ? <p>{t(catalog, "public.disclosure.verdictUnavailableMode")}</p>
      : null}
    {answer.tree_included !== true
      ? <p>{t(catalog, "public.disclosure.legacySummaryOnly")}</p>
      : null}
    <p>{t(catalog, "public.disclosure.evidenceAsOf", {
      date: formatDate(locale, answer.as_of, { dateStyle: "short", timeStyle: "short" })
    })}</p>
  </div>;
}
