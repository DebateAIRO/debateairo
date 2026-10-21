// tests/unit/vps-release.test.ts
// Side-by-side spec §10, Phase 3 (plan D16): the public server's release layout. Each release runs from its own folder
// with a base env file plus its own overlay, and Hatchet's compose file lives outside every release and the operator
// checkout. Root's release.mjs (the switch, the start check and the retirement on this server) is the follow-up
// task D16b, built once release-switch.mjs (D10) and release-check.mjs (D11) exist; its tests join this file then.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as runtimeEnvironment from "../../packages/register/src/runtime-environment.js";

const engineRoot = resolve(import.meta.dirname, "../..");
const read = (relative: string): string => readFileSync(resolve(engineRoot, relative), "utf8");

type KeyInventory = Readonly<{ required: readonly string[]; optional: readonly string[] }>;
const inventory = (name: string): KeyInventory =>
  (runtimeEnvironment as Readonly<Record<string, unknown>>)[name] as KeyInventory;

function exampleKeys(relative: string): string[] {
  const keys: string[] = [];
  for (const line of read(relative).split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/u.exec(line.trim());
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys;
}

/**
 * RELEASE_KEY is required by the API, the runner and the website (INTERFACE "Environment values"); it joins the
 * strict API and runner shapes with the release-key boot check, which another lane builds. Until that lane meets this
 * one it is the only key an overlay may set that a shape does not list yet.
 */
const NOT_YET_IN_THE_SHAPES = new Set(["RELEASE_KEY"]);

describe("the public server's per-release overlays (side-by-side spec §10)", () => {
  it("the overlay examples set only keys the shapes know", () => {
    for (const [service, keysName] of [["api", "API_ENVIRONMENT_KEYS"], ["runner", "RUNNER_ENVIRONMENT_KEYS"]] as const) {
      const shape = inventory(keysName);
      expect(shape.required.length, keysName).toBeGreaterThan(0);
      const known = new Set([...shape.required, ...shape.optional, ...NOT_YET_IN_THE_SHAPES]);
      const keys = exampleKeys(`deploy/vps/env/releases/${service}.env.example`);
      expect(keys.filter((key) => !known.has(key)), service).toEqual([]);
      expect(new Set(keys).size, service).toBe(keys.length);
      expect(keys, service).toContain("RELEASE_KEY");
    }
    // Only the values that must differ per release: the site version and release key, the slot's port, the
    // runner's worker identity (side-by-side plan D8's DERIVED_KEYS, less the preview-only mail helper).
    expect(exampleKeys("deploy/vps/env/releases/api.env.example").sort()).toEqual(["API_PORT", "REGISTER_VERSION", "RELEASE_KEY"]);
    expect(exampleKeys("deploy/vps/env/releases/runner.env.example").sort())
      .toEqual(["HATCHET_WORKER_NAME", "REGISTER_VERSION", "RELEASE_KEY", "RUNNER_WORKER_ID"]);
    const ui = exampleKeys("deploy/vps/env/releases/ui.env.example");
    expect(ui.filter((key) => !["RELEASE_KEY", "PORT", "DIALECTICAL_API_BASE"].includes(key))).toEqual([]);
    expect(ui.sort()).toEqual(["DIALECTICAL_API_BASE", "PORT", "RELEASE_KEY"]);
  });

  it("each overlay names its file, its owner and the base file it overrides", () => {
    for (const service of ["api", "runner", "ui"]) {
      const text = read(`deploy/vps/env/releases/${service}.env.example`);
      expect(text, service).toContain(`/etc/debateai/releases/<label>/${service}.env (0640 root:debateai-${service})`);
      expect(text, service).toContain(`/etc/debateai/${service}.env`);
    }
  });

  it("hatchet's compose file is no longer in any release or the operator checkout", () => {
    const hatchet = read("deploy/vps/systemd/debateai-hatchet.service");
    const lines = hatchet.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"));
    expect(lines).toContain("WorkingDirectory=/etc/debateai/hatchet");
    expect(lines).toContain("ExecStart=/usr/bin/docker compose -f /etc/debateai/hatchet/compose.prod.yaml up -d");
    expect(lines).toContain("ExecStop=/usr/bin/docker compose -f /etc/debateai/hatchet/compose.prod.yaml down");
    for (const line of lines.filter((entry) => /^(Exec[A-Za-z]*|WorkingDirectory)=/.test(entry))) {
      expect(line).not.toContain("/opt/debateai");
    }
    // No unit of the kit runs a compose file from a release folder or the operator checkout.
    for (const name of readdirSync(resolve(engineRoot, "deploy/vps/systemd"))) {
      expect(read(`deploy/vps/systemd/${name}`), name).not.toMatch(/\/opt\/debateai\/\S*compose\.prod\.yaml/);
    }
    // The compose project keeps its fixed name, so the move keeps the same container and its config volume.
    expect(read("deploy/vps/compose.prod.yaml")).toMatch(/^name: debateai-prod$/m);
  });
});
