import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

const canvas = read("components/DebateCanvas.tsx");
const viewport = read("components/CanvasViewport.tsx");
const thread = read("components/DebateThread.tsx");
const split = read("components/DebateSplit.tsx");
const map = read("components/DebateMap.tsx");
const drawer = read("components/NodeDetailDrawer.tsx");
const library = read("components/DebatesBuffer.tsx");
const publicOverview = read("components/PublicDebateOverview.tsx");
const publicPage = read("app/public/debate/[id]/PublicDebatePageClient.tsx");
const debatePage = read("app/debate/[id]/DebatePageClient.tsx");
const meta = read("components/ReferenceNodeMeta.tsx");
const layout = read("lib/debatePresentation.ts");
const css = read("app/globals.css");

test("Turn 1 tree uses the coded 392px card grid and compact card anatomy", () => {
  assert.match(layout, /export const CARD_W = 392;/);
  assert.match(layout, /const COL = 444;/);
  assert.match(layout, /const VGAP = 30;/);
  assert.match(layout, /const PADY = 56;/);
  assert.match(canvas, /className="nodeArgHeader"/);
  assert.match(canvas, /className="nodeScoreRow"/);
  assert.match(canvas, /className="modelPill metaLine"/);
  assert.match(canvas, /data-reference-tree-footer/);
  assert.match(canvas, /initialAnchorTop=\{allCardsMeasured \? layout\.placed\[0\]\?\.y \?\? null : null\}/);
  assert.match(viewport, /surface\.scrollTo\(\{ left: 0, top: Math\.max\(0, initialAnchorTop \* fitStateRef\.current\.zoom - 120\) \}\)/);
  assert.doesNotMatch(canvas, /className="nodeReviewBadges"/);
  assert.match(css, /\.nodeWrap \{[\s\S]*?padding: 6px;/);
  assert.match(css, /\.node \{[\s\S]*?border-radius: 11px;[\s\S]*?padding: 16px 15px 11px;/);
  assert.match(css, /\.nodeClaim \{[\s\S]*?font-size: 15\.5px;[\s\S]*?line-height: 1\.4;/);
});

test("Turn 1 Thread, Split, and Map retain their coded view-specific anatomy", () => {
  assert.match(thread, /data-reference-thread-card/);
  assert.match(thread, /<ReferenceReviewLine review=\{v3Node\?\.review\}/);
  assert.match(meta, /className="nodeReviewLine"/);
  assert.match(thread, /data-reference-thread-footer/);
  assert.match(split, /data-reference-split-focus/);
  assert.match(split, /className="splitCardShell"/);
  assert.match(map, /className="mapLegendItem">[\s\S]*?Reasoning/);
  assert.match(map, /data-reference-map-readout/);
  assert.match(css, /\.mapStage \{[^}]*align-self: start;/);
  assert.match(css, /\.threadInner \{[\s\S]*?max-width: 780px;[\s\S]*?padding: 38px 48px 46px;/);
  assert.match(css, /\.splitInner \{[\s\S]*?max-width: 1080px;[\s\S]*?padding: 38px 48px 46px;/);
  assert.match(css, /\.splitCardClaim \{[\s\S]*?-webkit-line-clamp: 6;/);
  assert.match(css, /\.splitFocusClaim \{[\s\S]*?-webkit-line-clamp: 5;/);
  assert.match(css, /\.splitRebuttalClaim \{[\s\S]*?-webkit-line-clamp: 4;/);
  assert.match(css, /\.mapInner \{[\s\S]*?padding: 44px 48px;/);
});

test("Turn 5 drawer uses the coded 440px hierarchy and record presentation", () => {
  assert.match(drawer, /data-design-turn="5"/);
  assert.match(drawer, /className="drawerIntro"/);
  assert.match(drawer, /className="drawerReviewLine"/);
  assert.match(drawer, /className="drawerActions drawerReferenceActions"/);
  assert.match(drawer, /className="drawerHistoryRule"/);
  assert.match(css, /\.drawer\[data-drawer-panel\] \{[\s\S]*?width: min\(440px, 100vw\);/);
  assert.match(css, /\.drawerRecordTable \{[\s\S]*?border-radius: 12px;[\s\S]*?background: var\(--shell\);/);
  assert.match(css, /\.historyCardBody \{[\s\S]*?-webkit-line-clamp: 2;/);
});

test("Turn 3 library shares one row anatomy and carries real public model metadata", () => {
  assert.match(library, /models=\{debate\.models \?\? \[\]\}/);
  assert.match(library, /modelCount/);
  assert.match(css, /\.libTab \{[^}]*font-weight: 700;/);
  assert.match(css, /\.libRow \{[\s\S]*?border-radius: 13px;[\s\S]*?padding: 14px 18px;/);
  assert.match(css, /\.libRow:hover \{ transform: translateX\(4px\);/);
});

test("Turn 3 public Tree is verdict-first while the other three reading views remain live", () => {
  assert.match(publicPage, /<PublicDebateOverview/);
  assert.match(debatePage, /publicMode && view === "tree" && publicOverview/);
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
