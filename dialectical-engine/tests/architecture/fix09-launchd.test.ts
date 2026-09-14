import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("FIX-09 dormant launchd templates", () => {
  it("proves placeholder-only configuration, least privilege, and zero service operation", () => {
    const listenerPath = "ops/launchd/com.debateai.obs-listener.plist.template";
    const watchdogPath = "ops/launchd/com.debateai.obs-watchdog.plist.template";
    const listener = readFileSync(listenerPath, "utf8");
    const watchdog = readFileSync(watchdogPath, "utf8");
    for (const path of [listenerPath, watchdogPath]) {
      const lint = spawnSync("/usr/bin/plutil", ["-lint", path], { encoding: "utf8" });
      expect({ status: lint.status, stderr: lint.stderr }).toEqual({ status: 0, stderr: "" });
      expect(lint.stdout).toContain("OK");
    }
    expect(listener).toContain("<string>com.debateai.obs-listener</string>");
    expect(watchdog).toContain("<string>com.debateai.obs-watchdog</string>");
    for (const source of [listener, watchdog]) {
      expect(source.match(/<key>KeepAlive<\/key>\s*<true\/>/u)).not.toBeNull();
      expect(source.match(/<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/u)).not.toBeNull();
      expect(source).toContain("__NODE_BINARY__");
      expect(source).toContain("<key>WorkingDirectory</key>\n  <string>__DIALECTICAL_ENGINE_ROOT__</string>");
      expect(source).not.toMatch(/launchctl|postgresql:\/\/[^_]|\/Users\/|<key>RunAtLoad<\/key>/u);
    }
    expect(listener).toContain("__LISTENER_OS_USER__");
    expect(watchdog).toContain("__WATCHDOG_OS_USER__");
    expect(listener).toContain("obs-listener.stdout.log");
    expect(watchdog).toContain("obs-watchdog.stdout.log");
    expect(listener).not.toContain("obs-watchdog.stdout.log");
    expect(watchdog).not.toContain("obs-listener.stdout.log");
    const runbook = readFileSync("docs/observability/README.md", "utf8");
    expect(runbook).toContain("Never load the `.template` files.");
    expect(runbook).toContain("launchctl bootstrap system /absolute/path/com.debateai.obs-watchdog.plist");
    const watchdogSource = [
      readFileSync("tools/obs-listener/src/watchdog.ts", "utf8"),
      readFileSync("tools/obs-listener/src/watchdog/main.ts", "utf8"),
      readFileSync("tools/obs-listener/src/watchdog/database.ts", "utf8"),
    ].join("\n");
    expect(watchdogSource).not.toMatch(/@debateai\/db|child_process|spawn\(|occurrence_detail|OPENAI|ANTHROPIC|model|provider/iu);
  });
});
