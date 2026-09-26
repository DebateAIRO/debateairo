import { PLAN_TIER_ROSTERS, type Answer, type AnswerStory } from "@debateai/contract";

/**
 * A realistic sample debate and its story, for the owner's look-first mock
 * (scripts/story-mock.tsx), the sample PDF (scripts/story-sample-pdf.ts) and
 * the story tests. No page imports it. The question is Romanian, so the mock
 * and the PDF show ș ț ă î â and „…” the way real stories will.
 */
export const STORY_FIXTURE_DEBATE_ID = "fe830726-05a2-4840-82de-0d6ef160231e";
export const STORY_FIXTURE_QUESTION =
  "Ar trebui să ne mutăm cu familia din București la Cluj pentru un salariu mai mare?";

const RUN_REF = "e177d603-1f78-40cc-8bdd-52dc4c22b2e2";
const ASKED_AT = "2026-09-26T09:00:00.000Z";
const SERVED_AT = "2026-09-26T09:24:00.000Z";
const FIXTURE_PACK_FINGERPRINT = "e4a5f9d6b9cb4e6310c15b2cc06830fe09b7b477239e6e2229102c406f318c32";

type Node = Answer["nodes"][number];
type Edge = Answer["edges"][number];
type FixtureMaker = "OpenAI" | "Anthropic" | "xAI";

/**
 * Each maker's model in the premium roster. The ids are read from the roster,
 * never written here: a roster model id is declared once, in the contract
 * (tests/architecture/tier01-roster.test.ts).
 */
function rosterModel(prefix: string): string {
  const model = PLAN_TIER_ROSTERS.premium.find((id) => id.startsWith(prefix));
  if (model === undefined) throw new Error(`STORY_FIXTURE_MODEL_MISSING: no premium model starts with ${prefix}`);
  return model;
}

const MODEL_OF: Readonly<Record<FixtureMaker, string>> = Object.freeze({
  OpenAI: rosterModel("gpt-"),
  Anthropic: rosterModel("claude-"),
  xAI: rosterModel("grok-")
});

function lineage(maker: FixtureMaker): NonNullable<Node["maker_lineage"]> {
  return {
    maker,
    model_id: MODEL_OF[maker],
    transport: "openai-compatible-http",
    provider_ref: `provider:${maker.toLowerCase()}`
  };
}

function labeled(value: number, source: string): Node["base_score"] {
  return {
    value,
    kind: "strength",
    source,
    producer: "judgement",
    provenance_ref: `prov:${source}`,
    replay_handle: `replay:${source}`
  };
}

export interface StoryFixtureNodeInput {
  readonly id: string;
  readonly claim: string;
  readonly way: Node["way_of_knowing"];
  readonly base: number;
  readonly final: number | null;
  readonly maker: FixtureMaker | null;
  readonly review: Readonly<{ outcome: "agree" | "dispute" | "cannot-assess"; by: FixtureMaker; reason: string }> | null;
  readonly locator: string | null;
  readonly marks: Node["condition_marks"];
}

export function storyFixtureNode(input: StoryFixtureNodeInput): Node {
  return {
    node_id: input.id,
    claim: input.claim,
    way_of_knowing: input.way,
    base_score: labeled(input.base, `judge:base:${input.id}`),
    final_strength: input.final === null ? null : labeled(input.final, `propagation:final:${input.id}`),
    provenance_ref: `prov:node:${input.id}`,
    maker_lineage: input.maker === null ? null : lineage(input.maker),
    review: input.review === null ? null : {
      outcome: input.review.outcome,
      reasons: [input.review.reason],
      provenance_ref: `artifact:review:${input.id}`,
      reviewer_lineage: lineage(input.review.by)
    },
    locator: input.locator,
    stranger_restatement: { check_status: "PASS" },
    defeater_refs: [],
    defeater_exhaustion_marked: false,
    disagreement: null,
    condition_marks: [...input.marks],
    abstention: null,
    staleness_state: "FRESH",
    relevant_as_of: SERVED_AT
  };
}

