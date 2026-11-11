"use client";

import type { PublicDebate } from "@debateai/contract";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { MessageCatalog } from "@/lib/i18n/translate";
import v4English from "@/messages/en/v4.json";
import { V4PublicAnswerFirst } from "@/components/v4/V4PublicPage";
import { V4PublicLaneProvider, type V4PublicLaneConfig } from "@/components/v4/V4PublicLane";

/*
 * The body of a public debate's page, and of the publication review that shows a reviewer the same page.
 * Owner's screen review, 3 Nov 2026: public-d1 A rebuilt it answer-first in V4's look (components/v4/V4PublicPage.tsx); public-f1 took every score,
 * percentage, capital-letter measure, model code, for/against count and the old disclaimer off it; public-f3 took the locked Challenge and its "Unlock
 * actions" line away. This file keeps its export and props (the start-step branch builds on them) and switches to the new page. `composeCatalog` and
 * `viewingNote` belonged to the old layout (its score copy and its unlock line) and are no longer read. `onDetails` and `onRead` open a publication
 * review's own panels: without a lane (the review) the page shows the reviewer "Details" and "Read" for them; a stranger's page (with a lane) never does.
 */
export function PublicDebateOverview({
  debate,
  catalog,
  storyCatalog,
  storyLocale,
  locale = storyLocale,
  lane,
  onDetails,
  onRead
}: {
  debate: PublicDebate;
  catalog: MessageCatalog;
  /**
   * The `public` catalogue of the language the debate was argued in (spec
   * 2026-09-26 §14.3): the short story's words read in it, whatever the interface's language.
   */
  storyCatalog: MessageCatalog;
  storyLocale: LocaleCode;
  /** No longer read (the old layout's score copy); kept so callers need no change. */
  composeCatalog?: MessageCatalog;
  /** No longer read (public-f3: the "Unlock actions" line is gone); kept so callers need no change. */
  viewingNote?: "PUBLIC" | "NONE";
  /** The reader's locale, for the dates of contributions and reports. */
  locale?: string;
  /** Decision 13: on the live public page, what a signed-in person can press. Absent (a publication review): the page's text alone. */
  lane?: V4PublicLaneConfig;
  /** A publication review's "Details" (no lane only; public-f1: a stranger's page has no Details drawer). */
  onDetails: () => void;
  /** A publication review's "Read" on each side's strongest point (no lane only). */
  onRead: (nodeId: string) => void;
}) {
  const body = (
    <V4PublicAnswerFirst
      debate={debate}
      catalog={lane?.catalog ?? v4English}
      publicCatalog={catalog}
      storyCatalog={storyCatalog}
      storyLocale={storyLocale}
      locale={locale}
      actions={lane !== undefined}
      {...(lane === undefined ? { reviewDoors: { onDetails, onRead } } : {})}
    />
  );
  return lane === undefined ? body : <V4PublicLaneProvider debate={debate} lane={lane}>{body}</V4PublicLaneProvider>;
}
