import type { JSX } from "react";
import { localeDirection } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { morePathsWords, storyFateWords, type StoryFateValue } from "@/lib/v3/storyWords";

/**
 * The verdict story's short version, as the two surfaces that show it hold it:
 * the public overview maps its snapshot's `story_short` to this, and the
 * owner's StoryPanel passes its view. Every string here was written by a model.
 * `morePaths` is how many positions the short version left out (0 or more).
 * `reservation` is true for a READY_WITH_RESERVATION story: on the owner's
 * panel, and on the public page when its snapshot says `double_checked: false`
 * (final review, Important 2). The box then shows the gentle catalogue line,
 * never the checker's own text (spec 2026-09-26 §14.2).
 */
export interface StoryShortContent {
  readonly headline: string | null;
  readonly confidence: string | null;
  readonly summary: string | null;
  readonly paths: readonly Readonly<{ fate: StoryFateValue; line: string; positionRef: string }>[];
  readonly morePaths: number;
  readonly change: string | null;
  readonly reviewerNote: string | null;
  readonly reservation?: boolean;
}

/**
 * The short-story blocks (spec 2026-09-26 §10, §14): the headline, the
 * storyteller's sentence on how sure we are, the summary, the path list, what
 * would change the answer, the note box and the gentle reservation line. One
 * component for the public overview and the owner's StoryPanel, so the two
 * never drift. The fixed words come from `catalog`, the `public` catalogue of
 * the QUESTION's locale, and the blocks carry that locale's `lang` and `dir`:
 * the story reads in one language from its headline to its last label. Every
 * model-written string is a React text child: never HTML, Markdown or a link.
 */
export function StoryShortBlocks({
  story,
  catalog,
  locale,
  className,
  headlineAs = "p"
}: {
  story: StoryShortContent;
  catalog: MessageCatalog;
  locale: string;
  className: string;
  headlineAs?: "p" | "h2";
}): JSX.Element {
  const more = morePathsWords(story.morePaths, catalog, locale);
  const Headline = headlineAs;
  return (
    <div className={className} lang={locale} dir={localeDirection(locale)} data-ai-generated="true">
      {story.headline === null ? null : <Headline className="storyHeadline">{story.headline}</Headline>}
      {story.confidence === null ? null : <p className="storyConfidence">{story.confidence}</p>}
      {story.summary === null ? null : <p className="storySummary">{story.summary}</p>}
      <ul className="storyPaths" aria-label={t(catalog, "public.story.pathsListName")}>
        {story.paths.map((path, index) => (
          <li key={`${index}:${path.positionRef}`} className="storyPath">
            <span className="storyFate" data-fate={path.fate}>{storyFateWords(path.fate, catalog)}</span>
            <span className="storyPathLine">{path.line}</span>
          </li>
        ))}
        {more === null ? null : <li className="storyPath storyPathMore">{more}</li>}
      </ul>
      {story.change === null ? null : (
        <div className="storyChange">
          <span className="storyChangeLead">{t(catalog, "public.story.changeLead")}</span>
          <p>{story.change}</p>
        </div>
      )}
      {story.reviewerNote === null ? null : (
        <div className="storyBox" data-box="note">
          <span className="storyBoxTitle">{t(catalog, "public.story.noteTitle")}</span>
          <p>{story.reviewerNote}</p>
        </div>
      )}
      {story.reservation === true ? (
        <div className="storyBox" data-box="reservation">
          <p>{t(catalog, "public.story.reservation")}</p>
        </div>
      ) : null}
    </div>
  );
}
