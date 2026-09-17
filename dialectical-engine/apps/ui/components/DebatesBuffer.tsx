import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicDebateSummary } from "@debateai/contract";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";

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
  state
}: {
  href: string;
  claim: string;
  by?: string;
  meta: string;
  models: readonly string[];
  status: string;
  state: "complete" | "generating" | "failed" | "contested" | "unsupported";
}) {
  return (
    <Link className="libRow" href={href}>
      <div className="libRowBody">
        <div className="libRowClaim">{claim}</div>
        <p className="libRowMeta">
          {by === undefined ? null : <>By <span className="libRowBy">{by}</span> · </>}
          {meta}
        </p>
      </div>
      {models.length > 0 ? (
        <div className="libDots" aria-hidden>
          {models.slice(0, 5).map((model) => {
            const meta = modelMeta(model);
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
      <span className="libStatus" data-state={state}>{status}</span>
      <span className="libArrow" aria-hidden>→</span>
    </Link>
  );
}

export function DebatesBuffer({ debates }: { readonly debates: readonly DebateSummary[] }) {
  if (debates.length === 0) {
    return <div className="libEmpty">No debates yet — post the first claim above.</div>;
  }
  return debates.map((debate) => {
    const failed = debate.status === "failed";
    const meta = debate.terminal_reason === null || debate.terminal_reason === undefined
      ? joinMeta([relativeTime(debate.created_at),
         debate.models.length > 0
           ? `${debate.models.length} model${debate.models.length === 1 ? "" : "s"}`
           : null])
      : `Debate generation failed: ${debate.terminal_reason}`;
    return (
      <LibraryRow
        key={debate.id}
        href={`/debate/${debate.id}`}
        claim={debate.topic}
        meta={meta}
        models={debate.models}
        status={statusLabel(debate.status)}
        state={failed ? "failed" : isComplete(debate.status) ? "complete" : "generating"}
      />
    );
  });
}

/* Public summaries carry only model IDs already disclosed by the published
   nodes. Legacy answer-only publications keep the same typed absence. */
export function PublicDebatesBuffer({
  debates
}: {
  readonly debates: readonly PublicDebateSummary[];
}) {
  if (debates.length === 0) {
    return <div className="libEmpty">No debates have been published yet.</div>;
  }
  return debates.map((debate) => {
    const models = debate.models ?? [];
    const modelCount = models.length > 0
      ? `${models.length} model${models.length === 1 ? "" : "s"}`
      : null;
    const verdict = debate.verdict === null
      ? "Verdict unavailable"
      : debate.verdict.charAt(0) + debate.verdict.slice(1).toLowerCase();
    return (
      <LibraryRow
        key={debate.public_ref}
        href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}
        claim={debate.question}
        by={debate.author_pseudonym}
        meta={joinMeta([
          relativeTime(debate.published_at),
          modelCount,
          debate.confidence_band?.toLowerCase()
        ])}
        models={debate.models ?? []}
        status={verdict}
        state={debate.verdict === null
          ? "generating"
          : debate.verdict === "CONTESTED"
            ? "contested"
            : debate.verdict === "UNSUPPORTED"
              ? "unsupported"
              : "complete"}
      />
    );
  });
}
