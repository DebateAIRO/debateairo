### Task T14: The Privacy Policy 1.3 and the Terms of Service 1.2 name upvotes, in all 35 languages

Spec: `docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md` §7.5 ("Legal texts"), §9 decision 1.
Depends on: **T06** (the export README sentence this text repeats), **T09** (the word each language's button uses),
**T12** (the feature is whole) and **T16** (the hourly clean-up the retention row names; T01's table under it). It is the slice's last
commit before T15. It touches no file of any other task.

**Do not start Step 5 until the orchestrator says the owner approved the seven English passages of Steps 5 and 6,
and has answered the fourth open question of Step 1 (taking an upvote back when its debate is no longer on the
list).** If the owner changed a word, change it in Step 2's `ENGLISH` constant and in Steps 5 and 6 alike, then go on.
If the owner chose the reworded passages of that fourth question, they replace (a), (c) and (f) in the same places.

**Passage (d) is shared with T06.** The export's README (`apps/api/src/data-export/readme.ts:27`) ends with the same
sentence, and T06 committed it under the same approval round. If the owner changes passage (d) now, that file and
T06's test `tests/unit/public-debate-upvotes-export.test.ts` (its README case) change with it. That is a named
follow-up to T06: report it to the orchestrator, who has it made as its own small commit before this task's commit.
Do not edit those two files inside this task's commit, and do not leave the two sentences different.

If another task shares your working tree, run your typecheck, `generate:contract` and commit steps while no other
task is in the middle of an edit, and read every `git status` and typecheck expectation below as "nothing else of
yours". This task may overlap T08 and T13 (no shared file).

Every command below is run as written. All paths are relative to `dialectical-engine/`. Line numbers were read at
commit `c946564be`. The whole task was rehearsed on a throw-away clone of that commit (the English passages below,
English stand-ins in the 34 translations, every test edit below): what this file says a command prints, and which
tests move, is what that rehearsal showed.

**Files:**

- Create: `docs/legal/2026-11-26-public-debate-upvotes-privacy-1-3-terms-1-2.md`
- Create: `tests/unit/legal-public-debate-upvotes.test.ts`
- Create, by `legal-redate.mjs` only, never by hand: `apps/ui/legal/archive/<code>/<sha256>.md` × 70 (35 Privacy 1.3, 35 Terms 1.2)
- Modify: `apps/ui/legal/en/privacy-policy.md` — lines 5, 8, 22; one row before 49; one row after 88; one row before 167; line 207; line 271
- Modify: `apps/ui/legal/en/terms-of-service.md` — lines 5, 8, 24; one paragraph after 165; line 256
- Modify: `apps/ui/legal/<code>/privacy-policy.md` and `apps/ui/legal/<code>/terms-of-service.md` for the 34 other codes
  (`ar bg cs da de el es et fi fr ga he hi hr hu id it ja ko lt lv mt nl pl pt ro ru sk sl sv tr uk vi zh`): the same passages at the same places
- Modify: `apps/ui/scripts/generate-legal-data.mjs` — lines 99 and 116
- Modify: `apps/ui/lib/legal/pages.ts` — lines 599-603
- Modify: `deploy/preview-auth-dev/v1/MAIN-SITE.md` — lines 799-801 and 1010-1014
- Written by commands, never by hand: `apps/ui/lib/privacyPolicy.ts`, `apps/ui/lib/termsOfService.ts`,
  `apps/ui/lib/legal/<code>/privacyPolicy.ts` × 34, `apps/ui/lib/legal/<code>/termsOfService.ts` × 34,
  `packages/legal-manifest/src/manifest.json`, `apps/ui/legal/translated-from.json`
- Test (new): `tests/unit/legal-public-debate-upvotes.test.ts`
- Test (pins moved, Steps 4 and 14): `tests/unit/legal-reset-10.test.ts` 14-29, 37, 55-57, 74-79, 84, 116-120, 126-129, 135-136, 143, 152-155, 181, 186, 193, 201, 207, 219, 223-224, 237-240;
  `tests/unit/legal-privacy-page-memory-row.test.ts` 68-71, 93; `tests/unit/legal-privacy-analytics-clause.test.ts` 51, 57;
  `tests/unit/legal-privacy-billing-recipients.test.ts` 95, 102; `tests/unit/legal-english-first.test.ts` 114, 125, 142;
  `tests/unit/legal-manifest.test.ts` 88, 158, 167, 185; `tests/unit/legal-documents-data.test.ts` 92, 97, 489, 494, 527, 533;
  `tests/unit/legal-sign-in-methods.test.ts` 80-81; `tests/unit/data-export-privacy-policy.test.ts` 88, 124-125, 129;
  `tests/unit/preview-release-guide.test.ts` 1195, 1200, 1207, 1210, 1211; `tests/render/consent-policy-modal-render.test.tsx` 94, 224-225, 249;
  `tests/render/terms-modal-render.test.tsx` 137, 156, 225-226; `tests/render/legal-onboarding-locale.test.tsx` 23-24;
  `tests/render/legal-pages.test.tsx` 358, 366-372
- Test (guards, not edited, must stay green): `tests/unit/reply-language.test.ts`, `tests/unit/argument-language.test.ts`,
  `tests/unit/question-language-eld-tuning.test.ts`, `tests/unit/legal-public-debate-stays-public.test.ts`,
  `tests/unit/legal-documents-locale-complete.test.ts`, `tests/unit/legal-redate.test.ts`, and the rest of Step 15's list

**Interfaces:**

- Consumes:
  - T06: `account.json` holds `debates_you_upvoted: [{ debate_reference, upvoted_at }]`, and the export README says
    "It also holds the public debates you upvoted, and when." The Privacy Policy's Access row uses the same sentence.
  - T09: `home.upvote.label.*`, `home.upvote.signedOut` in `apps/ui/messages/<code>/home.json`. Each translation
    below names the upvote with the word that language's catalogue uses.
  - T01, T16 (behaviour the text states): one row per account per debate; taking it back deletes the row at once;
    the account's rows go when the account row is deleted, after the 7-day closure grace period; a debate hidden for
    review keeps its rows; the rows of a debate gone for good are deleted by the API's hourly pass.
- Produces:
  - `currentDocument("PRIVACY", <code>).version === "1.3"` and `currentDocument("TERMS", <code>).version === "1.2"` for
    all 35 codes; `reacceptanceFloor("PRIVACY") === "1.0"` and `reacceptanceFloor("TERMS") === "1.0"`, unchanged, so
    nobody is asked to accept again.
  - `TERMS_VERSIONS` with three rows (Step 7).
  - For T15: `pnpm run generate:legal:check` and `pnpm run legal:release-check` pass. No new shipped file to list.

**Before you start:**

Templates.
- `docs/legal/2026-11-24-recovery-help-privacy-1-2.md` (102 lines): the shape of the decision record. Copy its headings.
- `tests/unit/legal-privacy-page-memory-row.test.ts:24-49,78-100`: a row test over 35 languages. Step 2's test follows it,
  with `tests/support/legalText.ts` (`legalText`, `sectionBody`, `cells`) instead of its own readers.
- `apps/ui/legal/ro/privacy-policy.md:49,86,147` and `apps/ui/legal/fr/privacy-policy.md:49,86,147`: the register of a
  section 2 row, a section 4 row with `**Contract** — Art. 6(1)(b)`, and a section 7 row, in the two launch languages.

Traps.
1. **Both current versions are live.** `tests/n1-baseline.json:3` names commit `84891f69c`, which holds the archive copies
   of Privacy 1.2 and Terms 1.1. A changed byte under either number is refused (`apps/ui/scripts/generate-legal-data.mjs:686-690`,
   `LEGAL_MANIFEST_ARCHIVE_VERSION_REUSED`). So: Privacy **1.3**, Terms **1.2**, in all 35 languages together.
2. **A legal change lands whole.** English alone is red in seven files. Drafts, numbers, translations, record, archive
   and test edits go in one commit.
3. **`tests/unit/legal-public-debate-stays-public.test.ts:15,23-27`** refuses any English sentence that holds
   "you can" or "you may", then "take it back", "take them down", "unpublish", "delete", "remove" or "withdraw", and the
   letters "publi". The approved passages pass it ("pressing the button again takes it back" has no "you can"). Do not
   reword them.
4. **Write no date in a passage.** `legal-redate.mjs:150-154` replaces the old day wherever the English text, or a
   translation that follows it, gives it.
5. **Archive once, at the end (Step 13).** An archive copy made before a text is final blocks the release check
   ("the archive already holds a different text as version 1.2"). Running `legal-redate.mjs` again with the same day
   does not remake copies. The way back, before the commit only, is in Step 13.
6. **Never edit or delete a released copy** under `apps/ui/legal/archive/` (1.0, 1.1, Privacy 1.2):
   `legal-reset-10.test.ts:209-215` holds each to its hash.
7. **Recording a translation does not prove it was translated.** `--translated` passed with the English passages pasted
   into all 34 languages. What catches it: Step 2's test, and three language guards that read the legal pages as a
   corpus: `reply-language.test.ts:200-208` (every paragraph of 120 characters or more, and its first twelve words, must
   read as its own language), `argument-language.test.ts:346-363` (no Romanian sentence read as another language; wrong
   guesses under 0.32% of all sentences, 81 of 26,515 today, so only four or five more are tolerated across all languages),
   `question-language-eld-tuning.test.ts:29-58` (no Romanian/English confusion). If a real translation trips one,
   reword that sentence in that language. Never change a bar. If rewording cannot fix it, stop and report.
8. **`Art. ` is a counted token** (`legal-locale-check.mjs:17`). The new section 4 row adds one; every translation
   carries the literal `Art. 6(1)(b)`.
9. **Places that must not move** (rehearsed: none moves): in section 2, Payments second to last and the moderation
   notices row directly under the reports row; in section 7, Backups last; the end of the Portability row; section 14 of
   the Privacy Policy stays three paragraphs and section 14 of the Terms five (`legal-reset-10.test.ts:109,112`).
10. **The version line keeps the English words** `Version` and `Effective` in every language
    (`generate-legal-data.mjs:451-461`). Do not touch the day in an eyebrow or a version line by hand.
11. **`TERMS_VERSIONS` is kept by hand** (`pages.ts:599-603`). `legal-manifest.test.ts:402-432` holds it to the archive.
12. **The floors stay.** `generate-legal-data.mjs:95` and `:112` (`reacceptanceFrom: "1.0"`) are not edited.
13. **`legal-redate.test.ts` is not edited.** It builds its own stand-in release (`:57-62`) and stayed green.

---

- [ ] **Step 1: Write the decision record** `docs/legal/2026-11-26-public-debate-upvotes-privacy-1-3-terms-1-2.md`

Title: `# Upvotes on public debates, in the Privacy Policy (version 1.3) and the Terms of Service (version 1.2)`.
Then `Written on <today>.` and `These notes are not legal advice.` Then these headings, in this order:

- `## The facts` — what is kept (which debate, which account, when: `identity.public_debate_upvote`, step 0193); one per
  account per debate; taking it back deletes the row; rows go with the account row after the closure grace period; a
  debate hidden for review keeps them; the hourly pass deletes the rows of a debate gone for good; the list shows a
  count and no page shows who voted; the export's `account.json` lists them under `debates_you_upvoted`; nothing is
  kept in the browser; nothing goes to another company.
- `## The decision` — the owner's decision of 26 November 2026: both documents change in this slice, in all 35
  languages, in the same pull request as the feature; the re-acceptance floors stay at 1.0.
- `## What changed` — the seven English passages of Steps 5 and 6, word for word, each with its place; why new numbers
  (trap 1); the 34 translations, French and Romanian first, **none reviewed by a native speaker or by counsel**; one
  archive copy of each current text per language (70); the working day and that the upload sets the upload day with
  `pnpm run legal:redate`; `/terms/versions` now lists 1.2, 1.1 and 1.0; the tests that moved.
- `## Open: the legal basis of the new purpose` — the row says contract, Art. 6(1)(b); the owner's or counsel's word is
  recorded here. Leave the line `The owner's answer:` empty if the orchestrator gave none.
- `## Open: telling account holders before the feature is switched on` — quote Privacy Policy section 14 ("For a change
  that adds a new purpose or a new recipient we tell you before the new processing starts, by email and in the product,
  and give you time to object.") and Terms section 14 ("we post the new version with a summary of what changed and
  email you at least **30 days** before it takes effect"); say that no such notice exists in the code and that for 1.1
  the owner chose the upload day without the email because every account was his own
  (`docs/legal/2026-11-24-partner-model-out.md:98-99`). End with the line `The owner's answer:` and leave it empty
  unless the orchestrator gave one.
- `## Open: upvotes on debates about politics, religion or health` — section 3 is not changed; whether a kept upvote on
  such a debate is special-category data is a question for counsel.
- `## Open: taking an upvote back when its debate is no longer on the list` — the facts: the only vote control is on
  the home page's Public debates tab, which shows the newest 50 public debates and has no paging
  (`apps/ui/app/page.tsx:161`, `readPublicDebates(50, 0)`); the design allows no control on the debate's own page; a
  debate hidden for review is not on the list; and no page shows a person which debates they upvoted (only the
  export does). So for a debate older than the newest 50, or one that is hidden, there is no button to press, and
  "pressing the button again takes it back" and "Until you take the upvote back" cannot be done in the product. The
  upvote still goes with the account, and when the debate is gone for good. Two answers, the owner's to choose:
  (A) keep the seven passages as they are and accept a follow-up slice that adds a way to see and take back one's
  upvotes; (B) reword three passages now, as drafted under "Draft for answer (B)" at the end of Step 6. Record the
  owner's answer on the line `The owner's answer:`; leave it empty if the orchestrator gave none, and then do not
  start Step 5.

- [ ] **Step 2: Write the failing test** `tests/unit/legal-public-debate-upvotes.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";
import { cells, legalText, sectionBody, type LegalKind } from "../support/legalText.js";

/**
 * Upvotes on public debates, in the Privacy Policy (sections 2, 4, 7, 10 and 14) and the Terms of Service (sections 9
 * and 14). English is pinned word for word, as the owner approved it. Every language has the same rows and the same
 * paragraph at the same places, names the data the same way in sections 2, 4 and 7, and says it in its own words:
 * recording a translation (generate-legal-data.mjs --translated) compares structure only, so a pasted English row
 * would pass it.
 */
const ENGLISH = {
  collect: "| **Upvotes on public debates** | When you upvote a public debate: which debate, and when. Your upvote is tied to your account, so that it counts once and so that pressing the button again takes it back. The list of public debates shows only how many upvotes each debate has. No page shows who gave them, to other people or to our team | You, when you press the upvote button on the list of public debates |",
  purpose: "| Recording your upvotes on public debates, so that each account counts once for a debate and can take its upvote back, and showing how many upvotes each public debate has | Upvotes on public debates | **Contract** — Art. 6(1)(b) |",
  retain: "| Upvotes on public debates | Until you take the upvote back, or until the account is deleted after the closure grace period. A debate we hide while we review it keeps its upvotes, and they count again if it comes back | Deleted at once when you take it back, and the debate's count goes down by one. Deleted with the account. Also deleted, by an automatic clean-up that runs every hour, when the debate's public page is gone for good, as when our check deletes the debate (section 6) |",
  access: "It also holds each question you have not started yet, with your answers and paths. It also holds the public debates you upvoted, and when. |",
  policySummary: "Version 1.3 replaced version 1.2: sections 2, 4 and 7 now say that we keep which public debates you upvote and when, that the list of public debates shows only how many upvotes each debate has, and how long we keep an upvote. Section 10 now says that your export holds them. Version 1.2 replaced version 1.1: ",
  terms: "**Upvotes.** When you are signed in, you can upvote a debate on the list of public debates, your own included, to show other readers that you found it worth reading. Each account has one upvote for each debate, and pressing the button again takes yours back. The list shows how many upvotes each debate has and never who gave them. Your upvotes are deleted when the closure of your account takes effect (section 6), and a debate's upvotes are deleted when its public page is gone for good (Privacy Policy, section 7). Do not use more than one account, or any automated means, to change a count: section 6 allows you one account, and section 7 does not allow automated access.",
  termsSummary: "Version 1.2 replaced version 1.1: section 9 now says what an upvote on a public debate is, that each account has one for each debate and can take it back, that the list shows how many upvotes a debate has and never who gave them, and that a count must not be changed with more than one account or by automated means. Version 1.1 replaced version 1.0: "
} as const;

const CODES = LOCALES.map(({ code }) => code);
/** The body rows of a section's one table, without the header and the separator. */
const rows = (kind: LegalKind, code: string, section: number): string[] =>
  sectionBody(legalText(kind, code), section).split("\n").filter((line) => line.startsWith("| ")).slice(1)
    .filter((line) => !/^\|\s*-{3}/u.test(line));
const paragraphs = (kind: LegalKind, code: string, section: number): string[] =>
  sectionBody(legalText(kind, code), section).split("\n").filter((line) => line.trim() !== "");
/** Where each English passage stands in its section; every language has the same lines in the same order. */
const AT = {
  collect: rows("PRIVACY", "en", 2).indexOf(ENGLISH.collect),
  purpose: rows("PRIVACY", "en", 4).indexOf(ENGLISH.purpose),
  support: rows("PRIVACY", "en", 4).findIndex((row) => row.startsWith("| Answering support requests |")),
  retain: rows("PRIVACY", "en", 7).indexOf(ENGLISH.retain),
  terms: paragraphs("TERMS", "en", 9).indexOf(ENGLISH.terms)
};

describe("upvotes on public debates, in the Privacy Policy and the Terms of Service", () => {
  it("English says it in the approved words, at the approved places", () => {
    const collect = rows("PRIVACY", "en", 2);
    expect(collect).toHaveLength(19);
    expect([AT.collect - 1, AT.collect + 1].map((index) => cells(collect[index]!)[0])).toEqual(["**Support**", "**Reports you make**"]);
    const purpose = rows("PRIVACY", "en", 4);
    expect(purpose).toHaveLength(18);
    expect(purpose[AT.purpose - 1]!.startsWith("| Making a debate public")).toBe(true);
    expect(purpose[AT.purpose + 1]!.startsWith("| Checking the synthesis of each finished debate")).toBe(true);
    const retain = rows("PRIVACY", "en", 7);
    expect(retain).toHaveLength(34);
    expect([AT.retain - 1, AT.retain + 1].map((index) => cells(retain[index]!)[0]))
      .toEqual(["A debate our check deletes (section 6)", "A report you make with the Report button"]);
    expect(rows("PRIVACY", "en", 10)[0]!.endsWith(ENGLISH.access)).toBe(true);
    expect(paragraphs("PRIVACY", "en", 14).at(-1)!.split(ENGLISH.policySummary)).toHaveLength(2);
    const publishing = paragraphs("TERMS", "en", 9);
    expect(publishing[AT.terms - 1]!.startsWith("**Reports by anyone.**")).toBe(true);
    expect(publishing[AT.terms + 1]!.startsWith("**After the author leaves.**")).toBe(true);
    expect(paragraphs("TERMS", "en", 14).at(-1)!.startsWith(ENGLISH.termsSummary)).toBe(true);
  });

  it.each(CODES.map((code) => [code]))("%s: the same rows and the same paragraph at the same places, named the same way", (code) => {
    for (const section of [2, 4, 7]) expect(rows("PRIVACY", code, section), `${code}: section ${section} rows`).toHaveLength(rows("PRIVACY", "en", section).length);
    const collect = cells(rows("PRIVACY", code, 2)[AT.collect]!);
    expect(collect, `${code}: section 2 row shape`).toHaveLength(3);
    expect(collect[0], `${code}: a bold category`).toMatch(/^\*\*[^*]+\*\*$/u);
    const label = collect[0]!.slice(2, -2);
    const purpose = cells(rows("PRIVACY", code, 4)[AT.purpose]!);
    expect(purpose, `${code}: section 4 row shape`).toHaveLength(3);
    expect(purpose[1], `${code}: section 4 names the section 2 row`).toBe(label);
    expect(purpose[2], `${code}: the basis reads as in the support row`).toBe(cells(rows("PRIVACY", code, 4)[AT.support]!)[2]);
    expect(purpose[2], `${code}: the basis`).toContain("Art. 6(1)(b)");
    const retain = cells(rows("PRIVACY", code, 7)[AT.retain]!);
    expect(retain, `${code}: section 7 row shape`).toHaveLength(3);
    expect(retain[0], `${code}: section 7 names the section 2 row`).toBe(label);
    expect(retain[2], `${code}: a deleted debate points at section 6`).toMatch(/(?<![\d.])6(?!\d)/u);
    const publishing = paragraphs("TERMS", code, 9);
    expect(publishing, `${code}: section 9 paragraphs`).toHaveLength(paragraphs("TERMS", "en", 9).length);
    expect(publishing[AT.terms], `${code}: a paragraph with a bold lead`).toMatch(/^\*\*[^*]+\*\* \S/u);
    expect(publishing[AT.terms], `${code}: it points at sections 6 and 7`).toMatch(/(?<![\d.])6(?!\d)[\s\S]*(?<![\d.])7(?!\d)/u);
  });

  it.each(CODES.filter((code) => code !== "en").map((code) => [code]))("%s: in its own words, never the English ones", (code) => {
    expect(rows("PRIVACY", code, 2)[AT.collect], `${code}: section 2`).not.toBe(ENGLISH.collect);
    expect(cells(rows("PRIVACY", code, 2)[AT.collect]!)[1], `${code}: section 2, what is kept`).not.toBe(cells(ENGLISH.collect)[1]);
    expect(cells(rows("PRIVACY", code, 4)[AT.purpose]!)[0], `${code}: section 4, the purpose`).not.toBe(cells(ENGLISH.purpose)[0]);
    expect(cells(rows("PRIVACY", code, 7)[AT.retain]!).slice(1), `${code}: section 7`).not.toEqual(cells(ENGLISH.retain).slice(1));
    const policy = legalText("PRIVACY", code);
    expect(policy, `${code}: the export sentence`).not.toContain("It also holds the public debates you upvoted, and when.");
    expect(policy, `${code}: the Privacy Policy's summary`).not.toContain("sections 2, 4 and 7 now say that we keep which public debates you upvote");
    const terms = legalText("TERMS", code);
    expect(paragraphs("TERMS", code, 9)[AT.terms], `${code}: the Terms' paragraph`).not.toBe(ENGLISH.terms);
    expect(terms, `${code}: the Terms' paragraph`).not.toContain("When you are signed in, you can upvote a debate");
    expect(terms, `${code}: the Terms' summary`).not.toContain("section 9 now says what an upvote on a public debate is");
  });
});
```

- [ ] **Step 3: Run it and see it fail**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/legal-public-debate-upvotes.test.ts
```

Expected: `Tests  70 failed (70)`. The first case fails with `expected [ …(18) ] to have a length of 19 but got 18`.

- [ ] **Step 4: Move the pins of the existing tests** (thirteen files here, one more in Step 14; they go red now and green in Step 15; one commit holds them with the text, `tests/support/legalText.ts:9-14`)

`tests/unit/legal-reset-10.test.ts`:

| Line | Becomes |
| --- | --- |
| 14-29 | the header says: Privacy Policy 1.3 and Terms 1.2 add upvotes on public debates; the archive holds 1.0 (English, French, Romanian), 1.1 (35), the Privacy Policy's 1.2 (35), and one copy of each current text (35 each); `/terms/versions` lists 1.2, 1.1 and 1.0 |
| 37 | `const CURRENT: Readonly<Record<ResetKind, string>> = { PRIVACY: "1.3", TERMS: "1.2" };` |
| 55 | add `, "1.2": "ff1a970f8705e03f43aeb4aeaa3e36a835fb5005a43f4911b2ca7d7ccfcc9f77"` to `PRIVACY.en` |
| 56 | add `, "1.2": "3e45f14e7720e57bc1e656eb4cefe95eabf9238f41142fd922183df7e1d26cca"` to `PRIVACY.fr` |
| 57 | add `, "1.2": "4ff71c09879dbc8591ecdf92f4f985e99749f9229ad1c6c24efbf758e5246b3a"` to `PRIVACY.ro` |
| 74-79 | after the `"1.2"` entry add `"1.3": { en: "Version 1.3 replaced version 1.2: ", fr: "La version 1.3 a remplacé la version 1.2 : ", ro: "Versiunea 1.3 a înlocuit versiunea 1.2: " }` |
| 84 | title ends `Terms 1.2 and Privacy Policy 1.3 now` |
| 152-155 | `v1.1` → `v1.2` (two Terms lines), `v1.2` → `v1.3` (two Privacy lines) |
| 181 | add `"1.3"` after `"1.2"` in the list |
| 186 | name: `the archive holds exactly the released texts (1.0 in English, French and Romanian, 1.1 in all 35, the Privacy Policy's 1.2 in all 35) and one copy of each current text in all 35` |
| 193 | `let current = 0;` |
| 201 | `const released = entries.filter(([, entry]) => entry.version !== CURRENT[kind]);` |
| 207 | ``expect(released.map(([, entry]) => entry.version).sort(), `${kind} ${code}`).toEqual(kind === "PRIVACY" ? ["1.1", "1.2"] : ["1.1"]);`` |
| 219 | `current += atCurrent.length;` |
| 223-224 | `expect(current, "the current copies: the Privacy Policy's 1.3 and the Terms' 1.2").toBe(2 * CODES.length);` then `expect(listed).toHaveLength(3 * CODES.length + 2 * 3 + current);` (181 files) |
| 237 | name: `lists the Terms' 1.2, in force, and 1.1 and 1.0, each linked to its archived English text` |
| 239-240 | three rows: `{ version: "1.2", noteKey: "legal.versions.v2.note", current: true, href: "/terms" }`, ``{ version: "1.1", noteKey: "legal.archive.meta", current: false, href: `/terms/versions/${RELEASED.TERMS.en!["1.1"]}` }``, then the 1.0 row as it is |

Lines 116-120 (the Terms' summaries) become:

```ts
    // The Terms' two summaries, newest first, which every language carries: 1.2's (upvotes, section 9), then 1.1's.
    expect(named(terms[4]!, "1.2"), "1.2 is named in its own summary only").toBe(1);
    expect(named(terms[4]!, "1.1"), "1.1 is named by both summaries").toBe(2);
    expect(named(terms[4]!, "1.0"), "the Terms' summaries name 1.0 once").toBe(1);
    expect(terms[4], "and no other version").not.toMatch(/(?<![\d.])(?!1\.[012](?!\d))\d\.\d+(?!\d)/u);
    expect(terms[4], "1.1's names the company its change is about").toContain("DeepInfra");
    const nine = terms[4]!.search(/(?<![\d.])9(?!\d|\.\d)/u);
    expect(nine, "1.2's names the section it changed").toBeGreaterThanOrEqual(0);
    expect(nine, "and comes before 1.1's").toBeLessThan(terms[4]!.indexOf("DeepInfra"));
```

Lines 126-129 (the Privacy Policy's summaries) become:

```ts
    expect(named(summaries, "1.3"), "1.3 is named in its own summary only").toBe(1);
    expect(named(summaries, "1.2"), "1.2 is named by 1.3's summary and its own").toBe(2);
    expect(named(summaries, "1.1"), "1.1 is named by 1.2's summary and its own").toBe(2);
    expect(named(summaries, "1.0"), "1.0 is named once").toBe(1);
    expect(summaries, "and no other version").not.toMatch(/(?<![\d.])(?!1\.[0123](?!\d))\d\.\d+(?!\d)/u);
    // 1.3's summary (upvotes) comes before 1.2's, which names the model, and names section 10 (what the export holds).
    expect(privacy[2]!.slice(0, privacy[2]!.indexOf("Claude Haiku 5.5")), "1.3's names section 10").toMatch(/(?<![\d.])10(?!\d|\.\d)/u);
```

Lines 135-136 (launch languages, the Terms) become:

```ts
      expect(terms[4]!.startsWith(REPLACED["1.2"]![code]!), "the Terms' 1.2 summary comes first").toBe(true);
      expect(terms[4]!.split(REPLACED["1.1"]![code]!), "the Terms' 1.1 summary, once").toHaveLength(2);
      expect(terms[4]!.slice(0, terms[4]!.indexOf(REPLACED["1.1"]![code]!)), "1.2's names the section it changed").toMatch(/ 9 /u);
      expect(terms[4]!.slice(terms[4]!.indexOf(REPLACED["1.1"]![code]!)), "1.1's names the section it changed").toMatch(/ 8 /u);
```

Line 143 becomes:

```ts
      expect(at, "1.2's comes before 1.1's").toBeLessThan(last.indexOf(REPLACED["1.1"]![code]!));
      expect(last.split(REPLACED["1.3"]![code]!), "the Privacy Policy's 1.3 summary, once").toHaveLength(2);
      const thirteen = last.indexOf(REPLACED["1.3"]![code]!);
      expect(thirteen, "1.3's comes first").toBeLessThan(at);
      // The upvote rows in sections 2, 4 and 7, then what the export holds in section 10.
      expect(last.slice(thirteen, at), "1.3's names the parts it changed").toMatch(/ 2, 4 \S+ 7 .* 10 /u);
```

The other files:

| File | Line | Becomes |
| --- | --- | --- |
| `tests/unit/legal-privacy-page-memory-row.test.ts` | 68-71 | add the comment `// Privacy 1.3: upvotes on public debates, one row in each.`; `toHaveLength(18)` → `19`; `toHaveLength(33)` → `34` |
| same | 93 | `/v1\.2 /u` → `/v1\.3 /u`, message `now version 1.3` |
| `tests/unit/legal-privacy-analytics-clause.test.ts` | 51, 57 | `the text is 1.3`; `/v1\.3 /u`, message `now version 1.3` |
| `tests/unit/legal-privacy-billing-recipients.test.ts` | 95, 102 | comment `(1.1, 1.2 and 1.3)`; `/v1\.3 /u`, message `now version 1.3` |
| `tests/unit/legal-english-first.test.ts` | 114, 125, 142 | `version: "1.2"` → `version: "1.3"` (three places) |
| `tests/unit/legal-manifest.test.ts` | 88 | `kind === "TERMS" ? "1.2" : "1.3"` |
| same | 158 | `toEqual(["1.2", "1.3"])` |
| same | 167 | the floors refused as too high: `[{ TERMS: "1.3" }, { TERMS: "3.0" }, { PRIVACY: "1.4" }, { TERMS: "2.1", PRIVACY: "4.0" }]` |
| same | 185 | `[{ TERMS: "1.3", PRIVACY: null }, { TERMS: null, PRIVACY: "1.4" }, { TERMS: "v2", PRIVACY: null }]` |
| `tests/unit/legal-documents-data.test.ts` | 92, 97 | `v1.1` → `v1.2` |
| same | 489, 494 | `v1.2` → `v1.3` |
| same | 527, 533 | name `…into nineteen rows joined with em dashes`; `toHaveLength(19)` |
| `tests/unit/legal-sign-in-methods.test.ts` | 80 | `expect(history(terms)).toEqual(["Version 1.2 replaced", "Version 1.1 replaced"]);` |
| same | 81 | `expect(history(privacy)).toEqual(["Version 1.3 replaced", "Version 1.2 replaced", "Version 1.1 replaced"]);` |
| `tests/unit/data-export-privacy-policy.test.ts` | 88 | the string in the code block under this table |
| same | 124-125, 129 | comment `Privacy 1.1, 1.2 and 1.3 kept the floor at 1.0.`; name `(1.3)`; `toBe("1.3")` |
| `tests/render/consent-policy-modal-render.test.tsx` | 94, 249 | `v1.2` → `v1.3` |
| same | 224-225 | add `// Privacy 1.3: sections 2, 4 and 7 each gain a row on upvotes on public debates.`; `toBe(95)` → `toBe(98)` |
| `tests/render/terms-modal-render.test.tsx` | 137, 156 | `v1.1` → `v1.2` |
| same | 225-226 | add `// 123 since section 9 gained its paragraph on upvotes (Terms 1.2).`; `toBe(122)` → `toBe(123)` |
| `tests/render/legal-onboarding-locale.test.tsx` | 23-24 | comment `The Terms are at 1.2 and the Privacy Policy at 1.3`; `v1\.1` → `v1\.2`, `v1\.2` → `v1\.3`, `'ENDE DER NUTZUNGSBEDINGUNGEN · v1.2'` |

`tests/unit/data-export-privacy-policy.test.ts:88`, the pinned end of the Access row:

```ts
      "It also holds each question you have not started yet, with your answers and paths. It also holds the public debates you upvoted, and when. |",
```

`tests/render/legal-pages.test.tsx`: line 358's comment says the page lists 1.2, in force, and 1.1 and 1.0, each linked
to its archived text; line 366 expects `["1.2", "1.1", "1.0"]`; lines 367-372 (from `const older = rows[1]` to the
`toMatch(/^\*\*Version 1\.0 · Effective /mu)` line) become:

```ts
    // Each earlier version's row links to its archived English text.
    for (const [index, version] of [[1, "1.1"], [2, "1.0"]] as const) {
      const older = rows[index]?.querySelector("a")?.getAttribute("href") ?? "";
      expect(rows[index]?.querySelector(".legalVersionTag")).toBeNull();
      expect(rows[index]?.textContent).toContain(legalEnglish["legal.archive.meta"]);
      const archived = archivedLegalText("TERMS", older.replace("/terms/versions/", ""), "en");
      expect(archived?.version, older).toBe(version);
      expect(archived?.text).toMatch(new RegExp(`^\\*\\*Version ${version.replace(".", "\\.")} · Effective `, "mu"));
    }
```

`tests/unit/preview-release-guide.test.ts` is edited in Step 14, with the runbook.

- [ ] **Step 5: The English Privacy Policy** `apps/ui/legal/en/privacy-policy.md` (five passages; the day is not touched)

Line 5 `· v1.2 ·` → `· v1.3 ·`. Line 8 ends `· v1.3`. Line 22 starts `**Version 1.3 · Effective`.

(a) Section 2, a new row between line 48 and line 49. Its neighbours, for the style: `| **Support** | What you write to
the support assistant. … | You |` above; `| **Reports you make** | When you use the Report button on a public debate:
the debate, where in it and what you wrote, and that you made the report. Only admins who review can see your name. …
| You, when you use the Report button; our team, when it closes a report |` below.

```
| **Upvotes on public debates** | When you upvote a public debate: which debate, and when. Your upvote is tied to your account, so that it counts once and so that pressing the button again takes it back. The list of public debates shows only how many upvotes each debate has. No page shows who gave them, to other people or to our team | You, when you press the upvote button on the list of public debates |
```

(b) Section 4, a new row between line 88 (`| Making a debate public — when you publish it or, on the Free plan, when it
finishes — … | **Contract** — Art. 6(1)(b): a public debate is the service you asked for. … |`) and line 89
(`| Checking the synthesis of each finished debate …`). Its twin for the basis cell is line 86:
`| Answering support requests | Support | **Contract** — Art. 6(1)(b) |`.

```
| Recording your upvotes on public debates, so that each account counts once for a debate and can take its upvote back, and showing how many upvotes each public debate has | Upvotes on public debates | **Contract** — Art. 6(1)(b) |
```

(c) Section 7, a new row between line 166 (`| A debate our check deletes (section 6) | Not kept: deleted at once, as
when you delete a debate yourself | Three traces remain: … |`) and line 167 (`| A report you make with the Report button
| The words: six months after the report is closed. … |`). Its twin is line 147: `| Declared country of residence and US
state | Until the account is deleted after the closure grace period | Deleted with the account |`.

```
| Upvotes on public debates | Until you take the upvote back, or until the account is deleted after the closure grace period. A debate we hide while we review it keeps its upvotes, and they count again if it comes back | Deleted at once when you take it back, and the debate's count goes down by one. Deleted with the account. Also deleted, by an automatic clean-up that runs every hour, when the debate's public page is gone for good, as when our check deletes the debate (section 6) |
```

(d) Section 10, the Access row (line 207): one sentence before the closing ` |`. The row ends today
`… It also holds each question you have not started yet, with your answers and paths. |`; the sentence before it reads
`It also holds your moderation notices, each with its statement of reasons, and, for each report you made, how it was
closed and which emails we sent you about it.` Do not touch the Portability row (line 212).

```
 It also holds the public debates you upvoted, and when.
```

(e) Section 14 (line 271), in the same paragraph, between `This policy was last updated on 25 November 2026.` and
`Version 1.2 replaced version 1.1: sections 2, 4 and 7 now say that you can ask for help getting back into your
account …`, followed by one space:

```
Version 1.3 replaced version 1.2: sections 2, 4 and 7 now say that we keep which public debates you upvote and when, that the list of public debates shows only how many upvotes each debate has, and how long we keep an upvote. Section 10 now says that your export holds them.
```

Not touched: line 59 (it stays true, because the table now lists the row), section 3, Annex B.

- [ ] **Step 6: The English Terms of Service** `apps/ui/legal/en/terms-of-service.md` (two passages)

Line 5 `· v1.1 ·` → `· v1.2 ·`. Line 8 ends `· v1.2`. Line 24 starts `**Version 1.2 · Effective`.

(f) Section 9, a new paragraph with a blank line above and below, between line 165 (`**Reports by anyone.** Anyone with
credit can write a report on a public debate while nothing is still being added to it, using their own quota. The
report is public. …`) and line 167 (`**After the author leaves.** A public debate stays open to contributions after its
first author has erased their account. …`). The rule on counts rests on what the Terms already say: line 85 ("You may
hold one account unless we agree otherwise.") and line 113 ("do not access the service automatically").

```
**Upvotes.** When you are signed in, you can upvote a debate on the list of public debates, your own included, to show other readers that you found it worth reading. Each account has one upvote for each debate, and pressing the button again takes yours back. The list shows how many upvotes each debate has and never who gave them. Your upvotes are deleted when the closure of your account takes effect (section 6), and a debate's upvotes are deleted when its public page is gone for good (Privacy Policy, section 7). Do not use more than one account, or any automated means, to change a count: section 6 allows you one account, and section 7 does not allow automated access.
```

(g) Section 14 (line 256), at the start of the same paragraph, before `Version 1.1 replaced version 1.0: section 8 now
says that DeepInfra runs on its own servers every model a debate is given through it, and the summary was changed to
match.`, followed by one space:

```
Version 1.2 replaced version 1.1: section 9 now says what an upvote on a public debate is, that each account has one for each debate and can take it back, that the list shows how many upvotes a debate has and never who gave them, and that a count must not be changed with more than one account or by automated means.
```

**Draft for answer (B)** of the fourth open question (Step 1). Used only if the owner chose (B); then these replace
the matching sentences of (a), (c) and (f), and Step 2's `ENGLISH` constant follows. They are drafts awaiting the
owner, like the seven passages. None holds "you can" or "you may" beside "take … back" (trap 3).

- In (a), the second sentence becomes: `Your upvote is tied to your account, so that it counts once and so that pressing the button again takes it back while the debate is on the list of public debates.`
- In (c), the first cell becomes: `Until you take the upvote back, which the button does while the debate is on the list of public debates, or until the account is deleted after the closure grace period. A debate we hide while we review it keeps its upvotes, and they count again if it comes back`
- In (f), the second sentence becomes: `Each account has one upvote for each debate, and pressing the button again takes yours back while the debate is on the list.`

- [ ] **Step 7: The two numbers in code, and the Terms' versions list**

`apps/ui/scripts/generate-legal-data.mjs:99` → `versionAnchor: "Version 1.3",` and `:116` → `versionAnchor: "Version 1.2",`.

`apps/ui/lib/legal/pages.ts:599-603` becomes (the middle hash is the released English Terms 1.1, `legal-reset-10.test.ts:60`):

```ts
export const TERMS_VERSIONS: readonly TermsVersion[] = Object.freeze([
  { version: "1.2", noteKey: "legal.versions.v2.note", current: true, href: "/terms" },
  { version: "1.1", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/49412a20009903fb70679a9fe0451fa27dd92aa2643af4566cee6064575ee8c8" },
  { version: "1.0", noteKey: "legal.archive.meta", current: false,
    href: "/terms/versions/737971b09f371ef4c0266610b58c563df067caf3a4ddf52ae55204aa689610d2" }
]);
```

- [ ] **Step 8: The number in the 68 translated drafts**

In each `apps/ui/legal/<code>/privacy-policy.md`: the `eyebrow:` line ` · v1.2 · ` → ` · v1.3 · `; the `endMarker:` line
ends ` · v1.3`; the version line starts `**Version 1.3 · `. In each `apps/ui/legal/<code>/terms-of-service.md`: the same
three lines, `1.1` → `1.2`. Nothing else on those lines changes (trap 10).

Check (it lists a draft that does not carry its new number):

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -L "^\*\*Version 1\.3 · " apps/ui/legal/*/privacy-policy.md; grep -L "^\*\*Version 1\.2 · " apps/ui/legal/*/terms-of-service.md
```

Expected: no output.

- [ ] **Step 9: French and Romanian, sentence for sentence**

In `fr` and `ro`, put the seven passages at the same places: the same neighbour above and the same neighbour below as
in English (in each language a section has the same lines in the same order). Rules, for these two and for Step 10:

- The category of the section 2 row (between `**`), the Data cell of the section 4 row and the first cell of the
  section 7 row are **the same words**, letter for letter.
- The basis cell of the section 4 row is copied from that language's own "Answering support requests" row
  (`ro:86`, `fr:86`): `**Contract** — Art. 6(1)(b)`, `**Contrat** — Art. 6(1)(b)`.
- "Upvote" is the word of that language's `home.upvote.label.*` and `home.upvote.signedOut`
  (`apps/ui/messages/<code>/home.json`, T09). "Public debate", "account", "closure grace period", "our check" and
  "section" are the words that language's text already uses (copy them from the neighbour rows).
- Section numbers stay as digits: the section 7 row names section 6; the Terms paragraph names 6, then 7, then 6 and 7
  again; the Privacy summary names 2, 4, 7 and 10; the Terms summary names 9.
- The Privacy summary goes in the last paragraph of section 14, after the "last updated" sentence and before that
  language's 1.2 summary. The Terms summary goes at the start of the last paragraph of section 14, before that
  language's 1.1 summary. No new paragraph in either.
- The summaries open exactly so (pinned in Step 4): French `La version 1.3 a remplacé la version 1.2 : ` (Privacy) and
  `La version 1.2 a remplacé la version 1.1 : ` (Terms); Romanian `Versiunea 1.3 a înlocuit versiunea 1.2: ` and
  `Versiunea 1.2 a înlocuit versiunea 1.1: `. In these two languages the Privacy summary must read `… 2, 4 <and> 7 …`
  and later ` 10 `, and the Terms summary ` 9 `, each with a space on both sides.
- No square brackets, no email address, no `dezbatere.ro/…` path, no date in any passage.

- [ ] **Step 10: The other 32 languages**

`ar bg cs da de el es et fi ga he hi hr hu id it ja ko lt lv mt nl pl pt ru sk sl sv tr uk vi zh`: the same seven
passages by the rules of Step 9. Each summary opens with that language's own wording of its existing summary (the
Privacy Policy's 1.2 summary, the Terms' 1.1 summary), with the numbers moved up. A version number is never written
directly after a digit or an ASCII full stop without a space (`legal-reset-10.test.ts:81-82` would not count it);
after `。` it is fine. These are written by you from the approved English; nobody reviews them, and Step 1's record
says so.

- [ ] **Step 11: Regenerate, and record the 68 translations**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm generate:legal
```

Expected: exit 0; 70 lines ending `: written` for the modules, `packages/legal-manifest/src/manifest.json: written`, and
two notes `privacy: 34 translation(s) follow an older English text (…)` and `terms: 34 translation(s) follow …`. A line
`INVALID (Frozen version anchor must start …)` names a draft Step 8 missed.

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node apps/ui/scripts/generate-legal-data.mjs --translated --locale ar --locale bg --locale cs --locale da --locale de --locale el --locale es --locale et --locale fi --locale fr --locale ga --locale he --locale hi --locale hr --locale hu --locale id --locale it --locale ja --locale ko --locale lt --locale lv --locale mt --locale nl --locale pl --locale pt --locale ro --locale ru --locale sk --locale sl --locale sv --locale tr --locale uk --locale vi --locale zh
```

Expected: exit 0 and 68 lines, `<code>/privacy: recorded as translated from English 1.3 (<12 hex>)` and
`<code>/terms: recorded as translated from English 1.2 (<12 hex>)`. A line `NOT RECORDED (<reason>)` names a draft whose
structure differs from English (a missing row, a lost `Art. `): fix that draft and run the command again.

- [ ] **Step 12: Check the words before anything is archived**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && for f in tests/unit/legal-public-debate-upvotes.test.ts tests/unit/legal-public-debate-stays-public.test.ts tests/unit/reply-language.test.ts tests/unit/argument-language.test.ts tests/unit/question-language-eld-tuning.test.ts; do out=$(PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run "$f" 2>&1) && echo "PASS $f" || { echo "FAIL $f"; echo "$out" | grep -E "^ (FAIL|×)|AssertionError" | head -20; }; done
```

Expected: five `PASS` lines (run alone, the files show 70, 6, 161, 182 and 9 cases passed). A `FAIL` of one of the
three language tests prints the sentence it refused: reword it in that language (trap 7), run Step 11 again, then this
step. Do not go on while one fails: after Step 13 a changed text costs the way back written there.

- [ ] **Step 13: The working day and the archive**

The day is today in Romania, and it must be after 25 November 2026. Print it, then run the dry run and the real run
with that day in place of `YYYY-MM-DD`:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools TZ=Europe/Bucharest date +%F
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node apps/ui/scripts/legal-redate.mjs --date YYYY-MM-DD --dry-run
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node apps/ui/scripts/legal-redate.mjs --date YYYY-MM-DD
```

Expected from the dry run: `Privacy Policy: from 25 November 2026 to <day>; translations recorded again: ar, bg, … zh`,
`Terms of Service: from 24 November 2026 to <day>; translations recorded again: ar, bg, … zh`, and
`dry run: 70 draft(s) would change; nothing was written`. Neither document prints `released, keeps`.
Expected from the real run: 70 lines ending `: archived`, then `Legal texts: ready for release. …`, then
`LEGAL_REDATE_DONE: the Privacy Policy and the Terms of Service take effect on <day>; commit what changed`.
`LEGAL_REDATE_REFUSED: … follows an older English text` means Step 11's second command was not run after the last edit.

The way back, if a text must change after this step and before the commit (rehearsed): edit the draft; then

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git clean -f -q apps/ui/legal/archive && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git checkout -q -- packages/legal-manifest/src/manifest.json
```

(the 70 new copies are untracked, so only they go; the released copies are tracked and stay), then Step 11's two
commands, then

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:legal:archive
```

which prints 70 lines ending `: archived`.

- [ ] **Step 14: The runbook's two passages and their pins**

`deploy/preview-auth-dev/v1/MAIN-SITE.md`, lines 799-801 become these three lines:

```
goes live on the site at DR6. Today the Terms 1.1 and the Privacy Policy 1.2 are on the live site and keep their days,
24 November 2026 and 25 November 2026; a newer version of either takes the upload day. This upload carries the Terms
1.2 and the Privacy Policy 1.3, both new versions, which take the upload day. Check both, in the same folder:
```

and lines 1010-1014 become these five lines:

```
the live site already carries must show its live day (in this upload neither text), and a new version must show
today (in this upload both, the Terms 1.2 and the Privacy Policy 1.3; the release guide's section "The legal texts'
day", `deploy/preview-release/v1/README.md`). If a line shows another day, stop before piece 1 and ask. PRECHECK (step
14) reads both texts by the same rule. In this upload it prints `legal day: terms-of-service 1.2, new in this release,
takes <today>` and `legal day: privacy-policy 1.3, new in this release, takes <today>`. Its `legal-date`
```

"Today … on the live site" is what `tests/n1-baseline.json` records (trap 1). Nothing else in the runbook changes.

`tests/unit/preview-release-guide.test.ts`, the same words in its pins (the test reads the runbook with every run of
white space as one space, so each pin is one line):

- Line 1195: inside the string, `Today the Terms 1.1 and the Privacy Policy 1.1 are on the live site and keep 24 November 2026; a newer version of either takes the upload day. This upload carries the Terms 1.1, which keep 24 November 2026, and the Privacy Policy 1.2, a new version, which takes the upload day.` becomes `Today the Terms 1.1 and the Privacy Policy 1.2 are on the live site and keep their days, 24 November 2026 and 25 November 2026; a newer version of either takes the upload day. This upload carries the Terms 1.2 and the Privacy Policy 1.3, both new versions, which take the upload day.`
- Line 1200: inside the string, `(in this upload the Terms 1.1: 24 November 2026), and a new version must show today (in this upload the Privacy Policy 1.2; the release guide` becomes `(in this upload neither text), and a new version must show today (in this upload both, the Terms 1.2 and the Privacy Policy 1.3; the release guide`. The rest of the string stays.
- Line 1207: inside the string, ``In this upload it prints `legal day: terms-of-service 1.1, in the live release, keeps 24 November 2026` and `legal day: privacy-policy 1.2, new in this release, takes <today>`.`` becomes ``In this upload it prints `legal day: terms-of-service 1.2, new in this release, takes <today>` and `legal day: privacy-policy 1.3, new in this release, takes <today>`.``
- Line 1210 becomes `    expect(read('apps/ui/legal/en/terms-of-service.md')).toMatch(/Version 1\.2 · Effective /u);`
- Line 1211 becomes `    expect(read('apps/ui/legal/en/privacy-policy.md')).toMatch(/Version 1\.3 · Effective /u);`

Lines 2321-2342 of that file also say `terms-of-service 1.1`: they are a made-up release in a PRECHECK case. Leave them.

- [ ] **Step 15: Verify**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:legal:check
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run legal:release-check
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && for f in tests/unit/legal-public-debate-upvotes.test.ts tests/unit/legal-reset-10.test.ts tests/unit/legal-privacy-page-memory-row.test.ts tests/unit/legal-privacy-analytics-clause.test.ts tests/unit/legal-privacy-billing-recipients.test.ts tests/unit/legal-english-first.test.ts tests/unit/legal-manifest.test.ts tests/unit/legal-documents-data.test.ts tests/unit/legal-sign-in-methods.test.ts tests/unit/data-export-privacy-policy.test.ts tests/unit/preview-release-guide.test.ts tests/render/consent-policy-modal-render.test.tsx tests/render/terms-modal-render.test.tsx tests/render/legal-onboarding-locale.test.tsx tests/render/legal-pages.test.tsx tests/unit/legal-public-debate-stays-public.test.ts tests/unit/reply-language.test.ts tests/unit/argument-language.test.ts tests/unit/question-language-eld-tuning.test.ts tests/unit/legal-documents-locale-complete.test.ts tests/unit/legal-chrome-version.test.ts tests/unit/legal-redate.test.ts tests/unit/legal-release-languages.test.ts tests/unit/legal-report-button.test.ts tests/unit/legal-privacy-payments-row.test.ts tests/unit/legal-privacy-payments-backups.test.ts tests/unit/legal-privacy-saved-questions.test.ts tests/unit/legal-tests-read-the-text-as-it-is.test.ts tests/unit/legal-terms-launch-text.test.ts tests/unit/sf-s04-refusal-terms-sections.test.ts tests/unit/partner-served-line-up.test.ts tests/unit/main-site-review-window.test.ts tests/render/legal-versions-pages.test.tsx tests/render/legal-document-locale-render.test.tsx tests/render/legal-accept-gate.test.tsx tests/architecture/ci-fast-path.test.ts; do out=$(PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run "$f" 2>&1) && echo "PASS $f" || { echo "FAIL $f"; echo "$out" | grep -E "^ (FAIL|×)|AssertionError" | head -20; }; done
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui typecheck
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short
```

| Command | Expected |
| --- | --- |
| `generate:legal:check` | exit 0; 73 lines, each ending `: up to date` |
| `legal:release-check` | exit 0; `Legal texts: ready for release. Every language this release offers (ar, bg, … zh) follows the current English text, and the archive holds their current texts.` |
| the loop | 36 `PASS` lines and no `FAIL`. `legal-reset-10` shows 113 cases, the new test 70 |
| both typechecks | exit 0 |
| `git status --short` | of this task: 70 drafts, 70 generated modules, `translated-from.json`, `manifest.json`, `generate-legal-data.mjs`, `pages.ts`, `MAIN-SITE.md` and 14 test files modified; 70 files under `apps/ui/legal/archive/`, the new test and the new record untracked. No released archive copy is modified or deleted |

In the rehearsal, with every edit of Steps 4, 7 and 14 and English stand-ins in the translations, `tests/unit`,
`tests/architecture` and `tests/render` showed no failure beyond the cases that catch an untranslated passage.

- [ ] **Step 16: Commit**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/ui/legal apps/ui/lib/legal apps/ui/lib/privacyPolicy.ts apps/ui/lib/termsOfService.ts apps/ui/scripts/generate-legal-data.mjs packages/legal-manifest/src/manifest.json deploy/preview-auth-dev/v1/MAIN-SITE.md docs/legal/2026-11-26-public-debate-upvotes-privacy-1-3-terms-1-2.md tests/unit/legal-public-debate-upvotes.test.ts tests/unit/legal-reset-10.test.ts tests/unit/legal-privacy-page-memory-row.test.ts tests/unit/legal-privacy-analytics-clause.test.ts tests/unit/legal-privacy-billing-recipients.test.ts tests/unit/legal-english-first.test.ts tests/unit/legal-manifest.test.ts tests/unit/legal-documents-data.test.ts tests/unit/legal-sign-in-methods.test.ts tests/unit/data-export-privacy-policy.test.ts tests/unit/preview-release-guide.test.ts tests/render/consent-policy-modal-render.test.tsx tests/render/terms-modal-render.test.tsx tests/render/legal-onboarding-locale.test.tsx tests/render/legal-pages.test.tsx
```

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The Privacy Policy 1.3 and the Terms of Service 1.2 say what an upvote on a public debate is, in all 35 languages." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Never `git add -A` or `git add .`. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this
worktree; nothing is pushed. The last `-m` is the attribution line; if your session's instructions give another
one, use theirs.

Expected: one commit with 231 files changed (159 modified, 72 new).
