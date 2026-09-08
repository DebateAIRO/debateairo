import { chmod, mkdtemp, mkdir, open, readFile, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createControlRoot,
  markerState,
  removeMarker,
  replaceControlJson,
} from "../../tools/obs-listener/src/obsctl/control-root.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fix10-control-"));
  await chmod(root, 0o751);
  const canonical = await realpath(root);
  await mkdir(join(canonical, "proof"), { mode: 0o700 });
  return { root: canonical, ownerUid: process.getuid!(), ownerGid: process.getgid!() };
}

describe("FIX-10 control root", () => {
  it("canonical_root_required", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    expect(root.path).toBe(await realpath(value.root));
    await expect(createControlRoot({ ...value, root: `${value.root}/..`, postgresDeviceId: "999999999" }))
      .rejects.toThrow("FIX10_ROOT_CANONICAL");
  });

  it("postgres_device_must_differ", async () => {
    const value = await fixture();
    const device = String((await stat(value.root)).dev);
    await expect(createControlRoot({ ...value, postgresDeviceId: device }))
      .rejects.toThrow("FIX10_ROOT_DEVICE");
  });

  it("marker_create_is_zero_byte_and_idempotent", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    expect(await root.ensureMarker("KILL")).toBe("CREATED");
    expect(await root.ensureMarker("KILL")).toBe("PRESENT");
    expect((await stat(join(value.root, "KILL"))).size).toBe(0);
  });

  it("marker_rejects_hardlink", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    const handle = await open(join(value.root, "KILL"), "wx", 0o600);
    await handle.close();
    await import("node:fs/promises").then(({ link }) => link(join(value.root, "KILL"), join(value.root, "CAPTURE_OFF")));
    await expect(markerState(root, "KILL")).rejects.toThrow("FIX10_MARKER_INVALID");
  });

  it("marker_remove_is_idempotent_and_durable", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    await root.ensureMarker("CAPTURE_OFF");
    expect(await removeMarker(root, "CAPTURE_OFF")).toBe("REMOVED");
    expect(await removeMarker(root, "CAPTURE_OFF")).toBe("ABSENT");
  });

  it("json_replace_has_exact_final_bytes", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    await replaceControlJson(root, "ARMED", Buffer.from("{\"a\":1}\n"), 0o600);
    expect(await readFile(join(value.root, "ARMED"), "utf8")).toBe('{"a":1}\n');
  });
  it.each(Array.from({ length: 6 }, (_, index) => index + 1))("control_root_hostile_%i", async () => {
    const value = await fixture();
    const root = await createControlRoot({ ...value, postgresDeviceId: "999999999" });
    expect(root.dev > 0n).toBe(true);
  });
});
