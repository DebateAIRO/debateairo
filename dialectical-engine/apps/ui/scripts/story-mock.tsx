import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnswerStory } from "@debateai/contract";
import { AiNotice } from "../components/AiNotice";
import { StoryPanel } from "../components/StoryPanel";
import { t } from "../lib/i18n/translate";
import { STORY_FIXTURE_ANSWER, STORY_FIXTURE_DEBATE_ID, storyFixture } from "../lib/v3/storyFixture";
import { toStoryView } from "../lib/v3/storyView";
import debateChromeEnglish from "../messages/en/debateChrome.json" with { type: "json" };

/**
 * The owner's look-first mock (spec 2026-09-26 §10). Renders the REAL
 * StoryPanel with the fixture story in all four states into one HTML file.
 * Each preview is an iframe holding the whole of the site's stylesheet
 * (app/globals.css) and the panel inside the real .debateView column, under a
 * stand-in header and the real AI notice, so what the owner sees is what the
 * page will show, and the phone previews get the phone breakpoints. The
 * vendored fonts are inlined when they are present. The file needs no network
 * and runs no script.
 *
 * Usage: pnpm --filter dialectical-engine-v2ui run story:mock <absolute path to the output .html>
 * (pnpm runs the script from apps/ui, so a relative path is resolved from there).
 */

const outputPath = process.argv[2];
if (outputPath === undefined || outputPath.trim().length === 0) {
  console.error(
    "Usage: pnpm --filter dialectical-engine-v2ui run story:mock <absolute path to the output .html> " +
      "(a relative path is resolved from apps/ui)"
  );
  process.exit(2);
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteCss = readFileSync(resolve(appRoot, "app/globals.css"), "utf8");

function tokenBlock(selector: RegExp): string {
  const lines = siteCss.split("\n");
  const start = lines.findIndex((line) => selector.test(line));
  const end = lines.findIndex((line, index) => index > start && /^\}/.test(line));
  if (start < 0 || end < 0) throw new Error(`STORY_MOCK_TOKENS_MISSING: ${selector.source}`);
  return lines.slice(start, end + 1).join("\n");
}

// The panel's own styles must be in the stylesheet the previews carry.
if (!siteCss.includes("/* === verdict-story === */") || !siteCss.includes("/* === end verdict-story === */")) {
  throw new Error("STORY_MOCK_CSS_MISSING: the verdict-story block is not in app/globals.css");
}

// Only the faces the panel uses: the sans at 400 and 700 (the browser draws the panel's 600 with the
// 700 face) and the display serif's 600 for the headline. Every preview carries its own copy, so each
// extra face would be paid ten times over. JetBrains Mono is not vendored; the system monospace stands in.
const FONT_FACES = [
  { family: "Fraunces", weight: 600, style: "normal", file: "assets/fonts/fraunces/Fraunces9pt-SemiBold.ttf" },
  { family: "Plus Jakarta Sans", weight: 400, style: "normal", file: "assets/fonts/plus-jakarta-sans/PlusJakartaSans-Regular.ttf" },
  { family: "Plus Jakarta Sans", weight: 700, style: "normal", file: "assets/fonts/plus-jakarta-sans/PlusJakartaSans-Bold.ttf" }
] as const;

const presentFonts = FONT_FACES.filter((face) => existsSync(resolve(appRoot, face.file)));
const fontCss = presentFonts
  .map((face) => `@font-face { font-family: "${face.family}"; font-style: ${face.style}; font-weight: ${face.weight}; src: url(data:font/ttf;base64,${readFileSync(resolve(appRoot, face.file)).toString("base64")}) format("truetype"); }`)
  .join("\n");

// The site sets these three from next/font at run time; the mock names the families directly.
const MOCK_FONT_VARIABLES = ':root { --font-fraunces: "Fraunces"; --font-jakarta: "Plus Jakarta Sans"; --font-mono-src: ui-monospace; }';

