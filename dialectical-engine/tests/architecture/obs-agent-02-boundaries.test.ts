import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratch: string[] = [];
afterEach(async () => Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function sources(root: string): Promise<string> {
  const values: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".ts")) values.push(await readFile(path, "utf8"));
    }
  }
  await visit(root);
  return values.join("\n");
}

describe("OBS-02 source and target boundaries", () => {
  it("loads the exact OBS-02 target fragment and rejects a duplicate component", async () => {
    const { loadObservationTargetCatalog } = await import(
      "../../apps/observation-agent/src/core/targets.js"
    );
    const real = await loadObservationTargetCatalog(resolve("deploy/observation-agent/targets.dev.d"));
    expect(real.fragments.find((item) => item.basename === "OBS-02.json")?.targets).toEqual([
      { component: "api", kind: "http", live_url: "http://127.0.0.1:8790/v1/session", expected: "when_dev_stack" },
      { component: "ui", kind: "http", live_url: "http://127.0.0.1:3001/login", expected: "when_dev_stack" },
      { component: "tls_front_door", kind: "http", live_url: "https://localhost:3000/login", expected: "when_dev_stack" },
      { component: "runner", kind: "process", command_contains: "apps/runner/src/main.ts", expected: "when_dev_stack" },
      { component: "kanban", kind: "http", live_url: "http://127.0.0.1:9119/", expected: "always" },
      { component: "evaluator_worker", kind: "fact", fact: "UNBOUND_BY_REGISTER", expected: "never" }
    ]);

    const directory = await mkdtemp(join(tmpdir(), "obs-02-duplicate-"));
    scratch.push(directory);
    await writeFile(join(directory, "OBS-01.json"), JSON.stringify({
      schema_version: 1, targets: [{ component: "api", kind: "http", live_url: "http://127.0.0.1:1/" }]
    }));
    await writeFile(join(directory, "OBS-02.json"), JSON.stringify({
      schema_version: 1, targets: [{ component: "api", kind: "http", live_url: "http://127.0.0.1:2/" }]
    }));
    await expect(loadObservationTargetCatalog(directory)).rejects.toMatchObject({
      code: "OBSERVATION_DUPLICATE_TARGET"
    });
  });

  it("contains no product-control primitive or product-runtime import", async () => {
    const product = await sources(resolve("apps/observation-agent/src/modules/product-liveness"));
    const witness = await sources(resolve("apps/observation-agent/src/modules/witness"));
    const all = await sources(resolve("apps/observation-agent/src/modules"));
    expect(`${product}\n${witness}`).not.toMatch(/process\.kill|child_process/u);
    expect(all).not.toMatch(/apps\/(?:api|runner|ui)|packages\/obs-capture|\/zone\//u);
  });
});
