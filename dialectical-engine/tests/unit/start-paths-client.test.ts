/**
 * V4 start step, Task 10 (spec 2026-11-03 §4.1): the page's four calls before Start and the live-event frame reader.
 * Frames split on blank lines (LF or CRLF); comment lines (":") are ignored; frames without data are dropped; a frame
 * cut across chunks waits in `rest`. The two streams post with `accept: text/event-stream` and the CSRF pair; every
 * event is schema-read; the merge resolves from its `menu` or `none` event, and a stream with neither is an invalid
 * response; a refusal (409 START_PATHS_STALE) rejects with its status.
 */
import { describe, expect, it } from "vitest";
import { ContractHttpError, StartMergeRequestSchema, createContractClient, parseStartStepFrames, type StartListsEvent } from "@debateai/contract";

const REF = "eyJhIjoxfQ.c2lnbmF0dXJl";
const MENU = {
  menu_id: "AAAAAAAAAAAAAAAAAAAAAA", revision: 1, language: { code: "en", name: "English" },
  angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: [{ viewpoint_id: "pt11", title: "Whole-system costs", question: "What does the whole system cost?", why: "It decides it.",
    angle_id: "g1", repeat_ids: [] }],
  repeats: [],
  paths: [{ path_ref: "kp01", title: "Whole-system costs", question: "What does the whole system cost?", viewpoint_ids: ["pt11"],
    put_together: false, is_new: false }],
  cards: [], suggestions: []
};

type Seen = { url: string; init: RequestInit };
/** A fetch that answers every call with `body` (a stream of `chunks` when given) and records what was sent. */
function fakeFetch(status: number, chunks: readonly string[], seen: Seen[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), init: init ?? {} });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    } });
    return new Response(stream, { status, headers: { "content-type": status === 200 ? "text/event-stream" : "application/json" } });
  }) as typeof fetch;
}
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const client = (fetchImplementation: typeof fetch) =>
  createContractClient("https://api.example.test", fetchImplementation, { mode: "cookie", cookieHeader: "s=1", csrfToken: () => "t" });
const LISTS_INPUT = { question_line: "Should Romania build new nuclear plants?", reading_level: "plain" } as const;
const MERGE_INPUT = StartMergeRequestSchema.parse({ question_line: "Should Romania build new nuclear plants?", check_ref: REF,
  reading_level: "plain", lists: [{ ref: REF, list: { list_no: 1, angles: MENU.angles,
    viewpoints: MENU.viewpoints.map(({ repeat_ids: _drop, ...words }) => words) } }] });

describe("the start step's frame reader", () => {
  it("reads whole frames, skips comments and data-less frames, and keeps a cut frame for the next chunk", () => {
    const read = parseStartStepFrames(": keep-alive\n\nevent: progress\ndata: {\"answered\":1,\"of\":4}\n\nevent: li");
    expect(read.events).toEqual([{ event: "progress", data: { answered: 1, of: 4 } }]);
    expect(read.rest).toBe("event: li");
  });

  it("reads CRLF frames", () => {
    const read = parseStartStepFrames("event: cut\r\ndata: {\"lists_in\":2}\r\n\r\nevent: end\r\ndata: {\"reason\":\"DONE\"}\r\n\r\n");
    expect(read.events).toEqual([{ event: "cut", data: { lists_in: 2 } }, { event: "end", data: { reason: "DONE" } }]);
    expect(read.rest).toBe("");
  });
});

describe("the start step's calls", () => {
  it("posts the lists as an event stream with the CSRF pair and hands each event on, in order", async () => {
    const seen: Seen[] = [];
    const check = frame("check", { check_ref: REF, language: { code: "en", name: "English" }, seats: 4 });
    const end = frame("end", { reason: "DONE" });
    const fetchImplementation = fakeFetch(200, [check.slice(0, 20), check.slice(20) + ": keep-alive\n\n", end], seen);
    const got: StartListsEvent[] = [];
    await client(fetchImplementation).startPathLists(LISTS_INPUT, (event) => { got.push(event); }, new AbortController().signal);
    expect(got.map((event) => event.event)).toEqual(["check", "end"]);
    expect(seen[0]!.url).toBe("https://api.example.test/v1/asks/paths/lists");
    const headers = new Headers(seen[0]!.init.headers);
    expect([seen[0]!.init.method, headers.get("accept"), headers.get("x-csrf-token"), headers.get("cookie")])
      .toEqual(["POST", "text/event-stream", "t", "s=1"]);
  });

  it("resolves the merge from its menu, from none, and refuses a stream with neither", async () => {
    const menu = await client(fakeFetch(200, [frame("menu", { source: "AI", menu: { menu: MENU, ref: REF } }), frame("end", { reason: "DONE" })]))
      .startPathMerge(MERGE_INPUT);
    expect(menu).toMatchObject({ source: "AI", menu: { ref: REF } });
    const none = await client(fakeFetch(200, [frame("none", { reason: "DEADLINE" }), frame("end", { reason: "NONE" })])).startPathMerge(MERGE_INPUT);
    expect(none).toEqual({ source: "NONE", reason: "DEADLINE" });
    await expect(client(fakeFetch(200, [frame("end", { reason: "DONE" })])).startPathMerge(MERGE_INPUT))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
  });

  it("rejects a refused fit with its status", async () => {
    const refused = fakeFetch(409, [JSON.stringify({ error: "START_PATHS_STALE", message: "START_PATHS_STALE" })]);
    const fit = client(refused).startPathFit({ question_line: "Should Romania build new nuclear plants?", check_ref: REF, reading_level: "plain",
      own_text: "What about the people who live near the plants?", paths: [{ key: "kp01", title: "Costs", question: "What does it cost?" }] });
    await expect(fit).rejects.toBeInstanceOf(ContractHttpError);
    await expect(fit).rejects.toMatchObject({ status: 409 });
  });
});
