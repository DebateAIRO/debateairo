import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { replyLanguageExpectation } from "@debateai/kernel";
import { planPatchFollowUp, promptContractFingerprintText } from "@debateai/providers";
import {
  MAP_CONTRACT_NAMES,
  MAP_LIMITS,
  mapAnglesCheck,
  mapAnglesReplySchema,
  mapAnglesSalvage,
  mapAnglesSpec,
  mapChooseCheck,
  mapChooseReplySchema,
  mapChooseSalvage,
  mapChooseSpec,
  mapClassifyReply,
  mapGapCheck,
  mapGapReplySchema,
  mapGapSalvage,
  mapGapSpec,
  mapListCheck,
  mapListReplySchema,
  mapListSalvage,
  mapListSpec,
  mapMergeSpec,
  mapPromptContractHash,
  mapPromptContracts,
  mapProviderPieces,
  MapSalvageLog,
  mapSnowballSpec,
  mapTrimAtWord,
  type MapKeyPoint,
  type MapSpecContext
} from "@debateai/map";
import { practiceJsonRepairOf, practiceMapKeyPointIdsOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";

/**
 * Ruling MAP-SALVAGE (owner's slip recovery order: salvage in code → smallest follow-up → full re-ask). The fixtures are
 * excerpts of the real replies of the practice debate of 2026-10-14 (lang-ro-en-mix, shape arm), where 6 of the 9 slips
 * were map replies a code salvage reads: too long internal texts (Qwen), missing leans (Haiku), a key point on both
 * sides of one answer (DeepSeek).
 */
const STOP = { finishReason: "stop" };
const RO_Q = "Ar trebui România să adopte euro acum sau să aștepte până când salariile ajung din urmă?";
const RO = replyLanguageExpectation(RO_Q);
const CTX: MapSpecContext = { questionLine: RO_Q, languageName: "Romanian", languageTag: "ro", replyLanguage: RO };
const issuesOf = (parseError: string | null) => (JSON.parse(parseError ?? "[]") as { code: string; path: (string | number)[]; message: string }[])
  .map((issue) => `${issue.code === "custom" ? issue.message : issue.code}@${issue.path.join(".")}`);
const json = (value: unknown) => JSON.parse(value as string) as Record<string, unknown>;

/** Never mid-word: the trimmed text is a prefix of the original, and the original's next character is no letter, mark or digit. */
function expectWordBoundaryPrefix(trimmed: string, original: string, max: number): void {
  expect(trimmed.length).toBeLessThanOrEqual(max);
  expect(trimmed.length).toBeGreaterThanOrEqual(Math.ceil(max / 2));
  expect(original.startsWith(trimmed)).toBe(true);
  expect(original[trimmed.length]).toMatch(/^[^\p{L}\p{M}\p{N}]$/u);
  expect(trimmed).toMatch(/[\p{L}\p{N}).!?”»]$/u);
  expect(trimmed).not.toMatch(/(?:…|\.\.\.)$/u);
}

