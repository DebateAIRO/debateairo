import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { loadReportCatalogs } from "../../apps/ui/lib/report/reportLanguage.js";
import {
  createReportRenderClient,
  resolveReportWorkerEntry,
  type ReportRenderInput,
  type ReportWorkerHandle
} from "../../apps/ui/lib/report/reportRenderWorker.js";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";

/**
 * NV-27: the main thread's report worker client. A fake worker stands in for every case but the last, which renders
 * one real report through the default spawn (plain Node, the folder's own tsx) as a fast check of the loading path.
 */

type Posted = Readonly<{ id: number; input: unknown }>;
class FakeWorker extends EventEmitter {
  readonly posted: Posted[] = [];
  terminated = 0;
  throwOnPost: Error | null = null;
  postMessage(message: Posted): void {
    if (this.throwOnPost !== null) throw this.throwOnPost;
    this.posted.push(message);
  }
  terminate(): Promise<number> {
    this.terminated += 1;
    queueMicrotask(() => this.emit("exit", 1));
    return Promise.resolve(1);
  }
  unref(): void { /* nothing to keep alive */ }
  reply(id: number, text: string): void {
    const bytes = new Uint8Array(Buffer.from(text, "latin1"));
    this.emit("message", { id, ok: true, bytes });
  }
}

