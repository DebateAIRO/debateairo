import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicDebateSummary } from "@debateai/contract";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";

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
  state: "complete" | "generating" | "failed";
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
      ? [relativeTime(debate.created_at),
         debate.models.length > 0
           ? `${debate.models.length} model${debate.models.length === 1 ? "" : "s"}`
           : null].filter((part) => part !== null).join(" · ")
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

/* The public tab. The published projection carries no model list, so these
   rows show no dots and no model count rather than inventing either. */
export function PublicDebatesBuffer({
  debates
}: {
  readonly debates: readonly PublicDebateSummary[];
}) {
  if (debates.length === 0) {
    return <div className="libEmpty">No debates have been published yet.</div>;
  }
  return debates.map((debate) => {
    const verdict = debate.verdict === null
      ? "Verdict unavailable"
      : debate.verdict.charAt(0) + debate.verdict.slice(1).toLowerCase();
    return (
      <LibraryRow
        key={debate.public_ref}
        href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}
        claim={debate.question}
        by={debate.author_pseudonym}
        meta={[relativeTime(debate.published_at), debate.confidence_band?.toLowerCase()]
          .filter((part) => part !== null && part !== undefined).join(" · ")}
        models={[]}
        status={verdict}
        state={debate.verdict === null ? "generating" : "complete"}
      />
    );
  });
}
