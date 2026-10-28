import { fileURLToPath } from "node:url";
import { parentPort } from "node:worker_threads";

/**
 * THE REPORT WORKER THREAD (NV-27). react-pdf lays a whole report out synchronously, seconds for a long one, so the
 * PDF is made here, in the UI process's one report worker thread, never on the event loop that answers /readyz and
 * every page (lib/report/reportRenderWorker.ts posts the input and receives the bytes; the render gate's admit and
 * release stay on the main thread).
 *
 * Plain ESM outside Next's bundle, like server.mjs and release-edge.mjs. It runs the release's own report code
 * (lib/report/renderReport.ts) under the folder's own tsx, with tsconfig.scripts.json (react-jsx over tsconfig.json,
 * so its paths and the .js to .ts/.tsx mapping hold), the way `story:sample-pdf` already runs it.
 *
 * tsx is loaded dynamically, after its cache switch (NV-54's rule, deploy/preview-auth-dev/v1/tsx-api.mjs): tsx
 * chooses its file cache once, when its modules are first evaluated, so the switch is set first, in this thread's
 * own environment (a worker's environment is its own copy), and no cached transform can stand in for the release's
 * source. A static import would be evaluated before the assignment.
 *
 * Nothing of a report or an error leaves this thread: a reply is the PDF's bytes, or `ok: false`.
 */
process.env.TSX_DISABLE_CACHE = "1";

const TSCONFIG = fileURLToPath(new URL("./tsconfig.scripts.json", import.meta.url));
const renderer = import("tsx/esm/api").then(({ tsImport }) =>
  tsImport("./lib/report/renderReport.ts", { parentURL: import.meta.url, tsconfig: TSCONFIG }));
// A renderer that cannot load ends this thread (in a worker, process.exit stops only the thread); the client then
// fails the waiting downloads and starts a fresh worker for the next one.
renderer.catch(() => process.exit(1));

parentPort.on("message", async (message) => {
  const id = message?.id;
  let report;
  try {
    report = await renderer;
  } catch {
    process.exit(1);
    return;
  }
  try {
    const pdf = await report.renderReportPdf(message.input);
    // A fresh array that owns its whole ArrayBuffer, so the buffer can be transferred, not copied again.
    const bytes = new Uint8Array(pdf.byteLength);
    bytes.set(pdf);
    parentPort.postMessage({ id, ok: true, bytes }, [bytes.buffer]);
  } catch {
    parentPort.postMessage({ id, ok: false });
  }
});
