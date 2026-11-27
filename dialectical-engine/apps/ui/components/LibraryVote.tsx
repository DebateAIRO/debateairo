"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import type { PublicVoteAnswer } from "@debateai/contract";
import { announce } from "@/components/Toast";
import { contractClient, holdsNoSession } from "@/lib/api";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { shortVoteCount } from "@/lib/upvoteWords";

/** `vote` is the state the reader asks for: true casts, false takes the vote back. */
const defaultSend = (publicRef: string, vote: boolean): Promise<PublicVoteAnswer> =>
  vote ? contractClient.castPublicVote(publicRef) : contractClient.withdrawPublicVote(publicRef);

/** The server's last answer for a row, and the props that row had when the answer came. Written by the press handler only. */
const settled = new Map<string, Readonly<{ fromVoted: boolean; fromCount: number; voted: boolean; count: number }>>();

/** The remembered answer for a row, when the row mounts with the same props it had when that answer came; else none. Reads only. */
function startFrom(publicRef: string, initialVoted: boolean, initialCount: number) {
  const kept = settled.get(publicRef);
  return kept !== undefined && kept.fromVoted === initialVoted && kept.fromCount === initialCount ? kept : undefined;
}

/**
 * Upvotes on public debates (design of 26 Nov 2026, section 4): the vote box of one public row. The button sits beside the row's link, not inside it,
 * because a button may not sit inside an anchor. It is never switched off, also while a request runs: a control switched off under keyboard focus drops
 * focus (lib/focusGuard.ts), so a press during a request is ignored instead. A browser with no session sends nothing, because a 401 costs the reader the
 * site password (lib/api.ts); it is shown the sign-in link. The words are handed in, not read from the layout's provider, so a test can render any language.
 * The box remembers the server's last answer per row for as long as the page's code lives, so coming back from a debate shows the vote as the person left
 * it; it writes that memory from the press alone, never while rendering, so a server render, shared by every request, keeps nothing of anyone's vote.
 */
export function LibraryVote({ publicRef, initialCount, initialVoted, signedIn, signInHref, catalog, locale, describedBy, send = defaultSend,
  children }: Readonly<{
  /** The row's public_ref. */
  publicRef: string;
  /** The list's vote_count for this row. */
  initialCount: number;
  /** Whether this ref is among the reader's own upvotes. */
  initialVoted: boolean;
  /** The page's sessionConfirmed. */
  signedIn: boolean;
  /** Where "Sign in to upvote" leads. */
  signInHref: string;
  /** The picked home.upvote.* entries. */
  catalog: MessageCatalog;
  locale: string;
  /** The id of the row's question, set as aria-describedby. */
  describedBy?: string;
  /** `vote` is the state the reader asks for. */
  send?: (publicRef: string, vote: boolean) => Promise<PublicVoteAnswer>;
  /** The row's unchanged link. */
  children: ReactNode;
}>) {
  const [voted, setVoted] = useState(() => startFrom(publicRef, initialVoted, initialCount)?.voted ?? initialVoted);
  const [count, setCount] = useState(() => startFrom(publicRef, initialVoted, initialCount)?.count ?? initialCount);
  const [note, setNote] = useState<"NONE" | "SIGN_IN" | "FAILED">("NONE");
  const inFlight = useRef(false);
  function settle(nowVoted: boolean, nowCount: number) {
    setVoted(nowVoted);
    setCount(nowCount);
    settled.set(publicRef, { fromVoted: initialVoted, fromCount: initialCount, voted: nowVoted, count: nowCount });
  }
  function say(line: "SIGN_IN" | "FAILED") {
    setNote(line);
    announce(t(catalog, line === "SIGN_IN" ? "home.upvote.signedOut" : "home.upvote.failed"));
  }
  async function press() {
    if (!signedIn || holdsNoSession()) {
      say("SIGN_IN");
      return;
    }
    if (inFlight.current) return;
    const before = { voted, count };
    const vote = !voted;
    const shown = vote ? count + 1 : Math.max(0, count - 1);
    inFlight.current = true;
    setNote("NONE");
    setVoted(vote);
    setCount(shown);
    try {
      const answer = await send(publicRef, vote);
      settle(answer.voted, answer.vote_count);
    } catch (error) {
      if (holdsNoSession()) {
        // The session ended on the server, and the website's own fetch dropped its readable cookie before this answer came.
        setVoted(before.voted);
        setCount(before.count);
        say("SIGN_IN");
      } else if (!vote && typeof error === "object" && error !== null && (error as { status?: unknown }).status === 404) {
        // A withdrawal for a debate that left the list deletes the vote and then answers 404: the vote is gone on the server.
        settle(false, shown);
      } else {
        setVoted(before.voted);
        setCount(before.count);
        say("FAILED");
      }
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <div className="libVoteRow">
      <button type="button" className="libVote" data-library-vote aria-pressed={voted} onClick={() => { void press(); }}
        aria-label={tPlural(catalog, "home.upvote.label", count, locale)} aria-describedby={describedBy}>
        <svg className="libVoteArrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path d="M12 3.5 21 13h-5.2v7.5H8.2V13H3z" />
        </svg>
        <span className="libVoteCount" suppressHydrationWarning>{shortVoteCount(locale, count)}</span>
      </button>
      {children}
      {note === "NONE" ? null : (
        <p className="libVoteNote" role="status">
          {note === "SIGN_IN" ? <Link href={signInHref}>{t(catalog, "home.upvote.signedOut")}</Link> : t(catalog, "home.upvote.failed")}
        </p>
      )}
    </div>
  );
}
