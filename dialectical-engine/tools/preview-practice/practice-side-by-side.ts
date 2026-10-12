/**
 * Preview practice: the side-by-side page (spec 2026-10-12 §4.8): the same question's answers at each thinking level,
 * on one static page the owner can read and judge.
 *
 * Plain words: `practice report --side-by-side <samples.jsonl> --out DIR` writes DIR/side-by-side.html from a samples
 * log, sending nothing. Only the chosen jobs are shown: the four the owner reads (PANEL, SYNTHESIZER, STORYTELLER,
 * REVIEW), or the ones `--lanes` names; the other jobs' answers are left out. Each model has its own block. Inside it
 * each lane (a kind of job) has one block per sample and question, and in that block one column per run ("high#1",
 * "high#2", "low#1", ...), the runs in the order they first appear in the samples. A column shows the accepted answer,
 * or why there is none, and under it its run, status, thinking tokens, time, cost in US dollars, and "cut off" when a
 * reply stopped at the length limit. The page has no script, so it can be published as a private page, and every value
 * on it is escaped.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PracticeSample, PracticeSampleStatus } from "./practice-formats.js";
import type { PracticeLane } from "./practice-lanes.js";

export const PRACTICE_SIDE_BY_SIDE_FILE = "side-by-side.html" as const;

/**
 * The chosen jobs (spec 2026-10-12 §4.8: the judge panel, the answer writer, the story writer, the reviewer), in this
 * order, unless the caller names others. Only these lanes are shown; the other jobs' answers are left out.
 */
const DEFAULT_LANES: readonly PracticeLane[] = ["PANEL", "SYNTHESIZER", "STORYTELLER", "REVIEW"];

/** What each lane's job is, in plain words (as the practice's README names them, in the lanes' own order). */
const LANE_WORDS: Readonly<Partial<Record<PracticeLane, string>>> = {
  JUDGE_POSITION: "write a position", JUDGE_ATTACK: "attack one", JUDGE_CROSS: "answer a cross exchange",
  PANEL: "sit on a panel", REVIEW: "review a node", SYNTHESIZER: "write the answer", EVALUATOR: "check the answer",
  STORYTELLER: "tell the story", STORY_CHECKER: "check the story"
};

/** A sample's status, in plain words, under its column. */
const STATUS_WORDS: Readonly<Record<PracticeSampleStatus, string>> = {
  PARSED: "answered",
  REPAIRED: "answered on a second try (a warning)",
  PARSE_FAILED: "wrong format, failed for good",
  SCHEMA_FAILED: "wrong format, failed for good",
  UNPARSED: "wrong format, failed for good",
  POST_CHECK_FAILED: "content check failed for good",
  CALL_FAILED: "call failed",
  UNBILLED_REFUSED: "refused as busy, not billed",
  VENDOR_ERROR_UNBILLED: "vendor error, not billed",
  SKIPPED_GATE_STOPPED: "not sent: gate stopped",
  SKIPPED_MODEL_BUSY: "not sent: model busy"
};

/** What a column shows instead of an answer when it has no answer text. */
const NO_ANSWER_WORDS: Readonly<Record<PracticeSampleStatus, string>> = {
  PARSED: "no answer text recorded",
  REPAIRED: "no answer text recorded",
  PARSE_FAILED: "no answer (format failed for good)",
  SCHEMA_FAILED: "no answer (format failed for good)",
  UNPARSED: "no answer (format failed for good)",
  POST_CHECK_FAILED: "no answer (content check failed for good)",
  CALL_FAILED: "no answer (call failed)",
  UNBILLED_REFUSED: "no answer (refused as busy, not billed)",
  VENDOR_ERROR_UNBILLED: "no answer (vendor error, not billed)",
  SKIPPED_GATE_STOPPED: "no answer (gate stopped)",
  SKIPPED_MODEL_BUSY: "no answer (model busy)"
};

/** Escapes a value for HTML text: & < > " '. Every value written into the page goes through this. */
function esc(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

/** A sample's run: its `--levels` run ("high#1"), or "server setting" for a sample of a run without levels. */
function runOf(sample: PracticeSample): string {
  return sample.levelRun ?? "server setting";
}

/** A nano-USD decimal string as dollars: "540000" is "$0.00054" (at least two decimals). */
function dollarsOf(nano: string | null | undefined): string {
  if (typeof nano !== "string" || !/^\d+$/u.test(nano)) return "not reported";
  const value = BigInt(nano);
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/u, "").padEnd(2, "0");
  return `$${(value / 1_000_000_000n).toString()}.${fraction}`;
}

function secondsOf(milliseconds: number): string {
  return Number.isFinite(milliseconds) ? `${(milliseconds / 1_000).toFixed(1)} s` : "not reported";
}

function thinkingOf(tokens: number | null | undefined): string {
  return typeof tokens === "number" ? `${String(tokens)} tokens` : "not reported";
}

function fact(name: string, value: string): string {
  return `<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`;
}

/** One run's column: its answer (or why there is none), then its facts. A job never sent has no time, cost or thinking. */
function column(sample: PracticeSample): string {
  const run = runOf(sample);
  const sent = !sample.status.startsWith("SKIPPED_");
  const answer = typeof sample.answerText === "string"
    ? `<pre>${esc(sample.answerText)}</pre>`
    : `<p class="missing">${esc(NO_ANSWER_WORDS[sample.status] ?? sample.status)}</p>`;
  const facts = [
    fact("Run", run),
    fact("Status", STATUS_WORDS[sample.status] ?? sample.status),
    ...(sent ? [fact("Thinking", thinkingOf(sample.reasoningTokens)), fact("Time", secondsOf(sample.latencyMs)),
      fact("Cost", dollarsOf(sample.costNanoUsd))] : [])
  ].join("");
  const level = sample.thinkingLevel === undefined ? "" : `<p class="level">level: ${esc(sample.thinkingLevel)}</p>`;
  const cut = sample.cutOff === true ? `<p class="cut">cut off: a reply stopped at the length limit</p>` : "";
  return `<section class="run"><h5>${esc(run)}</h5>${level}${answer}<dl>${facts}</dl>${cut}</section>`;
}

