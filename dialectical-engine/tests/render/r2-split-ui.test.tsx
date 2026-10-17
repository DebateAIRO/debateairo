// @vitest-environment jsdom

// tests/render/r2-split-ui.test.tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { PublicDebatesBuffer } from "../../apps/ui/components/DebatesBuffer.js";
import { VerdictBanner } from "../../apps/ui/components/VerdictBanner.js";
import { loadNamespace } from "../../apps/ui/lib/i18n/server.js";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { loadReportCatalogs, reportSupportedForLocale } from "../../apps/ui/lib/report/reportLanguage.js";
import { buildReportModel } from "../../apps/ui/lib/report/reportModel.js";
import type { VerdictSummary } from "../../apps/ui/lib/types.js";
import { liveVerdictState } from "../../apps/ui/lib/v3/labels.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { STORY_FIXTURE_ANSWER, storyFixture } from "../../apps/ui/lib/v3/storyFixture.js";
import { storyLabelWords } from "../../apps/ui/lib/v3/storyWords.js";
import { SPLIT_WORDS } from "../support/r2-split-words.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
const ROW = {
  public_ref: "00000000-0000-4000-8000-000000000009", author_pseudonym: "reader", question: "Question?",
  published_at: "2026-09-01T00:00:00.000Z", models: [], confidence_band: null
} as const;

describe("R2 SPLIT in the UI (ruling E8, Q1 option 1)", () => {
  it("maps SPLIT onto its own live state, distinct from the other three", () => {
    const states = (["SUPPORTED", "CONTESTED", "UNSUPPORTED", "SPLIT"] as const).map(liveVerdictState);
    expect(states).toEqual(["supported", "contested", "unsupported", "split"]);
  });

  it.each(LOCALES.map(({ code }) => code))("%s: the story label words SPLIT with the moved word", (code) => {
    expect(storyLabelWords("SPLIT", catalog(code, "public"))).toBe(SPLIT_WORDS[code]);
    expect(storyLabelWords("CONTESTED", catalog(code, "public"))).toBe(catalog(code, "public")["public.story.label.contested"]);
  });

  it("names a SPLIT row in the library with its own state, never complete, and a SPLIT floor the same way", () => {
    for (const row of [{ ...ROW, verdict: "SPLIT" as const }, { ...ROW, verdict: null, floor_verdict: "SPLIT" as const }]) {
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(
        <PublicDebatesBuffer debates={[row]} catalog={{ ...catalog("ro", "home"), ...catalog("ro", "chrome") }}
          timeCatalog={catalog("ro", "time")} locale="ro" composeCatalog={catalog("ro", "compose")} />
      );
      const status = container.querySelector(".libStatus");
      expect(status?.textContent).toBe(SPLIT_WORDS.ro);
      expect(status?.getAttribute("data-state")).toBe("split");
    }
  });

  it("gives the banner a SPLIT badge and no sentence (the V2 banner never receives SPLIT; no sentence rather than a false one)", () => {
    const summary: VerdictSummary = {
      verdictBand: "split", claimLanguage: "Engine label SPLIT reached the banner.",
      basis: { dialecticalStrength: 0.5, verificationStatus: null, convergence: null },
      verdictThresholdsVersion: "test-layer:r2", verdictState: liveVerdictState("SPLIT")
    };
    const html = renderToStaticMarkup(<VerdictBanner verdict={summary} />);
    expect(html).toContain('data-verdict-state="split"');
    expect(html).toContain(">Contested<");
    expect(html).not.toContain("The run did not settle this either way");
  });

  it.each(LOCALES.map(({ code }) => code).filter((code) => reportSupportedForLocale(code)))(
    "%s: the PDF cover words SPLIT with the moved word",
    async (code) => {
      const answer: Answer = { ...STORY_FIXTURE_ANSWER, verdict_state: "SPLIT" };
      const model = buildReportModel(answer, storyFixture("READY"), new Date("2026-10-16T12:00:00.000Z"),
        await loadReportCatalogs({ questionTag: code, interfaceLocale: "en", load: loadNamespace }));
      expect(model.cover.labelWords).toBe(SPLIT_WORDS[code]);
    }
  );

  it("styles SPLIT like the other contested states on every pill", () => {
    const css = readFileSync(resolve(process.cwd(), "apps/ui/app/globals.css"), "utf8");
    for (const selector of ['.libStatus[data-state="split"]', '.publicVerdictPill[data-verdict="split"]',
      '.storyPanelLabel[data-verdict="split"]', '.floorAnswerLabel[data-verdict="split"]']) {
      expect(css).toContain(selector);
    }
  });

  // Pre-flight PF-R2b4.8 (ruling option (a)): the owner's honesty drawer words the verdict as the story pill does;
  // the raw state stays only as the line's title, so no reader sees "SPLIT" or "CONTESTED" as a code.
  it.each(["en", "ro"] as const)("%s: the honesty drawer words the verdict, the raw state only as its title", (code) => {
    const noop = () => {};
    const words: ReadonlyArray<readonly [NonNullable<Answer["verdict_state"]>, string]> = [
      ["SPLIT", SPLIT_WORDS[code]!],
      ["CONTESTED", catalog(code, "public")["public.story.label.contested"]!],
      ["SUPPORTED", catalog(code, "public")["public.story.label.supported"]!]
    ];
    for (const [state, word] of words) {
      const container = document.createElement("div");
      container.innerHTML = renderToStaticMarkup(
        <AnswerHonestyDrawer
          answer={buildFairShapedAnswer({ verdict_state: state })} live={createLiveRunState()} ledgerDigest={null}
          ledgerError={null} inspection={null} inspectionError={null} onShowInspection={noop} onUnlinkMemory={noop}
          actionState={null} investigationInput={{}} onInvestigationInput={noop} onRecordInvestigation={noop}
          answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Test-layer export pending." }}
          token={null} onClose={noop} catalog={catalog(code, "misc")} debateChromeCatalog={catalog(code, "debateChrome")}
          composeCatalog={catalog(code, "compose")} publicCatalog={catalog(code, "public")}
        />
      );
      const verdictLine = container.querySelector(`.drawerFindingText[title="${state}"]`);
      expect(verdictLine?.textContent).toBe(word);
      expect([...container.querySelectorAll(".drawerFindingText")].map((line) => line.textContent)).not.toContain(state);
    }
  });
});
