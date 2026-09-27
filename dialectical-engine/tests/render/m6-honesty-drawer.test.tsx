import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { RUN_LEVEL_SPEND_STOP_CODES } from "@debateai/kernel";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { panelStoppedBySpendStop } from "../../apps/ui/lib/v3/labels.js";
import { createLiveRunState } from "../../apps/ui/lib/v3/liveEvents.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

/**
 * Task M6, M2 review carries: the honesty drawer is the technical view, but it
 * must not contradict itself. A served answer whose debate stopped exploring
 * early read "Cost envelope: WITHIN" beside the mark "Run envelope exhausted";
 * a panel cut short by a spend stop was told to "Re-ask to collect the
 * assessments the failed panel members owed", though no member failed and a
 * re-ask under the same budget stops the same way.
 */

const MESSAGES = resolve(process.cwd(), "apps/ui/messages");
const catalog = (locale: string, namespace: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(MESSAGES, locale, `${namespace}.json`), "utf8")) as Record<string, string>;
function words(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (value === undefined) throw new Error(`catalogue lacks ${key}`);
  return value;
}
const miscEn = catalog("en", "misc");
const miscRo = catalog("ro", "misc");
const chromeEn = catalog("en", "debateChrome");
const chromeRo = catalog("ro", "debateChrome");

const noop = () => {};

type Record_ = Answer["condition_mark_records"][number];
function panelRecord(mark: "PANEL-PARTIAL" | "PANEL-DEGRADED-SINGLE-VOICE", reason: string, liftPath: string): Record_ {
  return {
    mark, scope: "node", subject_ref: "node:fair:pro", reason, lift_path: liftPath, served_root_rule: null,
    call_site_key: null, planned_leg_count: null, terminal_transport_outcome: null, review_outcome: null,
    hidden_strength: null, hidden_score_threshold: null, hidden_score_threshold_source_ref: null,
    excluded_from_served_number: null, judged_basis_count: null, affected_node_ids: ["node:fair:pro"]
  };
}
const PARTIAL_LIFT = "Re-ask to collect the assessments the failed panel members owed";
const SINGLE_LIFT = "Re-ask when another healthy maker can assess this node";

function drawer(answer: Answer, locale: "en" | "ro" = "en"): string {
  return renderToStaticMarkup(
    <AnswerHonestyDrawer
      answer={answer}
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
      catalog={locale === "en" ? miscEn : miscRo}
      debateChromeCatalog={locale === "en" ? chromeEn : chromeRo}
    />
  );
}

/** The drawer's visible text: the markup without its tags and attributes. */
const visible = (html: string): string => html.replace(/<[^>]*>/gu, " ").replace(/&#x27;/gu, "'").replace(/&quot;/gu, '"').replace(/&amp;/gu, "&");

const CUT_SHORT = buildFairShapedAnswer({
  condition_marks: [...buildFairShapedAnswer().condition_marks, "SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]
});

describe("the drawer's limits line and the stopped-early mark agree", () => {
  it("says the served answer stopped exploring early to stay within budget, and stayed within the limits", () => {
    const text = visible(drawer(CUT_SHORT));
    expect(text).toContain("Stopped exploring early to stay within budget");
    expect(text).toContain("Spending and attempt limits");
    expect(text).toContain("Stayed within the limits");
    expect(text).not.toContain("Run envelope exhausted");
    expect(text).not.toContain("Cost envelope");
    // The raw state stays in the markup's title, the true mark, not in the words a person reads.
    expect(text).not.toMatch(/\bWITHIN\b/u);
    expect(drawer(CUT_SHORT)).toContain('title="WITHIN"');
  });

  it("words every state of the limits plainly", () => {
    const state = (value: Answer["cost_envelope"]["state"]) =>
      visible(drawer(buildFairShapedAnswer({ cost_envelope: { ...buildFairShapedAnswer().cost_envelope, state: value } })));
    expect(state("ENRICHMENT_SKIPPED")).toContain("Extra checks skipped to stay within the limits");
    expect(state("EXHAUSTED")).toContain("A limit was reached");
  });

  it("says the same in Romanian", () => {
    const text = visible(drawer(CUT_SHORT, "ro"));
    expect(text).toContain(words(chromeRo, "debateChrome.condition.envelopeExhausted"));
    expect(text).toContain(words(miscRo, "misc.answerHonesty.costEnvelope"));
    expect(text).toContain(words(miscRo, "misc.answerHonesty.limitsWithin"));
    expect(words(chromeRo, "debateChrome.condition.envelopeExhausted")).not.toBe("Limita execuției a fost epuizată");
  });
});

describe("a panel a spend stop cut short gets a remedy that fits", () => {
  it("knows a stopped panel by its record's reason, and nothing else", () => {
    for (const code of RUN_LEVEL_SPEND_STOP_CODES) {
      expect(panelStoppedBySpendStop(panelRecord("PANEL-PARTIAL", code, PARTIAL_LIFT)), code).toBe(true);
      expect(panelStoppedBySpendStop(panelRecord("PANEL-DEGRADED-SINGLE-VOICE", `OpenAI: PROVIDER_ERROR; ${code}`, SINGLE_LIFT)), code).toBe(true);
    }
    expect(panelStoppedBySpendStop(panelRecord("PANEL-PARTIAL", "OpenAI: PROVIDER_ERROR", PARTIAL_LIFT))).toBe(false);
    expect(panelStoppedBySpendStop(panelRecord("PANEL-PARTIAL", "Every non-author panel member failed", PARTIAL_LIFT))).toBe(false);
    // Only the two panel marks: another record naming a stop keeps its own lift.
    const other = { ...panelRecord("PANEL-PARTIAL", "RUN_COST_ENVELOPE_MONEY_REACHED", "Re-ask"), mark: "SINGLE-LINEAGE" as const };
    expect(panelStoppedBySpendStop(other)).toBe(false);
  });

  it("tells a stopped panel why fewer models weighed the point, instead of blaming failed members", () => {
    for (const [mark, lift] of [["PANEL-PARTIAL", PARTIAL_LIFT], ["PANEL-DEGRADED-SINGLE-VOICE", SINGLE_LIFT]] as const) {
      const answer = buildFairShapedAnswer({ condition_mark_records: [panelRecord(mark, "RUN_COST_ENVELOPE_MONEY_REACHED", lift)] });
      const text = visible(drawer(answer));
      expect(text, mark).toContain(
        "This point was weighed by fewer AI models because the debate stopped exploring early to stay within its budget."
      );
      expect(text, mark).not.toContain(lift);
    }
    const ro = visible(drawer(buildFairShapedAnswer({
      condition_mark_records: [panelRecord("PANEL-PARTIAL", "DAILY_COST_ENVELOPE_REACHED", PARTIAL_LIFT)]
    }), "ro"));
    expect(ro).toContain(words(miscRo, "misc.answerHonesty.panelStoppedEarly"));
  });

  it("keeps the runner's own remedy for a panel whose members failed", () => {
    const answer = buildFairShapedAnswer({ condition_mark_records: [panelRecord("PANEL-PARTIAL", "OpenAI: PROVIDER_ERROR", PARTIAL_LIFT)] });
    const text = visible(drawer(answer));
    expect(text).toContain(`Lift path: ${PARTIAL_LIFT}`);
    expect(text).not.toContain("stopped exploring early");
  });
});