// Qwen/Qwen3.8-Flash, MAP:angles (sequence 108): every focus over angleFocusMaxChars (240), and one straight quote
// closing „…" inside a text (the tolerant decode's INNER_QUOTE). Four of its six angles.
const QWEN_FOCUS = [
  "Se examinează de ce așteptarea „până când salariile ajung din urmă\" poate fi o capcană: convergența nominală nu garantează convergența reală, iar aderarea la zona euro poate accelera investițiile, reduce costul creditului și ancorea inflația, făcând ca salariile să crească mai repede decât în afara zonei.",
  "Se analizează teama concretă a întrebătorului: dacă adoptarea euro ar duce la creșterea prețurilor la alimente, energie și chirii mai repede decât la creșterea salariilor, și ce măsuri de protecție (plafonări, controale anti-speculă) ar putea atenua efectul de tranziție.",
  "Se trece în revistă pașii reali: îndeplinirea criteriilor de la Maastricht, aderarea la ERM II pentru minimum doi ani, reforma pieței muncii, consolidarea fiscală și un calendar legislativ realist, incluzând costurile de conversie și educație publică.",
  "Se examinează ce se întâmplă cu o economie care nu mai poate deprecia moneda sau modifica independent dobânda de referință în fața unei crize sectoriale (de ex. prăbușirea unui export major sau a turismului), și dacă bugetul UE și mecanismele de stabilizare sunt suficiente ca plasă de siguranță."
];
const QWEN_ANGLES = `{
  "question_language": "ro",
  "angles": [
    { "angle_id": "adopt-now", "kind": "OPPOSITE_CASE", "label": "Argumentul puternic pentru adoptarea rapidă a euro", "focus": "${QWEN_FOCUS[0]}" },
    { "angle_id": "purchasing-power", "kind": "ASKER_WORRY", "label": "Impactul asupra puterii de cumpărare a cetățeanului obișnuit", "focus": "${QWEN_FOCUS[1]}" },
    { "angle_id": "roadmap", "kind": "PRACTICAL", "label": "Ce ar trebui făcut concret și ce condiții tehnice trebuie îndeplinite", "focus": "${QWEN_FOCUS[2]}" },
    { "angle_id": "asymmetric-shock", "kind": "SPECIFIC", "label": "Riscul pierderii instrumentelor de ajustare în fața șocurilor asimetrice", "focus": "${QWEN_FOCUS[3]}" }
  ]
}`;

// Qwen/Qwen3.8-Flash, MAP:list:0 (sequence 118): points.0.why_it_matters over 240, and candidate_answers.2 over 160.
const QWEN_WHY0 = "Un susținător al strategiei „așteptăm salariile\" presupune că inflația mai mare în România erodează puterea de cumpărare doar temporar; în realitate, fără ancorare valutară, primele de risc mențin inflația structural ridicată, iar decalajul real se lărgește.";
const QWEN_ANSWER2 = "Adoptarea rapidă a euro, chiar prin derogare temporară, accelerează investițiile productive care generează convergența reală pe care așteptarea pretinde că o urmărește.";
const QWEN_LIST = JSON.stringify({
  points: [
    { claim: "Convergența nominală (criteriile Maastricht) nu implică convergența reală: salariile pot crește nominal fără a închide decalajul de productivitate, iar așteptarea perpetuează iluzia progresului.",
      why_it_matters: QWEN_WHY0, leans: "for_some_answer" },
    { claim: "Aderarea la euro elimină prima de risc valutar, reducând costul creditului pentru firmele românești cu 1–2 puncte procentuale, ceea ce accelerează investițiile productive și creșterea salariilor reale.",
      why_it_matters: "Cei care argumentează „așteptăm\" ignoră că dobânzile mai mari în lei descurajează investițiile de capital, tocmai cele care ar genera convergența reală pe care așteptarea pretinde că o urmărește.",
      leans: "for_some_answer" },
    { claim: "Așteptarea devine un echilibru politic instabil: fiecare ciclu electoral adaugă un nou motiv de amânare (deficit, inflație, schimbare de guvern), transformând „când salariile ajung\" într-un orizont perpetuu.",
      why_it_matters: "Contextul instituțional contează: România riscă să piardă fereastra de integrare prin amânare indefinită.", leans: "context" }
  ],
  candidate_answers: [
    "România ar trebui să adopte euro în orizont de 3–5 ani, folosind ancorarea inflației ca mecanism de creștere reală a puterii de cumpărare.",
    "Așteptarea convergenței nominale este o capcană: fără euro, salariile reale stagnizează structural din cauza primei de risc și a inflației persistente.",
    QWEN_ANSWER2
  ]
});

