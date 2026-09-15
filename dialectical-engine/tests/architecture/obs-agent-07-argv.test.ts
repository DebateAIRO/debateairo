import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-07 channel argv boundary", () => {
  it("uses no shell command, agent env read, private product field, or state-changing Hermes verb", async () => {
    const [sendmailSource, kanbanSource] = await Promise.all([
      "apps/observation-agent/src/modules/channels-sendmail/sendmail.ts",
      "apps/observation-agent/src/modules/channels-kanban/kanban.ts"
    ].map((path) => readFile(path, "utf8")));
    const source = `${sendmailSource}\n${kanbanSource}`;
    expect(source).not.toMatch(/shell\s*:\s*true/u);
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/raw_text|metadata_json|content_ciphertext/u);
    for (const forbidden of ["edit", "move", "assign", "close", "archive", "status"]) {
      expect(kanbanSource).not.toMatch(new RegExp(`[\"']${forbidden}[\"']`, "u"));
    }
  });

  it("rejects shell metacharacters in validated board and executable configuration", async () => {
    const { createKanbanDeliveryExecutor } = await import(
      "../../apps/observation-agent/src/modules/channels-kanban/kanban.js"
    );
    for (const board of ["ops-alerts;touch", "$(id)", "ops alerts", "`id`"]) {
      expect(() => createKanbanDeliveryExecutor({
        board, hermesPath: "/safe/hermes", execute: async () => ({ stdout: "", stderr: "" })
      })).toThrow("OBSERVATION_KANBAN_CONFIG_INVALID");
    }
  });
});
