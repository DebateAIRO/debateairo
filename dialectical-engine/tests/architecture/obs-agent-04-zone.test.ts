import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const captureRoot = "apps/observation-agent/src/modules/capture-health";
const spoolRoot = "apps/observation-agent/src/modules/spool-health";

async function moduleSource(root: string): Promise<string> {
  if (!existsSync(root)) return "";
  const names = (await readdir(root)).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(names.map((name) => readFile(join(root, name), "utf8")))).join("\n");
}

describe("OBS-04 privacy, zone, and read-only boundary", () => {
  it("contains no spool-body reader or permission-change loss stimulus", async () => {
    expect(existsSync(spoolRoot)).toBe(true);
    const source = await moduleSource(spoolRoot);
    expect(source).not.toMatch(/readFile|createReadStream|openSync|readSync/u);
    expect(source).not.toMatch(/chmod|fchmod|permission.{0,30}(?:gap|loss)/iu);
    expect(source).not.toMatch(/captured_line|error_message|stack|prompt|payload|token|cookie|user_id/iu);
  });

  it("never imports the capture runtime or excluded-zone manifest", async () => {
    const source = `${await moduleSource(captureRoot)}\n${await moduleSource(spoolRoot)}`;
    expect(source).not.toMatch(/packages\/obs-capture|zone\/manifest|identity\.|occurrence_detail/u);
    expect(source).not.toMatch(/child_process|process\.kill|docker\s+(?:stop|start|restart|rm)/u);
  });

  it("uses SELECT only for obs relations and keeps all capture intents outside defects", async () => {
    const source = `${await moduleSource(captureRoot)}\n${await moduleSource(spoolRoot)}`;
    expect(source).not.toMatch(/(?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]{0,80}obs\./iu);
    expect(source).not.toMatch(/suspectedDefect:\s*true|defectKind:\s*["'][^"']+["']/u);
  });
});
