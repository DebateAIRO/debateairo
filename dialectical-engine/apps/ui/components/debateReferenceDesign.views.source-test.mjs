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
  // REMOVED by V's ruling of 2026-09-20: the canvas card SHALL show the review
  // marks. This line asserted the opposite — it was introduced by 2b670d30
  // ("chore: checkpoint local development state", no body) alongside the
  // deletion of the review block that 8230bc27 had built, and it then held the
  // deletion in place against t1-canvas, role-token-map and v2ui-pages, which
  // all demand the marks. V chose the card over the drawer-only alternative
  // knowing this assertion existed. Removing it does not build the feature; it
  // stops one gate from forbidding what another gate requires. The positive
  // rows stay RED on purpose — they now read "ruled, not yet built" instead of
  // "two gates fighting". The build is ticketed as
  // F-T4-UI-8-REVIEW-VOCABULARY-CARD.
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
