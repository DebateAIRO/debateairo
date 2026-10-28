import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { Answer, AnswerDisclosure, AnswerStory } from "@debateai/contract";
import type { ReportCatalogs } from "./reportLanguage.js";

/**
 * NV-27: the main thread's side of the report worker (apps/ui/report-worker.mjs). react-pdf lays a whole report out
 * synchronously, so the PDF is made in one worker thread, never on the event loop that answers /readyz and every page.
 * This thread only posts the input, receives the bytes, and lets the route release its render-gate place. Nothing here
 * imports the renderer: the route's graph no longer carries react-pdf.
 */

/** The route's ReportRenderer input: plain data and one Date, so it crosses to the worker by structured clone. */
export type ReportRenderInput = Readonly<{
  answer: Answer;
  story: AnswerStory;
  disclosure: AnswerDisclosure | null;
  generatedAt: Date;
  catalogs: ReportCatalogs;
}>;

/**
 * Past this a render is abandoned and its worker terminated: the 150-point report's test budget, and under the
 * server's 300 s request limit. Both admitted renders share the one worker, so each one's time includes the other's.
 */
export const REPORT_RENDER_DEADLINE_MS = 120_000;

/**
 * The worker's entry, resolved from the working directory the way resolveReportFontDirectory finds the fonts (no
 * machine path): the UI process runs from apps/ui, the root test suite from the repository root. Throws
 * REPORT_WORKER_UNRESOLVED (the route's 500) when neither holds it.
 */
export function resolveReportWorkerEntry(cwd: string = process.cwd()): string {
  for (const candidate of [resolve(cwd, "report-worker.mjs"), resolve(cwd, "apps/ui/report-worker.mjs")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("REPORT_WORKER_UNRESOLVED");
}

/** The part of a worker_threads Worker the client uses. */
export type ReportWorkerHandle = Readonly<{
  postMessage(message: unknown): void;
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  terminate(): unknown;
  unref(): void;
}>;

type Pending = Readonly<{ resolve: (pdf: Buffer) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>;
type WorkerState = { readonly handle: ReportWorkerHandle; readonly pending: Map<number, Pending>; ended: boolean; stopping: boolean };

/**
 * The default spawn. `execArgv: []` is load-bearing, for the argon2 pool's reason
 * (packages/crypto/src/argon2-worker-pool.ts): a worker must not inherit the parent's loader flags (a Vitest or tsx
 * loader plain node does not have); report-worker.mjs loads the folder's own tsx itself.
 */
function spawnReportWorker(): ReportWorkerHandle {
  return new Worker(resolveReportWorkerEntry(), { execArgv: [], name: "report-render" }) as unknown as ReportWorkerHandle;
}

/**
 * One lazy, unref'd worker per process: both admitted renders run in it, so one JavaScript thread lays reports out
 * (today's CPU and memory model), now not the one that serves pages. Each render gets an id and a deadline that
 * terminates the worker. A reply resolves its own render's bytes (no copy) or rejects REPORT_RENDER_FAILED. The worker's
 * error or exit rejects every render pending on it with REPORT_WORKER_ENDED, logs one fixed line unless stop() caused
 * it, and the next render spawns a new worker. State is kept per worker, so a late event from an old worker never
 * touches a new one's renders. Creating the client spawns nothing.
 */
export function createReportRenderClient(options: Readonly<{
  spawn?: () => ReportWorkerHandle;
  deadlineMs?: number;
}> = {}): Readonly<{ render(input: ReportRenderInput): Promise<Buffer>; stop(): Promise<void> }> {
  const spawn = options.spawn ?? spawnReportWorker;
  const deadlineMs = options.deadlineMs ?? REPORT_RENDER_DEADLINE_MS;
  let current: WorkerState | null = null;
  let nextId = 0;

  const end = (state: WorkerState, logged: boolean): void => {
    if (state.ended) return;
    state.ended = true;
    if (current === state) current = null;
    if (logged && !state.stopping) console.error("[STORY_REPORT_WORKER_ENDED]");
    for (const [id, pending] of state.pending) {
      clearTimeout(pending.timer);
      state.pending.delete(id);
      pending.reject(new Error("REPORT_WORKER_ENDED"));
    }
  };

  const start = (): WorkerState => {
    const handle = spawn();
    const state: WorkerState = { handle, pending: new Map(), ended: false, stopping: false };
    handle.unref();
    handle.on("message", (message) => {
      const reply = message as { id?: unknown; ok?: unknown; bytes?: unknown } | null;
      const id = typeof reply?.id === "number" ? reply.id : undefined;
      const pending = id === undefined ? undefined : state.pending.get(id);
      if (id === undefined || pending === undefined) return;
      state.pending.delete(id);
      clearTimeout(pending.timer);
      if (reply?.ok === true && reply.bytes instanceof Uint8Array) {
        pending.resolve(Buffer.from(reply.bytes.buffer, reply.bytes.byteOffset, reply.bytes.byteLength));
      } else {
        pending.reject(new Error("REPORT_RENDER_FAILED"));
      }
    });
    handle.on("error", () => end(state, true));
    handle.on("exit", () => end(state, true));
    return state;
  };

  /** Ends a worker on purpose (the deadline, or stop()); it is forgotten at once, so no new render is posted to it. */
  const terminate = (state: WorkerState, logged: boolean): void => {
    if (current === state) current = null;
    end(state, logged);
    void Promise.resolve(state.handle.terminate()).catch(() => undefined);
  };

  return Object.freeze({
    render(input: ReportRenderInput): Promise<Buffer> {
      const state = current ?? (current = start());
      const id = nextId;
      nextId += 1;
      return new Promise<Buffer>((resolvePdf, rejectPdf) => {
        const timer = setTimeout(() => terminate(state, true), deadlineMs);
        timer.unref?.();
        state.pending.set(id, { resolve: resolvePdf, reject: rejectPdf, timer });
        try {
          state.handle.postMessage({ id, input });
        } catch {
          // A DataCloneError, say: only this render fails; the worker stays.
          clearTimeout(timer);
          state.pending.delete(id);
          rejectPdf(new Error("REPORT_RENDER_FAILED"));
        }
      });
    },
    async stop(): Promise<void> {
      const state = current;
      if (state === null) return;
      state.stopping = true;
      terminate(state, false);
    }
  });
}

const processClient = createReportRenderClient();

/** NV-27: the route's default renderer: the PDF is made in the report worker thread. */
export function renderReportPdfOffThread(input: ReportRenderInput): Promise<Buffer> {
  return processClient.render(input);
}

/** NV-27: ends the process's report worker (tests, and a clean stop); the next render spawns a new one. */
export function stopReportRenderWorker(): Promise<void> {
  return processClient.stop();
}
