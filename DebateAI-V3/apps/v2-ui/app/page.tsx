import Link from "next/link";
import { cookies } from "next/headers";
import { USER_TOKEN_COOKIE, listDebatesPageServer } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { modelMeta } from "@/lib/models";
import { isComplete, relativeTime, statusLabel } from "@/lib/format";
import type { DebateSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

function readCookieToken(raw: string | undefined): string | null {
  if (raw === undefined || raw.length === 0) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function HomePage() {
  // UI-01 (S05): the V3 answer index is asker-scoped; without an identity
  // cookie the list honestly stays empty with an unlock hint — never an
  // anonymous global listing.
  const token = readCookieToken((await cookies()).get(USER_TOKEN_COOKIE)?.value);
  let debates: DebateSummary[] = [];
  let total: number | null = null;
  let error: string | null = null;
  if (token === null) {
    error = "Add your dev token (open any debate's Unlock actions, or start a new debate) to list your asker-scoped debates.";
  } else {
    try {
      const page = await listDebatesPageServer(token);
      debates = page.summaries;
      total = page.total;
    } catch (exc) {
      error = exc instanceof Error ? exc.message : "Unable to reach the V3 API";
    }
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
          <span className="count">
            {total === null
              ? `${debates.length} shown`
              : total > debates.length
                ? `${debates.length} shown of ${total} total`
                : `${total} total`}
          </span>
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
