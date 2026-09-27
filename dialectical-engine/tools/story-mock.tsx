/** @jsxRuntime classic */
/** @jsx createElement */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { JSX } from "react";
import type { AnswerStory } from "@debateai/contract";
import { AiNotice } from "../apps/ui/components/AiNotice";
import { LanguageOfferStrip } from "../apps/ui/components/QuestionLanguageOffer";
import { StoryPanel } from "../apps/ui/components/StoryPanel";
import { SynthesisPanel } from "../apps/ui/components/SynthesisPanel";
import { languageOfferLocale, questionLocale } from "../apps/ui/lib/i18n/questionLocale";
import { t } from "../apps/ui/lib/i18n/translate";
import { reportSupportedForLocale } from "../apps/ui/lib/report/reportLanguage";
import { floorAnswerView, resolveFloor } from "../apps/ui/lib/v3/floorAnswer";
import {
  STORY_FIXTURE_ANSWER,
  STORY_FIXTURE_DEBATE_ID,
  STORY_FIXTURE_FLOOR,
  STORY_FIXTURE_FLOOR_ANSWER,
  STORY_FIXTURE_LANGUAGE,
  storyFixture
} from "../apps/ui/lib/v3/storyFixture";
import { toStoryView } from "../apps/ui/lib/v3/storyView";
import chromeEnglish from "../apps/ui/messages/en/chrome.json" with { type: "json" };
import debateChromeEnglish from "../apps/ui/messages/en/debateChrome.json" with { type: "json" };
import debateDrawersEnglish from "../apps/ui/messages/en/debateDrawers.json" with { type: "json" };
import homeEnglish from "../apps/ui/messages/en/home.json" with { type: "json" };
import publicEnglish from "../apps/ui/messages/en/public.json" with { type: "json" };
import publicRomanian from "../apps/ui/messages/ro/public.json" with { type: "json" };

/**
 * The owner's look-first mock (spec 2026-09-26 §10, revised by §14). Renders
 * the REAL StoryPanel with the Romanian fixture story in all four states into
 * one HTML file, the way a reader whose interface is English sees a debate
 * argued in Romanian: the page around the panel in English, the panel, its
 * labels and buttons included, in Romanian (spec §14.3), and the REAL offer to
 * show the page in Romanian. Each preview is an iframe holding the whole of the
 * site's stylesheet (app/globals.css) and the panel inside the real
 * .debateView column, under a stand-in header and the real AI notice, so what
 * the owner sees is what the page will show, and the phone previews get the
 * phone breakpoints. The vendored fonts are inlined when they are present. The
 * file needs no network and runs no script. Task M6 adds the FLOOR answer: the
 * same debate when no answer could be written, as the strip and the page's
 * real verdict card show it.
 *
 * Usage: pnpm --filter dialectical-engine-v2ui run story:mock <absolute path to the output .html>
 * (pnpm runs the script from apps/ui, so a relative path is resolved from there).
 *
 * WHY IT LIVES IN tools/ AND NOT apps/ui/scripts/: it is a developer's preview
 * for the owner, never shipped, and its page is written in English for the
 * owner. dev's no-hardcoded-english gate (apps/ui/scripts/
 * no-hardcoded-english.test.mjs) scans every .ts/.tsx file under apps/ui, so
 * the mock moved out of that tree rather than onto the gate's allowlist. It
 * still renders the REAL components from apps/ui, and it takes React from
 * apps/ui too (below): the repository root does not depend on React, and the
 * page and the panel must share one React. Nothing type-checks this file any
 * more (the root tsconfig takes only .ts files under tools/, the UI one only
 * apps/ui); tests/render/story-mock-script.test.tsx runs it end to end instead.
 */

