import type { JSX } from "react";
import { StoryShortBlocks } from "@/components/StoryShortBlocks";
import { localeDirection } from "@/lib/i18n/questionLocale";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { StoryView } from "@/lib/v3/storyView";
import { storyLabelWords } from "@/lib/v3/storyWords";

function StoryBodyView({ view, catalog, locale }: { view: StoryView; catalog: MessageCatalog; locale: string }): JSX.Element {
  if (view.status === "WRITING") {
    return (
      <>
        <p className="storyPanelStatus" role="status" data-writing="true">{t(catalog, "public.story.writing")}</p>
        <p className="storyPanelNote">{t(catalog, "public.story.writingNote")}</p>
      </>
    );
  }
  if (view.status === "UNAVAILABLE") {
    const paragraphs = view.fallbackText === null ? [] : view.fallbackText.split("\n\n");
    return (
      <>
        <p className="storyPanelStatus">
          {paragraphs.length === 0 ? t(catalog, "public.story.unavailableEmpty") : t(catalog, "public.story.unavailable")}
        </p>
        {paragraphs.length === 0 ? null : (
          <div className="storyPanelFallback" data-ai-generated="true">
            {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        )}
      </>
    );
  }
  // The download comes first, above the story, so it shows without scrolling
  // the bounded body, on a phone too. A story in a language the report cannot
  // print yet gets a short note there instead of a button (spec §14.3).
  return (
    <>
      {view.pdfHref !== null ? (
        <p className="storyPanelActions">
          <a className="storyPanelDownload" href={view.pdfHref}>{t(catalog, "public.story.download")}</a>
        </p>
      ) : view.reportUnsupported ? (
        <p className="storyPanelNote">{t(catalog, "public.story.reportUnsupported")}</p>
      ) : null}
      <StoryShortBlocks
        story={view}
        catalog={catalog}
        locale={locale}
        className="storyPanelStory"
        headlineAs="h2"
      />
    </>
  );
}

/**
 * The owner page's verdict story strip (spec 2026-09-26 §10, §14). Everything
 * in it, the fixed words included, is in the QUESTION's language: `catalog` is
 * the `public` catalogue of `locale`, the question's locale, and the strip
 * carries that locale's `lang` and `dir`. The label is the arithmetic label in
 * human words; the confidence line is the storyteller's own sentence. The
 * short story is the shared StoryShortBlocks, the same blocks the public page
 * shows, plus the gentle reservation line, which only the owner sees. Every
 * model-written string is a React text child: never HTML, Markdown or a link.
 * The download is a plain link to the PDF route, which answers with an
 * attachment; it is not a Next Link, so nothing prefetches a PDF render.
 * Hide and Show are drawn by CSS from the two data attributes, so the words
 * stay out of the summary's accessible name.
 */
export function StoryPanel({
  view,
  catalog,
  locale
}: {
  view: StoryView;
  catalog: MessageCatalog;
  locale: string;
}): JSX.Element {
  const title = t(catalog, "public.story.panelTitle");
  return (
    <section
      className="storyPanel"
      aria-label={title}
      lang={locale}
      dir={localeDirection(locale)}
      data-story-status={view.status}
    >
      <details className="storyPanelDetails" open>
        <summary
          className="storyPanelSummary"
          data-hide-words={t(catalog, "public.story.hide")}
          data-show-words={t(catalog, "public.story.show")}
        >
          <span className="storyPanelEyebrow">{title}</span>
          {view.label === null ? null : (
            <span className="storyPanelLabel" data-verdict={view.verdictState ?? "none"}>{storyLabelWords(view.label, catalog)}</span>
          )}
        </summary>
        <div className="storyPanelBody">
          <div className="storyPanelInner">
            <StoryBodyView view={view} catalog={catalog} locale={locale} />
          </div>
        </div>
      </details>
    </section>
  );
}
