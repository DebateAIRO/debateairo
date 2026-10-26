import "server-only";

import { headers } from "next/headers";
import { createServerContractClient, readTrustedClientIp } from "../serverApi.js";

/**
 * Side-by-side spec §13, addition D24 item 3 (owner's answer to Q-L6, 2026-10-22: providers only, not the models,
 * listed automatically): the "AI providers" page asks the API which companies its declared provider targets reach
 * (`GET /v1/public/ai-providers`), at request time, so a company added with an upload appears by itself and a model
 * or line-up change never touches the page.
 *
 * One ask at most every 60 s, each given 2 s: within 60 s of the last ask the page reuses the last good answer (or,
 * when there is none yet, gives the whole reviewed catalogue at once). A slow, failing, malformed or empty answer
 * keeps the last good answer, else `null`, which `providerRegister` reads as "every reviewed company": a legal page
 * discloses rather than hides. A slow API therefore costs at most 2 s once a minute. Never throws.
 */
const ASK_TIMEOUT_MS = 2000;
const ASK_INTERVAL_MS = 60 * 1000;

let lastGood: readonly string[] | null = null;
let lastAskAt: number | null = null;
let asking: Promise<readonly string[] | null> | null = null;

/** The API's answer, or null on a refusal, a malformed or empty body, or no answer within `ASK_TIMEOUT_MS`. */
async function askOnce(): Promise<readonly string[] | null> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => { abort.abort(); resolve(null); }, ASK_TIMEOUT_MS);
  });
  try {
    const headerStore = await headers();
    const bounded: typeof fetch = (input, init) => fetch(input, { ...init, signal: abort.signal });
    const answer = createServerContractClient(
      bounded, undefined, headerStore.get("user-agent") ?? undefined, readTrustedClientIp(headerStore)
    ).readPublicAiProviders().then(({ companies }) => companies.length === 0 ? null : Object.freeze([...companies]));
    // A late rejection after the timeout must not surface as an unhandled one.
    answer.catch(() => undefined);
    return await Promise.race([answer, timedOut]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The API's answer (2 s timeout, at most one ask a minute, the last good answer kept); null when there is none. Never throws. */
export async function readAiProviderCompanies(): Promise<readonly string[] | null> {
  try {
    const now = Date.now();
    if (lastAskAt !== null && now - lastAskAt < ASK_INTERVAL_MS) return lastGood;
    if (asking === null) {
      lastAskAt = now;
      asking = askOnce().then((answer) => {
        if (answer !== null) lastGood = answer;
        return lastGood;
      }).finally(() => { asking = null; });
    }
    return await asking;
  } catch {
    return lastGood;
  }
}
