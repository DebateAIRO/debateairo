import Link from "next/link";
import { cookies, headers } from "next/headers";
import { createServerContractClient, listDebatesPageServer, readSessionCookie, readTrustedClientIp } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { DebatesBuffer, PublicDebatesBuffer } from "@/components/DebatesBuffer";
import { LandingPage } from "@/components/landing/LandingPage";
import { SupportWidget } from "@/components/support/SupportWidget";
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
  const token = readSessionCookie(await cookies());
  if (token === null) return <><LandingPage /><SupportWidget /></>;
  const requestedTab = (await searchParams).tab;
  const tab: "yours" | "public" =
    requestedTab === "yours" || requestedTab === "public"
      ? requestedTab
      : token !== null ? "yours" : "public";
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  const clientIp = readTrustedClientIp(await headers());
  let debates: DebateSummary[] = [];
  let error: string | null = null;
  let sessionConfirmed = false;
  let published: Awaited<ReturnType<ContractClient["readPublicDebates"]>> = { items: [], total: 0 };
  let publishedError: string | null = null;
  try {
    published = await createServerContractClient(fetch, undefined, userAgent, clientIp).readPublicDebates(50, 0);
  } catch {
    publishedError = "Published debates are temporarily unavailable.";
  }
  if (token === null) {
    error = "Sign in to start a debate and save it to your account.";
  } else {
    try {
      const page = await listDebatesPageServer(token, undefined, userAgent, clientIp);
      debates = page.summaries;
      sessionConfirmed = true;
    } catch {
      error = "Your signed-in session could not be confirmed. Refresh once, or sign in again.";
    }
  }

  // V's ruling of 2026-09-20: the chip counts what is on screen. It used to
  // show the account-wide or corpus-wide aggregate, so a reader saw "41 TOTAL"
  // standing over four rows and "37 TOTAL" over three. fd82d84e had already
  // derived it from the rendered rows; the 690ebe14 merge kept that slice's
  // test and dropped the change.
  const count = tab === "yours" ? debates.length : published.items.length;

  // The list wrappers carry `recentList` beside `libList`. `recentList` is the
  // name the T3-C2 slice used and the one t3-library still selects on; the
  // 690ebe14 merge discarded it with the rest of that side. The two rules are
  // identical (globals.css:2325 and :6765), so carrying both recovers the
  // dropped name with no visual change.

  return (
    <div className="screen scroll libScreen">
      <div className="libInner">
        <p className="libEyebrow">A REASONING INSTRUMENT</p>
        <h1 className="libTitle">What should we debate?</h1>
        <p className="libLede">
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

        {/* The composer is the workspace and renders only for a confirmed
            session; an unconfirmed one gets the notice above instead. */}
        {sessionConfirmed ? (
          <section data-support-primary-control id="start-a-debate" aria-label="Start a debate">
            <LibraryComposer />
          </section>
        ) : null}

        <div className="libTabs sectionHead" aria-label="Debate library">
          <Link
            aria-current={tab === "yours" ? "page" : undefined}
            href="/?tab=yours"
            className="libTab"
          >
            Your debates
          </Link>
          <Link
            aria-current={tab === "public" ? "page" : undefined}
            href="/?tab=public"
            className="libTab"
          >
            Public debates
          </Link>
          <span className="libCount count">{count} TOTAL</span>
        </div>

        {tab === "yours" ? (
          sessionConfirmed ? (
            <div className="libList recentList">
              <DebatesBuffer debates={debates} />
            </div>
          ) : (
            <p className="tabEmptyHint">Sign in or create an account above to see your debates.</p>
          )
        ) : (
          <>
            {publishedError ? <div className="error">{publishedError}</div> : null}
            <div className="libList recentList">
              <PublicDebatesBuffer debates={published.items} />
            </div>
            <p className="libPublicNote">
              Published debates may be indexed by search engines. Copies may persist after unpublishing.
            </p>
          </>
        )}
      </div>
      <SupportWidget />
    </div>
  );
}
