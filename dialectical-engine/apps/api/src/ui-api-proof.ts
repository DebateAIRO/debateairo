import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { readCustodyTextSecretBytes } from "@debateai/crypto";

/**
 * NV-03: the UI-to-API proof. The API is loopback-bound and trusts a loopback peer's x-forwarded-for
 * (client-ip.ts), but any local process can open that port. So the API honours a forwarded client address
 * (x-forwarded-for, and the x-forwarded-host/-proto Fastify trusts under the same rule) and the edge country
 * (cf-ipcountry) only from a loopback peer that ALSO carries this proof: a static base64url secret that only the
 * UI and the API can read, the same bytes in two files (deploy/vps/README.md §3). Without it the client is the
 * socket peer, in sourceFor, the support routes and billing alike. The proof header itself never reaches a handler.
 *
 * GET /readyz answers the verdict in UI_API_PROOF_VERDICT_HEADER (its body is unchanged), so a website whose API
 * does not accept its proof, or that holds none while its API holds one, is never ready (apps/ui/release-edge.mjs,
 * UI_API_PROOF_REFUSED). That is a consistency check between the two halves of a pair; keeping an impostor off the
 * API port is NV-55's port reservation.
 */
export const UI_API_PROOF_HEADER = "x-debateai-ui-proof";
/** NV-03: on GET /readyz only: `accepted` or `refused`, absent when neither side holds a proof. */
export const UI_API_PROOF_VERDICT_HEADER = "x-debateai-ui-proof-verdict";

export type UiApiProofVerdict = "accepted" | "refused" | "absent";

/** The edge secret's grammar (apps/ui/trusted-client-ip.mjs): at least 32 random bytes as base64url. */
const UI_API_PROOF_GRAMMAR = /^[A-Za-z0-9_-]{43,512}$/u;

/**
 * The headers a proven UI may name the client with; every one is dropped without the proof. cf-ipcountry is gated on
 * the proof alone, with no peer-address rule of its own: the API listens only on loopback, so every peer is local.
 */
const FORWARDED_HEADERS = Object.freeze(["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "cf-ipcountry"] as const);

/**
 * NV-03: the API's copy of the proof (UI_API_PROOF_PATH), read once at boot with the custody reader the billing text
 * secrets use (0600, owner-only, in a 0700 folder) and held as a zeroable Buffer. A hosted API refuses to start
 * without one (UI_API_PROOF_REQUIRED); a local one runs without and honours no forwarded address. A file outside the
 * grammar refuses UI_API_PROOF_INVALID, its bytes zeroed first.
 */
export function loadUiApiProof(
  environment: Readonly<{ DEPLOYMENT_MODE: string; UI_API_PROOF_PATH?: string | undefined }>,
  read: (path: string) => Buffer = readCustodyTextSecretBytes
): Buffer | null {
  const path = environment.UI_API_PROOF_PATH;
  if (path === undefined) {
    if (environment.DEPLOYMENT_MODE === "hosted") throw new TypeError("UI_API_PROOF_REQUIRED");
    return null;
  }
  const bytes = read(path);
  if (!UI_API_PROOF_GRAMMAR.test(bytes.toString("latin1"))) {
    bytes.fill(0);
    throw new TypeError("UI_API_PROOF_INVALID");
  }
  return bytes;
}

/**
 * NV-03: whether `supplied` is exactly the expected proof, compared in constant time. False when the API holds none
 * or the header is not one string; a repeated header arrives comma-joined and so fails the length or the bytes.
 */
export function uiApiProofMatches(expected: Buffer | null, supplied: unknown): boolean {
  if (expected === null || typeof supplied !== "string") return false;
  const bytes = Buffer.from(supplied, "utf8");
  return bytes.length === expected.length && timingSafeEqual(bytes, expected);
}

/**
 * NV-03: the API's first onRequest hook, on the raw headers Fastify computes request.ip (and host and protocol)
 * from on every read. It always removes the proof header. Unless the proof matched, it also deletes the forwarded
 * headers and the edge country, so Fastify falls back to the socket address and edgeCountry finds none. Returns the
 * verdict GET /readyz names: `absent` only when the API holds no proof and the request carried none.
 */
export function gateForwardedHeaders(headers: IncomingHttpHeaders, expected: Buffer | null): UiApiProofVerdict {
  const supplied = headers[UI_API_PROOF_HEADER];
  delete headers[UI_API_PROOF_HEADER];
  if (uiApiProofMatches(expected, supplied)) return "accepted";
  for (const name of FORWARDED_HEADERS) delete headers[name];
  return expected === null && supplied === undefined ? "absent" : "refused";
}
