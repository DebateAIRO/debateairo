"use client";

import type { PublicDebate } from "@debateai/contract";
import { AiNotice } from "@/components/AiNotice";
import { PublicAnswerDisclosure } from "@/components/PublicAnswerDisclosure";
import { V4PublicFlag } from "@/components/v4/V4PublicFlag";
import { V4CopyLink } from "@/components/v4/V4PublicMark";
import { V4PublicTopMenu } from "@/components/v4/V4PublicPage";
import { V4PublicHeader, V4PublicSessionProvider } from "@/components/v4/V4PublicSession";
import { PublicDebateOverview } from "@/components/PublicDebateOverview";
import { SupportWidget } from "@/components/support/SupportWidget";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";
import { publicPageHref } from "@/lib/v4/publicState";
import chromeEnglish from "@/messages/en/chrome.json";
import v4English from "@/messages/en/v4.json";

/*
 * A published debate, as a stranger reads it. Owner's screen review, 3 Nov 2026:
 *   - public-d1 A: a V4 page that leads with the answer (the body is PublicDebateOverview → components/v4/V4PublicPage.tsx), in place of the classic
 *     workspace. That workspace's extra doors are gone with it (public-f1): the folded "Published by" header with its badges and disclosure, the
 *     "Details" drawer with its measures, and the snapshot download whose file carried the scores. The published line stays, as one quiet line.
 *   - public-f4: "Report a problem" (r2-14 A) sits in the page's top bar (on a phone, in the bar's menu) and at the foot of each path; "Part of this
 *     debate was changed after review." is a quiet grey line under the question; the question's title is at the top on every screen.
 *   - public-f13: one sign-in read for the whole page; the report link, the dig boxes and the report press all read it.
 *   - Kept from the old page, in the reader's language: the site's AI notice (its strip, with the AI transparency link: published debates are labelled
 *     for readers), now in the wording that names no scores and no verdict (public-f1: the old notice named "scores and the verdict"), and, at the foot,
 *     that published debates may be indexed and when the evidence dates from (PublicAnswerDisclosure without its engine lines).
 * The props of the old workspace's catalogues stay, so the server page and its callers need no change; they are no longer read.
 */
export function PublicDebatePageClient({
  debate,
  locale,
  storyLocale,
  storyCatalog,
  publicCatalog,
  homeCatalog,
  chromeCatalog = chromeEnglish,
  v4Catalog = v4English,
  newDebateCatalog,
  crisisCountryHint = null
}: {
  debate: PublicDebate;
  locale: LocaleCode;
  /** The locale of the language the debate was argued in (spec 2026-09-26 §14.3); the reader's own when the snapshot does not say. */
  storyLocale: LocaleCode;
  /** The `public` catalogue of `storyLocale`: the short story's fixed words. */
  storyCatalog: MessageCatalog;
  publicCatalog: MessageCatalog;
  /** The old workspace's catalogues: no longer read. */
  timeCatalog?: MessageCatalog;
  debateChromeCatalog?: MessageCatalog;
  debateDrawersCatalog?: MessageCatalog;
  miscCatalog?: MessageCatalog;
  composeCatalog?: MessageCatalog;
  homeCatalog: MessageCatalog;
  /** The reader's `chrome` catalogue: with `home`, the words of the site's AI notice (AiNotice reads both). */
  chromeCatalog?: MessageCatalog;
  /** Decision 13: the contributions, reports and dig box, and what a dig's ask reads. */
  v4Catalog?: MessageCatalog;
  newDebateCatalog?: MessageCatalog;
  crisisCountryHint?: string | null;
}) {
  // Decision 13: the first author's account is gone: the name went, and the page says so in its own words.
  const author = debate.author_name_gone === true ? t(v4Catalog, "v4.public.aContributor") : debate.author_pseudonym;
  // The owner's answer to question 4 (5 Nov 2026, A): the long form with the year, "published 3 November 2026".
  const published = t(publicCatalog, "public.header.summary", { author, date: formatDate(locale, debate.published_at, { dateStyle: "long" }) });
  return (
    <V4PublicSessionProvider>
      <div className="v4Root v4PubPage" data-public-page>
        {/* journey-f19 (review F8): the quota shows only on the ask, choosing and map pages; a public page shows none and reads none. */}
        <V4PublicHeader catalog={v4Catalog}>
          <V4PublicTopMenu catalog={v4Catalog}>
            {/* public-f26 (owner's screen review): "Copy link" at the top of the public page too (the phone's share sheet there). */}
            <span className="v4PubCopyLink"><V4CopyLink href={publicPageHref(debate.public_ref)} catalog={v4Catalog} /></span>
            <V4PublicFlag publicRef={debate.public_ref} catalog={v4Catalog} placement="top" />
          </V4PublicTopMenu>
        </V4PublicHeader>
        {/* The layout already holds the page's one <main>. */}
        <div className="v4PubMain">
          <h1 className="v4Serif v4PubTitle" data-ai-generated="true" lang={storyLocale} dir="auto">{debate.question}</h1>
          <p className="v4PubPublished v4Muted">{published}</p>
          {debate.changed_after_review === true
            ? <p className="v4PubChangedLine v4Muted" data-public-changed>{t(v4Catalog, "v4.public.changedAfterReview")}</p>
            : null}
          <div className="v4PubAiNotice"><AiNotice catalog={{ ...homeCatalog, ...chromeCatalog }} /></div>
          <PublicDebateOverview
            debate={debate}
            catalog={publicCatalog}
            storyCatalog={storyCatalog}
            storyLocale={storyLocale}
            locale={locale}
            lane={{ catalog: v4Catalog, homeCatalog, newDebateCatalog, locale, crisisCountryHint }}
            onDetails={() => undefined}
            onRead={() => undefined}
          />
          <div className="v4PubFoot v4Muted" data-public-foot>
            <PublicAnswerDisclosure answer={debate.answer} catalog={publicCatalog} locale={locale} engineLines={false} />
          </div>
        </div>
        <SupportWidget />
      </div>
    </V4PublicSessionProvider>
  );
}
