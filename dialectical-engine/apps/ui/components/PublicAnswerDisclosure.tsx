import type { PublicDebate } from "@debateai/contract";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";

export function PublicAnswerDisclosure({
  answer,
  catalog,
  locale,
  engineLines = true
}: {
  answer: PublicDebate["answer"];
  catalog: MessageCatalog;
  locale: LocaleCode;
  /**
   * Owner's screen review, 3 Nov 2026 (public-f1): false on the V4 public page, which names no engine state. It then says only what a stranger needs:
   * that published debates may be indexed, and when the evidence dates from. True (the default): every line, as before.
   */
  engineLines?: boolean;
}) {
  return <div aria-label={t(catalog, "public.disclosure.aria")}>
    <p>{t(catalog, "public.disclosure.indexing")}</p>
    {engineLines ? <p>{t(catalog, "public.disclosure.answerStatus", { status: answer.terminal })}</p> : null}
    {engineLines && !answer.verdict_available
      ? <p>{t(catalog, "public.disclosure.verdictUnavailableMode")}</p>
      : null}
    {engineLines && answer.tree_included !== true
      ? <p>{t(catalog, "public.disclosure.legacySummaryOnly")}</p>
      : null}
    <p>{t(catalog, "public.disclosure.evidenceAsOf", {
      date: formatDate(locale, answer.as_of, { dateStyle: "short", timeStyle: "short" })
    })}</p>
  </div>;
}
