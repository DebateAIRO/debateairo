import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { PublicDebateSummary } from "@debateai/contract";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { runFailureMessage } from "@/lib/v3/runFailure";
import composeEnglish from "@/messages/en/compose.json";
import publicEnglish from "@/messages/en/public.json";
import { TakeDownControl } from "@/components/TakeDownControl";
import { RESET_TIME_MARK, ResetSentence } from "@/components/billing/ResetSentence";

/* The published verdict, in the reader's locale (it used to be the enum title-cased in English). */
// OWNER WORDING — approve before R2b's upload (Q1 ships live, engine 1 included). Q1 option 1: CONTESTED's word becomes the locale's
// close-call word, and SPLIT takes the old "Contested" word.
const VERDICT_KEYS: Readonly<Record<NonNullable<PublicDebateSummary["verdict"]>, string>> = {
  SUPPORTED: "home.verdict.supported",
  CONTESTED: "home.verdict.contested",
  UNSUPPORTED: "home.verdict.unsupported",
  SPLIT: "home.verdict.split"
};

/*
 * The row's status pill state per verdict: total over the contract's states, so a new state fails typecheck here.
 * Named for the pill, not the contract's own `VERDICT_STATES` list (B4, @debateai/contract): pre-flight PF-R2b5.12.
 */
const VERDICT_PILL_STATES: Readonly<Record<NonNullable<PublicDebateSummary["verdict"]>, "complete" | "contested" | "unsupported" | "split">> = {
  SUPPORTED: "complete",
  CONTESTED: "contested",
  UNSUPPORTED: "unsupported",
  // R2: no majority is never "complete".
  SPLIT: "split"
};

function joinMeta(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" · ");
}

/* The design document's Turn 3 library row: claim, meta line, overlapping
   model dots, a status pill and the arrow. */
function LibraryRow({
  href,
  claim,
  by,
  meta,
  models,
  status,
  state,
  generatedStatus = false,
  flagged = false,
  flagLabel,
  confidenceBand,
  catalog,
  composeCatalog
}: {
  href: string;
  claim: string;
  by?: string;
  meta: ReactNode;
  models: readonly string[];
  status: string;
  state: "complete" | "generating" | "failed" | "contested" | "unsupported" | "split";
  generatedStatus?: boolean;
  flagged?: boolean;
  flagLabel?: string;
  confidenceBand?: string | null;
  catalog: MessageCatalog;
  composeCatalog: MessageCatalog;
}) {
  const [byBefore, byAfter] = t(catalog, "home.by", { name: "\u0000" }).split("\u0000");
  return (
    <Link className="libRow" href={href} data-library-row data-bezel="shell" data-flagged={flagged ? "true" : undefined} style={{ background: "var(--shell)" }}>
      <div className="libRowCore" data-bezel="core" style={{ background: "var(--core)" }}>
        <div className="libRowBody">
          {flagged ? <div className="libFlag"><span className="libFlagMark" aria-hidden /><span className="libFlagLabel">{flagLabel ?? t(catalog, "home.flag.flagged")}</span></div> : null}
          <div className="libRowClaim">{claim}</div>
          <p className="libRowMeta">
            {by === undefined ? null : <>{byBefore}<span className="libRowBy">{by}</span>{byAfter} · </>}
            {meta}
            {confidenceBand ? <> · <span data-ai-generated="true">{confidenceBand}</span></> : null}
          </p>
        </div>
        {models.length > 0 ? (
          <div className="libDots" aria-hidden>
            {models.slice(0, 5).map((model) => {
              const meta = modelMeta(model, composeCatalog);
              return (
                <span
                  key={model}
                  className="libDot"
                  title={meta.name}
                  style={{ "--dot": meta.dot } as CSSProperties}
                />
              );
            })}
          </div>
        ) : null}
        <span className="libStatus" data-state={state} data-ai-generated={generatedStatus ? "true" : undefined}>{status}</span>
        <span className="libArrow" aria-hidden>→</span>
      </div>
    </Link>
  );
}