/** One lane of one model: a block per sample and question, with one column per run in the model's run order. */
function laneBlock(lane: PracticeLane, samples: readonly PracticeSample[], runs: readonly string[]): string {
  const groups = new Map<string, PracticeSample[]>();
  for (const sample of samples) {
    const key = `${String(sample.sample)}\n${sample.questionId}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const blocks = [...groups.values()].map((group) => {
    const first = group[0]!;
    const columns = runs.flatMap((run) => group.filter((sample) => runOf(sample) === run)).map(column);
    return `<article class="question"><h4>Sample ${esc(String(first.sample))}, question ${esc(first.questionId)}</h4>`
      + `<div class="runs">${columns.join("")}</div></article>`;
  });
  const words = LANE_WORDS[lane];
  return `<section class="lane"><h3>${esc(lane)}${words === undefined ? "" : ` (${esc(words)})`}</h3>${blocks.join("")}</section>`;
}

const HEADER_TEXT = "Each column is one answer to the same question, given at one thinking level. The label on a column is its run: "
  + "\"high#1\" is the first run at the level high, and \"high#2\" is the same level run a second time, so you can see how much "
  + "answers change by chance alone. \"default\" is the AI's own setting (MiMo with thinking on, Qwen at its maximum). \"none\" "
  + "means thinking is switched off. \"server setting\" is the level the preview server sets for a model that was not given "
  + "levels. Under each answer: its status, its thinking tokens, the time its whole job took, its cost in US dollars, and "
  + "\"cut off\" when a reply stopped at the length limit.";

const STYLE = `
:root {
  --bg: #faf9f6; --fg: #1c1c1a; --muted: #5f5d57; --card: #ffffff; --line: #d8d5cb; --pre: #f3f1ea; --warn: #8a4b00; --missing: #6d6a62;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161619; --fg: #ebeae5; --muted: #a8a59c; --card: #1f1f24; --line: #3b3b43; --pre: #1a1a1f; --warn: #f2b56b; --missing: #b3afa4;
  }
}
:root[data-theme="dark"] {
  --bg: #161619; --fg: #ebeae5; --muted: #a8a59c; --card: #1f1f24; --line: #3b3b43; --pre: #1a1a1f; --warn: #f2b56b; --missing: #b3afa4;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
.page { max-width: 1200px; margin: 0 auto; padding: 16px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
h2 { font-size: 1.2rem; margin: 32px 0 4px; overflow-wrap: anywhere; }
h3 { font-size: 1rem; margin: 20px 0 6px; color: var(--muted); overflow-wrap: anywhere; }
h4 { font-size: 0.9rem; margin: 14px 0 8px; font-weight: 600; overflow-wrap: anywhere; }
h5 { font-size: 1rem; margin: 0; overflow-wrap: anywhere; }
.generated, .intro { color: var(--muted); }
.intro { margin: 8px 0 0; }
.runs { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 12px; }
.run { min-width: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.level { margin: 2px 0 8px; color: var(--muted); font-size: 0.9rem; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 10px; padding: 12px; background: var(--pre); border-radius: 8px;
  font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--fg); }
.missing { margin: 0 0 10px; color: var(--missing); font-style: italic; overflow-wrap: anywhere; }
dl { margin: 0; display: grid; gap: 4px; font-size: 0.9rem; }
dl > div { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 8px; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.cut { margin: 8px 0 0; color: var(--warn); font-weight: 600; }
`;

export function practiceSideBySideHtml(samples: readonly PracticeSample[],
  options: Readonly<{ lanes?: readonly PracticeLane[]; generatedAt?: Date }> = {}): string {
  const generatedAt = options.generatedAt ?? new Date();
  // Only the lanes named (default: the four chosen jobs), in that order; a sample of any other lane is left out.
  const laneOrder = [...new Set<PracticeLane>(options.lanes ?? DEFAULT_LANES)];
  const models = [...new Set(samples.map((sample) => sample.model))];
  const modelBlocks = models.map((model) => {
    const mine = samples.filter((sample) => sample.model === model);
    const runs = [...new Set(mine.map(runOf))];
    const lanes = laneOrder.flatMap((lane) => {
      const inLane = mine.filter((sample) => sample.lane === lane);
      return inLane.length === 0 ? [] : [laneBlock(lane, inLane, runs)];
    });
    return `<section class="model"><h2>${esc(model)}</h2>${lanes.join("")}</section>`;
  });
  const body = modelBlocks.length === 0 ? "<p>No answers in this log.</p>" : modelBlocks.join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Thinking level comparison</title>
<style>${STYLE}</style>
</head>
<body>
<main class="page">
<header>
<h1>Thinking level comparison</h1>
<p class="generated">Generated ${esc(generatedAt.toISOString())}</p>
<p class="intro">${esc(HEADER_TEXT)}</p>
</header>
${body}
</main>
</body>
</html>
`;
}

/** Writes DIR/side-by-side.html (made private, as report.json is), creating DIR if needed; returns the file's path. */
export function writeSideBySideFile(directory: string, samples: readonly PracticeSample[],
  options: Readonly<{ lanes?: readonly PracticeLane[] }> = {}): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, PRACTICE_SIDE_BY_SIDE_FILE);
  writeFileSync(path, practiceSideBySideHtml(samples, options), { mode: 0o600 });
  return path;
}