export function storyFixtureEdge(input: Readonly<{
  from: string;
  to: string;
  relation: "support" | "attack";
  strength: number;
}>): Edge {
  return {
    edge_id: `edge:${input.from}:${input.to}`,
    from_node_ref: input.from,
    target_kind: "NODE",
    target_ref: input.to,
    relation: input.relation,
    strength: { status: "PRESENT", number: labeled(input.strength, `judgement:edge:${input.from}`) },
    provenance_ref: `prov:edge:${input.from}`,
    placeholder: false
  };
}

function fixtureNodes(): Node[] {
  return [
    storyFixtureNode({
      id: "n-yes", claim: "Da. Salariul nou acoperă cu mult costurile mai mari din Cluj.",
      way: "REASONING", base: 0.66, final: 0.58, maker: "OpenAI",
      review: { outcome: "agree", by: "Anthropic", reason: "Salariul mai mare este real, dar argumentul trece prea repede peste chirie." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "n-yes-pay", claim: "Oferta este cu aproximativ 35% mai mare decât salariul actual, după impozite.",
      way: "LOOKED_UP", base: 0.72, final: 0.72, maker: "Anthropic",
      review: { outcome: "agree", by: "xAI", reason: "Cifra se potrivește cu oferta citată." },
      locator: "oferta de angajare, pagina 2", marks: []
    }),
    storyFixtureNode({
      id: "n-yes-rent", claim: "Chiriile pentru trei camere în Cluj sunt cu circa 30% mai mari decât în cartierul actual din București.",
      way: "LOOKED_UP", base: 0.69, final: 0.66, maker: "xAI",
      review: { outcome: "agree", by: "OpenAI", reason: "Comparația folosește apartamente asemănătoare." },
      locator: "anunțuri de închiriere, septembrie 2026", marks: []
    }),
    storyFixtureNode({
      id: "n-not-now", claim: "Nu acum. Primii doi ani costă mai mult decât aduce salariul, din cauza chiriei și a mutării.",
      way: "REASONING", base: 0.61, final: 0.52, maker: "Anthropic",
      review: { outcome: "dispute", by: "OpenAI", reason: "Costul mutării se plătește o singură dată, nu în fiecare an." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "n-not-now-once", claim: "Mutarea se plătește o singură dată; diferența de salariu vine în fiecare lună.",
      way: "REASONING", base: 0.64, final: 0.64, maker: "OpenAI",
      review: { outcome: "agree", by: "Anthropic", reason: "Argument corect despre costurile unice." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "n-hybrid", claim: "Merită doar dacă angajatorul acceptă lucrul hibrid, ca familia să se mute treptat, după încheierea anului școlar.",
      way: "REASONING", base: 0.68, final: 0.64, maker: "xAI",
      review: { outcome: "agree", by: "Anthropic", reason: "Condiția este clară și se poate verifica." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "n-hybrid-school", claim: "Schimbarea școlii în mijlocul anului are un cost real pentru copii.",
      way: "REASONING", base: 0.63, final: 0.63, maker: "OpenAI",
      review: { outcome: "cannot-assess", by: "xAI", reason: "Nu există date despre școala copiilor." },
      locator: null, marks: []
    }),
    storyFixtureNode({
      id: "n-hybrid-forum", claim: "Un comentariu anonim de pe un forum spune că angajatorul refuză des cererile de lucru hibrid.",
      way: "REASONING", base: 0.21, final: 0.21, maker: "Anthropic",
      review: null, locator: null, marks: ["BRANCH-FROZEN-LOW-LEVERAGE"]
    })
  ];
}

function fixtureEdges(): Edge[] {
  return [
    storyFixtureEdge({ from: "n-yes-pay", to: "n-yes", relation: "support", strength: 0.72 }),
    storyFixtureEdge({ from: "n-yes-rent", to: "n-yes", relation: "attack", strength: 0.66 }),
    storyFixtureEdge({ from: "n-not-now-once", to: "n-not-now", relation: "attack", strength: 0.64 }),
    storyFixtureEdge({ from: "n-hybrid-school", to: "n-hybrid", relation: "support", strength: 0.63 }),
    storyFixtureEdge({ from: "n-hybrid-forum", to: "n-hybrid", relation: "attack", strength: 0.21 })
  ];
}

function fixtureAnswer(): Answer {
  return {
    answer_id: STORY_FIXTURE_DEBATE_ID,
    answer_version: 1,
    run_ref: RUN_REF,
    question_line: STORY_FIXTURE_QUESTION,
    terminal: "SERVED",
    verdict_state: "CONTESTED",
    verdict_unavailable: null,
    confidence_band: "CAPPED",
    band_ceiling: {
      label: "mostly-reasoning",
      basis: { LOOKED_UP: 2, RAN: 0, REASONING: 6 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "fixture:verdict-story",
      lift_path: "Look up more of the claims to lift the ceiling."
    },
    answer_form: null,
    serve_state: "COMPOSED",
    composed_text: [
      {
        segment_id: "seg:1",
        text: "Dezbaterea nu a ajuns la un răspuns clar. Cea mai puternică poziție spune că mutarea merită doar cu lucru hibrid și după încheierea anului școlar.",
        load_bearing: true,
        served_number_refs: []
      },
      {
        segment_id: "seg:2",
        text: "Chiria mai mare din Cluj rămâne principala obiecție la o mutare imediată.",
        load_bearing: false,
        served_number_refs: []
      }
    ],
    number_slots: [],
    abstention: null,
    shadow_suppressions: [],
    nodes: fixtureNodes(),
    edges: fixtureEdges(),
    badges: [],
    residual_objections: ["Chiria mai mare din Cluj rămâne principala obiecție."],
    value_hinges: [],
    condition_marks: [],
    condition_mark_records: [],
    reversal_point: "O locuință în Cluj la un preț apropiat de cel actual.",
    builds_on_previous: { value: false, answer_ref: null },
    memory_disclosure: null,
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "fixture:verdict-story",
    cost_envelope: { basis: {}, state: "WITHIN", consumed_model_attempts: 38, protected_core: "NEVER_SKIPPABLE" },
    composition_budget_tier: "medium",
    conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:fixture",
    inspection_handle: "inspection:fixture",
    as_of: ASKED_AT,
    staleness_state: "FRESH",
    relevant_as_of: SERVED_AT
  };
}

export const STORY_FIXTURE_ANSWER: Answer = fixtureAnswer();

const FIXTURE_BASIS: NonNullable<AnswerStory["verdict_basis"]> = {
  label: "CONTESTED",
  rung: 4,
  trigger: "MID_BAND",
  winner_node_id: "n-hybrid",
  winner_strength: 0.64,
  runner_up_node_id: "n-yes",
  runner_up_strength: 0.58,
  margin: 0.06,
  disagreement: 0.12,
  thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
  confidence_band: "CAPPED",
  marks: []
};

const FIXTURE_BODY: NonNullable<AnswerStory["story"]> = {
  shape_id: "personal-choice",
  short: {
    headline: "Mutarea poate merita, dar nu dintr-odată: totul depinde de lucrul hibrid.",
    summary: "Întrebarea de fond este dacă un salariu mai mare compensează costurile și stresul unei mutări cu toată familia. Dezbaterea a cântărit trei drumuri. Cel mai solid a fost o mutare treptată, cu lucru hibrid, după încheierea anului școlar. Mutarea imediată a rămas aproape, dar chiriile mai mari din Cluj îi reduc avantajul. Varianta „nu acum” a căzut: mutarea costă o singură dată, pe când diferența de salariu vine în fiecare lună.",
    paths: [
      {
        position_ref: "n-hybrid", fate: "HELD_UP",
        line: "Mutare treptată, cu lucru hibrid: a rezistat cel mai bine, pentru că protejează anul școlar al copiilor.",
        node_refs: ["n-hybrid", "n-hybrid-school"]
      },
      {
        position_ref: "n-yes", fate: "PARTLY_HELD",
        line: "Mutare imediată: salariul cu 35% mai mare ajută, dar chiriile cu circa 30% mai mari îi taie din avantaj.",
        node_refs: ["n-yes", "n-yes-pay", "n-yes-rent"]
      },
      {
        position_ref: "n-not-now", fate: "FELL",
        line: "Nu acum: a căzut, fiindcă mutarea costă o singură dată, iar diferența de salariu vine lunar.",
        node_refs: ["n-not-now", "n-not-now-once"]
      }
    ],
    change: {
      text: "Răspunsul s-ar schimba dacă angajatorul refuză lucrul hibrid sau dacă găsiți în Cluj o locuință la un preț apropiat de cel de acum.",
      node_refs: ["n-hybrid", "n-yes-rent"]
    }
  },
  long: {
    sections: [
      {
        title: "Ce încercați de fapt să decideți",
        paragraphs: [{
          text: "Așa cum înțelegem noi întrebarea, nu este vorba doar despre bani. Vreți să știți dacă un salariu mai bun merită schimbarea orașului, a școlii și a rutinei întregii familii, și în ce ordine ar trebui făcute aceste schimbări.",
          node_refs: ["n-yes", "n-hybrid"]
        }]
      },
      {
        title: "Verdictul pe scurt",
        paragraphs: [{
          text: "Verdictul este „disputat”. Cea mai puternică poziție, mutarea treptată cu lucru hibrid, a obținut 0,64. Mutarea imediată a obținut 0,58. Diferența este mică, iar niciuna nu a ajuns la pragul de 0,70 pentru un verdict „susținut”.",
          node_refs: ["n-hybrid", "n-yes"]
        }]
      },
      {
        title: "Drumurile cercetate",
        paragraphs: [
          {
            text: "Mutarea treptată cu lucru hibrid. Un părinte începe noul job lucrând parțial de acasă, iar familia se mută după încheierea anului școlar. Cel mai bun argument pentru ea: schimbarea școlii în mijlocul anului are un cost real pentru copii. Evaluatorul nu a putut verifica acest punct, pentru că nu avea date despre școală. Drumul este fezabil dacă angajatorul acceptă lucrul hibrid.",
            node_refs: ["n-hybrid", "n-hybrid-school"]
          },
          {
            text: "Mutarea imediată. Oferta este cu aproximativ 35% mai mare decât salariul actual, după impozite, iar cifra a fost verificată. Cea mai puternică obiecție: chiriile pentru trei camere în Cluj sunt cu circa 30% mai mari decât în cartierul actual. Drumul rămâne posibil, dar avantajul este mai mic decât pare la prima vedere.",
            node_refs: ["n-yes", "n-yes-pay", "n-yes-rent"]
          },
          {
            text: "Varianta „nu acum”. Argumentul era că primii doi ani costă mai mult decât aduce salariul. A căzut, pentru că amestecă un cost unic, mutarea, cu un câștig care se repetă lunar. Un evaluator a contestat-o direct din acest motiv.",
            node_refs: ["n-not-now", "n-not-now-once"]
          },
          {
            text: "Un drum a fost lăsat deoparte: un comentariu anonim de pe un forum, potrivit căruia angajatorul refuză des lucrul hibrid. A primit un scor mic, 0,21, și nu putea schimba răspunsul.",
            node_refs: ["n-hybrid-forum"]
          }
        ]
      },
      {
        title: "De ce depinde verdictul",
        paragraphs: [{
          text: "Verdictul se sprijină cel mai mult pe două puncte: condiția lucrului hibrid și diferența de chirie. Dacă oricare dintre ele se schimbă, ordinea dintre primele două drumuri se poate inversa.",
          node_refs: ["n-hybrid", "n-yes-rent"]
        }]
      },
      {
        title: "Ce rămâne nesigur",
        paragraphs: [{
          text: "Majoritatea argumentelor se bazează pe raționament, nu pe date verificate. Doar două puncte au fost verificate în surse: oferta de salariu și chiriile. De aceea încrederea în verdict este limitată.",
          node_refs: ["n-yes-pay", "n-yes-rent"]
        }]
      },
      {
        title: "Ce ar schimba răspunsul și ce puteți face acum",
        paragraphs: [{
          text: "Cereți angajatorului confirmarea scrisă a lucrului hibrid pentru primul an. Căutați apoi locuințe în două-trei cartiere mai ieftine din Cluj. Cu aceste două răspunsuri, alegerea devine mult mai clară.",
          node_refs: ["n-hybrid", "n-yes-rent"]
        }]
      }
    ]
  },
  reviewer_note: {
    text: "Scorurile tratează chiria din Cluj ca pe un cost fix. În realitate, familia ar putea alege un cartier mai ieftin, iar atunci mutarea imediată ar deveni mai atractivă. Nota aceasta nu schimbă verdictul.",
    node_refs: ["n-yes-rent"]
  }
};

/**
 * The checker's reservation. It names a point by its number (P5, the rent
 * comparison), as the checker is told to: it is shown only on the owner's
 * panel, beside the PDF whose appendix explains the numbers. The short texts
 * above never name a point number (the story checks refuse one there).
 */
const FIXTURE_RESERVATION =
  "Rezumatul prezintă diferența de chirie din Cluj (P5, circa 30%) ca pe un fapt sigur, deși cifra vine dintr-o singură comparație de anunțuri.";

/**
 * The point numbers this sample's stored story carries (node id to Pn): the
 * stored story's canonical numbers, the ones its PDF appendix prints and the
 * reservation's "P5" refers to. A real story gets them from the story material
 * (packages/story, Task 3), which puts the positions strongest first. This
 * sample keeps its three positions in the answer's own order and then numbers
 * each position's points in tree order. Tree-order numbering is only a
 * fallback for an answer without a stored story.
 */
export const STORY_FIXTURE_POINT_NUMBERS: Readonly<Record<string, string>> = Object.freeze({
  "n-yes": "P1",
  "n-not-now": "P2",
  "n-hybrid": "P3",
  "n-yes-pay": "P4",
  "n-yes-rent": "P5",
  "n-not-now-once": "P6",
  "n-hybrid-school": "P7",
  "n-hybrid-forum": "P8"
});

export const STORY_FIXTURE_STATUSES: readonly AnswerStory["status"][] = Object.freeze([
  "WRITING", "READY", "READY_WITH_RESERVATION", "UNAVAILABLE"
]);

/** A fresh copy each call, so a test may change it freely. */
export function storyFixture(status: AnswerStory["status"]): AnswerStory {
  const ready = status === "READY" || status === "READY_WITH_RESERVATION";
  return {
    answer_id: STORY_FIXTURE_DEBATE_ID,
    answer_version: 1,
    status,
    unavailable_reason: status === "UNAVAILABLE" ? "STORY_WINDOW_PASSED" : null,
    shape: ready ? { id: "personal-choice", title: "Personal choice" } : null,
    pack: ready ? { version: "2026-09-26.1", fingerprint: FIXTURE_PACK_FINGERPRINT } : null,
    written_at: ready ? "2026-09-26T09:31:00.000Z" : null,
    storyteller: ready ? lineage("OpenAI") : null,
    checker: ready ? lineage("Anthropic") : null,
    rounds: ready ? (status === "READY" ? 1 : 2) : null,
    reservation: status === "READY_WITH_RESERVATION" ? FIXTURE_RESERVATION : null,
    verdict_basis: ready ? structuredClone(FIXTURE_BASIS) : null,
    point_numbers: ready ? { ...STORY_FIXTURE_POINT_NUMBERS } : null,
    story: ready ? structuredClone(FIXTURE_BODY) : null
  };
}
