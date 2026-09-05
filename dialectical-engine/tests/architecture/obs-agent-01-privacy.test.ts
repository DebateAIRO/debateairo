import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function signal(): Record<string, unknown> {
  return {
    seq: 1,
    signal_id: "20000000-0000-4000-8000-000000000001",
    state: "OPEN",
    class: "INFRA_DOWN",
    component: "postgres",
    severity: "FATAL",
    impact_code: "IMPACT_PG_DOWN",
    first_failed_probe_at: "2026-09-03T07:00:00.000Z",
    detected_at: "2026-09-03T07:00:05.000Z",
    evidence: {
      probe: "tcp+select1", target: "127.0.0.1:55432", consecutive_failures: 2,
      threshold: 2, last_status: "FAILED", container_status: "exited",
      restart_policy: "no", exit_code: 1
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: null,
    recorded_at: "2026-09-03T07:00:05.000Z"
  };
}

describe("OBS-01 privacy and template-only delivery", () => {
  it("renders impact copy from the closed code rather than evidence text", async () => {
    const { renderImpact } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    expect(renderImpact(signal())).toBe(
      "Postgres is down: every debate read and write fails; nothing can be dispatched or recorded."
    );
  });

  it("keeps osascript on execFile with a fixed absolute executable and no shell", async () => {
    const source = await readFile("apps/observation-agent/src/notify/osascript.ts", "utf8");
    expect(source).toContain('"/usr/bin/osascript"');
    expect(source).toContain("execFile");
    expect(source).not.toMatch(/shell\s*:\s*true/u);
    expect(source).not.toMatch(/\bexec\s*\(/u);
  });

  it("keeps shared status and routing code behind the closed privacy boundary", async () => {
    const sources = await Promise.all([
      "apps/observation-agent/src/core/types.ts",
      "apps/observation-agent/src/core/runtime.ts",
      "apps/observation-agent/src/core/routing.ts",
      "apps/observation-agent/src/core/modules.ts",
      "apps/observation-agent/src/store/status.ts",
      "apps/observation-agent/src/oactl/core/status.ts",
      "apps/observation-agent/src/main.ts"
    ].map((path) => readFile(path, "utf8")));
    const prohibited = [
      "raw_text", "occurrence_detail", "content_ciphertext", "innerHTML",
      "dangerouslySetInnerHTML", "process.env", "0.0.0.0", "webhook"
    ];
    for (const source of sources) {
      for (const value of prohibited) expect(source).not.toContain(value);
    }
  });
});
