import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ContractHttpError, type RunProjection } from "@debateai/contract";
import { handleReportRequest, type ReportReader, type ReportRenderer } from "../../apps/ui/lib/report/reportRoute.js";
import { REPORT_RENDER_LIMITS, ReportRenderGate, type ReportRenderLimits } from "../../apps/ui/lib/report/reportRenderGate.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_LANGUAGE,
  storyFixture
} from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * GET /debate/{id}/report makes a whole PDF in the one UI process. The render
 * gate bounds that: a few at once in the process, one per signed-in session,
 * a short bounded queue, and a quick plain refusal with Retry-After beyond it.
 */

const NOW = new Date("2026-09-26T12:00:00.000Z");
const FAKE_PDF = Buffer.from("%PDF-1.3 fake");
const session = (name: string): string => name.repeat(43).slice(0, 43);

const tryAgain = (JSON.parse(readFileSync(
  resolve(process.cwd(), "apps/ui/messages", STORY_FIXTURE_LANGUAGE.tag, "public.json"), "utf8"
)) as Record<string, string>)["public.report.error.tryAgain"];

function runProjection(): RunProjection {
  return {
    run_ref: STORY_FIXTURE_ANSWER.run_ref,
    question_line: STORY_FIXTURE_ANSWER.question_line,
    state: "SETTLED",
    terminal_reason: null,
    hold_until: null,
    argument_language: STORY_FIXTURE_LANGUAGE
  };
}

const reader: ReportReader = {
  readAnswer: async () => STORY_FIXTURE_ANSWER,
  readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); },
  readRun: async () => runProjection(),
  readAnswerStory: async () => storyFixture("READY"),
  readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); }
};

/** A render that only finishes when the test says so, counting how many run at once. */
function heldRenders() {
  const held: Array<{ finish: () => void; fail: () => void }> = [];
  const state = { active: 0, peak: 0, started: 0 };
  const render: ReportRenderer = () => {
    state.active += 1;
    state.started += 1;
    state.peak = Math.max(state.peak, state.active);
    return new Promise<Buffer>((resolveRender, rejectRender) => {
      held.push({
        finish: () => { state.active -= 1; resolveRender(FAKE_PDF); },
        fail: () => { state.active -= 1; rejectRender(new Error("layout exploded")); }
      });
    });
  };
  return {
    render,
    state,
    finishNext: () => held.shift()!.finish(),
    failNext: () => held.shift()!.fail(),
    started: (count: number) => vi.waitFor(() => expect(state.started).toBe(count))
  };
}

function request(
  sessionCookie: string,
  render: ReportRenderer,
  gate?: ReportRenderGate,
  extra: Readonly<{ signal?: AbortSignal; client?: ReportReader }> = {}
): Promise<Response> {
  return handleReportRequest({
    id: STORY_FIXTURE_DEBATE_ID,
    sessionCookie,
    interfaceLocale: "en",
    client: () => extra.client ?? reader,
    now: NOW,
    render,
    ...(gate === undefined ? {} : { gate }),
    ...(extra.signal === undefined ? {} : { signal: extra.signal })
  });
}

function gate(limits: Partial<ReportRenderLimits>): ReportRenderGate {
  return new ReportRenderGate({ ...REPORT_RENDER_LIMITS, ...limits });
}

/** Lets every pending read and queue step run, so a request that could start would have. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise((done) => setImmediate(done));
}

/** A refusal must come at once; one that waits for a render would hang here, so it fails instead. */
function quickly(pending: Promise<Response>, withinMs = 2_000): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    pending,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`not answered within ${withinMs} ms`)), withinMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function expectRefused(pending: Promise<Response>, status: 429 | 503, retryAfterSeconds: number): Promise<void> {
  const response = await quickly(pending);
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("retry-after")).toBe(String(retryAfterSeconds));
  expect(await response.text()).toBe(tryAgain);
}