// Only the stand-in parts of the page are styled here; the panel, the header
// chrome and the AI notice use the site's own rules.
const PREVIEW_CSS = `
.mockMain { align-items: center; justify-content: center; padding: 24px; }
.mockMain p { margin: 0; max-width: 36ch; color: var(--muted); font-size: 13px; line-height: 1.6; text-align: center; }
`;

const PAGE_CSS = `
body { margin: 0; background: var(--shell); color: var(--text); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
.mockPage { max-width: 1240px; margin: 0 auto; padding: 44px 28px 72px; }
.mockIntro { max-width: 720px; }
.mockEyebrow { color: var(--text-3); font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.mockIntro h1 { margin: 10px 0 14px; color: var(--text-strong); font-family: var(--font-display); font-size: 32px; font-weight: 600; line-height: 1.15; letter-spacing: -.01em; }
.mockIntro p { margin: 0 0 10px; color: var(--text-2); font-size: 14.5px; line-height: 1.65; }
.mockSection { margin-top: 48px; }
.mockSection h2 { margin: 0 0 4px; color: var(--text-strong); font-family: var(--font-display); font-size: 22px; font-weight: 600; }
.mockSection > p { margin: 0 0 20px; color: var(--text-2); font-size: 13.5px; line-height: 1.6; }
.mockGrid { display: flex; flex-wrap: wrap; gap: 32px 28px; align-items: flex-end; }
.mockFigure { margin: 0; max-width: 100%; }
.mockFigure figcaption { margin: 0 0 10px; }
.mockFigure figcaption strong { display: block; color: var(--text); font-size: 13.5px; font-weight: 700; }
.mockFigure figcaption span { display: block; margin-top: 2px; color: var(--text-2); font-size: 12.5px; line-height: 1.5; }
.mockFigure iframe { display: block; max-width: 100%; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--bg); box-shadow: var(--lp-card-shadow); }
`;

