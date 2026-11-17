import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import type { Answer, AnswerStory, Session } from "@debateai/contract";
import { ContractHttpError } from "@debateai/contract";
import { createReadinessResponder } from "../../apps/ui/release-edge.mjs";
import { handleReportRequest, type ReportReader } from "../../apps/ui/lib/report/reportRoute.js";
import { REPORT_RENDER_LIMITS, ReportRenderGate } from "../../apps/ui/lib/report/reportRenderGate.js";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_LANGUAGE,
  storyFixture,
  storyFixtureEdge,
  storyFixtureNode
} from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * NV-27, the boundary: two concurrent 150-point report downloads must not stall the event loop that answers the
 * website's /readyz. A child process probes /readyz every 100 ms with Caddy's 3 s timeout while the two reports are
 * made through the route's own default renderer; the main loop's longest delay stays under 250 ms and every probe
 * sent during the renders answers 200 within 2 s.
 */

// Key-shaped values are built from pieces, so no line pairs a *_KEY name with a literal (gitleaks).
const KEY = ["r17", "0123456789ab"].join("-");
const NOW = new Date("2026-09-26T12:00:00.000Z");
const SESSION = "s".repeat(43);
/** The owners GET /v1/session names (the render gate's key, NV-26); this file's own, not the route test's. */
const OWNER_SESSION: Session = {
  asker_id: "owner:00000000-0000-4000-8000-0000000000a1",
  session_id: "00000000-0000-4000-8000-000000000001",
  caller_scope: "ASKER",
  ownership_provenance: "server_session",
  provisional_identity_model: false
};

/** The 150-point answer of tests/render/story-report-pdf.test.tsx ("renders a 150-point appendix across many pages"). */
function answerWithPoints(roots: number, childrenPerRoot: number): Answer {
  const nodes: Answer["nodes"] = [];
  const edges: Answer["edges"] = [];
  for (let root = 0; root < roots; root += 1) {
    nodes.push(storyFixtureNode({
      id: `r${root}`, claim: `Poziția ${root + 1}: mutarea în Cluj merită doar cu lucru hibrid.`, way: "REASONING",
      base: 0.5, final: 0.5, maker: "OpenAI", review: null, locator: null, marks: []
    }));
    for (let child = 0; child < childrenPerRoot; child += 1) {
      nodes.push(storyFixtureNode({
        id: `r${root}-c${child}`, claim: `Argumentul ${child + 1} pentru poziția ${root + 1}: chiria și școala contează.`,
        way: "REASONING", base: 0.4, final: 0.4, maker: "Anthropic",
        review: { outcome: "agree", by: "xAI", reason: "Argumentul se sprijină pe datele din dezbatere." },
        locator: null, marks: []
      }));
      edges.push(storyFixtureEdge({ from: `r${root}-c${child}`, to: `r${root}`, relation: "support", strength: 0.4 }));
    }
  }
  return { ...STORY_FIXTURE_ANSWER, nodes, edges };
}

const ANSWER = answerWithPoints(10, 14);
const STORY: AnswerStory = { ...storyFixture("READY"), point_numbers: null };

function reader(owner: string): ReportReader {
  return {
    readAnswer: async () => ANSWER,
    readRunAnswer: async () => { throw new ContractHttpError("NOT_FOUND", 404, "ANSWER_NOT_SERVED"); },
    readRun: async () => ({
      run_ref: ANSWER.run_ref, question_line: ANSWER.question_line, state: "SETTLED", terminal_reason: null, hold_until: null,
      argument_language: { tag: STORY_FIXTURE_LANGUAGE.tag, name: STORY_FIXTURE_LANGUAGE.name }
    }),
    readAnswerStory: async () => STORY,
    readAnswerDisclosure: async () => { throw new ContractHttpError("NOT_FOUND", 404, "DISCLOSURE_NOT_FOUND"); },
    readSession: async () => ({ ...OWNER_SESSION, asker_id: owner })
  };
}

/** The prober: Caddy's view of the website. Date.now() on both sides, so its `sent` compares with this process's. */
const PROBER = `
const url = process.argv[1];
let open = 0;
let ended = false;
const done = () => { if (ended && open === 0) process.exit(0); };
const tick = setInterval(() => {
  const sent = Date.now();
  open += 1;
  fetch(url, { signal: AbortSignal.timeout(3000) })
    .then(async (response) => { await response.arrayBuffer(); return response.status; })
    .catch(() => 0)
    .then((status) => {
      process.stdout.write(JSON.stringify({ sent, ms: Date.now() - sent, status }) + "\\n");
      open -= 1;
      done();
    });
}, 100);
process.stdin.on("end", () => { ended = true; clearInterval(tick); done(); });
process.stdin.resume();
`;