// claude-haiku-5-5, MAP:list:1 (sequence 112): no `leans` on any point. Three of its eight points.
const HAIKU_LIST = JSON.stringify({
  points: [
    { claim: "Studiile privind trecerea la euro în statele din Europa Centrală și de Est arată, de regulă, efecte inflaționiste reale, dar moderate, concentrate în servicii și alimentație publică.",
      why_it_matters: "Frica de creștere bruscă a prețurilor la alimente și chirii este plauzibilă, dar mărimea efectului depinde de structura pieței, nu doar de moneda în sine." },
    { claim: "Convergența reală a prețurilor (efectul Balassa-Samuelson) va duce la inflație mai mare și în cazul în care România rămâne cu leul.",
      why_it_matters: "Așteptarea nu elimină creșterea prețurilor; ea doar schimbă canalul prin care aceasta apare." },
    { claim: "Chiriile din România sunt determinate în primul rând de oferta de locuințe și de cerere, iar multe anunțuri sunt deja exprimate în euro.",
      why_it_matters: "Adoptarea monedei unice nu schimbă neapărat dinamica chiriilor; teama legată de chirii poate fi tratată separat." }
  ],
  candidate_answers: [
    "Adoptarea euro cu un pachet de protecție pentru consumatori (liste de prețuri limitate, afișare dublă, monitorizare a prețurilor la alimente și chirii).",
    "Amânarea adoptării până la îndeplinirea reală a criteriilor fiscale și de inflație, cu un calendar public și obiective de convergență a salariilor."
  ]
});

// deepseek-ai/DeepSeek-V4.1-Flash, MAP:choose (sequence 130), whole: answers.3 names kp15 both for and against.
const DEEPSEEK_CHOOSE = `{"answers":[{"answer_id":"an01","statement":"Calendar condiționat de indicatori: consolidare fiscală, reforme, doi ani în ERM II, apoi euro, cu revizuire periodică.","for":["kp04","kp28","kp20","kp24","kp35","kp01"],"against":["kp23","kp33","kp34","kp40","kp42"],"strongest_rival":"an03"},{"answer_id":"an03","statement":"Să se aștepte convergența salariilor și productivității spre media UE, fără dată fixă, înainte de a renunța la politica monetară proprie.","for":["kp07","kp12","kp18","kp34","kp40","kp11"],"against":["kp17","kp20","kp02","kp10","kp23","kp42"],"strongest_rival":"an01"},{"answer_id":"an06","statement":"Adoptarea rapidă a euro este preferabilă: accelerează investițiile productive, iar efectele inflaționiste au fost mici și temporare.","for":["kp05","kp06","kp10","kp21","kp29","kp43"],"against":["kp01","kp08","kp41","kp42","kp18","kp33"],"strongest_rival":"an01"},{"answer_id":"an02","statement":"Adoptarea euro împreună cu un pachet de protecție pentru consumatori: prețuri limitate, afișare dublă, monitorizarea alimentelor și chiriilor.","for":["kp15","kp06","kp27","kp08","kp26","kp38"],"against":["kp33","kp15","kp42","kp01","kp34","kp40"],"strongest_rival":"an06"}]}`;
const KP_IDS = Array.from({ length: 45 }, (_, index) => `kp${String(index + 1).padStart(2, "0")}`);
const keyPointOf = (keyPointId: string): MapKeyPoint => Object.freeze({ keyPointId, claim: `Punctul ${keyPointId} contează pentru răspuns.`,
  memberItemIds: [], blindMakers: [], gapMakers: [], makers: [], fixedAngleKinds: [], leansAgainst: false });