const INPUT = { answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY"), disclosure: null, generatedAt: new Date(0) } as unknown as ReportRenderInput;

function fakes() {
  const workers: FakeWorker[] = [];
  const spawn = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as ReportWorkerHandle; });
  return { workers, spawn };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createReportRenderClient (NV-27)", () => {
  it("gives each of two concurrent renders its own bytes, out of order, as a Buffer over the transferred buffer, from one worker", async () => {
    const { workers, spawn } = fakes();
    const client = createReportRenderClient({ spawn });
    const first = client.render(INPUT);
    const second = client.render(INPUT);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [a, b] = workers[0]!.posted;
    workers[0]!.reply(b!.id, "%PDF-second");
    workers[0]!.reply(a!.id, "%PDF-first");
    const [one, two] = await Promise.all([first, second]);
    expect(Buffer.isBuffer(one)).toBe(true);
    expect(one.toString("latin1")).toBe("%PDF-first");
    expect(two.toString("latin1")).toBe("%PDF-second");
  });

  it("rejects only the render the worker says failed, and reuses the worker", async () => {
    const { workers, spawn } = fakes();
    const client = createReportRenderClient({ spawn });
    const failed = client.render(INPUT);
    workers[0]!.emit("message", { id: workers[0]!.posted[0]!.id, ok: false });
    await expect(failed).rejects.toThrow("REPORT_RENDER_FAILED");
    const next = client.render(INPUT);
    workers[0]!.reply(workers[0]!.posted[1]!.id, "%PDF-next");
    expect((await next).toString("latin1")).toBe("%PDF-next");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it.each(["exit", "error"] as const)("on %s rejects every pending render, spawns anew, and ignores the old worker's late reply", async (event) => {
    const { workers, spawn } = fakes();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createReportRenderClient({ spawn });
    const pending = [client.render(INPUT), client.render(INPUT)];
    const ids = workers[0]!.posted.map((posted) => posted.id);
    workers[0]!.emit(event, event === "exit" ? 1 : new Error("boom"));
    for (const render of pending) await expect(render).rejects.toThrow("REPORT_WORKER_ENDED");
    expect(errors.mock.calls.map((args) => args[0])).toEqual(["[STORY_REPORT_WORKER_ENDED]"]);
    const next = client.render(INPUT);
    expect(spawn).toHaveBeenCalledTimes(2);
    // The first worker's late answer for an id it had: nothing resolves from it.
    workers[0]!.reply(ids[0]!, "%PDF-late");
    workers[1]!.reply(workers[1]!.posted[0]!.id, "%PDF-fresh");
    expect((await next).toString("latin1")).toBe("%PDF-fresh");
  });

  it("terminates the worker at the deadline, rejects the render, and spawns anew for the next one", async () => {
    vi.useFakeTimers();
    const { workers, spawn } = fakes();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createReportRenderClient({ spawn, deadlineMs: 1_000 });
    const slow = client.render(INPUT);
    const caught = slow.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(workers[0]!.terminated).toBe(1);
    expect(await caught).toBeInstanceOf(Error);
    expect(String(await caught)).toContain("REPORT_WORKER_ENDED");
    // Forgotten at the deadline, not at its exit: the next render never goes to the dying worker.
    void client.render(INPUT).catch(() => undefined);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(workers[0]!.posted).toHaveLength(1);
    await client.stop();
  });

  it("rejects a render whose post throws, and keeps the worker", async () => {
    const { workers, spawn } = fakes();
    const client = createReportRenderClient({ spawn });
    const worker = (client.render(INPUT), workers[0]!);
    worker.throwOnPost = new DOMException("could not be cloned", "DataCloneError");
    await expect(client.render(INPUT)).rejects.toThrow("REPORT_RENDER_FAILED");
    worker.throwOnPost = null;
    const next = client.render(INPUT);
    worker.reply(worker.posted.at(-1)!.id, "%PDF-kept");
    expect((await next).toString("latin1")).toBe("%PDF-kept");
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("stop() terminates without the ended line; an unexpected exit logs it once", async () => {
    const { workers, spawn } = fakes();
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = createReportRenderClient({ spawn });
    const stopped = client.render(INPUT).catch((error: unknown) => error);
    await client.stop();
    expect(workers[0]!.terminated).toBe(1);
    expect(String(await stopped)).toContain("REPORT_WORKER_ENDED");
    await Promise.resolve();
    expect(errors).not.toHaveBeenCalled();
    const crashed = client.render(INPUT).catch(() => undefined);
    workers[1]!.emit("exit", 1);
    workers[1]!.emit("exit", 1);
    await crashed;
    expect(errors.mock.calls.map((args) => args[0])).toEqual(["[STORY_REPORT_WORKER_ENDED]"]);
  });
});

describe("resolveReportWorkerEntry (NV-27)", () => {
  it("finds the entry from apps/ui and from the repository root, and refuses elsewhere", () => {
    const root = mkdtempSync(join(tmpdir(), "nv27-entry-"));
    try {
      mkdirSync(join(root, "apps/ui"), { recursive: true });
      writeFileSync(join(root, "apps/ui/report-worker.mjs"), "");
      expect(resolveReportWorkerEntry(join(root, "apps/ui"))).toBe(join(root, "apps/ui/report-worker.mjs"));
      expect(resolveReportWorkerEntry(root)).toBe(join(root, "apps/ui/report-worker.mjs"));
      const empty = mkdtempSync(join(tmpdir(), "nv27-empty-"));
      try {
        expect(() => resolveReportWorkerEntry(empty)).toThrow("REPORT_WORKER_UNRESOLVED");
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the worker's sources (NV-27)", () => {
  const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  it("sets tsx's cache switch before its only, dynamic, import of tsx, and loads the report code with the scripts tsconfig", () => {
    const entry = source("apps/ui/report-worker.mjs");
    const code = entry.replace(/\/\*[\s\S]*?\*\//gu, "");
    const imports = code.match(/import\("tsx\/esm\/api"\)/gu) ?? [];
    expect(imports).toHaveLength(1);
    expect(code.indexOf('process.env.TSX_DISABLE_CACHE = "1"')).toBeGreaterThan(-1);
    expect(code.indexOf('process.env.TSX_DISABLE_CACHE = "1"')).toBeLessThan(code.indexOf('import("tsx/esm/api")'));
    expect(entry).not.toMatch(/^\s*import\s[^;]*["']tsx/mu);
    expect(entry).toContain("./lib/report/renderReport.ts");
    expect(entry).toContain("tsconfig.scripts.json");
  });
  it("spawns with an empty execArgv, and the route renders only through the worker", () => {
    expect(source("apps/ui/lib/report/reportRenderWorker.ts")).toContain("execArgv: []");
    const route = source("apps/ui/lib/report/reportRoute.ts");
    expect(route).not.toContain('from "./renderReport.js"');
    expect(route).toContain("input.render ?? renderReportPdfOffThread");
  });
});

describe("one real render through the worker (NV-27)", () => {
  it("renders the fixture report to a PDF in the worker thread", async () => {
    const client = createReportRenderClient();
    try {
      const catalogs = await loadReportCatalogs({ questionTag: "en", interfaceLocale: "en", load: loadNamespace });
      const pdf = await client.render({
        answer: STORY_FIXTURE_ANSWER, story: storyFixture("READY"), disclosure: null,
        generatedAt: new Date("2026-09-26T12:00:00.000Z"), catalogs
      });
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    } finally {
      await client.stop();
    }
  }, 60_000);
});
