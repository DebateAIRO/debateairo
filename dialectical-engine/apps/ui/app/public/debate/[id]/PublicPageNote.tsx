import Link from "next/link";
import type { ReactNode } from "react";
import { V4Header } from "@/components/v4/V4Header";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * public-f7 and public-f8 (owner screen review, 3 Nov): a public debate that cannot be shown is never a bare line on an empty page. The normal V4
 * header, the one plain sentence, what the person can do here (`children`, e.g. "Try again"), and, where asked, two ways on: other public debates
 * (today's list, until V4 has its own) and the ask page. Kept out of search engines, like the under-review answer.
 */
export function PublicPageNote({ kind, v4Catalog, line, waysOn = true, children }: Readonly<{
  /** Which note this is, for tests and the click-test: "under-review", "newer-release" or "could-not-load". */
  kind: string;
  v4Catalog: MessageCatalog;
  line: string;
  waysOn?: boolean;
  children?: ReactNode;
}>) {
  return (
    <div className="v4Root v4PubNotePage">
      <meta name="robots" content="noindex" />
      {/* journey-f19: the quota share is for the ask, choosing and map pages, never a public page's note. */}
      <V4Header catalog={v4Catalog} showQuota={false} />
      {/* The layout already holds the page's one <main>. */}
      <div className="v4PubNoteMain" data-public-note={kind}>
        <p className="v4PubNoteLine" role="status">{line}</p>
        {children}
        {waysOn ? (
          <div className="v4PubNoteWays">
            <Link className="v4Link" href="/?tab=public">{t(v4Catalog, "v4.public.otherDebates")}</Link>
            <Link className="v4Link" href="/v4">{t(v4Catalog, "v4.public.askYourOwn")}</Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
