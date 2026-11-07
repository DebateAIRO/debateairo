"use client";

import type { AnswerMainAnswer, MainAnswerVersion } from "@debateai/contract";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";

/** The owner's answer to question 4 (5 Nov 2026, A): "Updated on …" and each earlier version's date, long with the year. */
const LONG_DATE: Intl.DateTimeFormatOptions = Object.freeze({ dateStyle: "long" });

/**
 * Decision 3 of 31 Oct: when a first-debate path changes, the main answer is rewritten and checked. The latest version stands at the top
 * of the debate, with why it changed, and the earlier ones stay readable under it. Nothing here until a path has changed the answer (the
 * first answer is on the map as before). Never a score, a price or who paid.
 */
function Segments({ version }: Readonly<{ version: MainAnswerVersion }>) {
  return (
    <div className="v4MainAnswerText" data-ai-generated="true">
      {version.segments.map((segment, at) => <p key={at}>{segment.text}</p>)}
    </div>
  );
}

export function V4MainAnswer(props: Readonly<{ mainAnswer: AnswerMainAnswer | null | undefined; catalog: MessageCatalog; locale: string }>) {
  const { mainAnswer, catalog, locale } = props;
  if (mainAnswer === null || mainAnswer === undefined) return null;
  const current = mainAnswer.current;
  const earlier = mainAnswer.history.slice(0, -1).reverse();
  return (
    <section className="v4MainAnswer" aria-label={t(catalog, "v4.mainAnswer.title")}>
      {current === null ? null : (
        <>
          <h2 className="v4MainAnswerTitle">{t(catalog, "v4.mainAnswer.title")}</h2>
          <Segments version={current} />
          <p className="v4MainAnswerNote v4Muted">
            {t(catalog, `v4.mainAnswer.trigger.${current.trigger}`)} {t(catalog, "v4.mainAnswer.updated", { date: formatDate(locale, current.updated_at, LONG_DATE) })}
          </p>
          {current.with_reservation === true ? <p className="v4MainAnswerNote v4Muted">{t(catalog, "v4.mainAnswer.reservation")}</p> : null}
        </>
      )}
      {mainAnswer.writing === true ? <p className="v4MainAnswerNote v4Muted" role="status">{t(catalog, "v4.mainAnswer.writing")}</p> : null}
      {earlier.length === 0 ? null : (
        <details className="v4MainAnswerEarlier">
          <summary>{t(catalog, "v4.mainAnswer.earlier")}</summary>
          {earlier.map((version) => (
            <article key={version.version} className="v4MainAnswerVersion">
              <h3 className="v4MainAnswerVersionTitle">{t(catalog, "v4.mainAnswer.version", { version: version.version, date: formatDate(locale, version.updated_at, LONG_DATE) })}</h3>
              <Segments version={version} />
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
