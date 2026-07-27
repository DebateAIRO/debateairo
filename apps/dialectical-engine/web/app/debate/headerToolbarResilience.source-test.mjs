import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadCss } from "../../tests/loadCss.mjs";

const pageSource = readFileSync("app/debate/[id]/DebatePageClient.tsx", "utf8");
const globalsSource = loadCss();

test("debate header declares separate identity and control rows", () => {
  assert.match(
    pageSource,
    /<header className="debateTopBar">[\s\S]*?<div className="debateTopIdentityRow">[\s\S]*?<BrandMark \/>[\s\S]*?<div className="debateTopClaim">[\s\S]*?className="debateTopTitle"[\s\S]*?className=\{`pill \$\{statusKind\}`\}[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<div className="debateTopControlRow">[\s\S]*?<div className="segment" role="group" aria-label="View">[\s\S]*?aria-pressed=\{view === "thread"\}[\s\S]*?Thread[\s\S]*?aria-pressed=\{view === "split"\}[\s\S]*?Split[\s\S]*?aria-pressed=\{view === "tree"\}[\s\S]*?Tree[\s\S]*?aria-pressed=\{view === "map"\}[\s\S]*?Map[\s\S]*?<\/div>[\s\S]*?<div className="topSwitch">[\s\S]*?aria-label="Open scoring diagnostics"[\s\S]*?<\/div>[\s\S]*?<details className="debateOverflow">[\s\S]*?<summary[\s\S]*?aria-label="More debate actions"[\s\S]*?<div className="debateOverflowMenu">[\s\S]*?Workspace[\s\S]*?Export[\s\S]*?How it works[\s\S]*?Settings[\s\S]*?<\/details>[\s\S]*?<\/div>[\s\S]*?<\/header>/s,
    "The header should expose an identity row, a view-first control row, and the secondary-action overflow"
  );
  assert.doesNotMatch(
    pageSource,
    /aria-label="Toggle scoring"|Refresh scoring/,
    "The normal toolbar should not expose removed scoring toggle or refresh controls"
  );
});

test("scoring status and responsive controls follow the phone-safe chrome contract", () => {
  const topSwitchSource = pageSource.match(/<div className="topSwitch">([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.doesNotMatch(
    topSwitchSource,
    /topSwitchStatus|scoringStatusText|scoringConfidenceText/,
    "The top switch should keep only the scoring label and diagnostics trigger"
  );
  assert.equal(
    pageSource.match(/data-mobile-scoring-status="true"/g)?.length,
    2,
    "Both scoring-insights summary variants should present scoring status copy"
  );
  assert.match(
    pageSource,
    /className="scoringInsightsStatus"[\s\S]*?data-mobile-scoring-status="true"[\s\S]*?\{scoringStatusText[\s\S]*?\{scoringConfidenceText/,
    "The scoring insights strip should render the real status and confidence copy"
  );
  assert.match(
    globalsSource,
    /\.debateTopBar\s+:where\(a,\s*button,\s*summary\)\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?\}/,
    "Every interactive header target should have a 44px minimum height"
  );
  assert.match(
    globalsSource,
    /\.debateTopBar \.segment button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;[\s\S]*?\}/,
    "All four view buttons should remain 44px tap targets"
  );
  assert.match(
    globalsSource,
    /@media \(max-width:\s*920px\)\s*\{[\s\S]*?\.debateTopBar\s*\{[\s\S]*?grid-template-rows:\s*auto auto;[\s\S]*?\}[\s\S]*?\.debateTopTitle\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?\}/,
    "At 920px the header should become two rows with a flexible ellipsized title"
  );
  assert.match(
    globalsSource,
    /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.debateTopIdentityRow \.brandText\s*\{[\s\S]*?display:\s*none;[\s\S]*?\}[\s\S]*?\.debateOverflow > summary\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?\}[\s\S]*?\.debateOverflow:not\(\[open\]\) \.debateOverflowMenu\s*\{[\s\S]*?display:\s*none;/,
    "At 640px the brand should become icon-only and secondary actions should collapse behind the overflow trigger"
  );
  assert.match(
    pageSource,
    /\{\/\* ---- action token \(subtle, bottom-right\) ---- \*\/\}/,
    "The token dock mount comment should describe its actual bottom-right position"
  );
});
