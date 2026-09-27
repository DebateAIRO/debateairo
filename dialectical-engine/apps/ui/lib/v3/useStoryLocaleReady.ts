import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { LocaleCode } from "@/lib/i18n/locales";

/** When the page may ask for its second render: once before the answer exists, once when it first does. */
const BEFORE_ANSWER = 1;
const WITH_ANSWER = 2;

/**
 * Whether the story catalogue the owner's page holds speaks the question's
 * language (spec 2026-09-26 §14.3), so the story panel may show.
 *
 * The server hands over the `public` catalogue of `storyLocale`: the question's
 * locale when its render read the run, the interface's when it did not (the
 * "starting" render straight after an ask reads nothing). Then the page's own
 * run read decides. A question in the interface's language, `und` or an unknown
 * tag needs nothing more. Any other language asks the server to render the page
 * again with a real read; that render brings the question's locale, its
 * catalogue and the offer to switch the page to it. Until then the panel stays
 * hidden rather than wrap the story in another language's words.
 *
 * It asks at most twice: once while the debate runs, and once more when the
 * answer first arrives if the catalogue is still missing (that first render's
 * own read may have come back pending). An ask made once the answer exists is
 * the last.
 */
export function useStoryLocaleReady(input: Readonly<{
  /** The server's reading of the question's locale; null when its render learned none. */
  questionLocale: LocaleCode | null;
  /** What the page's own run read learned (`und` and unknown tags give the interface's locale); null before it answers. */
  readQuestionLocale: LocaleCode | null;
  /** The locale of the `public` catalogue the server handed over for the story. */
  storyLocale: LocaleCode;
  /** Whether the page holds a served answer. */
  hasAnswer: boolean;
}>): boolean {
  const router = useRouter();
  const asked = useRef(0);
  const { questionLocale, readQuestionLocale, storyLocale, hasAnswer } = input;
  const wanted = questionLocale ?? readQuestionLocale;
  const needsServerRead = questionLocale === null && readQuestionLocale !== null && readQuestionLocale !== storyLocale;
  useEffect(() => {
    const stage = hasAnswer ? WITH_ANSWER : BEFORE_ANSWER;
    if (!needsServerRead || asked.current >= stage) return;
    asked.current = stage;
    // The "starting" render skips the server's read (page.tsx), and a refresh
    // renders the page's URL again: drop the flag first, so this one reads.
    const url = new URL(window.location.href);
    if (url.searchParams.has("starting")) {
      url.searchParams.delete("starting");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    router.refresh();
  }, [needsServerRead, hasAnswer, router]);
  return wanted !== null && wanted === storyLocale;
}
