import { createHash } from "node:crypto";
import { request } from "node:http";
import { deploymentHostname, siteverifyOutcome, validProof, validSocketPath } from "../../../deploy/turnstile/siteverify-response.mjs";

export type TurnstileAction = "signup" | "resend-verification";
export type TurnstileProof = Readonly<{ token: string; action: TurnstileAction }>;
export type TurnstileOutcome = "passed" | "rejected" | "unavailable";
export interface TurnstileVerifier { verify(input: TurnstileProof): Promise<TurnstileOutcome>; }
export class TurnstileGateError extends Error {
  readonly code: "TURNSTILE_REJECTED" | "TURNSTILE_UNAVAILABLE";
  readonly statusCode: 400 | 503;
  constructor(outcome: "rejected" | "unavailable") {
    const code = outcome === "rejected" ? "TURNSTILE_REJECTED" : "TURNSTILE_UNAVAILABLE";
    super(code); this.name = "TurnstileGateError"; this.code = code; this.statusCode = outcome === "rejected" ? 400 : 503;
  }
}
/** Every public account creation/completion/resend consumer must await this before identity work. */
export async function requireTurnstileProof(verifier: TurnstileVerifier | undefined, input: TurnstileProof): Promise<void> {
  let outcome: TurnstileOutcome = "unavailable";
  if (!validProof(input)) outcome = "rejected";
  else if (verifier !== undefined) {
    try { outcome = await verifier.verify(input); } catch { outcome = "unavailable"; }
  }
  if (outcome !== "passed") throw new TurnstileGateError(outcome === "rejected" ? "rejected" : "unavailable");
}
/** API has only a Unix operation; it never holds the Turnstile secret or opens Internet sockets. */
export class UnixTurnstileVerifier implements TurnstileVerifier {
  readonly #hostname: string;
  readonly #used = new Map<string, number>();
  constructor(private readonly options: Readonly<{ publicAppUrl: string; socketPath?: string; clock?: () => Date }>) {
    this.#hostname = deploymentHostname(options.publicAppUrl);
    if (options.socketPath !== undefined && !validSocketPath(options.socketPath)) throw new TypeError("TURNSTILE_SOCKET_PATH_INVALID");
  }
  async verify(input: TurnstileProof): Promise<TurnstileOutcome> {
    if (!validProof(input)) return "rejected";
    if (this.options.socketPath === undefined) return "unavailable";
    const now = (this.options.clock?.() ?? new Date()).getTime();
    for (const [digest, until] of this.#used) if (until <= now) this.#used.delete(digest);
    const digest = createHash("sha256").update(input.token).digest("hex");
    if (this.#used.has(digest)) return "rejected";
    if (this.#used.size >= 10_000) return "unavailable";
    // Reserve before awaiting transport: parallel requests cannot both use a proof.
    this.#used.set(digest, now + 300_000);
    return new Promise(resolve => {
      let done = false;
      const finish = (outcome: TurnstileOutcome) => { if (done) return; done = true; clearTimeout(deadline); resolve(outcome); };
      const req = request({ socketPath: this.options.socketPath, path: "/siteverify", method: "POST", agent: false,
        headers: { "content-type": "application/json", accept: "application/json" }, maxHeaderSize: 4096 }, response => {
        if (response.statusCode !== 200) { response.destroy(); finish("unavailable"); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 8192) { response.destroy(); req.destroy(); finish("unavailable"); } else chunks.push(chunk);
        });
        response.on("error", () => finish("unavailable")); response.on("aborted", () => finish("unavailable"));
        response.on("end", () => {
          try { finish(siteverifyOutcome(JSON.parse(Buffer.concat(chunks).toString("utf8")), input.action, this.#hostname, (this.options.clock?.() ?? new Date()).getTime())); }
          catch { finish("unavailable"); }
        });
      });
      const deadline = setTimeout(() => { req.destroy(); finish("unavailable"); }, 5000);
      req.on("error", () => finish("unavailable"));
      req.end(JSON.stringify({ token: input.token, action: input.action }));
    });
  }
}
