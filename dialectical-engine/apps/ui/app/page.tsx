import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createServerContractClient, USER_TOKEN_COOKIE, listDebatesPageServer } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { DebatesBuffer } from "@/components/DebatesBuffer";
import { LandingPage } from "@/components/landing/LandingPage";
import type { ContractClient } from "@debateai/contract";
import type { DebateSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  // UI-01 (S05): the V3 answer index is asker-scoped; without a server session
  // cookie the list honestly stays empty with a sign-in hint — never an
  // anonymous global listing.
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  if (token === null) return <LandingPage />;
  const requestedTab = (await searchParams).tab;
  const tab: "yours" | "public" =
    requestedTab === "yours" || requestedTab === "public"
      ? requestedTab
      : token !== null ? "yours" : "public";
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  let debates: DebateSummary[] = [];
  let total: number | null = null;
  let error: string | null = null;
  let sessionConfirmed = false;
  let published: Awaited<ReturnType<ContractClient["readPublicDebates"]>> = { items: [], total: 0 };
  let publishedError: string | null = null;
  try {
    published = await createServerContractClient(fetch, undefined, userAgent).readPublicDebates(50, 0);
  } catch {
    publishedError = "Published debates are temporarily unavailable.";
  }
  if (token === null) {
    error = "Sign in to start a debate and save it to your account.";
  } else {
    try {
      const page = await listDebatesPageServer(token, undefined, userAgent);
      debates = page.summaries;
      total = page.total;
      sessionConfirmed = true;
    } catch {
      error = "Your signed-in session could not be confirmed. Refresh once, or sign in again.";
    }
  }

  return (
    <div className="screen scroll">
      <div className="screenInner wide">
        <div className="eyebrow">A REASONING INSTRUMENT</div>
        <h1 className="display lg" style={{ marginTop: 14 }}>
          What should we debate?
        </h1>
        <p className="lede">
          Post a claim. Several different AI models argue it out against each other in a structured tree — so you can
          see how the strongest case for and against actually holds up.
        </p>

        {error ? (
          <div className="error" style={{ marginTop: 18 }}>
            <p>{error}</p>
            <div className="formActions">
              <Link className="btn" href="/login">{token === null ? "Log in" : "Sign in again"}</Link>
              {token === null ? (
                <Link className="btn btnDark" href="/sign-up">Create account</Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {sessionConfirmed ? (
          <>
            <section className="sessionHandoff" role="status" aria-live="polite">
              <div>
                <p className="sessionHandoffKicker">You’re signed in</p>
                <h2>Your debate workspace is ready.</h2>
                <p>Start a debate below. New debates and their answers will be saved to this account.</p>
              </div>
              <a className="btn btnDark" href="#start-a-debate">Start a debate</a>
            </section>

            <section id="start-a-debate" className="sessionComposer" aria-label="Start a debate">
              <LibraryComposer />
            </section>
          </>
        ) : null}

      <div className="sectionHead" aria-label="Debate library">
          <Link
            aria-current={tab === "yours" ? "page" : undefined}
            href="/?tab=yours"
            className={tab === "yours" ? "tab tabActive" : "tab"}
          >
            Your Debates
          </Link>
          <Link
            aria-current={tab === "public" ? "page" : undefined}
            href="/?tab=public"
            className={tab === "public" ? "tab tabActive" : "tab"}
          >
            Public Debates
          </Link>
          <span className="count">
            {tab === "yours"
              ? (total === null
                  ? `${debates.length} shown`
                  : total > debates.length
                    ? `${debates.length} shown of ${total} total`
                    : `${total} total`)
              : (published.total > published.items.length
                  ? `${published.items.length} shown of ${published.total} total`
                  : `${published.total} total`)}
          </span>
        </div>

        {sessionConfirmed && tab === "yours" ? (
          <div className="recentList">
            <DebatesBuffer debates={debates} />
          </div>
        ) : tab === "yours" ? (
          <p className="tabEmptyHint">Sign in or create an account above to see your debates.</p>
        ) : null}

        {tab === "public" ? (
          <>
            {publishedError ? <div className="error">{publishedError}</div> : null}
            <div className="recentList">
              {published.items.length === 0 && publishedError === null ? <p>No debates have been published yet.</p> : null}
              {published.items.map((debate) => (
                <article className="debateCard" key={debate.public_ref}>
                  <div className="debateCardBody">
                    <Link href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}>{debate.question}</Link>
                    <p>
                      By {debate.author_pseudonym} · {debate.verdict ?? "Verdict unavailable"}
                      {debate.confidence_band ? ` · ${debate.confidence_band}` : ""}
                    </p>
                    <p>Published debates may be indexed by search engines. Copies may persist after unpublishing.</p>
                  </div>
                  <Link
                    className="tab"
                    style={{ flexShrink: 0 }}
                    href={`/public/debate/${encodeURIComponent(debate.public_ref)}`}
                  >
                    Open the full debate →
                  </Link>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
