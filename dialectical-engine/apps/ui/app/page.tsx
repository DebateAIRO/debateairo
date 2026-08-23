import { cookies, headers } from "next/headers";
import { USER_TOKEN_COOKIE, listDebatesPageServer } from "@/lib/serverApi";
import { LibraryComposer } from "@/components/LibraryComposer";
import { DebatesBuffer } from "@/components/DebatesBuffer";
import type { DebateSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // UI-01 (S05): the V3 answer index is asker-scoped; without a server session
  // cookie the list honestly stays empty with a sign-in hint — never an
  // anonymous global listing.
  const token = (await cookies()).get(USER_TOKEN_COOKIE)?.value ?? null;
  const userAgent = (await headers()).get("user-agent") ?? undefined;
  let debates: DebateSummary[] = [];
  let total: number | null = null;
  let error: string | null = null;
  if (token === null) {
    error = "Sign in to list your asker-scoped debates.";
  } else {
    try {
      const page = await listDebatesPageServer(token, undefined, userAgent);
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
          <DebatesBuffer debates={debates} />
        </div>
      </div>
    </div>
  );
}
