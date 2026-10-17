// Engine redesign R3: valid engine-2 map replies that depend only on what was asked (the framed material), in the
// question's language (the request's question_language lock, `ro` or English). Used by unit tests, the shape harness and
// the preview gate stubs. Returns null for any contract that is not an engine-2 map contract.
import { mapEngineContractNameOf } from "@debateai/map";
import type { FramedMaterialField } from "@debateai/providers";

export type EngineMapScriptOptions = Readonly<{
  /** Check ids the checker says do NOT answer the question (default none). */
  failChecks?: readonly string[];
  /** Check ids the checker says add a fact the question does not give (default none). */
  addedFactChecks?: readonly string[];
  /** Check ids the checker says name no cost of following them (D4(b): `cost_can_be_named: false`, a fail; default none). */
  noCostChecks?: readonly string[];
  /** Check ids the checker says challenge the question's premise (D4(b): `cost_can_be_named: null`, exempt; default none). */
  premiseChecks?: readonly string[];
  /** How many reserve answers choose names (default 1). */
  reserves?: number;
}>;
export const ENGINE_MAP_SCRIPT_DEFAULTS = Object.freeze({ reserves: 1 });

const PROSE = Object.freeze({
  en: Object.freeze({
    why: "It could change the answer for the people affected.",
    angles: [["The other side", "The strongest case against."], ["The worry", "What the asker fears."], ["What to do", "What to do first."],
      ["The cost", "Who pays for it."]] as const,
    point: (label: string, n: number) => `A point from the ${label.toLowerCase()} view, number ${String(n)}.`,
    shared: "A shared point about the cost of the change.",
    no: "No, keep it as it is.",
    yes: (label: string) => `Yes, where ${label.toLowerCase()} allows it.`,
    reserve: "Only for the night lines, where riders are few.",
    assumption: "The city can pay for it from its own budget.",
    missing: "A missing point about the people who work at night.",
    challenge: "The question may be too narrow about who pays.",
    reason: "It only says that it depends."
  }),
  ro: Object.freeze({
    why: "Ar putea schimba răspunsul pentru oamenii afectați.",
    angles: [["Cealaltă parte", "Cel mai puternic argument împotrivă."], ["Îngrijorarea", "De ce se teme cel care întreabă."],
      ["Ce este de făcut", "Ce trebuie făcut mai întâi."], ["Costul", "Cine plătește pentru asta."]] as const,
    point: (label: string, n: number) => `Un argument din perspectiva ${label.toLowerCase()}, numărul ${String(n)}.`,
    shared: "Un punct comun despre costul schimbării pentru oraș.",
    no: "Nu, să rămână așa cum este.",
    yes: (label: string) => `Da, acolo unde ${label.toLowerCase()} o permite.`,
    reserve: "Doar pentru liniile de noapte, unde sunt puțini călători.",
    assumption: "Orașul poate plăti din propriul buget.",
    missing: "Un punct care lipsește despre oamenii care lucrează noaptea.",
    challenge: "Întrebarea poate fi prea îngustă cu privire la cine plătește.",
    reason: "Spune doar că depinde."
  })
});

const field = (fields: readonly FramedMaterialField[], name: string): string => fields.find((entry) => entry.name === name)?.content ?? "";
const proseOf = (fields: readonly FramedMaterialField[]) => {
  const locked = field(fields, "question_language");
  const code = locked === "" ? "en" : String((JSON.parse(locked) as { code?: unknown }).code ?? "en");
  return code.split("-")[0]!.toLowerCase() === "ro" ? PROSE.ro : PROSE.en;
};

