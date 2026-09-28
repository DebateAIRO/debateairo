import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer, AnswerModelAssignment, ExecutionLedgerDigest } from "@debateai/contract";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { makerIdentityLabel } from "../../apps/ui/lib/makerIdentity.js";
import { buildAnswerExport } from "../../apps/ui/lib/v3/answerExport.js";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/*
 * A21.3 — the finished debate's honesty drawer names the models chosen for each debate job.
 *
 * Owner decisions (2026-09-28, task-A21-carries.md):
 *  - O1: a PLAIN list. Per job, the NAMES of the models chosen, in the node badges' form, under a
 *    plain job name, and ONE sentence that another AI model may have stepped in. No seat number,
 *    thinking level, backup share, scorecard version or "plan list"; that detail stays in the
 *    JSON export.
 *  - O3: a lowered strength is never mentioned.
 * Carries: 2 (the backup mark's COMMITTED label), 4 (a FALLBACK answer seat names no model),
 * 5 (the cross-exchange is one fixed line), 6 (the title claims no use), 13 (the absent-field
 * sentence is true for "no scorecard" and for an unreadable pin alike).
 */

const noop = () => {};

function drawerHtml(overrides: Partial<Answer>): string {
  return renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={buildFairShapedAnswer(overrides)}
      live={createLiveRunState()}
      ledgerDigest={null}
      ledgerError={null}
      inspection={null}
      inspectionError={null}
      onShowInspection={noop}
      onUnlinkMemory={noop}
      actionState={null}
      investigationInput={{}}
      onInvestigationInput={noop}
      onRecordInvestigation={noop}
      answerExport={{ available: false, reason: "LEDGER_DIGEST_PENDING", message: "Test-layer export pending." }}
      token={null}
      onClose={noop}
    />
  );
}

/** Text as React writes it into markup. */
function escaped(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#x27;");
}

const TITLE = "Models chosen for this debate";
const STAND_IN = "Where a chosen model was unavailable, another AI model may have stepped in.";
// Fix round 1 (review Minor 1): exact both when no scorecard was in force and when the run's record is unreadable.
const NOT_RECORDED = "No record of the models for this debate is available.";
const SITE_SETTING = "This site's usual setting chooses the model for this job.";
const CROSS_EXCHANGE = "The model that wrote each opening position also writes its replies to the other positions.";

/** The new section alone, so no assertion can pass on another section's text. */
function modelsSection(html: string): string {
  const start = html.indexOf(`<section class="wsSection" aria-label="${TITLE}">`);
  expect(start, "the models section is rendered").toBeGreaterThan(-1);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end + "</section>".length);
}

/** One job's list item inside the section, found by its plain job name. */
function jobItem(section: string, label: string): string {
  const at = section.indexOf(`<span>${escaped(label)}</span>`);
  expect(at, `job "${label}" is listed`).toBeGreaterThan(-1);
  const start = section.lastIndexOf("<li", at);
  return section.slice(start, section.indexOf("</li>", at) + "</li>".length);
}

const CLAUDE = { maker: "Anthropic", model_id: "claude-opus-4-7", thinking_level: "high" };
const ALPHA = { maker: "Alpha", model_id: "alpha-large", thinking_level: "high" };
const BETA = { maker: "Beta", model_id: "beta-large", thinking_level: "DEFAULT_ONLY" };
const ETA = { maker: "Eta", model_id: "eta-only-in-cross-exchange", thinking_level: "DEFAULT_ONLY" };
const ZETA = { maker: "Zeta", model_id: "zeta-never-answers", thinking_level: "DEFAULT_ONLY" };

const ASSIGNMENT: AnswerModelAssignment = {
  strength: "BALANCED",
  stepped_down: true,
  scorecard_version: 4,
  roles: [
    { role: "POSITION", seats: [
      { seat_index: 0, source: "SCORECARD", main: CLAUDE, runner_up: BETA, runner_up_share: 0.2 },
      { seat_index: 1, source: "FALLBACK", main: ALPHA, runner_up: null, runner_up_share: 0 }
    ] },
    { role: "SUPPORT_ATTACK", seats: [] },
    { role: "CROSS_EXCHANGE", seats: [
      { seat_index: 0, source: "SCORECARD", main: CLAUDE, runner_up: ETA, runner_up_share: 0.2 },
      { seat_index: 1, source: "FALLBACK", main: ALPHA, runner_up: null, runner_up_share: 0 }
    ] },
    { role: "JUDGE", seats: [
      { seat_index: 0, source: "SCORECARD", main: BETA, runner_up: CLAUDE, runner_up_share: 0.2 }
    ] },
    { role: "REVIEWER", seats: [] },
    { role: "ANSWER_WRITER", seats: [
      { seat_index: 0, source: "SCORECARD", main: CLAUDE, runner_up: null, runner_up_share: 0 }
    ] },
    { role: "ANSWER_CHECKER", seats: [
      { seat_index: 0, source: "FALLBACK", main: ZETA, runner_up: null, runner_up_share: 0 }
    ] }
  ]
};

const badge = (candidate: { maker: string; model_id: string }) =>
  escaped(makerIdentityLabel({ maker: candidate.maker, modelId: candidate.model_id }).text);

