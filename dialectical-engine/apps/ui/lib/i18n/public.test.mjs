import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

import { assertLocalizedCatalog, assertTranslationSample } from "./catalogContractAssertions.mjs";

const root = process.cwd();
const sourcePaths = [
  "app/public/debate/[id]/PublicDebatePageClient.tsx",
  "app/public/debate/[id]/page.tsx",
  "components/PublicDebateOverview.tsx",
  "components/PublicAnswerDisclosure.tsx",
  "components/PublicHonestyDrawer.tsx",
  "components/PublicationControl.tsx",
  "components/PublicationReviewPanel.tsx",
  "components/auth/SecurityActionResume.tsx",
  "lib/publicDebatePresentation.ts",
  "lib/v3/publicAnswerExport.ts",
  // The verdict story's words (R2): the owner's panel, the shared short-story
  // blocks, the words helpers and the PDF's model read `public.story.*` and
  // `public.report.*` from the QUESTION's `public` catalogue.
  "components/StoryPanel.tsx",
  "components/StoryShortBlocks.tsx",
  "lib/v3/storyWords.ts",
  "lib/v3/storyView.ts",
  "lib/report/reportModel.ts",
  // Charts in the verdict PDF (design 2026-10-28): each chart's caption and its strength axis.
  "lib/report/reportCharts.ts",
  // Tables in the verdict PDF (data blocks, 2026-10-30): each table's caption, the pros and cons sides and the ranking.
  "lib/report/reportTables.ts",
  // The PDF download route's refusals (Task 15): short plain lines, `public.report.error.*`.
  "lib/report/reportRoute.ts",
  // The final report's PDF (plan 2026-10-31 decision 17): `public.report.investigation.*`, the same words as the debate's own.
  "lib/report/investigationReportModel.ts",
  // The floor answer (Task M6): "Our best answer:" and the thin-basis line, `public.story.floor*`.
  "lib/v3/floorAnswer.ts",
  // Debate shape P2c: "Also raised, not debated" and the position titles, `public.alsoRaised.*` and
  // `public.positionTitle`, in the QUESTION's `public` catalogue.
  "components/AlsoRaisedList.tsx",
  "lib/v3/mapView.ts",
  // The owner's screen review of 3 Nov 2026 (public-d1 A): the public page's V4 body reads the story's fixed words (its reservation line, "Worth
  // knowing") from the question's `public` catalogue, and a publication review's "Details" and "Read" from the interface's; the review panel names its
  // own panels with the same two words.
  "components/v4/V4PublicPage.tsx",
  "components/PublicationReviewsPanel.tsx",
  // 0157 (D1): the statements of reasons page.
  "components/ModerationNotices.tsx"
];
const sources = new Map(sourcePaths.map((path) => [path, readFileSync(join(root, path), "utf8")]));
const catalogPath = join(root, "messages/en/public.json");

const currentHardCodedCopy = [
  "Export the published snapshot",
  "Exported the published snapshot",
  "Public debate · by",
  "Residual objections",
  "What could reverse this answer?",
  "VERDICT UNAVAILABLE",
  "No published",
  "final strength withheld",
  "Model lineage unavailable",
  "Challenge locked in public view",
  "Composed verdict prose was not included in this published snapshot.",
  "No classified side strength is available",
  "The strongest surviving argument on each side",
  "Viewing publicly — sign in to challenge, regenerate, or flag claims.",
  "Published debates may be indexed by search engines.",
  "Published snapshot",
  "Answer honesty",
  "Risk tier: not included in this public snapshot.",
  "Publication status is unavailable.",
  "Published. Anyone with the link can read it",
  "Publication change was not authorized.",
  "Private debate deletion is pending durable key cleanup.",
  "Publishing makes this debate readable by anyone",
  "Checking visibility…",
  "Account password",
  "Authenticator code",
  "Delete this private debate",
  "Permanently delete private debate",
  "Not measured",
  // The verdict story's retired English copy (R2): now catalogue keys, and the
  // engine-worded lines are gone for good.
  "Writing the full story of this debate",
  "Download full report (PDF)",
  "Positions the debate explored",
  "Reviewer's note",
  "Our checker's reservation",
  "Written by the AI storyteller",
  "How this verdict was computed",
  "Confidence: held below full"
];