export function engineMapScriptedContent(contractId: string, fields: readonly FramedMaterialField[], options: EngineMapScriptOptions = {}): string | null {
  const name = mapEngineContractNameOf(contractId);
  if (name === null) return null;
  const prose = proseOf(fields);
  const point = (claim: string, restsOn: "question" | "assumption", leans = "context") =>
    ({ claim, why_it_matters: prose.why, leans, rests_on: restsOn });
  const label = field(fields, "angle_label") || "open";
  if (name === "angles") {
    const kinds = ["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL", "SPECIFIC"] as const;
    const locked = field(fields, "question_language");
    const code = locked === "" ? "en" : String((JSON.parse(locked) as { code?: unknown }).code ?? "en").split("-")[0]!.toLowerCase();
    return JSON.stringify({ question_language: code, angles: prose.angles.map(([angleLabel, focus], index) =>
      ({ angle_id: `angle-${String(index + 1)}`, kind: kinds[index], label: angleLabel, focus })) });
  }
  if (name === "listAngle" || name === "listOpen") {
    return JSON.stringify({ points: [point(prose.point(label, 1), "question", "against_some_answer"), point(prose.point(label, 2), "assumption", "for_some_answer"),
      point(prose.shared, "question")], candidate_answers: [label === prose.angles[0][0] ? prose.no : prose.yes(label)] });
  }
  if (name === "listSnowball") return JSON.stringify({ points: [point(prose.point(label, 9), "question")], candidate_answers: [] });
  if (name === "merge") {
    const points = JSON.parse(field(fields, "points")) as { item_id: string; claim: string }[];
    const answers = JSON.parse(field(fields, "candidate_answers")) as { item_id: string; answer: string }[];
    const group = <T,>(rows: T[], key: (row: T) => string) => [...new Set(rows.map(key))].map((text) => [text, rows.filter((row) => key(row) === text)] as const);
    return JSON.stringify({
      key_points: group(points, (row) => row.claim).map(([claim, rows], index) => ({ key_point_id: `kp-${String(index + 1)}`, claim, rests_on: "question",
        member_item_ids: rows.map((row) => row.item_id) })),
      answers: group(answers, (row) => row.answer).map(([answer, rows], index) => ({ answer_id: `an-${String(index + 1)}`, answer,
        member_item_ids: rows.map((row) => row.item_id) }))
    });
  }
  if (name === "gap") return JSON.stringify({ new_points: [point(prose.missing, "assumption")], framing_challenges: [prose.challenge] });
  if (name === "choose") {
    const keyPoints = (JSON.parse(field(fields, "key_points")) as { key_point_id: string }[]).map((row) => row.key_point_id);
    const answers = JSON.parse(field(fields, "answers")) as { answer_id: string; answer: string }[];
    const chosen = answers.slice(0, 2);
    const reserves = Math.min(options.reserves ?? ENGINE_MAP_SCRIPT_DEFAULTS.reserves, 2);
    return JSON.stringify({
      answers: chosen.map((answer, index) => ({ answer_id: answer.answer_id, statement: answer.answer,
        for: keyPoints.filter((_id, at) => at % 4 === index * 2).slice(0, 2), against: keyPoints.filter((_id, at) => at % 4 === index * 2 + 1).slice(0, 2),
        strongest_rival: chosen[(index + 1) % chosen.length]!.answer_id, assumptions: index === 0 ? [prose.assumption] : [] })),
      // As many reserves as asked (at most 2), each a distinct statement.
      reserve_answers: Array.from({ length: reserves }, (_unused, index) =>
        ({ statement: index === 0 ? prose.reserve : prose.missing, for: [], against: [], assumptions: [] }))
    });
  }
  const shown = (JSON.parse(field(fields, "answers")) as { check_id: string }[]).map((row) => row.check_id);
  return JSON.stringify({ checks: shown.map((id) => {
    const answers = !(options.failChecks ?? []).includes(id);
    const adds = (options.addedFactChecks ?? []).includes(id);
    // D4(b): the third test's REQUIRED nullable key; null only when the checker says the answer challenges the premise.
    const cost = (options.premiseChecks ?? []).includes(id) ? null : !(options.noCostChecks ?? []).includes(id);
    return { check_id: id, answers_question: answers, adds_unstated_fact: adds, cost_can_be_named: cost,
      reason: answers && !adds && cost !== false ? null : prose.reason };
  }) });
}
