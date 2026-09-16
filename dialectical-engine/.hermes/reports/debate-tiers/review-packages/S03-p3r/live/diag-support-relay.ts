// diag-support-relay.ts — orchestrator diagnostic (ignored dir): run ONLY the support-model relay stage of dev:auth:up and print the
// failure code chain. Never prints the credential; every string is masked for long token-like runs.
import { startHermesSupportRelay, HERMES_SUPPORT_PORT } from "../../acceptance/hermes-relay.js";
import { DEVELOPMENT_CLI_CALL_TIMEOUT_MS } from "../../apps/runner/src/dev-provider-panel.js";
const mask = (s: string) => s.replace(/[A-Za-z0-9._-]{30,}/g, "<masked>").slice(0, 400);
const t0 = Date.now();
try {
  const relay = await startHermesSupportRelay({ port: HERMES_SUPPORT_PORT, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS });
  console.log(`RELAY_OK port=${relay.port} model=${relay.model} after ${Date.now() - t0} ms`);
  await relay.close();
} catch (error) {
  let e: unknown = error; let depth = 0;
  while (e instanceof Error && depth < 6) {
    const extra = Object.entries(e).filter(([k]) => !["stack"].includes(k)).map(([k, v]) => `${k}=${mask(String(v))}`).join(" ");
    console.log(`[${depth}] ${e.name}: ${mask(e.message)} ${extra}`);
    e = e.cause; depth += 1;
  }
  console.log(`RELAY_FAILED after ${Date.now() - t0} ms timeoutMs=${DEVELOPMENT_CLI_CALL_TIMEOUT_MS}`);
}
