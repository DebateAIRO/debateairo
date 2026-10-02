// tests/support/connectorReplay.ts
// Replays one recorded connector step (tools/billing/record-connector.ts) through a client's injected `fetch`: each
// call must be the recorded request — scrubbed with the SAME rules as the recording — and gets the recorded reply.
import { isDeepStrictEqual } from "node:util";
import type { RecordedExchange } from "../../tools/billing/record-connector.js";
import { scrubConnectorValue } from "../../tools/billing/scrub-connector-fixture.js";

export const REPLAY_BASE_URL = "https://replay.invalid/api";
const REPLAY_BASE_PATH = new URL(REPLAY_BASE_URL).pathname;

function parsedBody(body: unknown): unknown {
  if (typeof body !== "string") return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function replyOf(response: RecordedExchange["response"]): Response {
  const body = response.body;
  if (typeof body === "object" && body !== null && "startsWithPdf" in body) {
    // A recorded document keeps only its shape: rebuild bytes of that length with the recorded first four.
    const shape = body as { bytes: number; startsWithPdf: boolean };
    const bytes = Buffer.alloc(shape.bytes, 0x20);
    if (shape.startsWithPdf) bytes.write("%PDF", 0, "latin1");
    return new Response(bytes, { status: response.status, headers: { "content-type": response.contentType } });
  }
  return new Response(JSON.stringify(body), { status: response.status, headers: { "content-type": response.contentType } });
}

export function replayFetch(
  exchanges: ReadonlyArray<RecordedExchange>, secrets: ReadonlyArray<string> = []
): Readonly<{ fetch: typeof fetch; mismatches: string[]; unused(): number }> {
  const mismatches: string[] = [];
  let next = 0;
  const replay: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const index = next;
    next += 1;
    const recorded = exchanges[index];
    const live = scrubConnectorValue({
      method: init?.method ?? "GET",
      path: url.pathname.startsWith(REPLAY_BASE_PATH) ? url.pathname.slice(REPLAY_BASE_PATH.length) || "/" : url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: parsedBody(init?.body)
    }, secrets);
    if (recorded === undefined) {
      mismatches.push(`call ${index + 1}: the recording has no such call: ${JSON.stringify(live)}`);
      return new Response(JSON.stringify({ error: "not recorded" }), { status: 599 });
    }
    if (!isDeepStrictEqual(live, recorded.request)) {
      mismatches.push(`call ${index + 1}: sent ${JSON.stringify(live)} but the recording sent ${JSON.stringify(recorded.request)}`);
    }
    return replyOf(recorded.response);
  };
  return { fetch: replay, mismatches, unused: () => exchanges.length - next };
}
