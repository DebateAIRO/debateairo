import type { FastifyReply } from "fastify";
import { RUN_EVENT_HEARTBEAT_FRAME } from "../run-event-tail.js";

/**
 * V4 start step, Task 30 (spec 2026-11-03 §4.1): THE STREAM WRITER of the two calls before Start that answer as they go, the
 * lists and the merge (POST /v1/asks/paths/lists and …/merge). One frame per event (`event: <name>`, `data: <json>`), a comment
 * line (`: keep-alive`) every `heartbeatMs` so no proxy closes a quiet stream, and exactly one `end`, the last frame: after it,
 * nothing more is written.
 *
 * It stops on its own in three cases. This process drains (asked every START_STREAM_DRAIN_POLL_MS): the route's `onStop` writes
 * its own end, and the page reads again from the next process. The stream outlives `maxLifeMs`: the route's `onStop` says
 * DEADLINE. The person's page goes (`clientGone`): nothing more is written, not even a heartbeat. Whichever way it stops, `signal`
 * aborts; the route hands it to the step, whose listener then stops listening, while the calls already started run on and count
 * once (plan, Calls item 8). The route writes the head's security headers (`headers`); this writer adds the stream's own three.
 */
export const START_STREAM_DRAIN_POLL_MS = 1_000 as const;

export type StartStream = Readonly<{
  signal: AbortSignal;
  write(event: string, data: unknown): void;
  end(event: string, data: unknown): void;
  ended(): boolean;
}>;
export type StartStreamStop = "DRAINING" | "MAX_LIFE";

/** The person's page gone: this answer's connection closed before the answer ended (a stream's or a JSON one). */
export function startClientGoneOf(reply: FastifyReply): AbortSignal {
  const gone = new AbortController();
  const raw = reply.raw;
  raw.once("close", () => {
    if (!raw.writableEnded) gone.abort();
  });
  return gone.signal;
}

const frameOf = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function openStartStream(reply: FastifyReply, input: Readonly<{
  headers: Readonly<Record<string, string | string[]>>; heartbeatMs: number; maxLifeMs: number; draining: () => boolean;
  onStop(cause: StartStreamStop, stream: StartStream): void; clientGone: AbortSignal;
}>): StartStream {
  const raw = reply.raw;
  const stopped = new AbortController();
  let ended = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let drainPoll: ReturnType<typeof setInterval> | undefined;
  let maxLife: ReturnType<typeof setTimeout> | undefined;
  const open = (): boolean => !ended && !raw.destroyed && !raw.writableEnded;
  const finish = (): void => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat);
    clearInterval(drainPoll);
    clearTimeout(maxLife);
    input.clientGone.removeEventListener("abort", gone);
    stopped.abort();
  };
  const close = (): void => {
    const writable = !raw.destroyed && !raw.writableEnded;
    finish();
    if (writable) raw.end();
  };
  const gone = (): void => {
    finish();
  };
  const stream: StartStream = Object.freeze({
    signal: stopped.signal,
    write(event: string, data: unknown): void {
      if (open()) raw.write(frameOf(event, data));
    },
    end(event: string, data: unknown): void {
      if (ended) return;
      if (open()) raw.write(frameOf(event, data));
      close();
    },
    ended: () => ended
  });
  /** Each cause stops it once: the route's own end, else (a route that wrote none, or threw) the stream closes without one. */
  const stop = (cause: StartStreamStop): void => {
    if (ended) return;
    try {
      input.onStop(cause, stream);
    } catch {
      // the stream still ends below
    }
    if (!ended) close();
  };
  if (input.clientGone.aborted) {
    finish();
    return stream;
  }
  input.clientGone.addEventListener("abort", gone, { once: true });
  raw.writeHead(200, { ...input.headers, "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  heartbeat = setInterval(() => {
    if (open()) raw.write(RUN_EVENT_HEARTBEAT_FRAME);
  }, input.heartbeatMs);
  drainPoll = setInterval(() => {
    let draining = false;
    try {
      draining = input.draining();
    } catch {
      // a readiness that cannot answer is not a drain
    }
    if (draining) stop("DRAINING");
  }, START_STREAM_DRAIN_POLL_MS);
  maxLife = setTimeout(() => {
    stop("MAX_LIFE");
  }, input.maxLifeMs);
  return stream;
}
