import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const publicOverview = read("components/PublicDebateOverview.tsx");
const publicPage = read("app/public/debate/[id]/PublicDebatePageClient.tsx");
const debatePage = read("app/debate/[id]/DebatePageClient.tsx");
const css = read("app/globals.css");

test("Turn 3 public Tree is verdict-first while the other three reading views remain live", () => {
  assert.match(publicPage, /<PublicDebateOverview/);
  assert.match(debatePage, /publicMode && view === "overview" && publicOverview/);
  assert.match(debatePage, /view === "thread"/);
  assert.match(debatePage, /view === "split"/);
  assert.match(debatePage, /view === "map"/);
  assert.match(publicOverview, /data-design-turn="3b"/);
  assert.match(publicOverview, /className="publicOverviewInner"/);
  assert.match(publicOverview, /className="publicVerdictShell"/);
  assert.match(publicOverview, /className="publicSupportRow"/);
  assert.match(publicOverview, /className="publicArgumentAccent"/);
  assert.match(publicOverview, /className="publicArgumentScore"/);
  assert.match(publicOverview, /className="publicArgumentGrid"/);
  assert.match(publicOverview, /next=\$\{encodeURIComponent\(returnPath\)\}/);
  assert.match(debatePage, /!publicMode && process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI/);
  assert.match(css, /\.publicOverviewInner \{[^}]*max-width: 960px;/);
  assert.match(css, /\.publicArgumentGrid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});
