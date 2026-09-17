import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readCertificateCapacity } from "../../apps/observation-agent/src/modules/certificate-capacity/reader.js";

async function productionSource(): Promise<string> {
  const root = "apps/observation-agent/src/modules/certificate-capacity";
  const names = (await readdir(root)).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(names.map((name) => readFile(join(root, name), "utf8")))).join("\n");
}

describe("OBS-05 certificate custody boundary", () => {
  it("rejects a private-key target before any filesystem access", async () => {
    const read = vi.fn(async () => Buffer.from("must not happen"));
    const privateName = ["localhost", "key.pem"].join("-");
    await expect(readCertificateCapacity(Object.freeze({
      basename: "OBS-05.json",
      targets: Object.freeze([Object.freeze({
        component: "tls_front_door", kind: "certificate", path: `.local/dev-auth/tls/${privateName}`
      })]),
      configuration: Object.freeze({})
    }), new Date("2026-09-03T12:00:00.000Z"), {
      read,
      notAfter: () => new Date("2027-01-01T00:00:00.000Z")
    })).rejects.toThrow("OBSERVATION_CERTIFICATE_TARGET_INVALID");
    expect(read).not.toHaveBeenCalled();
  });

  it("contains no private-key name or metadata/stat operation", async () => {
    const source = await productionSource();
    expect(source).not.toContain(["localhost", "key.pem"].join("-"));
    expect(source).not.toMatch(/\b(?:stat|lstat|access|readdir|readlink)\s*\(/u);
    expect(source).toContain('readFile');
    expect(source).toContain('X509Certificate');
  });
});
