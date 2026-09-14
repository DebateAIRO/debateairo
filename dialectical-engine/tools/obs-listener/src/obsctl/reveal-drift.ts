import type { CliResult } from "./types.js";

const HASH = /^[0-9a-f]{64}$/u;

export function revealDrift(liveManifestHash: string, slotHash: string | null): CliResult {
  if (!HASH.test(liveManifestHash)) throw new TypeError("FIX12_MANIFEST_HASH");
  if (slotHash === null) return Object.freeze({ exitCode: 2, stdout: "SLOT_UNSET RP-1\n", stderr: "" });
  if (!HASH.test(slotHash)) throw new TypeError("FIX12_MANIFEST_HASH");
  if (liveManifestHash === slotHash) {
    return Object.freeze({ exitCode: 0, stdout: `MANIFEST_MATCH ${liveManifestHash}\n`, stderr: "" });
  }
  return Object.freeze({
    exitCode: 1,
    stdout: `MANIFEST_DRIFT live=${liveManifestHash} slot=${slotHash}\n`,
    stderr: "",
  });
}