const outputPath = process.argv[2];
if (outputPath === undefined || outputPath.trim().length === 0) {
  console.error(
    "Usage: pnpm --filter dialectical-engine-v2ui run story:mock <absolute path to the output .html> " +
      "(a relative path is resolved from apps/ui)"
  );
  process.exit(2);
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/ui");
// React and react-dom are the UI app's dependencies: resolve them from apps/ui,
// the package whose components this mock renders. The two pragmas at the top
// make this file's own JSX call this createElement.
const uiRequire = createRequire(resolve(appRoot, "package.json"));
const { createElement } = uiRequire("react") as typeof import("react");
const { renderToStaticMarkup } = uiRequire("react-dom/server") as typeof import("react-dom/server");
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

// The reader's interface is English; the question, and so the story's fixed text, is Romanian.
const INTERFACE_LOCALE = "en";
const STORY_LOCALE = questionLocale(STORY_FIXTURE_LANGUAGE.tag, INTERFACE_LOCALE);

// The offer as a first-time reader sees it. The page's QuestionLanguageOffer renders nothing on the
// server (it waits for the browser to check a dismissal), so the preview draws its strip directly.
const OFFER_TARGET = languageOfferLocale(STORY_LOCALE, INTERFACE_LOCALE);
if (OFFER_TARGET === null) throw new Error("STORY_MOCK_OFFER_MISSING: the sample's language is the interface's");

/**
 * The floor (spec §14.4.4) of STORY_FIXTURE_FLOOR_ANSWER: its label, its leading
 * position's statement, and a label that rests on less than usual.
 */
const FLOOR = resolveFloor(
  { terminal: STORY_FIXTURE_FLOOR_ANSWER.terminal, verdict: STORY_FIXTURE_FLOOR_ANSWER.verdict_state, nodes: STORY_FIXTURE_FLOOR_ANSWER.nodes },
  STORY_FIXTURE_FLOOR
);
if (FLOOR === null) throw new Error("STORY_MOCK_FLOOR_MISSING: the fixture's floor does not resolve");

type Variant = "served" | "floor";

/**
 * The argument views' space. For a floor answer it also holds the page's real
 * verdict card, whose fixed words follow the reader's interface (English here),
 * as every fixed word there does; the statement is the debate's own.
 */
function PreviewMain({ variant }: { variant: Variant }): JSX.Element {
  const note = <p>The debate&apos;s argument views (tree, thread, split and map) stay here, below the story.</p>;
  if (variant === "served") return <div className="debateMain mockMain">{note}</div>;
  return (
    <div className="debateMain">
      <div className="mockMain" style={{ display: "flex", flex: 1, minWidth: 0 }}>{note}</div>
      <SynthesisPanel
        ready
        pending={false}
        streaming={false}
        structured
        proClaim=""
        conClaim=""
        verdict=""
        meta=""
        lean={null}
        sections={[]}
        floor={floorAnswerView(FLOOR!, publicEnglish, INTERFACE_LOCALE, STORY_LOCALE)}
        catalog={debateDrawersEnglish}
      />
    </div>
  );
}

/**
 * The debate page around the panel: a stand-in header, the real AI notice, the
 * real language offer when asked for (as before the reader answers it), the
 * panel, and the space the argument views keep.
 */
function PreviewPage({ status, offer, variant }: { status: AnswerStory["status"]; offer: boolean; variant: Variant }): JSX.Element {
  const view = variant === "floor"
    ? toStoryView(STORY_FIXTURE_FLOOR_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, STORY_LOCALE, reportSupportedForLocale, FLOOR)
    : toStoryView(STORY_FIXTURE_ANSWER, storyFixture(status), STORY_FIXTURE_DEBATE_ID, STORY_LOCALE);
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
      <div className="debateAiDisclosure">
        <AiNotice catalog={{ ...homeEnglish, ...chromeEnglish }} body={t(debateChromeEnglish, "debateChrome.aiNotice")} />
      </div>
      {offer ? <LanguageOfferStrip target={OFFER_TARGET} interfaceLocale={INTERFACE_LOCALE} catalog={chromeEnglish} /> : null}
      <StoryPanel view={view} catalog={publicRomanian} locale={STORY_LOCALE} />
      <PreviewMain variant={variant} />
    </div>
  );
}

function previewDocument(mode: "terracotta" | "chamber", status: AnswerStory["status"], offer: boolean, variant: Variant): string {
  const body = renderToStaticMarkup(<PreviewPage status={status} offer={offer} variant={variant} />);
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
    words: "The first few minutes after a debate ends, while the story is being written. The debate's usual answer shows meanwhile, so there is always an answer; no confidence line yet, since only the story can say how sure we are."
  },
  {
    status: "READY",
    title: "Ready",
    words: "The story is written and a second AI model checked it without a doubt. The label is in plain words, and the line under the headline is the story's own sentence on how sure we are."
  },
  {
    status: "READY_WITH_RESERVATION",
    title: "Ready, with a reservation",
    words: "The story is written, but the second model still had a doubt. The reader sees only the gentle line at the end; the doubt itself stays in your records."
  },
  {
    status: "UNAVAILABLE",
    title: "Unavailable",
    words: "No story could be written, for example because the time allowed ran out. The panel says so plainly and shows the debate's usual summary instead."
  }
]);

