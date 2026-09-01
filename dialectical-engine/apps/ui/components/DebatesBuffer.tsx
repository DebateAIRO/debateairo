import Link from "next/link";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";

export function DebatesBuffer({ debates }: { readonly debates: readonly DebateSummary[] }) {
  if (debates.length === 0) {
    return <div className="emptyState">No debates yet — post the first claim above.</div>;
  }
  return debates.map((debate) => {
    const complete = isComplete(debate.status);
    return (
      <Link
        key={debate.id}
        className="debateCard"
        href={`/debate/${debate.id}`}
        data-library-row
        data-bezel="shell"
        style={{ background: "var(--shell)", borderColor: "var(--line)", borderRadius: 13 }}
      >
        <div className="debateCardBody" data-bezel="core" style={{ background: "var(--core)" }}>
          <div className="debateCardClaim">{debate.topic}</div>
          <div className="debateCardMeta">
            {debate.terminal_reason === null || debate.terminal_reason === undefined
              ? <span>{relativeTime(debate.created_at)}</span>
              : <span>Debate generation failed: {debate.terminal_reason}</span>}
            {debate.models.length ? (
              <>
                <span className="sep">·</span>
                <span>
                  {debate.models.length} model{debate.models.length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="modelStack" aria-hidden>
          {debate.models.slice(0, 5).map((model) => {
            const meta = modelMeta(model);
            return (
              <span
                key={model}
                className="modelDot"
                title={meta.name}
                style={{
                  ["--dot" as string]: meta.dot,
                  borderColor: "var(--core)",
                  height: 12,
                  marginLeft: -4,
                  width: 12
                }}
              />
            );
          })}
        </div>
        <div className={`pill ${complete ? "pillOk" : debate.status === "failed" ? "pillBad" : "pillGen"}`}>
          <span className="dot" />
          {statusLabel(debate.status)}
        </div>
        <span className="debateCardArrow" aria-hidden>→</span>
      </Link>
    );
  });
}
