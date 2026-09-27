import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { RUN_LEVEL_SPEND_STOP_CODES } from "@debateai/kernel";
import { AnswerHonestyDrawer } from "../../apps/ui/components/AnswerHonestyDrawer.js";
import { NodeDetailDrawer } from "../../apps/ui/components/NodeDetailDrawer.js";
import { PublicHonestyDrawer } from "../../apps/ui/components/PublicHonestyDrawer.js";
import { debateDetailFromAnswer } from "../../apps/ui/lib/v3/adapter.js";
import { conditionRecordLabel, markLabelFromRecords, panelSpendStopKind } from "../../apps/ui/lib/v3/labels.js";
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
const publicEn = catalog("en", "public");

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

function drawer(answer: Answer, locale: "en" | "ro" = "en", floorShown = false): string {
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
      floorShown={floorShown}
    />
  );
}

/** The drawer's visible text: the markup without its tags and attributes. */
const visible = (html: string): string => html.replace(/<[^>]*>/gu, " ").replace(/&#x27;/gu, "'").replace(/&quot;/gu, '"').replace(/&amp;/gu, "&");

const CUT_SHORT = buildFairShapedAnswer({
  condition_marks: [...buildFairShapedAnswer().condition_marks, "SINGLE-LINEAGE", "ENVELOPE_EXHAUSTED"]
});

describe("the drawer's limits line and the stopped-early mark agree", () => {
  it("says the served answer ended early to stay within budget, and stayed within the limits", () => {
    const text = visible(drawer(CUT_SHORT));
    expect(text).toContain("Ended early to stay within budget");
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
    expect(words(chromeRo, "debateChrome.condition.envelopeExhausted")).toBe("S-a încheiat mai devreme, pentru a rămâne în buget");
  });

  it("says nothing untrue for a components-only answer that ended at the envelope with its arguing never cut short (fix round 1)", () => {
    // The envelope terminal: the answer-writing call could not be paid. The debate did not stop exploring
    // early (the record's cut_short.arguing is null), so the mark must not say it did.
    const floorAnswer = buildFairShapedAnswer({
      terminal: "COMPONENTS_ONLY",
      serve_state: "COMPONENTS_ONLY",
      verdict_state: null,
      verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
      confidence_band: null,
      band_ceiling: null,
      composed_text: [],
      condition_marks: ["ENVELOPE_EXHAUSTED"],
      cost_envelope: { ...buildFairShapedAnswer().cost_envelope, state: "EXHAUSTED" }
    });
    const text = visible(drawer(floorAnswer));
    expect(text).toContain("Ended early to stay within budget");
    expect(text).toContain("A limit was reached");
    // (The fixture's own badge, "defeater-explored", is not a claim about stopping.)
    expect(text).not.toMatch(/exploring/iu);
  });
});

describe("a drawer beside a floor answer says what the page shows (fix round 1)", () => {
  const FLOOR_ANSWER = buildFairShapedAnswer({
    terminal: "COMPONENTS_ONLY",
    serve_state: "COMPONENTS_ONLY",
    verdict_state: null,
    verdict_unavailable: { reason_ref: "serve-gate:COMPONENTS_ONLY_ENVELOPE" },
    confidence_band: null,
    band_ceiling: null,
    composed_text: []
  });
  const SHOWN = "The page shows the debate's strongest position as the answer.";

  it("adds one plain line under the owner's unavailable verdict, keeping the true marks", () => {
    const text = visible(drawer(FLOOR_ANSWER, "en", true));
    expect(text).toContain("Verdict unavailable");
    expect(text).toContain(SHOWN);
    expect(text).toContain(words(miscEn, "misc.answerHonesty.componentsOnlyNotice"));
    expect(visible(drawer(FLOOR_ANSWER))).not.toContain(SHOWN);
    expect(visible(drawer(FLOOR_ANSWER, "ro", true))).toContain(words(miscRo, "misc.answerHonesty.floorShown"));
  });

  it("adds the same line to the public drawer, whose limits line uses the new name", () => {
    const answer = {
      terminal: "COMPONENTS_ONLY" as const,
      verdict: null,
      verdict_available: false,
      confidence_band: null,
      summary_segments: [],
      badges: [],
      residual_objections: [],
      reversal_point: "A cheaper flat in Cluj.",
      as_of: "2026-09-26T09:00:00.000Z"
    };
    const publicDrawer = (floorShown: boolean) => visible(renderToStaticMarkup(
      <PublicHonestyDrawer answer={answer} catalog={publicEn} locale="en" onClose={noop} floorShown={floorShown} />
    ));
    expect(publicDrawer(true)).toContain(words(publicEn, "public.honesty.verdictUnavailable"));
    expect(publicDrawer(true)).toContain(SHOWN);
    expect(publicDrawer(false)).not.toContain(SHOWN);
    expect(publicDrawer(false)).toContain("Spending and attempt limits: not included in this public snapshot.");
    expect(publicDrawer(false)).not.toContain("Cost envelope");
  });
});

describe("a panel a spend stop cut short gets a remedy that fits", () => {
  it("knows a stopped panel by its record's reason, and which stop it was", () => {
    for (const code of RUN_LEVEL_SPEND_STOP_CODES) {
      const kind = code === "PROVIDER_USAGE_UNREPORTED" ? "SERVICE" : "BUDGET";
      expect(panelSpendStopKind(panelRecord("PANEL-PARTIAL", code, PARTIAL_LIFT)), code).toBe(kind);
      expect(panelSpendStopKind(panelRecord("PANEL-DEGRADED-SINGLE-VOICE", `OpenAI: PROVIDER_ERROR; ${code}`, SINGLE_LIFT)), code).toBe(kind);
    }
    expect(panelSpendStopKind(panelRecord("PANEL-PARTIAL", "OpenAI: PROVIDER_ERROR", PARTIAL_LIFT))).toBeNull();
    expect(panelSpendStopKind(panelRecord("PANEL-PARTIAL", "Every non-author panel member failed", PARTIAL_LIFT))).toBeNull();
    // Only the two panel marks: another record naming a stop keeps its own lift.
    const other = { ...panelRecord("PANEL-PARTIAL", "RUN_COST_ENVELOPE_MONEY_REACHED", "Re-ask"), mark: "SINGLE-LINEAGE" as const };
    expect(panelSpendStopKind(other)).toBeNull();
  });

  it("does not call a vendor that reports no usage a budget: it says an AI service had a problem (fix round 1)", () => {
    const answer = buildFairShapedAnswer({ condition_mark_records: [panelRecord("PANEL-PARTIAL", "PROVIDER_USAGE_UNREPORTED", PARTIAL_LIFT)] });
    const text = visible(drawer(answer));
    expect(text).toContain("This point was weighed by fewer AI models because a problem with an AI service made the debate stop exploring early.");
    expect(text).not.toContain("to stay within its budget");
    expect(text).not.toContain(PARTIAL_LIFT);
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

/**
 * Fix round 2 (ruling R2): a vendor that reports no usage mints the same
 * ENVELOPE_EXHAUSTED record as money, attempts or the day's spend, with its
 * stop code as the reason. Worded by the mark alone, it read "Ended early to
 * stay within budget", and an operator told "money" raises the wrong ceiling.
 * The mark is now worded by its record's reason.
 */
describe("the envelope mark is worded by its record's reason (fix round 2)", () => {
  const SERVICE = "Ended early because of a problem with an AI service";
  const BUDGET = "Ended early to stay within budget";

  function envelopeRecord(reason: string): Record_ {
    return {
      ...panelRecord("PANEL-PARTIAL", reason, ""),
      mark: "ENVELOPE_EXHAUSTED", scope: "answer", subject_ref: "run:fair", lift_path: null, affected_node_ids: ["node:fair:pro"]
    };
  }
  function stopped(reason: string): Answer {
    return buildFairShapedAnswer({
      condition_marks: [...buildFairShapedAnswer().condition_marks, "ENVELOPE_EXHAUSTED"],
      condition_mark_records: [...buildFairShapedAnswer().condition_mark_records, envelopeRecord(reason)]
    });
  }

  it("says a problem with an AI service for a usage stop, and the budget for every other stop", () => {
    expect(conditionRecordLabel(envelopeRecord("PROVIDER_USAGE_UNREPORTED"), chromeEn)).toBe(SERVICE);
    for (const code of ["RUN_COST_ENVELOPE_MONEY_REACHED", "RUN_COST_ENVELOPE_EXHAUSTED", "DAILY_COST_ENVELOPE_REACHED"]) {
      expect(conditionRecordLabel(envelopeRecord(code), chromeEn), code).toBe(BUDGET);
    }
    // A bare mark takes its answer's record; with none, the plain label.
    expect(markLabelFromRecords("ENVELOPE_EXHAUSTED", [envelopeRecord("PROVIDER_USAGE_UNREPORTED")], chromeEn)).toBe(SERVICE);
    expect(markLabelFromRecords("ENVELOPE_EXHAUSTED", [], chromeEn)).toBe(BUDGET);
    // Another mark is never reworded by a stop code in its reason.
    expect(conditionRecordLabel({ mark: "SINGLE-LINEAGE", reason: "PROVIDER_USAGE_UNREPORTED" }, chromeEn))
      .toBe(words(chromeEn, "debateChrome.condition.singleLineage"));
    expect(conditionRecordLabel(envelopeRecord("PROVIDER_USAGE_UNREPORTED"), chromeRo))
      .toBe(words(chromeRo, "debateChrome.condition.envelopeExhaustedService"));
  });

  it("the answer's drawer: a usage stop's chip and record say an AI service, never the budget", () => {
    const text = visible(drawer(stopped("PROVIDER_USAGE_UNREPORTED")));
    expect(text).toContain(SERVICE);
    expect(text).not.toContain(BUDGET);
    const money = visible(drawer(stopped("RUN_COST_ENVELOPE_MONEY_REACHED")));
    expect(money).toContain(BUDGET);
    expect(money).not.toContain(SERVICE);
  });

  it("the node drawer: the served root's pill is worded by the answer's record", () => {
    const node = (reason: string | null) => {
      const answer = reason === null ? stopped("RUN_COST_ENVELOPE_MONEY_REACHED") : stopped(reason);
      const v3 = { ...answer.nodes[0]!, condition_marks: ["ENVELOPE_EXHAUSTED" as const] };
      const detail = debateDetailFromAnswer(answer);
      return visible(renderToStaticMarkup(
        <NodeDetailDrawer
          node={detail.tree!.children[0]!}
          v3={v3}
          token={null}
          onClose={noop}
          onFocusRecommendationNode={() => false}
          canFocusRecommendationNode={() => false}
          onQueued={noop}
          onError={noop}
          onAuthRejected={noop}
          debateChromeCatalog={chromeEn}
          conditionRecords={reason === null ? [] : answer.condition_mark_records}
        />
      ));
    };
    expect(node("PROVIDER_USAGE_UNREPORTED")).toContain(SERVICE);
    expect(node("PROVIDER_USAGE_UNREPORTED")).not.toContain(BUDGET);
    expect(node("RUN_COST_ENVELOPE_MONEY_REACHED")).toContain(BUDGET);
    // No record to read (the public snapshot carries none): the plain label.
    expect(node(null)).toContain(BUDGET);
  });
});
