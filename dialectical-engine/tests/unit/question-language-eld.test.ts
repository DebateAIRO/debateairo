import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ELD_LANGUAGES, SITE_LANGUAGES_ELD_LACKS, loadEldReader, plainWordsOf, questionSegments } from "../../apps/api/src/question-language/eld.js";

const SITE_LOCALES = readdirSync(new URL("../../apps/ui/messages/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe("eld 2.1.0 (question-language spec 2026-10-13, ruling L2)", () => {
  it("knows 60 languages, and lacks exactly Irish, Indonesian and Maltese of our 35", () => {
    expect(ELD_LANGUAGES).toHaveLength(60);
    expect(SITE_LOCALES.filter((code) => !ELD_LANGUAGES.includes(code))).toEqual([...SITE_LANGUAGES_ELD_LACKS]);
    expect(SITE_LANGUAGES_ELD_LACKS).toEqual(["ga", "id", "mt"]);
  });

  it("the loaded database names the same 60 languages", async () => {
    const reader = await loadEldReader("small");
    expect([...reader.languages()].sort()).toEqual([...ELD_LANGUAGES].sort());
  });

  it("reads a plain sentence reliably and counts its letters; empty text is no reading", async () => {
    const reader = await loadEldReader("small");
    const ro = reader.read("Ar trebui ca România să investească mai mult în transportul public din orașele mari?");
    expect(ro).toMatchObject({ code: "ro", reliable: true });
    expect(ro.letters).toBeGreaterThan(60);
    expect(reader.read("   ")).toEqual({ code: null, reliable: false, letters: 0, segments: [] });
    expect(reader.read("2 + 2 = 4?")).toMatchObject({ letters: 0, segments: [] });
  });

  it("ruling L-MIX: cuts a question into clauses, and counts only plain words in each", async () => {
    expect(questionSegments("Ar trebui România să adopte euro, or should it wait until wages catch up?"))
      .toEqual(["Ar trebui România să adopte euro", "or should it wait until wages catch up"]);
    expect(questionSegments("Una pregunta — and an answer (maybe)\nsecond line")).toEqual(["Una pregunta", "and an answer", "maybe", "second line"]);
    expect(questionSegments("Fără niciun semn")).toEqual(["Fără niciun semn"]);
    expect(plainWordsOf("Merită să lucrez la un startup de AI în loc de o corporație"))
      .toBe("Merită să lucrez la un startup de în loc de o corporație");
    expect(plainWordsOf("Should Apple and OpenAI sell the iPhone 17 in România")).toBe("Should and sell the in");
    expect(plainWordsOf("EU, NATO, 2030")).toBe("");
    const reader = await loadEldReader("small");
    const mixed = reader.read("Ar trebui România să adopte euro, or should it wait until wages catch up?");
    expect(mixed.segments).toHaveLength(2);
    expect(mixed.segments.every((segment) => segment.letters > 0)).toBe(true);
    expect(reader.read("Merită să lucrez la un startup de AI în loc de o corporație?").segments).toHaveLength(1);
  });
});
