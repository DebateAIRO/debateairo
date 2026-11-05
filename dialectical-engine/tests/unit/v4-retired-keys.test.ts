import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { PurposeLinesSchema, purposeLinesMaterial } from "@debateai/contract";
import { describe, expect, it } from "vitest";

import { digQuestion, RETIRED_ANGLES_SENTENCE_EN } from "../../apps/ui/lib/v4/askText.js";
import type { V4OpenQuestion } from "../../apps/ui/lib/v4/types.js";

/*
 * V4 start step, Task 67 (decision 2): the own-angle box leaves step 2. A person's own angle is now a path added at the
 * choosing step, never a sentence added to the question, so the box's labels and the angle sentence retire in all 35
 * languages. An old debate that carries angles still reads: its stored purpose lines keep their angles, and its old
 * English angle sentence is still known, so a dig sent off English leaves it out.
 */

const ui = resolve(import.meta.dirname, "../../apps/ui");
const messages = join(ui, "messages");

/** The retired keys: the box's labels on step 2 and the sentence an angle added to the question. */
const RETIRED = [
  "v4.read.angles.label",
  "v4.read.angles.placeholder",
  "v4.read.angles.add",
  "v4.read.angles.remove",
  "v4.read.angles.full",
  "v4.askText.angles",
  "newDebate.askText.angles"
] as const;

const READS_RETIRED = /v4\.read\.angles\b|askText\.angles\b/u;

function sources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "messages" || entry === "public" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|mjs)$/u.test(entry) && !/\.test\./u.test(entry)) out.push({ path: relative(ui, full), text: readFileSync(full, "utf8") });
    }
  };
  walk(ui);
  return out;
}

describe("decision 2: the own-angle keys are retired", () => {
  const locales = readdirSync(messages, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  it("35 languages", () => expect(locales).toHaveLength(35));

  it("no catalogue of any language keeps an angle key", () => {
    const kept: string[] = [];
    for (const locale of locales) {
      for (const file of readdirSync(join(messages, locale)).filter((name) => name.endsWith(".json"))) {
        const catalog = JSON.parse(readFileSync(join(messages, locale, file), "utf8")) as Record<string, unknown>;
        for (const key of Object.keys(catalog)) {
          if ((RETIRED as readonly string[]).includes(key) || key.startsWith("v4.read.angles.")) kept.push(`${locale}/${file}: ${key}`);
        }
      }
    }
    expect(kept).toEqual([]);
  });

  it("no source of the website reads them", () => {
    const found = sources();
    expect(found.length).toBeGreaterThan(100);
    expect(found.filter(({ text }) => READS_RETIRED.test(text)).map(({ path }) => path)).toEqual([]);
  });
});

describe("decision 2: an old debate's angles still read", () => {
  const v4 = JSON.parse(readFileSync(join(messages, "en", "v4.json"), "utf8")) as Record<string, string>;
  const open = (text: string): V4OpenQuestion => ({ id: "w", kind: "STILL_ARGUED", text, star: false, pathId: null });
  const OLD_PARENT = "Q?\n\nPlease also look at: jobs.";

  it("the stored lines keep their angles, and the later AIs still get them", () => {
    expect(PurposeLinesSchema.safeParse({ angles: ["jobs"] }).success).toBe(true);
    expect(purposeLinesMaterial("Q?", { angles: ["jobs"] }).purpose).toBe("jobs");
  });

  it("the old English sentence is still known by its words", () => {
    expect(RETIRED_ANGLES_SENTENCE_EN).toBe("Please also look at: {list}.");
  });

  it("a dig sent off English leaves an old English angle line out", () => {
    expect(digQuestion({ kind: "open", questions: [open("Cheaper storage")] }, OLD_PARENT, v4, "ro")).toBe("Cheaper storage\n\n“Q?”");
  });

  it("a dig sent in English carries it as the earlier question said it", () => {
    expect(digQuestion({ kind: "open", questions: [open("Cheaper storage")] }, OLD_PARENT, v4, "en"))
      .toBe("Does this hold up, and when? Cheaper storage\n\nThis follows from an earlier question: “Q?”\nPlease also look at: jobs.");
  });
});

/*
 * V4 start step, Task 75b (ask-d2; owner answer Q15 of 5 Nov): the level block is one row of pills and one grey line. The
 * label box over the changing sentence and the note that the level "sits as a small label at the top" retire: the level now
 * belongs to the question, and no header changes it.
 */
describe("Task 75b: the level block's label and old note are retired", () => {
  const LEVEL_RETIRED = ["v4.ask.levelShowsLabel", "v4.ask.levelNote", "v4.ask.levelChangeLater"] as const;
  const READS_LEVEL_RETIRED = /v4\.ask\.(levelShowsLabel|levelNote|levelChangeLater)\b/u;

  it("no catalogue keeps them", () => {
    const kept: string[] = [];
    for (const locale of readdirSync(messages, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
      for (const file of readdirSync(join(messages, locale)).filter((name) => name.endsWith(".json"))) {
        const catalog = JSON.parse(readFileSync(join(messages, locale, file), "utf8")) as Record<string, unknown>;
        kept.push(...Object.keys(catalog).filter((key) => (LEVEL_RETIRED as readonly string[]).includes(key)).map((key) => `${locale}/${file}: ${key}`));
      }
    }
    expect(kept).toEqual([]);
  });

  it("no source of the website reads them", () => {
    expect(sources().filter(({ text }) => READS_LEVEL_RETIRED.test(text)).map(({ path }) => path)).toEqual([]);
  });
});
