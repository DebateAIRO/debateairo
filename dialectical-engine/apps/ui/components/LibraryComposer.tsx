"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COOKIE_SESSION_MARKER, createDebate, validateSession } from "@/lib/api";

/* The claim field rests at one line and grows with what is typed. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field === null) return;
  field.style.height = "auto";
  const border = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + border}px`;
}

export function LibraryComposer() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = topic.trim().length > 6;

  async function start() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await validateSession();
      const debate = await createDebate(
        topic.trim(), { max_depth: 3, branching: 2, max_tokens: 800 }, COOKIE_SESSION_MARKER
      );
      router.push(`/debate/${debate.id}`);
      return;
    } catch {
      // fall through to the authenticated /new flow
    }
    router.push(`/new?topic=${encodeURIComponent(topic.trim())}`);
    setBusy(false);
  }

  return (
    <div className="libComposer">
      <div className="libComposerCore">
        <textarea
          id="library-claim"
          className="libComposerInput"
          aria-label="Debate claim"
          ref={grow}
          rows={1}
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            grow(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void start();
            }
          }}
          placeholder="Type a debatable claim or question…"
        />
        <div className="libComposerFoot">
          <p className="libComposerHint">Models argue · you judge</p>
          <span className="libComposerSpacer" aria-hidden />
          <button type="button" className="libStart" onClick={start} disabled={!ready || busy}>
            {busy ? "Starting…" : "Start debate"} <span aria-hidden>→</span>
          </button>
        </div>
        {error ? <div className="error" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>
    </div>
  );
}