type Probe = Readonly<{ sent: number; ms: number; status: number }>;

const servers: Server[] = [];
async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

afterAll(async () => {
  for (const server of servers) await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  // Guarded: the file loads, and fails by assertion, before the worker module exists.
  try {
    const worker = await import("../../apps/ui/lib/report/" + "reportRenderWorker.ts") as { stopReportRenderWorker?: () => Promise<void> | void };
    await worker.stopReportRenderWorker?.();
  } catch { /* not there yet */ }
});

describe("NV-27: report rendering never stalls the website's readiness loop", () => {
  it("answers every probe within 2 s, and the loop never waits 250 ms, while two 150-point reports are made", async () => {
    const api = await listen(createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ready: true, releaseKey: KEY, reasons: [] }));
    }));
    // The shipped default API wait (no timeoutMs), as server.mjs passes it.
    const respond = createReadinessResponder({ apiBase: api, releaseKey: KEY, fetch: globalThis.fetch, draining: () => false });
    const website = await listen(createServer((request, response) => {
      if (!respond(request, response)) { response.statusCode = 404; response.end(); }
    }));

    // Every module the route reads (catalogs, i18n) is loaded once before the measurement, with a fake PDF.
    const warm = await handleReportRequest({
      id: STORY_FIXTURE_DEBATE_ID, sessionCookie: SESSION, interfaceLocale: "en", client: () => reader("owner-warm"), now: NOW,
      render: async () => Buffer.from("%PDF-1.3 warm"), gate: new ReportRenderGate(REPORT_RENDER_LIMITS)
    });
    expect(warm.status).toBe(200);

    const prober = spawn(process.execPath, ["--input-type=module", "-e", PROBER, `${website}/readyz`], { stdio: ["pipe", "pipe", "inherit"] });
    const probes: Probe[] = [];
    let buffered = "";
    let firstPass: () => void = () => undefined;
    const ready = new Promise<void>((resolveReady) => { firstPass = resolveReady; });
    prober.stdout.setEncoding("utf8");
    prober.stdout.on("data", (chunk: string) => {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const probe = JSON.parse(buffered.slice(0, newline)) as Probe;
        buffered = buffered.slice(newline + 1);
        probes.push(probe);
        if (probe.status === 200) firstPass();
        newline = buffered.indexOf("\n");
      }
    });
    const exited = once(prober, "exit");
    await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error("no 200 probe within 5 s")), 5_000))]);

    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const t0 = Date.now();
    const gate = new ReportRenderGate(REPORT_RENDER_LIMITS);
    const download = (owner: string) => handleReportRequest({
      id: STORY_FIXTURE_DEBATE_ID, sessionCookie: SESSION, interfaceLocale: "en", client: () => reader(owner), now: NOW, gate
    });
    const responses = await Promise.all([download("owner-a"), download("owner-b")]);
    const t1 = Date.now();
    // The histogram's timer sees a stretch only once the loop turns again, so it stays on through the tail.
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    histogram.disable();
    prober.stdin.end();
    await exited;

    const during = probes.filter((probe) => probe.sent >= t0 && probe.sent <= t1);
    const longestDelayMs = histogram.max / 1e6;
    const slowest = during.reduce<Probe | null>((worst, probe) => (worst === null || probe.ms > worst.ms ? probe : worst), null);
    console.log(JSON.stringify({
      event: "nv27.loop_stall", rendersMs: t1 - t0, longestDelayMs, probes: during.length, slowest,
      probeMs: during.map((probe) => (probe.status === 200 ? probe.ms : -probe.ms))
    }));

    for (const response of responses) {
      expect(response.status).toBe(200);
      const pdf = Buffer.from(await response.arrayBuffer());
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(20);
    }
    expect(longestDelayMs).toBeLessThan(250);
    expect(during.length).toBeGreaterThanOrEqual(5);
    for (const probe of during) expect(probe, JSON.stringify(probe)).toMatchObject({ status: 200 });
    for (const probe of during) expect(probe.ms, JSON.stringify(probe)).toBeLessThan(2_000);
  }, 240_000);
});