export function DebatesBuffer({
  debates,
  catalog,
  timeCatalog,
  locale,
  checkingLabel,
  composeCatalog = composeEnglish,
  publicCatalog = publicEnglish
}: {
  readonly debates: readonly DebateSummary[];
  catalog: MessageCatalog;
  timeCatalog: MessageCatalog;
  locale: string;
  checkingLabel: string;
  /** The reader's `compose` catalogue: model family names on the row dots. */
  composeCatalog?: MessageCatalog;
  publicCatalog?: MessageCatalog;
}) {
  if (debates.length === 0) {
    return <div className="libEmpty">{t(catalog, "home.noDebates")}</div>;
  }
  return debates.map((debate) => {
    const failed = debate.status === "failed";
    const checking = debate.synthesis_check === "CHECKING";
    const waitsUntil = debate.status === "waiting" ? debate.waits_until ?? null : null;
    // Budget spec §2.11: a waiting debate says when it will start (C). The time
    // is formatted in the reader's browser, in their own zone. Final review
    // Part 1b, Important 1: one that waits only for its person's own running
    // debates says so in C's place, with no time.
    // A failed row says what happened in the reader's words; its terminal
    // reason code is for operators and never reaches the page.
    const meta: ReactNode = waitsUntil !== null && debate.waits_for === "OWN_DEBATES"
      ? t(catalog, "home.status.waitingOwnDebates")
      : waitsUntil !== null
      ? <ResetSentence text={t(catalog, "home.status.waiting", { time: RESET_TIME_MARK })} at={waitsUntil} locale={locale} />
      : failed
        ? runFailureMessage(debate.terminal_reason, catalog)
        : joinMeta([relativeTime(debate.created_at, timeCatalog, locale),
           debate.models.length > 0
             ? tPlural(catalog, "home.models", debate.models.length, locale)
             : null]);
    const flagged = !checking && debate.synthesis_flag?.verdict === "FLAGGED";
    const labelKey = debate.publication_review?.review_state === "UNDER_REVIEW" ? "home.flag.underReview"
      : debate.publication_review?.review_state === "APPROVED" ? "home.flag.approved"
      : debate.publication_review?.review_state === "REFUSED" ? "home.flag.refused"
      : "home.flag.flagged";
    const row = (
      <LibraryRow
        key={debate.id}
        href={`/debate/${debate.id}`}
        claim={debate.topic}
        meta={meta}
        models={debate.models}
        status={checking ? checkingLabel : statusLabel(debate.status, timeCatalog)}
        state={checking ? "generating" : failed ? "failed" : isComplete(debate.status) ? "complete" : "generating"}
        flagged={flagged}
        flagLabel={t(catalog, labelKey)}
        catalog={catalog}
        composeCatalog={composeCatalog}
      />
    );
    if (!flagged || debate.publication_review?.visibility !== "PUBLISHED" || !debate.run_ref) return row;
    return <div className="libTakeDownGroup" key={debate.id}>{row}<TakeDownControl runRef={debate.run_ref} homeCatalog={catalog} publicCatalog={publicCatalog} /></div>;
  });
}

/* Public summaries carry only model IDs already disclosed by the published
   nodes. Legacy answer-only publications keep the same typed absence. */
export function PublicDebatesBuffer({
  debates,
  catalog,
  timeCatalog,
  locale,
  composeCatalog = composeEnglish
}: {
  readonly debates: readonly PublicDebateSummary[];
  catalog: MessageCatalog;
  timeCatalog: MessageCatalog;
  locale: string;
  /** The reader's `compose` catalogue: model family names on the row dots. */
  composeCatalog?: MessageCatalog;
}) {
  if (debates.length === 0) {
    return <div className="libEmpty">{t(catalog, "home.noPublishedDebates")}</div>;
  }
  return debates.map((debate) => {
    const models = debate.models ?? [];
    const modelCount = models.length > 0
      ? tPlural(catalog, "home.models", models.length, locale)
      : null;
    // A components-only snapshot whose label the engine kept (spec 2026-09-26
    // §14.4.4) shows that label, in the words every other row uses, instead of
    // "verdict unavailable" (Task M6).
    const label = debate.verdict ?? debate.floor_verdict ?? null;
    const verdict = label === null
      ? t(catalog, "home.verdictUnavailable")
      : t(catalog, VERDICT_KEYS[label]);
    return (
      <LibraryRow
        key={debate.public_ref}
        href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}
        claim={debate.question}
        by={debate.author_pseudonym}
        meta={joinMeta([
          relativeTime(debate.published_at, timeCatalog, locale),
          modelCount
        ])}
        confidenceBand={debate.confidence_band?.toLowerCase()}
        models={debate.models ?? []}
        status={verdict}
        generatedStatus={label !== null}
        state={label === null ? "generating" : VERDICT_PILL_STATES[label]}
        catalog={catalog}
        composeCatalog={composeCatalog}
      />
    );
  });
}