describe("A21.3 · the honesty drawer names the models chosen for each debate job", () => {
  it("O1 · lists each job's models by name, in the node badges' form, under a plain job name", () => {
    const section = modelsSection(drawerHtml({ model_assignment: ASSIGNMENT }));

    expect(section).toContain(`<div class="drawerSectionTitle">${TITLE}</div>`);
    // The node badges' own form: maker · family · id, through makerIdentityLabel.
    expect(badge(CLAUDE)).toBe("Anthropic · Claude · claude-opus-4-7");
    const opening = jobItem(section, "Writing the opening positions");
    expect(opening).toContain(badge(CLAUDE));
    expect(opening).toContain(badge(BETA));
    expect(opening).toContain(badge(ALPHA));
    expect(opening).toContain('class="metaLine" style="--model-color:var(--m-claude)" data-maker="Anthropic"');
    const judging = jobItem(section, "Judging the arguments");
    expect(judging).toContain(badge(BETA));
    expect(judging).toContain(badge(CLAUDE));
    expect(jobItem(section, "Writing the answer")).toContain(badge(CLAUDE));
    // One plain sentence that another model may have stepped in, once.
    expect(section.split(escaped(STAND_IN))).toHaveLength(2);
    // A job with no seats in this debate is not listed.
    expect(section).not.toContain("Writing supporting and opposing arguments");
    expect(section).not.toContain("Reviewing the arguments");
  });

  it("O1 / O3 · shows no seat, thinking level, share, strength, step-down or scorecard version", () => {
    const section = modelsSection(drawerHtml({ model_assignment: ASSIGNMENT }));
    expect(section).not.toMatch(/seat|thinking|high|DEFAULT_ONLY|%|20|0\.2|scorecard|version|Balanced|BALANCED/iu);
    expect(section).not.toMatch(/below the strength|stepped down|step-down|lower|limits|plan list|backup|fallback/iu);
    // The same section whatever the strength, the step-down or the scorecard version.
    expect(modelsSection(drawerHtml({
      model_assignment: { ...ASSIGNMENT, strength: "BEST", stepped_down: false, scorecard_version: null }
    }))).toBe(section);
  });

  it("carry 4 · a FALLBACK answer-writer or answer-checker seat names no model, only this site's usual setting", () => {
    const section = modelsSection(drawerHtml({ model_assignment: ASSIGNMENT }));
    const checking = jobItem(section, "Checking the answer");
    expect(checking).toContain(escaped(SITE_SETTING));
    expect(checking).not.toContain('class="metaLine"');
    expect(section).not.toContain("zeta-never-answers");

    const writerFallback = modelsSection(drawerHtml({
      model_assignment: {
        ...ASSIGNMENT,
        roles: ASSIGNMENT.roles.map((entry) => entry.role === "ANSWER_WRITER"
          ? { role: entry.role, seats: [{ ...entry.seats[0]!, source: "FALLBACK" as const }] }
          : entry)
      }
    }));
    const writing = jobItem(writerFallback, "Writing the answer");
    expect(writing).toContain(escaped(SITE_SETTING));
    expect(writing).not.toContain('class="metaLine"');
  });

  it("carry 5 · the cross-exchange is one fixed line, never listed seat by seat", () => {
    const section = modelsSection(drawerHtml({ model_assignment: ASSIGNMENT }));
    const replying = jobItem(section, "Replying to the other positions");
    expect(replying).toContain(escaped(CROSS_EXCHANGE));
    expect(replying).not.toContain('class="metaLine"');
    // A model pinned only as a cross-exchange backup never writes one, so it is never named.
    expect(section).not.toContain("eta-only-in-cross-exchange");
  });

  it("carry 6 · the title and its aria-label say chosen, never used", () => {
    const html = drawerHtml({ model_assignment: ASSIGNMENT });
    expect(html).toContain(`aria-label="${TITLE}"`);
    expect(html).not.toContain('aria-label="Models used"');
    expect(html).not.toContain(">Models used<");
  });

  it("carry 13 · an absent assignment says only that the models were not recorded", () => {
    const section = modelsSection(drawerHtml({}));
    expect(section).toContain(`<div class="drawerHintMuted">${escaped(NOT_RECORDED)}</div>`);
    expect(section).not.toContain(escaped(STAND_IN));
    expect(section).not.toMatch(/scorecard|plan list|because|metaLine/iu);
  });

  it("carry 2 / final review m1 · the backup mark reads in its committed plain words, true in every case", () => {
    const html = drawerHtml({ condition_marks: ["BACKUP-MODEL-USED"] });
    // m1: a main whose key reached its bound with only OK answers is handed over too, so the
    // label says the planned model could not be used, never that it was unavailable.
    expect(conditionMarkLabel("BACKUP-MODEL-USED")).toBe("Where a planned AI model could not be used, another one stepped in");
    expect(html).toContain(`>${conditionMarkLabel("BACKUP-MODEL-USED")}<`);
    expect(html).not.toContain(">BACKUP-MODEL-USED<");
  });

  it("O1 · the full detail stays in the JSON export", () => {
    const answer = buildFairShapedAnswer({ model_assignment: ASSIGNMENT });
    const ledgerDigest: ExecutionLedgerDigest = { answer_id: answer.answer_id, run_ref: answer.run_ref, work_items: [], entries: [] };
    const exported = buildAnswerExport({ answer, ledgerDigest, ledgerError: null, live: createLiveRunState() });
    if (!exported.available) throw new Error("the export is available once the digest is read");
    const payload = JSON.parse(decodeURIComponent(exported.href.slice(exported.href.indexOf(",") + 1))) as {
      answer: Answer;
    };
    expect(payload.answer.model_assignment).toEqual(ASSIGNMENT);
  });
});
