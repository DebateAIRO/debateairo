import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadCss } from "../loadCss.mjs";

const pageSource = readFileSync("app/debate/[id]/DebatePageClient.tsx", "utf8");
const globalsSource = loadCss();
const headerSource = pageSource.match(/<header className="debateTopBar">([\s\S]*?)<\/header>/)?.[1] ?? "";
const overflowSource = headerSource.match(/<div className="debateOverflowMenu">([\s\S]*?)<\/div>/)?.[1] ?? "";

test("phone chrome keeps view switching and scoring diagnostics outside overflow", () => {
  assert.match(
    headerSource,
    /<div className="debateTopControlRow">[\s\S]*?<div className="segment" role="group" aria-label="View">[\s\S]*?Thread[\s\S]*?Split[\s\S]*?Tree[\s\S]*?Map[\s\S]*?aria-label="Open scoring diagnostics"[\s\S]*?<details className="debateOverflow">/,
    "View switching and scoring diagnostics should stay primary controls before the overflow disclosure"
  );
});

test("phone overflow preserves every nonessential desktop capability", () => {
  for (const action of ["Library", "Replay", "Workspace", "Export", "How it works", "Settings"]) {
    assert.match(overflowSource, new RegExp(action), `${action} should remain reachable in the phone overflow`);
  }
});

test("phone geometry contract reserves visible 44px controls at 320 and 375", () => {
  assert.match(
    globalsSource,
    /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.debateTopControlRow\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) 44px 44px;[\s\S]*?\}/,
    "The phone control row should reserve one fluid view segment plus 44px diagnostics and overflow columns"
  );
  assert.match(
    globalsSource,
    /\.debateTopBar \.segment button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
    "Every view mode should retain a non-zero 44px target"
  );
  assert.match(
    globalsSource,
    /\.debateTopBar \.iconBtn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
    "Scoring diagnostics and overflow triggers should retain exact 44px boxes"
  );
});

test("scoring status is structurally moved to both insights summaries", () => {
  assert.equal(
    pageSource.match(/data-mobile-scoring-status="true"/g)?.length,
    2,
    "Expandable and compact scoring summaries should both expose mobile status"
  );
  assert.doesNotMatch(
    headerSource,
    /className="topSwitchStatus"|scoringStatusText|scoringConfidenceText/,
    "Status copy must not remain in the header and merely be hidden with CSS"
  );
});

test("token dock documentation names its actual corner", () => {
  assert.match(pageSource, /action token \(subtle, bottom-right\)/);
  assert.doesNotMatch(pageSource, /action token \(subtle, bottom-left\)/);
});
