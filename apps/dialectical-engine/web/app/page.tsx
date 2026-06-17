import Link from "next/link";
import { listDebatesServer } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let debates: DebateSummary[] = [];
  let error: string | null = null;
  try {
    debates = await listDebatesServer();
  } catch (exc) {
    error = exc instanceof Error ? exc.message : "Unable to reach coordinator";
  }

  return (
    <div className="screen scroll">
      <div className="screenInner wide">
        <div className="eyebrow">A reasoning instrument</div>
        <h1 className="display lg" style={{ marginTop: 14 }}>
          What should we debate?
        </h1>
        <p className="lede">
          Post a claim. Several different AI models argue it out against each other in a structured tree — so you can
          see how the strongest case for and against actually holds up.
        </p>

        <LibraryComposer />

        {error ? (
          <div className="error" style={{ marginTop: 18 }}>
            {error}
          </div>
        ) : null}

        <div className="sectionHead">
          <h2>Recent debates</h2>
          <span className="count">{debates.length} total</span>
        </div>

        <div className="recentList">
          {debates.length === 0 ? (
            <div className="emptyState">No debates yet — post the first claim above.</div>
          ) : (
            debates.map((debate) => {
              const complete = isComplete(debate.status);
              return (
                <Link key={debate.id} className="debateCard" href={`/debate/${debate.id}`}>
                  <div className="debateCardBody">
                    <div className="debateCardClaim">{debate.topic}</div>
                    <div className="debateCardMeta">
                      <span>{relativeTime(debate.created_at)}</span>
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
                          style={{ ["--dot" as string]: meta.dot }}
                        />
                      );
                    })}
                  </div>
                  <div className={`pill ${complete ? "pillOk" : "pillGen"}`}>
                    <span className="dot" />
                    {statusLabel(debate.status)}
                  </div>
                  <span className="debateCardArrow" aria-hidden>
                    →
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
