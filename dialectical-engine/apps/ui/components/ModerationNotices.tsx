"use client";
import { useEffect, useState } from "react";
import type { ContractClient, ModerationStatement } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import { formatDateAndTime, t, type MessageCatalog } from "@/lib/i18n/translate";
import type { LocaleCode } from "@/lib/i18n/locales";
import publicEnglish from "@/messages/en/public.json";
import newDebateEnglish from "@/messages/en/newDebate.json";

/*
 * 0157 (DSA Art 17; the owner's D1 of 6 November 2026): the person's statements of reasons, in full. The mail gives what was done, the source, the
 * automated means, the ground and the routes as fixed lines and links here; only this signed-in page shows the facts staff typed, the words the
 * automatic check found and the places corrected. The page reads the public catalogue, which every UI locale has.
 */
export function ModerationNoticesPageClient({ catalog = publicEnglish, newDebateCatalog = newDebateEnglish, locale = "en" }: Readonly<{
  catalog?: MessageCatalog; newDebateCatalog?: MessageCatalog; locale?: LocaleCode;
}>) {
  return (
    <AuthGate catalog={newDebateCatalog} legalGate={false}>
      {() => <ModerationNotices catalog={catalog} locale={locale} />}
    </AuthGate>
  );
}

export function ModerationNotices({ catalog, locale, client = contractClient }: Readonly<{ catalog: MessageCatalog; locale: LocaleCode; client?: Pick<ContractClient, "readModerationStatements"> }>) {
  const [statements, setStatements] = useState<readonly ModerationStatement[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => client.readModerationStatements()).then(
      (read) => { if (live) setStatements(read.statements); },
      () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [client]);
  return (
    <div className="screen scroll setScreen">
      <div className="setBody">
        <div className="setInner">
          <h1 className="setTitle">{t(catalog, "public.moderation.title")}</h1>
          <p className="setLede">{t(catalog, "public.moderation.intro")}</p>
          {failed ? <p className="setError" role="alert">{t(catalog, "public.moderation.unavailable")}</p>
            : statements === null ? null
            : statements.length === 0 ? <p className="setStatus" role="status">{t(catalog, "public.moderation.empty")}</p>
            : statements.map((statement) => <Statement key={statement.statement_id} statement={statement} catalog={catalog} locale={locale} />)}
        </div>
      </div>
    </div>
  );
}

/**
 * 0176 (what was left of M3, owner, 11 Nov 2026): the kinds told because their content left the page with someone else's. The rule they show is the other
 * content's, so its intro says so. A BACK notice restricts nothing: what happened and the link only, no source, rule or routes.
 */
const OTHER_CONTENT: ReadonlySet<ModerationStatement["kind"]> = new Set<ModerationStatement["kind"]>(["CONTRIBUTION_AFFECTED", "REPORT_AFFECTED", "CONTRIBUTION_DECIDED", "REPORT_DECIDED",
  "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF"]);
const BACK: ReadonlySet<ModerationStatement["kind"]> = new Set<ModerationStatement["kind"]>(["CONTRIBUTION_BACK", "REPORT_BACK"]);

function Statement({ statement, catalog, locale }: Readonly<{ statement: ModerationStatement; catalog: MessageCatalog; locale: LocaleCode }>) {
  const { ground } = statement;
  const back = BACK.has(statement.kind);
  // A staff hide relies on the hold alone; what the review is about is said apart, as not yet decided. The automatic hide relied on the rule it found (D2).
  const relied = ground.automated_decision ? [...new Set([...ground.grounds, ...ground.suspected])] : ground.grounds;
  const suspected = ground.automated_decision ? [] : ground.suspected.filter((code) => !ground.grounds.includes(code));
  return (
    <section className="setCard" id={statement.statement_id} aria-labelledby={`${statement.statement_id}-title`} data-statement-kind={statement.kind}>
      <h2 className="setCardTitle" id={`${statement.statement_id}-title`}>{t(catalog, `public.moderation.kind.${statement.kind}`)}</h2>
      <p className="setCardHint">{t(catalog, "public.moderation.on", { date: formatDateAndTime(locale, statement.happened_at) })}</p>
      <p>{t(catalog, `public.moderation.what.${statement.kind}`)}</p>
      <p>
        <a className="setBtnQuiet" href={`/public/debate/${encodeURIComponent(statement.public_ref)}`}>{t(catalog, "public.moderation.openDebate")}</a>{" "}
        {t(catalog, statement.hidden_now ? "public.moderation.nowHidden" : "public.moderation.nowPublic")}
      </p>
      {back ? null : <>
      {ground.sources.map((source) => <p key={source}>{t(catalog, `public.moderation.source.${source}`)}</p>)}
      <p>{t(catalog, ground.automated_decision ? "public.moderation.automatedDecision"
        : ground.automated_detection ? "public.moderation.automatedDetection" : "public.moderation.noAutomation")}</p>
      {!ground.recorded ? <p>{t(catalog, "public.moderation.groundNone")}</p> : (
        <>
          <p>{t(catalog, OTHER_CONTENT.has(statement.kind) ? "public.moderation.groundIntroOther" : "public.moderation.groundIntro")}</p>
          <ul>{relied.map((code) => <li key={code}>{t(catalog, `public.moderation.ground.${code}`)}</li>)}</ul>
          {/* 0172 (M7; DSA Art 17(3)(d)): the law an ILLEGAL ground relies on, in staff's own words; on this page and in the export, never in a mail. */}
          {ground.law !== null ? <p data-statement-law dir="auto">{t(catalog, "public.moderation.law", { law: ground.law })}</p> : null}
        </>
      )}
      {suspected.length > 0 ? (
        <>
          <p>{t(catalog, "public.moderation.suspectedIntro")}</p>
          <ul>{suspected.map((code) => <li key={code}>{t(catalog, `public.moderation.ground.${code}`)}</li>)}</ul>
        </>
      ) : null}
      {statement.facts_deleted ? <p>{t(catalog, "public.moderation.factsDeleted")}</p> : statement.facts.length > 0 ? (
        <>
          <p>{t(catalog, "public.moderation.factsIntro")}</p>
          {statement.facts.map((fact, index) => <p key={index} dir="auto" className="setCardNote">{fact}</p>)}
        </>
      ) : null}
      {statement.quote !== null ? (
        <>
          <p>{t(catalog, "public.moderation.quoteIntro")}</p>
          <blockquote dir="auto" className="setCardNote">{statement.quote}</blockquote>
        </>
      ) : null}
      {statement.places.length > 0 ? (
        <>
          <p>{t(catalog, "public.moderation.placesIntro")}</p>
          <ul>{statement.places.map((place) => <li key={`${place.piece_kind}${place.pointer}`}>{t(catalog, `public.moderation.place.${place.piece_kind}`, { pointer: place.pointer })}</li>)}</ul>
        </>
      ) : null}
      <p>{t(catalog, "public.moderation.routes")}</p>
      </>}
    </section>
  );
}
