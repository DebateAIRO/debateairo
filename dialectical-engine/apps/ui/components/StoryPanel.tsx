import type { JSX } from "react";
import { StoryShortBlocks } from "@/components/StoryShortBlocks";
import type { StoryView } from "@/lib/v3/storyView";

const PANEL_TITLE = "The story of this debate";
const WRITING_COPY = "Writing the full story of this debate…";
const WRITING_NOTE = "This usually takes a few minutes. The page updates by itself.";
const UNAVAILABLE_COPY = "The full story is not available for this debate. Here is the short answer instead.";
const UNAVAILABLE_EMPTY_COPY = "The full story is not available for this debate, and no short answer was served.";
const DOWNLOAD_COPY = "Download full report (PDF)";

/** The checker's reservation may name points by number; only the PDF's appendix explains them. */
function pointNumbersNote(example: string): string {
  return `Point numbers such as ${example} refer to the numbered points in the appendix of the full report.`;
}

function StoryBodyView({ view }: { view: StoryView }): JSX.Element {
  if (view.status === "WRITING") {
    return (
      <>
        <p className="storyPanelStatus" role="status" data-writing="true">{WRITING_COPY}</p>
        <p className="storyPanelNote">{WRITING_NOTE}</p>
      </>
    );
  }
  if (view.status === "UNAVAILABLE") {
    const paragraphs = view.fallbackText === null ? [] : view.fallbackText.split("\n\n");
    return (
      <>
        <p className="storyPanelStatus">{paragraphs.length === 0 ? UNAVAILABLE_EMPTY_COPY : UNAVAILABLE_COPY}</p>
        {paragraphs.length === 0 ? null : (
          <div className="storyPanelFallback" data-ai-generated="true">
            {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        )}
      </>
    );
  }
  // The download comes first, above the story, so it shows without scrolling
  // the bounded body, on a phone too.
  return (
    <>
      {view.pdfHref === null ? null : (
        <p className="storyPanelActions">
          <a className="storyPanelDownload" href={view.pdfHref}>{DOWNLOAD_COPY}</a>
          {view.reservationPointNumber === null ? null : (
            <span className="storyPanelActionsNote">{pointNumbersNote(view.reservationPointNumber)}</span>
          )}
        </p>
      )}
      <StoryShortBlocks story={view} className="storyPanelStory" headlineAs="h2" />
    </>
  );
}

/**
 * The owner page's verdict story strip (spec 2026-09-26 §10). The short story
 * is the shared StoryShortBlocks, the same blocks the public page shows, plus
 * the checker's reservation, which only the owner sees. Every model-written
 * string is a React text child: never HTML, Markdown or a link. The download
 * is a plain link to the PDF route, which answers with an attachment; it is
 * not a Next Link, so nothing prefetches a PDF render.
 */
export function StoryPanel({ view }: { view: StoryView }): JSX.Element {
  return (
    <section className="storyPanel" aria-label={PANEL_TITLE} data-story-status={view.status}>
      <details className="storyPanelDetails" open>
        <summary className="storyPanelSummary">
          <span className="storyPanelEyebrow">{PANEL_TITLE}</span>
          <span className="storyPanelLabel" data-verdict={view.verdictState ?? "none"}>{view.labelWords}</span>
          {view.confidenceWords === null ? null : <span className="storyPanelConfidence">{view.confidenceWords}</span>}
        </summary>
        <div className="storyPanelBody">
          <div className="storyPanelInner">
            <p className="storyPanelSentence">{view.labelSentence}</p>
            <StoryBodyView view={view} />
          </div>
        </div>
      </details>
    </section>
  );
}