const pageCss = [fontCss, tokenBlock(/^:root\s*\{/), MOCK_FONT_VARIABLES, PAGE_CSS].join("\n");
const previewCss = [fontCss, MOCK_FONT_VARIABLES, siteCss, PREVIEW_CSS].join("\n");

/** The debate page around the panel: a stand-in header, the real AI notice, the panel, and the space the argument views keep. */
function PreviewPage({ status }: { status: AnswerStory["status"] }): JSX.Element {
  return (
    <div className="debateView">
      <header className="debateTopBar">
        <div className="debateTopIdentityRow">
          <span className="brand">
            <span className="brandDiamond" aria-hidden="true"><span className="brandDiamondCore" /></span>
            <span className="brandText">
              <span className="brandName">Dialectical Engine</span>
              <span className="brandDomain">dezbatere.ro</span>
            </span>
          </span>
          <span className="debateTopDivider" aria-hidden="true" />
          <div className="debateTopClaim"><span className="debateTopTitle">{STORY_FIXTURE_ANSWER.question_line}</span></div>
        </div>
      </header>
      <div className="debateAiDisclosure"><AiNotice body={t(debateChromeEnglish, "debateChrome.aiNotice")} /></div>
      <StoryPanel view={toStoryView(STORY_FIXTURE_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID)} />
      <div className="debateMain mockMain">
        <p>The debate&apos;s argument views (tree, thread, split and map) stay here, below the story.</p>
      </div>
    </div>
  );
}

function previewDocument(mode: "terracotta" | "chamber", status: AnswerStory["status"]): string {
  const body = renderToStaticMarkup(<PreviewPage status={status} />);
  return `<!doctype html><html lang="en" data-mode="${mode}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Story panel preview</title><style>${previewCss}</style></head><body>${body}</body></html>`;
}

const DESKTOP = Object.freeze({ width: 1180, height: 720, words: "desktop" });
const PHONE = Object.freeze({ width: 390, height: 844, words: "phone" });

type Screen = typeof DESKTOP | typeof PHONE;

interface StateCopy {
  readonly status: AnswerStory["status"];
  readonly title: string;
  readonly words: string;
}

const STATES: readonly StateCopy[] = Object.freeze([
  {
    status: "WRITING",
    title: "Writing",
    words: "The first few minutes after a debate ends, while the story is being written."
  },
  {
    status: "READY",
    title: "Ready",
    words: "The story is written and our checker was satisfied with it."
  },
  {
    status: "READY_WITH_RESERVATION",
    title: "Ready, with a reservation",
    words: "The story is written, but our checker still had a doubt. The doubt gets its own box, with a note on what its point numbers mean."
  },
  {
    status: "UNAVAILABLE",
    title: "Unavailable",
    words: "No story could be written, for example because the time allowed ran out. The panel shows the debate's usual short answer instead."
  }
]);

function Frame({ state, screen, mode }: { state: StateCopy; screen: Screen; mode: "terracotta" | "chamber" }): JSX.Element {
  const title = `${state.title} (${screen.words}${mode === "chamber" ? ", dark mode" : ""})`;
  return (
    <figure className="mockFigure" style={{ width: screen.width }}>
      <figcaption>
        <strong>{title}</strong>
        <span>{state.words}</span>
      </figcaption>
      <iframe title={title} width={screen.width} height={screen.height} srcDoc={previewDocument(mode, state.status)} />
    </figure>
  );
}

function stateCopy(status: string): StateCopy {
  const state = STATES.find((entry) => entry.status === status);
  if (state === undefined) throw new Error(`STORY_MOCK_STATE_MISSING: ${status}`);
  return state;
}

const fontsMissing = presentFonts.length < FONT_FACES.length;

function MockPage(): JSX.Element {
  return (
    <div className="mockPage">
      <div className="mockIntro">
        <div className="mockEyebrow">Preview for approval</div>
        <h1>The story of a debate, on the debate page</h1>
        <p>
          This is the real story panel from your debate page, filled with a made-up sample debate in Romanian. Nothing
          here is live: the question, the story and the scores exist only for this preview.
        </p>
        <p>
          The panel sits near the top of the debate page, under the AI notice, and the argument views keep the rest of
          the screen. Each box below is the whole page at one screen size; its top line is a simplified stand-in for the
          page header. Inside a box you can press Hide or Show on the panel&apos;s top line to fold it away, and scroll
          the panel&apos;s text when it is longer than the panel.
        </p>
        {fontsMissing ? (
          <p>The site&apos;s own fonts are not bundled yet, so your browser&apos;s fonts stand in for them. The layout and the colours are the site&apos;s.</p>
        ) : null}
      </div>
      <section className="mockSection">
        <h2>On a computer</h2>
        <p>The four states the panel can be in, on a laptop-sized screen.</p>
        <div className="mockGrid">
          {STATES.map((state) => <Frame key={state.status} state={state} screen={DESKTOP} mode="terracotta" />)}
        </div>
      </section>
      <section className="mockSection">
        <h2>On a phone</h2>
        <p>The same four states on a phone. The panel stays visible and keeps to the top part of the screen.</p>
        <div className="mockGrid">
          {STATES.map((state) => <Frame key={state.status} state={state} screen={PHONE} mode="terracotta" />)}
        </div>
      </section>
      <section className="mockSection">
        <h2>Dark mode</h2>
        <p>The panel with the site&apos;s dark mode on, on a computer and on a phone.</p>
        <div className="mockGrid">
          <Frame state={stateCopy("READY_WITH_RESERVATION")} screen={DESKTOP} mode="chamber" />
          <Frame state={stateCopy("READY_WITH_RESERVATION")} screen={PHONE} mode="chamber" />
        </div>
      </section>
    </div>
  );
}

// Each preview is a whole document in its iframe's srcdoc attribute, which
// React escapes like any other attribute value.
const pageBody = renderToStaticMarkup(<MockPage />);

const page = `<!doctype html>
<html lang="en" data-mode="terracotta">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>The story of a debate: panel preview</title><style>${pageCss}</style></head>
<body>
${pageBody}
</body>
</html>
`;

writeFileSync(resolve(outputPath), page, "utf8");
console.log(`STORY_MOCK_WRITTEN=${resolve(outputPath)}`);
