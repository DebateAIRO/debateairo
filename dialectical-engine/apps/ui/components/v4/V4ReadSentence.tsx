"use client";

import type { MouseEvent } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import type { ReadAbout, ReadPart } from "@/lib/v4/readRestatement";

/*
 * Design Document v2 (16b), "How we read your question": the question said back in one sentence. A stretch that stands for a
 * clarifying question's answer is a link to that question's group lower on the page. While the person has not answered it, the
 * stretch shows the AI's assumed answer with a dotted line under it; once they have, their answer in the brand colour, bold, with
 * a solid line. A screen reader hears which is which before each stretch ("our assumption:", "your choice:", the legend's words).
 * The AI's words are marked as AI text; words the person typed under "Other…" are theirs. The sentence only shows: what Start
 * sends for it is the page's to say (lib/v4/readRestatement.ts). Nothing here is kept in the browser.
 */
export function V4ReadSentence({ parts, groupIdOf, onGoTo, catalog }: Readonly<{
  /** The sentence's stretches as they show now (lib/v4/readRestatement.ts). */
  parts: readonly ReadPart[];
  /** The id of a question's group among the clarifying questions. */
  groupIdOf(about: ReadAbout): string;
  /** A stretch was activated: the page brings that group into view and moves the focus there. */
  onGoTo(event: MouseEvent<HTMLAnchorElement>, groupId: string): void;
  catalog: MessageCatalog;
}>) {
  return (
    <p className="v4ReadSentence" dir="auto">
      {parts.map((part, at) => {
        if (part.kind === "TEXT") return <span key={at} data-ai-generated="true">{part.text}</span>;
        const groupId = groupIdOf(part.about);
        return (
          <a
            key={at}
            href={`#${groupId}`}
            className={part.chosen ? "v4ReadSlot v4ReadSlot--chosen" : "v4ReadSlot v4ReadSlot--assumed"}
            data-ai-generated={part.typed ? undefined : "true"}
            onClick={(event) => onGoTo(event, groupId)}
          >
            <span className="v4SrOnly">{t(catalog, part.chosen ? "v4.read.yourChoice" : "v4.read.ourAssumption")}: </span>
            {part.words}
          </a>
        );
      })}
    </p>
  );
}
