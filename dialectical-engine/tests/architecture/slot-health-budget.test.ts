import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RELEASE_WATCH_STALE_MS } from "../../apps/api/src/release-state.js";

/**
 * NV-27: the slot health budget, cross-pinned. Both Caddy snippets (the VPS Caddyfile's `(debateai_slots)` and the
 * preview's repository snippet) take a healthy slot out only after two failed checks since it last turned healthy
 * (Caddy's counters add up between flips), with a probe timeout above the website's own wait for its API, so one slow
 * answer is never a failure. The release tool's constants name the same interval and take-out time, and the switch's
 * take-traffic delay is the API watcher's stale bound plus that take-out time plus one second.
 */
const engineRoot = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(engineRoot, path), "utf8");

type Health = Readonly<{ intervalMs: number; timeoutMs: number; fails: number; passes: number }>;
function healthOf(text: string): Health {
  const duration = (name: string) => {
    const match = new RegExp(`^\\s*${name}\\s+(\\d+)(ms|s)\\s*$`, "mu").exec(text);
    if (match === null) throw new Error(`no ${name}`);
    return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  };
  const count = (name: string) => {
    const match = new RegExp(`^\\s*${name}\\s+(\\d+)\\s*$`, "mu").exec(text);
    if (match === null) throw new Error(`no ${name}`);
    return Number(match[1]);
  };
  return { intervalMs: duration("health_interval"), timeoutMs: duration("health_timeout"), fails: count("health_fails"), passes: count("health_passes") };
}

const SNIPPETS: readonly (readonly [string, string])[] = [
  ["deploy/vps/Caddyfile", /^\(debateai_slots\) \{\n([\s\S]*?)^\}$/mu.exec(read("deploy/vps/Caddyfile"))?.[1] ?? ""],
  ["deploy/preview-release/v1/caddy/debateai-slots.caddy", read("deploy/preview-release/v1/caddy/debateai-slots.caddy")]
];

describe("NV-27: the slot health budget", () => {
  it("both snippets take a slot out after two failures, with a probe timeout above the website's API wait", async () => {
    const switchTool = await import("../../deploy/" + "preview-lifecycle/v1/release-switch.mjs") as Record<string, unknown>;
    const edge = await import("../../apps/ui/release-edge.mjs") as Record<string, unknown>;
    const HEALTH_INTERVAL_S = switchTool.HEALTH_INTERVAL_S as number;
    const HEALTH_FAILS = switchTool.HEALTH_FAILS as number;
    const CADDY_TAKE_OUT_S = switchTool.CADDY_TAKE_OUT_S as number;
    const TAKE_TRAFFIC_AFTER_S = switchTool.TAKE_TRAFFIC_AFTER_S as number;
    const READINESS_API_TIMEOUT_MS = edge.READINESS_API_TIMEOUT_MS as number;
    for (const [file, snippet] of SNIPPETS) {
      expect(snippet, file).not.toBe("");
      const health = healthOf(snippet);
      expect(health.fails, file).toBeGreaterThanOrEqual(2);
      expect(health.intervalMs, file).toBe(HEALTH_INTERVAL_S * 1000);
      expect(health.fails, file).toBe(HEALTH_FAILS);
      expect(health.fails * health.intervalMs, file).toBe(CADDY_TAKE_OUT_S * 1000);
      expect(health.timeoutMs, file).toBeGreaterThan(READINESS_API_TIMEOUT_MS);
      expect(health.passes, file).toBe(1);
    }
    expect(RELEASE_WATCH_STALE_MS / 1000 + CADDY_TAKE_OUT_S + 1).toBe(TAKE_TRAFFIC_AFTER_S);
  });

  it("server.mjs passes the website's API wait to the readiness responder", () => {
    const server = read("apps/ui/server.mjs");
    const call = server.slice(server.indexOf("createReadinessResponder({"));
    expect(call.slice(0, call.indexOf("});"))).toContain("timeoutMs: READINESS_API_TIMEOUT_MS");
  });
});