describe("map salvage: too long internal texts are trimmed at a word boundary (MAP_TEXT_TRIMMED)", () => {
  it("trims at the last word boundary, never mid-word, with no ellipsis; refuses a cut that would keep too little", () => {
    expect(mapTrimAtWord("unu doi trei patru", 9)).toBe("unu doi");
    expect(mapTrimAtWord("unu doi, trei patru", 12)).toBe("unu doi");
    expect(mapTrimAtWord("unu doi trei", 7)).toBe("unu doi");
    expect(mapTrimAtWord("x".repeat(300), 240)).toBeNull();
    expect(mapTrimAtWord(`${"y".repeat(30)} ${"x".repeat(300)}`, 240)).toBeNull();
    // A text with no spaces (Chinese) is cut after its own punctuation.
    expect(mapTrimAtWord("这是第一句。这是第二句。这是第三句很长很长", 13)).toBe("这是第一句。这是第二句。");
    expect(mapTrimAtWord("short", 240)).toBe("short");
  });

  it("Qwen's real angles: every too long focus is trimmed, the inner quote is still read, and the reply is accepted with no follow-up", () => {
    const strict = mapClassifyReply(QWEN_ANGLES, STOP, mapAnglesReplySchema, mapAnglesCheck);
    expect(issuesOf(strict.classification.parseStatus === "PARSED" ? null : strict.classification.parseError))
      .toEqual(["too_big@angles.0.focus", "too_big@angles.1.focus", "too_big@angles.2.focus", "too_big@angles.3.focus"]);
    const out = mapClassifyReply(QWEN_ANGLES, STOP, mapAnglesReplySchema, mapAnglesCheck, mapAnglesSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED", jsonRepairs: ["INNER_QUOTE", "MAP_TEXT_TRIMMED"] });
    expect(out.repairs).toEqual(["INNER_QUOTE", "MAP_TEXT_TRIMMED"]);
    out.value!.angles.forEach((angle, index) => expectWordBoundaryPrefix(angle.focus, QWEN_FOCUS[index]!, MAP_LIMITS.angleFocusMaxChars));
    expect(out.value!.angles.map((angle) => angle.label)).toEqual([
      "Argumentul puternic pentru adoptarea rapidă a euro", "Impactul asupra puterii de cumpărare a cetățeanului obișnuit",
      "Ce ar trebui făcut concret și ce condiții tehnice trebuie îndeplinite", "Riscul pierderii instrumentelor de ajustare în fața șocurilor asimetrice"]);
    // The step's own reader (what the runner and the practice tool call) salvages the same way.
    expect(mapAnglesSpec(CTX).classify(QWEN_ANGLES, STOP)).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED", jsonRepairs: ["INNER_QUOTE", "MAP_TEXT_TRIMMED"] });
    expect(mapAnglesSpec(CTX).read(QWEN_ANGLES, STOP).angles[3]!.focus.length).toBeLessThanOrEqual(240);
  });

  it("trims a too long angle label too", () => {
    const label = "Ce ar trebui făcut concret și ce condiții tehnice trebuie îndeplinite înainte de orice dată fixă";
    const reply = JSON.stringify({ angles: [
      { angle_id: "a", kind: "OPPOSITE_CASE", label, focus: "Cazul opus." },
      { angle_id: "b", kind: "ASKER_WORRY", label: "Teama", focus: "Ce teme." },
      { angle_id: "c", kind: "PRACTICAL", label: "Ce facem", focus: "Pașii." },
      { angle_id: "d", kind: "SPECIFIC", label: "Costul", focus: "Cine plătește." }] });
    const out = mapClassifyReply(reply, STOP, mapAnglesReplySchema, mapAnglesCheck, mapAnglesSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED" });
    expectWordBoundaryPrefix(out.value!.angles[0]!.label, label, MAP_LIMITS.angleLabelMaxChars);
  });

  it("Qwen's real list: why_it_matters is trimmed; the too long candidate answer (it can reach the page) still goes to the follow-up, alone", () => {
    const out = mapClassifyReply(QWEN_LIST, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    if (out.classification.parseStatus !== "SCHEMA_FAILED") throw new Error("unreachable");
    expect(issuesOf(out.classification.parseError)).toEqual(["too_big@candidate_answers.2"]);
    const plan = planPatchFollowUp({ content: QWEN_LIST, reply: STOP, parseStatus: out.classification.parseStatus, parseError: out.classification.parseError });
    expect(plan?.locator.paths).toEqual(["candidate_answers.2"]);
    // Once the model shortens its answer, the reply is accepted, with the why still trimmed.
    const shortened = QWEN_LIST.replace(QWEN_ANSWER2, "Adoptarea rapidă a euro accelerează investițiile productive.");
    const fixed = mapClassifyReply(shortened, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(fixed.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED" });
    expectWordBoundaryPrefix(fixed.value!.points[0]!.why_it_matters, QWEN_WHY0, MAP_LIMITS.whyMaxChars);
    expect(mapListSpec(CTX, null).classify(shortened, STOP)).toEqual(fixed.classification);
  });

  it("never trims a text that can reach the debate page or the story: point claims, candidate answers, merged claims and answers, chosen statements", () => {
    const long = `${"Un argument lung despre euro și salarii ".repeat(8)}final`;
    const point = { claim: "Costul tranziției este mare.", why_it_matters: "Poate schimba răspunsul la întrebare.", leans: "context" };
    const list = (claim: string, answer: string) => JSON.stringify({ points: [{ ...point, claim }, point, point], candidate_answers: [answer] });
    expect(issuesOf((mapListSpec(CTX, null).classify(list(long, "Da."), STOP) as { parseError: string }).parseError)).toEqual(["too_big@points.0.claim"]);
    expect(issuesOf((mapListSpec(CTX, null).classify(list("Costul este mare.", long), STOP) as { parseError: string }).parseError))
      .toEqual(["too_big@candidate_answers.0"]);
    expect(issuesOf((mapSnowballSpec(CTX, []).classify(list(long, "Da."), STOP) as { parseError: string }).parseError)).toEqual(["too_big@points.0.claim"]);
    const gap = JSON.stringify({ new_points: [{ ...point, claim: long }], framing_challenges: [] });
    expect(issuesOf((mapGapSpec(CTX, [], []).classify(gap, STOP) as { parseError: string }).parseError)).toEqual(["too_big@new_points.0.claim"]);
    const merge = JSON.stringify({ key_points: [{ key_point_id: "k1", claim: long, member_item_ids: ["pt01"] }], answers: [] });
    expect(issuesOf((mapMergeSpec(CTX, []).classify(merge, STOP) as { parseError: string }).parseError)).toEqual(["too_big@key_points.0.claim"]);
    const choose = JSON.stringify({ answers: [{ answer_id: "a1", statement: long, for: ["kp01"], against: [], strongest_rival: null }] });
    expect(issuesOf((mapChooseSpec(CTX, [keyPointOf("kp01")], []).classify(choose, STOP) as { parseError: string }).parseError))
      .toEqual(["too_big@answers.0.statement"]);
  });

  it("a gap round: its why_it_matters and its framing challenges are trimmed; a word too long to cut is not salvaged", () => {
    const why = `${"Aceasta schimbă felul în care cetățenii judecă prețurile ".repeat(5)}azi`;
    const challenge = `${"Întrebarea presupune că salariile vor ajunge din urmă ".repeat(5)}curând`;
    const reply = JSON.stringify({ new_points: [{ claim: "Turismul depinde de curs.", why_it_matters: why, leans: "context" }], framing_challenges: [challenge] });
    const out = mapClassifyReply(reply, STOP, mapGapReplySchema, mapGapCheck(RO), mapGapSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED" });
    expectWordBoundaryPrefix(out.value!.new_points[0]!.why_it_matters, why, MAP_LIMITS.whyMaxChars);
    expectWordBoundaryPrefix(out.value!.framing_challenges[0]!, challenge, MAP_LIMITS.claimMaxChars);
    const oneWord = JSON.stringify({ new_points: [], framing_challenges: ["x".repeat(300)] });
    expect(issuesOf((mapGapSpec(CTX, [], []).classify(oneWord, STOP) as { parseError: string }).parseError)).toEqual(["too_big@framing_challenges.0"]);
  });
});

describe("map salvage: a missing or unknown lean reads as context (MAP_LEANS_DEFAULTED)", () => {
  it("Haiku's real list: no leans on any point; the reply is accepted with every lean context", () => {
    const strict = mapClassifyReply(HAIKU_LIST, STOP, mapListReplySchema, mapListCheck(RO));
    expect(issuesOf(strict.classification.parseStatus === "PARSED" ? null : strict.classification.parseError))
      .toEqual(["invalid_value@points.0.leans", "invalid_value@points.1.leans", "invalid_value@points.2.leans"]);
    const out = mapClassifyReply(HAIKU_LIST, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_LEANS_DEFAULTED" });
    expect(out.value!.points.map((point) => point.leans)).toEqual(["context", "context", "context"]);
    expect(out.value!.points.map((point) => point.claim)).toEqual((json(HAIKU_LIST).points as { claim: string }[]).map((point) => point.claim));
    expect(mapListSpec(CTX, null).classify(HAIKU_LIST, STOP)).toEqual(out.classification);
  });

  it("a lean that is not one of the three reads as context; the three values are kept as written", () => {
    const points = (json(HAIKU_LIST).points as Record<string, unknown>[]);
    const reply = JSON.stringify({ ...json(HAIKU_LIST), points: [{ ...points[0], leans: "for" }, { ...points[1], leans: 3 },
      { ...points[2], leans: "against_some_answer" }] });
    const out = mapClassifyReply(reply, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_LEANS_DEFAULTED" });
    expect(out.value!.points.map((point) => point.leans)).toEqual(["context", "context", "against_some_answer"]);
  });

  it("several salvages on one reply: all are named, the first in the fixed order on the classification", () => {
    const points = (json(HAIKU_LIST).points as Record<string, unknown>[]);
    const reply = JSON.stringify({ ...json(HAIKU_LIST), points: [{ ...points[0], why_it_matters: QWEN_WHY0 }, points[1], points[2]] });
    const out = mapClassifyReply(`\`\`\`json\n${reply}\n\`\`\``, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_TEXT_TRIMMED", jsonRepairs: ["CODE_FENCE", "MAP_TEXT_TRIMMED", "MAP_LEANS_DEFAULTED"] });
    expect(out.repairs).toEqual(["CODE_FENCE", "MAP_TEXT_TRIMMED", "MAP_LEANS_DEFAULTED"]);
  });

  it("a valid reply is read exactly as before: no repair named", () => {
    const valid = JSON.stringify({ ...json(HAIKU_LIST), points: (json(HAIKU_LIST).points as Record<string, unknown>[]).map((point) => ({ ...point, leans: "context" })) });
    const out = mapClassifyReply(valid, STOP, mapListReplySchema, mapListCheck(RO), mapListSalvage);
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null });
    expect(out.repairs).toEqual([]);
  });
});

describe("map salvage: choose ids that are unknown, repeated or on both sides are dropped (MAP_IDS_DROPPED)", () => {
  const check = mapChooseCheck(new Set(KP_IDS), RO);

  it("DeepSeek's real choose: kp15 on both sides of answers.3 was refused as MAP_KEY_POINT_REPEATED; now it is dropped from both and the reply accepted", () => {
    const strict = mapClassifyReply(DEEPSEEK_CHOOSE, STOP, mapChooseReplySchema, check);
    expect(issuesOf(strict.classification.parseStatus === "PARSED" ? null : strict.classification.parseError))
      .toEqual(["MAP_KEY_POINT_REPEATED@answers.3.against.1"]);
    const out = mapClassifyReply(DEEPSEEK_CHOOSE, STOP, mapChooseReplySchema, check, mapChooseSalvage(new Set(KP_IDS)));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_IDS_DROPPED" });
    expect(out.value!.answers[3]).toMatchObject({ answer_id: "an02", for: ["kp06", "kp27", "kp08", "kp26", "kp38"],
      against: ["kp33", "kp42", "kp01", "kp34", "kp40"] });
    const original = json(DEEPSEEK_CHOOSE).answers as { for: string[]; against: string[] }[];
    for (const index of [0, 1, 2]) expect(out.value!.answers[index]).toMatchObject({ for: original[index]!.for, against: original[index]!.against });
    // The step's own reader, built from the run's key points.
    const spec = mapChooseSpec(CTX, KP_IDS.map(keyPointOf), []);
    expect(spec.classify(DEEPSEEK_CHOOSE, STOP)).toEqual(out.classification);
  });

  it("drops an id the run does not hold and a repeat within one list, keeping the first", () => {
    const reply = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Da, după criteriile de convergență.", for: ["kp01", "kp99", "kp02", "kp01"], against: ["kp03"], strongest_rival: "a2" },
      { answer_id: "a2", statement: "Nu, nu în următorii ani.", for: ["kp04"], against: [], strongest_rival: "a1" }] });
    const out = mapClassifyReply(reply, STOP, mapChooseReplySchema, mapChooseCheck(new Set(["kp01", "kp02", "kp03", "kp04"]), RO),
      mapChooseSalvage(new Set(["kp01", "kp02", "kp03", "kp04"])));
    expect(out.classification).toEqual({ parseStatus: "PARSED", parseError: null, jsonRepair: "MAP_IDS_DROPPED" });
    expect(out.value!.answers[0]).toMatchObject({ for: ["kp01", "kp02"], against: ["kp03"] });
  });

  it("not salvageable: an answer whose every point would be dropped still goes to the follow-up, at the same paths as before", () => {
    const ids = new Set(["kp01", "kp02"]);
    const reply = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Da, după criteriile de convergență.", for: ["kp88", "kp99"], against: [], strongest_rival: "a2" },
      { answer_id: "a2", statement: "Nu, nu în următorii ani.", for: ["kp01"], against: ["kp01"], strongest_rival: "a1" }] });
    const out = mapClassifyReply(reply, STOP, mapChooseReplySchema, mapChooseCheck(ids, RO), mapChooseSalvage(ids));
    expect(out.classification.parseStatus).toBe("SCHEMA_FAILED");
    // a1 named only unknown points: left as written, refused where it was. a2's repeat (kp01 on both sides) would leave it
    // with nothing either: refused as before too.
    expect(issuesOf(out.classification.parseStatus === "PARSED" ? null : out.classification.parseError)).toEqual([
      "MAP_UNKNOWN_KEY_POINT_ID@answers.0.for.0", "MAP_UNKNOWN_KEY_POINT_ID@answers.0.for.1", "MAP_KEY_POINT_REPEATED@answers.1.against.0"]);
    expect(out.repairs).toEqual([]);
  });

  it("the other content checks still apply after the drop (an unknown rival is still refused)", () => {
    const reply = JSON.stringify({ answers: [
      { answer_id: "a1", statement: "Da, după criteriile de convergență.", for: ["kp01", "kp99"], against: [], strongest_rival: "a7" }] });
    const ids = new Set(["kp01"]);
    const out = mapClassifyReply(reply, STOP, mapChooseReplySchema, mapChooseCheck(ids, RO), mapChooseSalvage(ids));
    expect(issuesOf(out.classification.parseStatus === "PARSED" ? null : out.classification.parseError)).toEqual(["MAP_UNKNOWN_RIVAL@answers.0.strongest_rival"]);
  });
});

describe("map salvage: no prompt text moved, and the practice tool reads replies the same way", () => {
  it("the sealed map contract hash is unchanged", () => {
    // LG-C Task 14: today's 7 contracts + the 7 length variants; 25b4c106…9392 is history (register 14's map seal).
    expect(mapPromptContractHash()).toBe("d46c0c12d8164c9b01db78ff64ab58515e8a2f98887d5a433c090b40dcd39b71");
    // Review Focus 1: today's seven are byte for byte unchanged (their own fingerprint is still register 14's seal).
    expect(createHash("sha256").update(MAP_CONTRACT_NAMES.map((name) => promptContractFingerprintText(mapPromptContracts()[name]))
      .join("\n---\n")).digest("hex")).toBe("25b4c106a9b5e444d19aee0a31b7fea95f377ee91fb1f9eef64c623938e59392");
  });

  it("the practice re-check does not flag a salvaged reply, and still flags what is left for the follow-up", () => {
    expect(recheckReply("MAP:angles", QWEN_ANGLES).issues).toEqual([]);
    expect(recheckReply("MAP:list:1", HAIKU_LIST).issues).toEqual([]);
    expect(recheckReply("MAP:list:0", QWEN_LIST).issues).toEqual(["too_big@candidate_answers.2"]);
    expect(recheckReply("MAP:choose", DEEPSEEK_CHOOSE).issues).toEqual([]);
  });

  it("the practice report counts each salvage as a tolerant repair (information), every repair of one reply named", () => {
    expect(practiceJsonRepairOf(QWEN_ANGLES, "stop", "MAP:angles")).toBe("INNER_QUOTE+MAP_TEXT_TRIMMED");
    expect(practiceJsonRepairOf(HAIKU_LIST, "stop", "MAP:list:1:2")).toBe("MAP_LEANS_DEFAULTED");
    expect(practiceJsonRepairOf(DEEPSEEK_CHOOSE, "stop", "MAP:choose")).toBe("MAP_IDS_DROPPED");
    // An id the run does not hold is known only from the call's own prompt (its key_points material).
    const unknownOnly = DEEPSEEK_CHOOSE.replace("\"against\":[\"kp33\",\"kp15\"", "\"against\":[\"kp33\",\"kp44\"");
    expect(practiceJsonRepairOf(unknownOnly, "stop", "MAP:choose")).toBeNull();
    expect(practiceJsonRepairOf(unknownOnly, "stop", "MAP:choose", new Set(KP_IDS.filter((id) => id !== "kp44")))).toBe("MAP_IDS_DROPPED");
    // A valid reply, and a patch reply (not a whole reply), are read as before.
    expect(practiceJsonRepairOf(JSON.stringify({ answers: [] }), "stop", "MAP:merge")).toBeNull();
    expect(practiceJsonRepairOf("{\"answers.3.against.1\":\"kp42\"}", "stop", "MAP:choose")).toBeNull();
  });

  it("reads the choose call's key point ids from its own prompt", () => {
    const { framed } = mapProviderPieces(mapChooseSpec(CTX, ["kp01", "kp07"].map(keyPointOf), []));
    expect([...(practiceMapKeyPointIdsOf(framed.packet.messages) ?? [])]).toEqual(["kp01", "kp07"]);
    expect(practiceMapKeyPointIdsOf(mapProviderPieces(mapAnglesSpec(CTX)).framed.packet.messages)).toBeNull();
    expect(practiceMapKeyPointIdsOf([{ role: "user", content: "not a frame" }])).toBeNull();
  });
});

describe("map salvage log: every kind it notes is reported, in the providers' fixed order (LG-A, MAP_IDS_NORMALISED)", () => {
  it("reports MAP_IDS_NORMALISED beside the kinds noted with it, in the list's order", () => {
    const log = new MapSalvageLog();
    log.note("MAP_IDS_NORMALISED");
    log.note("MAP_IDS_DROPPED");
    log.note("MAP_TEXT_TRIMMED");
    expect(log.repairs).toEqual(["MAP_TEXT_TRIMMED", "MAP_IDS_DROPPED", "MAP_IDS_NORMALISED"]);
    expect(new MapSalvageLog().repairs).toEqual([]);
  });
});
