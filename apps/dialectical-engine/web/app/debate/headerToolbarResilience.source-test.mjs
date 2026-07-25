import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadCss } from "../../tests/loadCss.mjs";

const pageSource = readFileSync("app/debate/[id]/DebatePageClient.tsx", "utf8");
const globalsSource = loadCss();

test("debate header keeps default scoring status and view controls in the top toolbar", () => {
  assert.match(
    pageSource,
    /<div className="debateTopActions">[\s\S]*?<div className="topSwitch">[\s\S]*?<span>Scoring<\/span>[\s\S]*?className="topSwitchStatus"[\s\S]*?aria-label="Open scoring diagnostics"[\s\S]*?<\/div>[\s\S]*?<div className="segment" role="group" aria-label="View">[\s\S]*?aria-pressed=\{view === "thread"\}[\s\S]*?Thread[\s\S]*?<\/button>[\s\S]*?aria-pressed=\{view === "split"\}[\s\S]*?Split[\s\S]*?<\/button>[\s\S]*?aria-pressed=\{view === "tree"\}[\s\S]*?Tree[\s\S]*?<\/button>[\s\S]*?aria-pressed=\{view === "map"\}[\s\S]*?Map[\s\S]*?<\/button>[\s\S]*?<\/div>[\s\S]*?<\/header>/s,
    "Default scoring status, diagnostics, and Thread/Split/Tree/Map view controls should remain in the same toolbar action cluster"
  );
  assert.doesNotMatch(
    pageSource,
    /aria-label="Toggle scoring"|Refresh scoring/,
    "The normal toolbar should not expose removed scoring toggle or refresh controls"
  );
});

test("scoring status text shrinks instead of pushing toolbar controls away", () => {
  assert.match(
    globalsSource,
    /\.debateTopBar\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?\}/,
    "Top bar should allow child flex items to shrink"
  );
  assert.match(
    globalsSource,
    /\.debateTopActions\s*\{[\s\S]*?flex:\s*0 1 auto;[\s\S]*?min-width:\s*0;[\s\S]*?\}/,
    "Toolbar actions should shrink as a group instead of forcing overflow"
  );
  assert.match(
    globalsSource,
    /\.topSwitch\s*\{[\s\S]*?flex:\s*0 1 min\(52vw,\s*680px\);[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*min\(52vw,\s*680px\);[\s\S]*?\}/,
    "The scoring control cluster should have a bounded responsive width"
  );
  assert.match(
    globalsSource,
    /\.topSwitch > span:first-child,[\s\S]*?\.topSwitch \.iconBtn\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?\}/,
    "Scoring label and diagnostics controls should not collapse away"
  );
  assert.match(
    globalsSource,
    /\.topSwitchStatus\s*\{[\s\S]*?flex:\s*1 1 88px;[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?\}/,
    "Scoring status copy should truncate inside the scoring cluster"
  );
});
