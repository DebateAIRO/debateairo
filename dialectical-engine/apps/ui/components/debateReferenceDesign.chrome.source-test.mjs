import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("the debate header receives and uses the locale time catalogue for every status label", () => {
  const debatePage = read("app/debate/[id]/page.tsx");
  const debateGate = read("app/debate/[id]/DebatePageGate.tsx");
  const debateClient = read("app/debate/[id]/DebatePageClient.tsx");
  assert.match(debatePage, /loadNamespace\(locale, "time"\)/);
  assert.match(debatePage, /timeCatalog=\{timeCatalog\}/);
  assert.match(debateGate, /timeCatalog/);
  assert.equal(debateClient.match(/statusLabel\([^)]*,\s*timeCatalog\)/g)?.length ?? 0, 2);
});
