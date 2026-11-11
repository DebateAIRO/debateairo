import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const publicOverview = read("components/PublicDebateOverview.tsx");
const publicPage = read("app/public/debate/[id]/PublicDebatePageClient.tsx");
const publicBody = read("components/v4/V4PublicPage.tsx");
const debatePage = read("app/debate/[id]/DebatePageClient.tsx");
const laneCss = read("app/public/debate/[id]/public-lane.css");

// V's ruling of 2026-09-20 ("summary first, the argument tree one click away"), as the owner's screen review of 3 Nov 2026 rebuilt it (public-d1 A):
// the public page is V4's, it leads with the answer, and "Explore the map" opens the same map as the person's own, read-only (one map with a read-only
// switch, not a second copy). The classic workspace no longer serves the public route; its own public mode is left as it was for the owner's page.
test("the public page leads with the answer, and the map is one click away, read-only", () => {
  assert.match(publicPage, /<PublicDebateOverview/);
  assert.doesNotMatch(publicPage, /<DebatePageClient/);
  assert.match(publicOverview, /<V4PublicAnswerFirst/);
  assert.match(publicBody, /data-public-answer-first/);
  assert.match(publicBody, /className="v4AnswerCard v4PubAnswer"/);
  assert.match(publicBody, /className="v4PubRows"/);
  assert.match(publicBody, /data-public-explore/);
  // The map is the own map's pieces with the read-only switch: no copy of the tree is drawn here.
  assert.match(publicBody, /<V4MapTree \{\.\.\.pieces\} fold=/);
  assert.match(publicBody, /<V4Outline \{\.\.\.pieces\} \/>/);
  assert.match(publicBody, /readOnly: true/);
  // The owner's page keeps its own verdict-first switch.
  assert.match(debatePage, /!publicMode && process\.env\.NEXT_PUBLIC_VERDICT_FIRST_UI/);
  assert.match(laneCss, /\.v4PubMain \{[^}]*max-width: 820px;/);
  assert.match(laneCss, /\.v4PubMain:has\(\.v4PubMapView\) \{ max-width: 1280px; \}/);
});
