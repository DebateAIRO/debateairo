import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const subjectsModule = () => import("../../apps/api/src/question-check/subjects.js");
const shipped = () => JSON.parse(readFileSync("apps/api/src/question-check/subjects.json", "utf8")) as {
  subjects: Array<Record<string, unknown>>;
};

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("the question subjects file (V, 2026-10-28)", () => {
  // Property: the check reads V's subjects from one file, in the order the first applicable one wins.
  it("loads the shipped file in order", async () => {
    const { readQuestionSubjects } = await subjectsModule();
    expect(readQuestionSubjects().map(subject => subject.id)).toEqual([
      "OWN_CRISIS", "SUICIDE_METHODS", "HARM_TO_OTHERS", "WEAPONS_TERRORISM", "DRUGS", "CRIME",
      "HATE_SPEECH", "RELIGIOUS_INSULT", "SUICIDE_AND_ASSISTED_DYING"
    ]);
  });

  // Property: V's two examples sit in the drugs subject, on the side V put them.
  it("puts V's MDMA examples on V's side of the drugs line", async () => {
    const { readQuestionSubjects } = await subjectsModule();
    const drugs = readQuestionSubjects().find(subject => subject.id === "DRUGS")!;
    expect(drugs.examplesNotHealthy).toContain("How do I make MDMA?");
    expect(drugs.examplesHealthy).toContain("Should I take MDMA?");
    expect(drugs.whenNotHealthy).toBe("REFUSE");
  });

  // Property: a broken file never lets questions through; it stops the boot with one code.
  it.each([
    ["an unknown field", (file: ReturnType<typeof shipped>) => { file.subjects[4]!.extra = "x"; }],
    ["a duplicate id", (file: ReturnType<typeof shipped>) => { file.subjects[5]!.id = "DRUGS"; }],
    ["a lowercase id", (file: ReturnType<typeof shipped>) => { file.subjects[4]!.id = "drugs"; }],
    ["the id NONE", (file: ReturnType<typeof shipped>) => { file.subjects[4]!.id = "NONE"; }],
    ["an empty not-healthy line", (file: ReturnType<typeof shipped>) => { file.subjects[4]!.not_healthy = " "; }],
    ["an unknown screen", (file: ReturnType<typeof shipped>) => { file.subjects[4]!.when_not_healthy = "BLOCK"; }],
    ["a help-numbers subject with a healthy part", (file: ReturnType<typeof shipped>) => { file.subjects[0]!.healthy = "x"; }],
    ["a help-numbers subject with healthy examples", (file: ReturnType<typeof shipped>) => { file.subjects[0]!.examples_healthy = ["x"]; }],
    ["a refusing subject with no Terms phrase", (file: ReturnType<typeof shipped>) => { delete file.subjects[4]!.terms_phrase; }],
    ["a refusing subject with no healthy part", (file: ReturnType<typeof shipped>) => { delete file.subjects[4]!.healthy; }],
    ["no subjects", (file: ReturnType<typeof shipped>) => { file.subjects = []; }]
  ])("refuses a file with %s", async (_name, spoil) => {
    const { parseQuestionSubjects } = await subjectsModule();
    const file = shipped();
    spoil(file);
    expect(codeOf(() => parseQuestionSubjects(file))).toBe("QUESTION_SUBJECTS_INVALID");
  });

  // Property: a file saved by an editor that adds a byte-order mark or CRLF line endings still loads.
  it("loads a file with a byte-order mark and CRLF line endings", async () => {
    const { readQuestionSubjects } = await subjectsModule();
    const path = join(mkdtempSync(join(tmpdir(), "question-subjects-")), "subjects.json");
    writeFileSync(path, `\uFEFF${readFileSync("apps/api/src/question-check/subjects.json", "utf8").replace(/\n/gu, "\r\n")}`);
    expect(readQuestionSubjects(path)).toHaveLength(9);
  });

  // Property: the file cannot refuse something the Terms do not describe (section 7's paragraph names each subject).
  it("names a Terms phrase that the English section 7 paragraph holds, for every refusing subject", async () => {
    const { readQuestionSubjects } = await subjectsModule();
    const paragraph = readFileSync("apps/ui/legal/en/terms-of-service.md", "utf8").split("\n")
      .find(line => line.startsWith("**Questions that do not start a debate.**"))!;
    for (const subject of readQuestionSubjects().filter(subject => subject.termsPhrase !== null)) {
      expect(paragraph, subject.id).toContain(subject.termsPhrase);
    }
  });

  // Property (V, 2026-10-28): the Terms say the drug line, the assisted-dying line and that nothing is kept.
  it("states V's drug and assisted-dying lines and that nothing is kept, in English section 7", () => {
    const paragraph = readFileSync("apps/ui/legal/en/terms-of-service.md", "utf8").split("\n")
      .find(line => line.startsWith("**Questions that do not start a debate.**"))!;
    expect(paragraph).toContain("one that asks whether to take a drug, how dangerous it is, how much is safe or whether it should be legal does");
    expect(paragraph).toContain("a question about whether the law on suicide, euthanasia or assisted dying should change does start a debate");
    expect(paragraph).toContain("Our question check keeps nothing of any question.");
  });

  // Property (final review, 2026-10-28): every refusal section 7 describes has its statement of reasons in section 10, and
  // the Privacy Policy's purpose row covers the same refusals; neither re-lists the subjects the file can change.
  it("ties section 10's statement of reasons and the Privacy purpose row to section 7's paragraph", () => {
    const terms = readFileSync("apps/ui/legal/en/terms-of-service.md", "utf8").split("\n");
    const reasons = terms.find(line => line.startsWith("**Statement of reasons.**"))!;
    expect(reasons).toContain("When our question check refuses a question under the paragraph \"Questions that do not start a debate\" in section 7, the screen that tells you is our statement of reasons for it");
    expect(reasons).not.toMatch(/as hate speech, as religious insult/u);
    expect(terms.find(line => line.startsWith("Version 2.6 replaced version 2.5:")))
      .toContain("the screen that refuses a question is our statement of reasons for every question section 7 does not start (section 10)");
    const privacy = readFileSync("apps/ui/legal/en/privacy-policy.md", "utf8").split("\n");
    const row = privacy.find(line => line.startsWith("| Checking each question before a debate starts"))!;
    expect(row).toContain("refusing to start a debate whose question section 7 of our Terms of Service says does not start one");
    expect(row).toContain("keeping debates that could lead to harm, crime, hate speech or religious insult from starting");
    expect(privacy.find(line => line.includes("Version 3.6 replaced version 3.5")))
      .toContain("keeps nothing of any question (sections 3, 4 and 8)");
  });
});