describe("the report render gate", () => {
  it("makes at most the process's limit of reports at once, however many owners ask together", async () => {
    expect(REPORT_RENDER_LIMITS.concurrent).toBe(2);
    const renders = heldRenders();
    const owners = ["a", "b", "c", "d", "e", "f"];
    // The process's own gate, as the route uses it.
    const responses = owners.map((owner) => request(session(owner), renders.render));
    await renders.started(REPORT_RENDER_LIMITS.concurrent);
    await settle();
    expect(renders.state.started).toBe(REPORT_RENDER_LIMITS.concurrent);
    for (let finished = 0; finished < owners.length; finished += 1) {
      renders.finishNext();
      await renders.started(Math.min(owners.length, REPORT_RENDER_LIMITS.concurrent + finished + 1));
    }
    for (const response of await Promise.all(responses)) expect(response.status).toBe(200);
    expect(renders.state.peak).toBe(REPORT_RENDER_LIMITS.concurrent);
    expect(renders.state.active).toBe(0);
  });

  it("refuses a second download from the same session while its first is made, and still serves another owner", async () => {
    const renders = heldRenders();
    const fresh = gate({ concurrent: 2, retryAfterSeconds: 7 });
    const first = request(session("a"), renders.render, fresh);
    await renders.started(1);

    await expectRefused(request(session("a"), renders.render, fresh), 429, 7);

    const other = request(session("b"), renders.render, fresh);
    await renders.started(2);
    renders.finishNext();
    renders.finishNext();
    expect((await first).status).toBe(200);
    expect((await other).status).toBe(200);

    // Once the first is done, the same session may download again.
    const again = request(session("a"), renders.render, fresh);
    await renders.started(3);
    renders.finishNext();
    expect((await again).status).toBe(200);
  });

  it("refuses at once when every place and every waiting place is taken", async () => {
    const renders = heldRenders();
    const fresh = gate({ concurrent: 1, waiting: 1, retryAfterSeconds: 5 });
    const making = request(session("a"), renders.render, fresh);
    await renders.started(1);
    const waiting = request(session("b"), renders.render, fresh);
    await settle();

    // Answered while the first render is still held: the refusal never waits for a place.
    await expectRefused(request(session("c"), renders.render, fresh), 503, 5);
    expect(renders.state.started).toBe(1);

    renders.finishNext();
    await renders.started(2);
    renders.finishNext();
    expect((await making).status).toBe(200);
    expect((await waiting).status).toBe(200);
  });

  it("refuses a waiting request whose wait runs out, and frees its waiting place", async () => {
    const renders = heldRenders();
    const fresh = gate({ concurrent: 1, waiting: 1, waitMs: 30, retryAfterSeconds: 5 });
    const making = request(session("a"), renders.render, fresh);
    await renders.started(1);

    await expectRefused(request(session("b"), renders.render, fresh), 503, 5);
    expect(renders.state.started).toBe(1);

    // The same session's place and the waiting place are both free again.
    const later = request(session("b"), renders.render, fresh);
    await settle();
    renders.finishNext();
    await renders.started(2);
    renders.finishNext();
    expect((await making).status).toBe(200);
    expect((await later).status).toBe(200);
  });

  it("frees the place of a render that fails, for the same session and for whoever waits", async () => {
    const renders = heldRenders();
    const fresh = gate({ concurrent: 1, waiting: 1 });
    const failing = request(session("a"), renders.render, fresh);
    await renders.started(1);
    const waiting = request(session("b"), renders.render, fresh);
    await settle();

    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renders.failNext();
    const failed = await failing;
    expect(logged).toHaveBeenCalledWith("[STORY_REPORT_RENDER_FAILED]");
    logged.mockRestore();
    expect(failed.status).toBe(500);
    expect(failed.headers.get("retry-after")).toBeNull();
    await renders.started(2);
    renders.finishNext();
    expect((await waiting).status).toBe(200);

    const retried = request(session("a"), renders.render, fresh);
    await renders.started(3);
    renders.finishNext();
    expect((await retried).status).toBe(200);
    expect(renders.state.active).toBe(0);
  });

  it("drops a download abandoned while it waits: its waiting place and its session are free at once, and it is never made", async () => {
    const renders = heldRenders();
    const fresh = gate({ concurrent: 1, waiting: 1 });
    const making = request(session("a"), renders.render, fresh);
    await renders.started(1);
    const browser = new AbortController();
    const abandoned = request(session("b"), renders.render, fresh, { signal: browser.signal });
    await settle();
    await expectRefused(request(session("c"), renders.render, fresh), 503, 5);

    browser.abort();
    await expectRefused(abandoned, 503, 5);

    // The same session asks again at once: it waits (not 429, not 503) and is served.
    const retried = request(session("b"), renders.render, fresh);
    await settle();
    renders.finishNext();
    await renders.started(2);
    renders.finishNext();
    expect((await making).status).toBe(200);
    expect((await retried).status).toBe(200);
    expect(renders.state.started).toBe(2);
  });

  it("never makes a download abandoned before its render starts, and frees its place", async () => {
    const fresh = gate({ concurrent: 1, waiting: 0 });
    const browser = new AbortController();
    // The browser goes away while the story is being read.
    const client: ReportReader = {
      ...reader,
      readAnswerStory: async () => { browser.abort(); return storyFixture("READY"); }
    };
    const render = vi.fn<ReportRenderer>(async () => FAKE_PDF);
    await expectRefused(request(session("a"), render, fresh, { signal: browser.signal, client }), 503, 5);
    expect(render).not.toHaveBeenCalled();

    const next = await quickly(request(session("b"), render, fresh));
    expect(next.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("serves a single download exactly as before, byte for byte, from a PDF that is a view into a larger buffer", async () => {
    const backing = Buffer.concat([Buffer.from("head"), FAKE_PDF, Buffer.from("tail")]);
    const view = backing.subarray(4, 4 + FAKE_PDF.length);
    expect(view.byteOffset).toBeGreaterThan(0);
    const response = await quickly(request(session("a"), async () => view));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("retry-after")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_PDF);
  });
});

describe("ReportRenderGate", () => {
  it("frees a place once, however many times it is released", async () => {
    const fresh = gate({ concurrent: 1, waiting: 0 });
    const first = await fresh.admit(session("a"));
    expect(first.kind).toBe("admitted");
    if (first.kind !== "admitted") return;
    first.release();
    first.release();
    const second = await fresh.admit(session("b"));
    expect(second.kind).toBe("admitted");
    // A second release that counted would have opened a second place here.
    expect((await fresh.admit(session("c"))).kind).toBe("full");
    if (second.kind === "admitted") second.release();
  });

  it("clears an abandoned wait's own timer, so it can never free the place a later request of its session holds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const fresh = gate({ concurrent: 1, waiting: 1, waitMs: 1_000 });
      const first = await fresh.admit(session("a"));
      const browser = new AbortController();
      const abandoned = fresh.admit(session("b"), browser.signal);
      expect(vi.getTimerCount()).toBe(1);
      browser.abort();
      expect((await abandoned).kind).toBe("full");
      expect(vi.getTimerCount()).toBe(0);

      const retried = fresh.admit(session("b"));
      // Past the abandoned wait's deadline: the retried wait still holds b's place.
      vi.advanceTimersByTime(999);
      expect((await fresh.admit(session("b"))).kind).toBe("busy");
      if (first.kind === "admitted") first.release();
      expect((await retried).kind).toBe("admitted");
    } finally {
      vi.useRealTimers();
    }
  });
});