function visibleEnglish(path, source) {
  const failures = [];
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const visibleAttributes = new Set(["alt", "aria-label", "placeholder", "title"]);
  const add = (value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (/[A-Za-z]{3,}/.test(normalized)) failures.push(normalized);
  };
  const inspect = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) add(node.getText(parsed));
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(parsed))) {
      const initializer = node.initializer;
      if (initializer && ts.isStringLiteral(initializer)) add(initializer.text);
      if (
        initializer && ts.isJsxExpression(initializer) && initializer.expression &&
        (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression))
      ) add(initializer.expression.text);
    }
    if (
      ts.isJsxExpression(node) && node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) add(node.expression.text);
    ts.forEachChild(node, inspect);
  };
  inspect(parsed);
  return failures;
}

test("the public namespace exists and covers every public translation call", () => {
  assert.equal(existsSync(catalogPath), true, "messages/en/public.json must exist");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const usedKeys = new Set();
  for (const source of sources.values()) {
    for (const match of source.matchAll(/\bt\(\s*[^,]+,\s*["'](public\.[A-Za-z0-9.]+)["']/g)) {
      usedKeys.add(match[1]);
    }
    // A plural root is used through its English forms (catalogContractAssertions
    // derives every other locale's forms from those).
    for (const match of source.matchAll(/\btPlural\(\s*[^,]+,\s*["'](public\.[A-Za-z0-9.]+)["']/g)) {
      usedKeys.add(`${match[1]}.one`);
      usedKeys.add(`${match[1]}.other`);
    }
  }
  // S02-R22: the owner review panel selects category/rule keys from the four
  // wire categories. Its other review keys include conditional arguments to
  // t(), which the literal-call matcher above cannot see.
  const reviewSource = sources.get("components/PublicationReviewPanel.tsx");
  for (const match of reviewSource.matchAll(/\bpublic\.publicationReview\.(?:[A-Za-z0-9_]+\.)*[A-Za-z0-9_]+/g)) {
    if (match[0] !== "public.publicationReview.category" && match[0] !== "public.publicationReview.rule") usedKeys.add(match[0]);
  }
  for (const category of ["TERRORISM", "HATE_SPEECH", "SUICIDE_OR_HARM_TO_OTHERS", "WEAPONS_OR_DRUGS"]) {
    usedKeys.add(`public.publicationReview.category.${category}`);
    usedKeys.add(`public.publicationReview.rule.${category}`);
  }
  // Decision 27: the PDF's trust words, sides and verdicts are chosen through small maps and conditions.
  for (const match of sources.get("lib/report/investigationReportModel.ts").matchAll(/\bpublic\.report\.(?:trust|investigation)\.[A-Za-z0-9_]+/g)) {
    usedKeys.add(match[0]);
  }
  // 0157: the statements page picks each line by the statement's kind, ground code, source and place.
  for (const kind of ["DEBATE_HIDDEN", "DEBATE_DECIDED", "CONTRIBUTION_REMOVED", "REPORT_REMOVED", "CORRECTED", "CONTRIBUTION_AFFECTED", "REPORT_AFFECTED", "CONTRIBUTION_DECIDED", "REPORT_DECIDED",
    "CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"]) {
    usedKeys.add(`public.moderation.kind.${kind}`);
    usedKeys.add(`public.moderation.what.${kind}`);
  }
  for (const code of ["REVIEW_HOLD", "UNLAWFUL", "HATE_SPEECH", "WEAPONS_OR_DRUGS", "SUICIDE_OR_HARM", "RELIGIOUS_INSULT", "PERSONAL_DATA", "ILLEGAL"]) usedKeys.add(`public.moderation.ground.${code}`);
  for (const source of ["REPORT_BUTTON", "EMAIL_NOTICE", "AUTHORITY_ORDER", "OWN_INITIATIVE"]) usedKeys.add(`public.moderation.source.${source}`);
  for (const place of ["SNAPSHOT", "UPDATE", "REPORT"]) usedKeys.add(`public.moderation.place.${place}`);
  for (const match of sources.get("components/ModerationNotices.tsx").matchAll(/"(public\.moderation\.[A-Za-z]+)"/g)) usedKeys.add(match[1]);
  assert.ok(usedKeys.size > 0, "S2-public sources must use public namespace keys");
  for (const key of usedKeys) assert.ok(Object.hasOwn(catalog, key), `missing ${key}`);
  assert.deepEqual([...usedKeys].sort(), Object.keys(catalog).sort(), "public catalog has no unused keys");
});

test("all 35 locales carry the exact public contract and translated sample", () => {
  const messagesRoot = join(root, "messages");
  const localeDirectories = readdirSync(messagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(localeDirectories.length, 35);
  const english = JSON.parse(readFileSync(catalogPath, "utf8"));
  const catalogs = new Map();
  for (const locale of localeDirectories) {
    const localized = JSON.parse(readFileSync(join(messagesRoot, locale, "public.json"), "utf8"));
    catalogs.set(locale, localized);
    assertLocalizedCatalog({ english, localized, locale, namespace: "public" });
  }
  assertTranslationSample({ catalogs, english, namespace: "public" });
});

test("S2-public sources contain no hard-coded user-visible English", () => {
  const visibleFailures = [...sources].flatMap(([path, source]) =>
    visibleEnglish(path, source).map((copy) => `${path}: ${copy}`)
  );
  assert.deepEqual(visibleFailures, []);

  const joined = [...sources.values()].join("\n");
  for (const copy of currentHardCodedCopy) {
    assert.equal(joined.includes(copy), false, `hard-coded copy remains: ${copy}`);
  }

  const overview = sources.get("components/PublicDebateOverview.tsx");
  assert.doesNotMatch(overview, /["'](?:PRO|CON)["']/);
});

// The owner's screen review of 3 Nov 2026 (public-d1 A): the public page leads with the answer and opens the person's own map, read-only, one click
// away. The classic overview (its verdict shell, support meter and argument grid) and the classic workspace behind it are gone from the public route.
test("the public overview leads with the answer, in V4's page, with the map one click away", () => {
  const overview = sources.get("components/PublicDebateOverview.tsx");
  const page = sources.get("app/public/debate/[id]/PublicDebatePageClient.tsx");
  const serverPage = sources.get("app/public/debate/[id]/page.tsx");
  const body = sources.get("components/v4/V4PublicPage.tsx");
  assert.match(serverPage, /loadNamespace\(locale, "public"\)/);
  assert.match(serverPage, /publicCatalog=\{publicCatalog\}/);
  assert.match(page, /<PublicDebateOverview/);
  assert.match(overview, /<V4PublicAnswerFirst/);
  assert.match(body, /data-public-answer-first/);
  assert.match(body, /"v4\.public\.exploreMap"/);
  assert.match(body, /readOnly: true/);
  for (const gone of ["publicVerdictShell", "publicSupportRow", "publicArgumentGrid", "publicUnlockNote", "publicLockedAction"]) {
    assert.doesNotMatch(overview + body + page, new RegExp(gone));
  }
});

test("the public route reads only what the V4 page needs, and no classic workspace", () => {
  const serverPage = sources.get("app/public/debate/[id]/page.tsx");
  const clientPage = sources.get("app/public/debate/[id]/PublicDebatePageClient.tsx");
  for (const namespace of ["public", "home", "chrome", "v4", "newDebate"]) assert.match(serverPage, new RegExp(`loadNamespace\\(locale, "${namespace}"\\)`));
  for (const namespace of ["debateChrome", "debateDrawers", "compose", "misc", "time"]) assert.doesNotMatch(serverPage, new RegExp(`loadNamespace\\(locale, "${namespace}"\\)`));
  assert.match(serverPage, /chromeCatalog=\{chromeCatalog\}/);
  assert.match(clientPage, /<AiNotice catalog=\{\{ \.\.\.homeCatalog, \.\.\.chromeCatalog \}\} \/>/);
  assert.doesNotMatch(clientPage, /<DebatePageClient/);
});
