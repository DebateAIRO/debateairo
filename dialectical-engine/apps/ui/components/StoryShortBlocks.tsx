import type { JSX } from "react";
import {
  STORY_CHANGE_LEAD,
  STORY_FATE_WORDS,
  STORY_RESERVATION_TITLE,
  STORY_REVIEWER_NOTE_CAVEAT,
  STORY_REVIEWER_NOTE_TITLE,
  morePathsWords,
  type StoryFateValue
} from "@/lib/v3/storyWords";

/**
 * The verdict story's short version, as the two surfaces that show it hold it:
 * the public overview maps its snapshot's `story_short` to this, and the
 * owner's StoryPanel passes its view. Every string but the fixed English copy
 * was written by a model. `morePaths` is how many positions the short version
 * left out (0 or more). `reservation` is the checker's reservation, for the
 * owner's panel only: it names points by numbers only the owner's appendix
 * explains, so the public page never passes one.
 */
export interface StoryShortContent {
  readonly headline: string | null;
  readonly summary: string | null;
  readonly paths: readonly Readonly<{ fate: StoryFateValue; line: string; positionRef: string }>[];
  readonly morePaths: number;
  readonly change: string | null;
  readonly reviewerNote: string | null;
  readonly reservation?: string | null;
}

/**
 * The short-story blocks (spec 2026-09-26 §10): headline, summary, the path
 * list, the change line, the reviewer's note box and the reservation box. One
 * component for the public overview and the owner's StoryPanel, so the two
 * never drift. Every model-written string is a React text child: never HTML,
 * Markdown or a link. `className` names the surface; `headlineAs` lets a
 * surface make the headline its heading.
 */
export function StoryShortBlocks({
  story,
  className,
  headlineAs = "p"
}: {
  story: StoryShortContent;
  className: string;
  headlineAs?: "p" | "h2";
}): JSX.Element {
  const more = morePathsWords(story.morePaths);
  const reservation = story.reservation ?? null;
  const Headline = headlineAs;
  return (
    <div className={className} data-ai-generated="true">
      {story.headline === null ? null : <Headline className="storyHeadline">{story.headline}</Headline>}
      {story.summary === null ? null : <p className="storySummary">{story.summary}</p>}
      <ul className="storyPaths" aria-label="Positions the debate explored">
        {story.paths.map((path, index) => (
          <li key={`${index}:${path.positionRef}`} className="storyPath">
            <span className="storyFate" data-fate={path.fate}>{STORY_FATE_WORDS[path.fate]}</span>
            <span className="storyPathLine">{path.line}</span>
          </li>
        ))}
        {more === null ? null : <li className="storyPath storyPathMore">{more}</li>}
      </ul>
      {story.change === null ? null : (
        <p className="storyChange"><strong>{STORY_CHANGE_LEAD}</strong> {story.change}</p>
      )}
      {story.reviewerNote === null ? null : (
        <div className="storyBox" data-box="note">
          <span className="storyBoxTitle">{STORY_REVIEWER_NOTE_TITLE}</span>
          <p>{story.reviewerNote}</p>
          <p className="storyBoxNote">{STORY_REVIEWER_NOTE_CAVEAT}</p>
        </div>
      )}
      {reservation === null ? null : (
        <div className="storyBox" data-box="reservation">
          <span className="storyBoxTitle">{STORY_RESERVATION_TITLE}</span>
          <p>{reservation}</p>
        </div>
      )}
    </div>
  );
}
