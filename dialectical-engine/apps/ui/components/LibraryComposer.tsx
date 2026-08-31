"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { COOKIE_SESSION_MARKER, createDebate, validateSession } from "@/lib/api";

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
    <div>
      <div className="composer">
        <input
          className="input"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") start();
          }}
          placeholder="Type a debatable claim or question…"
          aria-label="Debate claim"
        />
        <button
          type="button"
          className={`startBtn${ready ? " ready" : ""}`}
          onClick={start}
          disabled={!ready || busy}
        >
          {busy ? "Starting…" : "Start debate"} <span aria-hidden>→</span>
        </button>
      </div>
      <p className="muted">Models argue · you judge</p>
      {error ? (
        <div className="error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
