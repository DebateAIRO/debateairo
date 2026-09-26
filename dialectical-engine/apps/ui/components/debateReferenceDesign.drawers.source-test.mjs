import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");
const drawer = read("components/NodeDetailDrawer.tsx");
const css = read("app/globals.css");

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