function Frame({ state, screen, mode, offer = false, variant = "served" }: {
  state: StateCopy;
  screen: Screen;
  mode: "terracotta" | "chamber";
  offer?: boolean;
  variant?: Variant;
}): JSX.Element {
  const title = `${state.title} (${screen.words}${mode === "chamber" ? ", dark mode" : ""})`;
  return (
    <figure className="mockFigure" style={{ width: screen.width }}>
      <figcaption>
        <strong>{title}</strong>
        <span>{state.words}</span>
      </figcaption>
      <iframe title={title} width={screen.width} height={screen.height} srcDoc={previewDocument(mode, state.status, offer, variant)} />
    </figure>
  );
}

const OFFER_STATE: StateCopy = Object.freeze({
  status: "READY",
  title: "The offer to switch languages",
  words: "What a reader with an English interface sees first on a Romanian debate. \"Switch to Romanian\" shows the whole site in Romanian; \"No, thanks\" hides the offer for the rest of the visit, and it does not come back on a reload."
});

/** The floor answer's states (Task M6): while its story is written, and once it is ready. */
const FLOOR_STATES: readonly StateCopy[] = Object.freeze([
  {
    status: "WRITING",
    title: "No answer could be written: while the story is written",
    words: "The debate ran out of budget before any AI model could write the answer. The strip still gives an answer: the close-call label, \"Cel mai bun răspuns al nostru:\" and the strongest position's own words, with a quiet line because this label rests on less evidence than usual. On the right, the page's own answer card says the same in the reader's English, where it used to show only a technical line."
  },
  {
    status: "READY",
    title: "No answer could be written: the story is ready",
    words: "The full story is told from the same label. Only the PDF's \"About this report\" says why no full answer was written; the story and the page never do."
  }
]);

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
          The previews show a reader whose site is in English opening a debate that was argued in Romanian. The page
          around the panel stays in English; the panel is Romanian from its title to its buttons, because it follows
          the language of the question. The last section shows the offer to switch the whole page to Romanian.
        </p>
        <p>
          The panel sits near the top of the debate page, under the AI notice, and the argument views keep the rest of
          the screen. Each box below is the whole page at one screen size; its top line is a simplified stand-in for the
          page header. Inside a box you can press Ascundeți (hide) or Afișați (show) on the panel&apos;s top line to fold
          it away, and scroll the panel&apos;s text when it is longer than the panel.
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
        <p>The four states with the site&apos;s dark mode on, on a computer.</p>
        <div className="mockGrid">
          {STATES.map((state) => <Frame key={state.status} state={state} screen={DESKTOP} mode="chamber" />)}
        </div>
      </section>
      <section className="mockSection">
        <h2>When no AI model could write the full answer</h2>
        <p>
          The same debate when the budget ran out before any AI model could write the answer. The reader still gets an
          answer: the label, &ldquo;Our best answer:&rdquo; and the strongest position&apos;s own statement. The public page
          shows it the same way, in the question&apos;s language.
        </p>
        <div className="mockGrid">
          {FLOOR_STATES.map((state) => <Frame key={state.status} state={state} screen={DESKTOP} mode="terracotta" variant="floor" />)}
          <Frame state={FLOOR_STATES[0]!} screen={PHONE} mode="terracotta" variant="floor" />
        </div>
      </section>
      <section className="mockSection">
        <h2>Offering the question&apos;s language</h2>
        <p>
          When a debate&apos;s language differs from the reader&apos;s, a slim strip under the AI notice offers to switch.
          It is written in the reader&apos;s language, and names the other language in its own words.
        </p>
        <div className="mockGrid">
          <Frame state={OFFER_STATE} screen={DESKTOP} mode="terracotta" offer />
          <Frame state={OFFER_STATE} screen={PHONE} mode="terracotta" offer />
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
