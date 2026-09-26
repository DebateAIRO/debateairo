import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicDebateSummary } from "@debateai/contract";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import composeEnglish from "@/messages/en/compose.json";

/* The published verdict, in the reader's locale (it used to be the enum title-cased in English). */
const VERDICT_KEYS: Readonly<Record<NonNullable<PublicDebateSummary["verdict"]>, string>> = {
  SUPPORTED: "home.verdict.supported",
  CONTESTED: "home.verdict.contested",
  UNSUPPORTED: "home.verdict.unsupported"
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
  confidenceBand,
  catalog,
  composeCatalog
}: {
  href: string;
  claim: string;
  by?: string;
  meta: string;
  models: readonly string[];
  status: string;
  state: "complete" | "generating" | "failed" | "contested" | "unsupported";
  generatedStatus?: boolean;
  confidenceBand?: string | null;
  catalog: MessageCatalog;
  composeCatalog: MessageCatalog;
}) {
  const [byBefore, byAfter] = t(catalog, "home.by", { name: "\u0000" }).split("\u0000");
  return (
    <Link className="libRow" href={href} data-library-row>
      <div className="libRowBody">
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
    </Link>
  );
}

export function DebatesBuffer({
  debates,
  catalog,
  timeCatalog,
  locale,
  composeCatalog = composeEnglish
}: {
  readonly debates: readonly DebateSummary[];
  catalog: MessageCatalog;
  timeCatalog: MessageCatalog;
  locale: string;
  /** The reader's `compose` catalogue: model family names on the row dots. */
  composeCatalog?: MessageCatalog;
}) {
  if (debates.length === 0) {
    return <div className="libEmpty">{t(catalog, "home.noDebates")}</div>;
  }
  return debates.map((debate) => {
    const failed = debate.status === "failed";
    const meta = debate.terminal_reason === null || debate.terminal_reason === undefined
      ? joinMeta([relativeTime(debate.created_at, timeCatalog, locale),
         debate.models.length > 0
           ? tPlural(catalog, "home.models", debate.models.length, locale)
           : null])
      : t(catalog, "home.generationFailed", { reason: debate.terminal_reason });
    return (
      <LibraryRow
        key={debate.id}
        href={`/debate/${debate.id}`}
        claim={debate.topic}
        meta={meta}
        models={debate.models}
        status={statusLabel(debate.status, timeCatalog)}
        state={failed ? "failed" : isComplete(debate.status) ? "complete" : "generating"}
        catalog={catalog}
        composeCatalog={composeCatalog}
      />
    );
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
    const verdict = debate.verdict === null
      ? t(catalog, "home.verdictUnavailable")
      : t(catalog, VERDICT_KEYS[debate.verdict]);
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
        generatedStatus={debate.verdict !== null}
        state={debate.verdict === null
          ? "generating"
          : debate.verdict === "CONTESTED"
            ? "contested"
            : debate.verdict === "UNSUPPORTED"
              ? "unsupported"
              : "complete"}
        catalog={catalog}
        composeCatalog={composeCatalog}
      />
    );
  });
}
