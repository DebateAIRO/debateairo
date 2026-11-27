### Task T09: Words in 35 languages and the words module

The upvote button's words (design §4, §7.4, §9.4): one spoken name with the count in each language's plural forms,
the signed-out line and the failure line, in all 35 `home.json` catalogues; and a small non-client module that picks
those words for the browser and writes the short count (`1.2k`). No component is built here: T11 builds the button
and T12 wires the row.

Depends on: nothing of this slice. May run alongside T01, T03, T04, T10 (no shared file). If another task shares
your working tree, run your typecheck and commit steps while no other task is in the middle of an edit, and read
every `git status` and typecheck expectation below as "nothing else of yours".

Two command forms are used below. Both start with the same prefix.
- vitest: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run <path>`
- a UI node test: `… pnpm --filter dialectical-engine-v2ui exec node --import tsx --test <path under apps/ui>`.
  These tests read `process.cwd()/messages` (`apps/ui/lib/i18n/catalog.test.mjs:9`), so they must run with
  `apps/ui` as the working directory. `pnpm --filter … exec` does that. Do not write `cd apps/ui && node …` after
  the prefix: the `PATH=` assignment would then apply to `cd` only and `node` would be the machine's Node 22.

**Files:**
- Create: `apps/ui/lib/upvoteWords.ts`
- Create: `tests/unit/public-upvote-words.test.ts`
- Modify: `apps/ui/messages/<locale>/home.json`, all 35 locales. In each file the last key line (the
  `home.flag.refused` line; its number per locale is in the table of Step 10) gains a comma, and the new lines go
  between it and the closing `}`. English: `apps/ui/messages/en/home.json:158-159`. Romanian:
  `apps/ui/messages/ro/home.json:159-160`.
- Modify: `apps/ui/messages/en/_notes.json:84-85` (comma on line 84, three notes before the closing `}`)
- Modify: `apps/ui/lib/i18n/translate.test.mjs:88-90` (one new `test(...)` after the test that ends on line 88,
  before `test("date and number helpers honor the requested locale"` on line 90)
- Test: `tests/unit/public-upvote-words.test.ts`, `apps/ui/lib/i18n/translate.test.mjs`, and unedited
  `apps/ui/lib/i18n/catalog.test.mjs`

**Interfaces:**
- Consumes: nothing from another task of this slice. From the tree as it is:
  `MessageCatalog` (`apps/ui/lib/i18n/translate.ts:7`), `tPlural(catalog, key, count, locale)` (`:32-53`),
  `formatNumber(locale, value, options?)` (`:95-105`).
- Produces, for T11 (the button) and T12 (the row):
  - Catalogue keys in namespace `home`, in all 35 languages:
    `home.upvote.label.<each language's CLDR plural categories>` (one plural root, `{count}` in every form, read
    with `tPlural(catalog, "home.upvote.label", count, locale)`); `home.upvote.signedOut` (no placeholder);
    `home.upvote.failed` (no placeholder). There is no `home.upvote.removeLabel`.
  - `apps/ui/lib/upvoteWords.ts` (no `"use client"`):
    `export function upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog` returns a frozen object holding
    exactly the entries of `catalog` whose key starts with `"home.upvote."`.
    `export function shortVoteCount(locale: string, count: number): string` returns the number shown in the box.
  - For T15: `apps/ui/lib/upvoteWords.ts` is a new shipped file that T15 adds to
    `tests/support/shipped-corpus.manifest.txt`.

**Before you start:**

Read these as templates.
- `apps/ui/lib/billing/roomCatalog.ts:1` and `:21-34`: a non-client words module. Copy the import with the `.js`
  suffix (`from "../i18n/translate.js"`; here `./i18n/translate.js`) and the doc comment that says why the picker
  lives outside the client file.
- `apps/ui/app/page.tsx:54-56` and `:94`: a picker by key prefix (`key.startsWith("auth.region.")`), frozen. A fixed
  key list cannot work here, because the plural forms differ per language.
- `apps/ui/lib/i18n/translate.test.mjs:55-88`: how a node test reads a real catalogue and pins rendered plurals.
- In every `home.json`: lines 39 to 44 (`home.models.*`, the plural forms that file needs and where it puts
  `{count}`), line 6 (`home.signInToStart`, that language's "sign in" verb and its form of address), and the
  `home.sensitiveConsent.failed` line (that language's "could not be saved. Try again.").

Traps.
- All 35 `home.json` files change in ONE commit. `catalog.test.mjs:33-43,56` demands, for every English plural
  root, exactly the language's CLDR categories in every language, and every English plain key in every language.
  A missing or extra key in one file fails the whole UI node suite and `tests/unit/v2ui-node-runner.test.ts`.
- Do not edit either allow-list in `catalog.test.mjs`: `numeralFreePluralForms` (`:16-31`) and `SAME_AS_ENGLISH`
  (`:79-95`). Every form keeps `{count}` (`:60-68`), and no value may equal the English value of the same key
  (`:97-108`).
- A plain key must not end in `.zero`, `.one`, `.two`, `.few`, `.many` or `.other` (`catalog.test.mjs:15`): it would
  be read as a plural form. `signedOut` and `failed` are safe.
- `tPlural` falls back to ENGLISH for the picked form before the language's own `.other`
  (`translate.ts:47-51`). A forgotten form never shows as a raw key, only as English. Only the tests catch it.
- `tPlural` always writes `{count}` as the raw number (`translate.ts:52`). The short count is never put in the name.
- `apps/ui/lib/upvoteWords.ts` must not start with `"use client"`. `PublicDebatesBuffer` is a server component and
  may not call an export of a client file (`apps/ui/scripts/server-client-boundary.source-test.mjs`).
- In `upvoteWords.ts`, do not assign an object literal holding strings to a variable whose name contains `label`,
  `copy`, `message`, `title`, `text`, `hint` or `placeholder` (`apps/ui/scripts/no-hardcoded-english.test.mjs:17`,
  `:49-62`). A plain string constant, and the suffixes `"k"` and `"M"`, pass.
- In `upvoteWords.ts`, write no array of numbers and no line with the word "depth": the shipped-corpus oracle
  reports numeric arrays (`tests/unit/s1-1-depth-contract.test.ts:312-314`).
- Do NOT edit `tests/support/shipped-corpus.manifest.txt`. T15 alone edits it. After this task
  `tests/unit/s1-1-depth-contract.test.ts` has ONE red test, "parses every shipped file with no syntactic
  diagnostic" (`:374-396`): `missing` is `[]` and `added` holds `apps/ui/lib/upvoteWords.ts`, beside any other file
  this slice has created by then (T01's loader, for one, when T01 shares the tree). That red is expected until T15.
- The test file of Step 1 writes the direction-control characters as `\u` escapes inside its regex, never as raw
  characters: a raw one is invisible, and losing it turns the class into one that matches a hyphen.
- Do not use `Intl` compact notation. It writes `1.2K`, rounds up, and adds spaces and direction marks.
- No new `*.test.mjs` file under `apps/ui` (it would need a line in `apps/ui/scripts/node-test-manifest.json`).
  `translate.test.mjs` is already listed there.
- Catalogue files stay raw UTF-8 with LF line ends, two-space indent, one `"key": "text"` per line, and end `}\n`.
  No `\u` escapes, no direction-control characters, no non-breaking spaces in the new values. Edit by appending
  lines; do not reorder or reword any existing key.
- `_notes.json` exists only under `en`. Add no notes file to another language.
- The pull request's `limits-check` job reads every added line and the commit message
  (`tools/limits-check.mjs:2-20`). Keep the count examples (`1.2k` and the like) out of the commit message.

- [ ] **Step 1: Write the failing vitest file**

Create `tests/unit/public-upvote-words.test.ts` with exactly these tests.

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tPlural } from "../../apps/ui/lib/i18n/translate.js";
import { shortVoteCount, upvoteMessageCatalog } from "../../apps/ui/lib/upvoteWords.js";

type Catalog = Record<string, string>;
const messagesRoot = join(process.cwd(), "apps/ui/messages");
const home = (locale: string): Catalog =>
  JSON.parse(readFileSync(join(messagesRoot, locale, "home.json"), "utf8")) as Catalog;
const LOCALES = readdirSync(messagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const ROOT = "home.upvote.label";
const PLAIN = ["home.upvote.signedOut", "home.upvote.failed"];
const COUNTS = [0, 1, 2, 3, 5, 11, 21, 100, 101, 1000];
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

describe("the upvote button's words (design 4 and 9.4)", () => {
  it("covers the 35 shipped locales", () => {
    expect(LOCALES).toHaveLength(35);
  });

  it("English and Romanian are the owner's wording, exactly", () => {
    expect(upvoteMessageCatalog(home("en"))).toEqual({
      "home.upvote.label.one": "Upvote. {count} vote",
      "home.upvote.label.other": "Upvote. {count} votes",
      "home.upvote.signedOut": "Sign in to upvote",
      "home.upvote.failed": "Your vote could not be saved. Try again."
    });
    expect(upvoteMessageCatalog(home("ro"))).toEqual({
      "home.upvote.label.one": "Votați. {count} vot",
      "home.upvote.label.few": "Votați. {count} voturi",
      "home.upvote.label.other": "Votați. {count} de voturi",
      "home.upvote.signedOut": "Autentificați-vă pentru a vota",
      "home.upvote.failed": "Votul dvs. nu a putut fi salvat. Încercați din nou."
    });
  });

  it("the picker hands over exactly each language's home.upvote keys, frozen", () => {
    for (const locale of LOCALES) {
      const catalog = home(locale);
      const picked = upvoteMessageCatalog(catalog);
      const forms = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.map((category) => `${ROOT}.${category}`);
      expect(Object.keys(picked).sort(), locale).toEqual([...forms, ...PLAIN].sort());
      for (const [key, value] of Object.entries(picked)) expect(value, `${locale}: ${key}`).toBe(catalog[key]);
      expect(Object.isFrozen(picked), locale).toBe(true);
    }
    expect(upvoteMessageCatalog({ "home.title": "x", "home.upvoted": "x", "chrome.logIn": "x" })).toEqual({});
  });

  it("every form of the name keeps {count} once, and no value carries another brace or a direction mark", () => {
    for (const locale of LOCALES) {
      const catalog = home(locale);
      for (const key of Object.keys(catalog).filter((name) => name.startsWith("home.upvote."))) {
        const value = catalog[key]!;
        const where = `${locale}: ${key}`;
        expect(value, where).toBe(value.trim());
        expect(BIDI_CONTROLS.test(value), where).toBe(false);
        expect(value.match(/\{[^{}]*\}|[{}]/gu) ?? [], where).toEqual(key.startsWith(`${ROOT}.`) ? ["{count}"] : []);
      }
      expect(Object.keys(catalog).filter((name) => name.startsWith(`${ROOT}.`)).length, locale).toBeGreaterThan(0);
    }
  });

  it("the name holds the number in every language and is never the English sentence", () => {
    const english = home("en");
    for (const locale of LOCALES) {
      const picked = upvoteMessageCatalog(home(locale));
      for (const count of COUNTS) {
        const name = tPlural(picked, ROOT, count, locale);
        expect(name, `${locale} ${count}`).toContain(String(count));
        expect(name, `${locale} ${count}`).not.toMatch(/[{}]/u);
        if (locale !== "en") expect(name, `${locale} ${count}`).not.toBe(tPlural(english, ROOT, count, "en"));
      }
      if (locale !== "en") for (const key of PLAIN) expect(picked[key], `${locale}: ${key}`).not.toBe(english[key]);
    }
  });
});

describe("shortVoteCount (design 4: counts of 1000 and more)", () => {
  it("writes the design's examples in English, never rounding up", () => {
    const table: ReadonlyArray<readonly [number, string]> = [
      [0, "0"], [1, "1"], [999, "999"], [1000, "1k"], [1049, "1k"], [1100, "1.1k"], [1249, "1.2k"], [1999, "1.9k"],
      [12_345, "12.3k"], [99_999, "99.9k"], [100_000, "100k"], [123_456, "123k"], [999_999, "999k"],
      [1_000_000, "1M"], [1_234_567, "1.2M"], [12_345_678, "12.3M"]
    ];
    for (const [count, shown] of table) expect(shortVoteCount("en", count), String(count)).toBe(shown);
  });

  it("takes the reader's decimal mark and keeps Latin digits in every language", () => {
    expect([999, 1000, 1249, 12_345, 123_456, 1_234_567].map((count) => shortVoteCount("ro", count)))
      .toEqual(["999", "1k", "1,2k", "12,3k", "123k", "1,2M"]);
    expect(shortVoteCount("en-GB", 1249)).toBe("1.2k");
    for (const locale of LOCALES) {
      for (const count of [7, 1000, 1249, 12_345, 99_999, 123_456, 1_234_567]) {
        expect(shortVoteCount(locale, count), `${locale} ${count}`).toMatch(/^[0-9]+(?:[.,][0-9])?[kM]?$/u);
      }
    }
  });

  it("answers a count that is not a whole number of votes without a broken number", () => {
    expect([-3, 2.9, Number.NaN].map((count) => shortVoteCount("en", count))).toEqual(["0", "2", "0"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail at the import**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-upvote-words.test.ts
```

Red: `Error: Cannot find module '…/apps/ui/lib/upvoteWords.js'`, then `Test Files  1 failed (1)` and
`Tests  no tests`.

- [ ] **Step 3: Add the failing node test for the rendered names**

In `apps/ui/lib/i18n/translate.test.mjs`, insert this test after line 88 (keep one blank line on each side). The
file already imports `t`, `tPlural`, `readFileSync`, `join`, `assert` and `test` (lines 1-6).

```js
test("the upvote button's spoken name is the owner's wording, with the count in each form", () => {
  const home = (locale) => JSON.parse(readFileSync(join(process.cwd(), "messages", locale, "home.json"), "utf8"));
  const named = (locale, counts) => counts.map((count) => tPlural(home(locale), "home.upvote.label", count, locale));

  assert.deepEqual(named("en", [0, 1, 2, 1234]), [
    "Upvote. 0 votes", "Upvote. 1 vote", "Upvote. 2 votes", "Upvote. 1234 votes"
  ]);
  assert.deepEqual(named("ro", [0, 1, 2, 19, 20, 100, 101, 1234]), [
    "Votați. 0 voturi", "Votați. 1 vot", "Votați. 2 voturi", "Votați. 19 voturi", "Votați. 20 de voturi",
    "Votați. 100 de voturi", "Votați. 101 voturi", "Votați. 1234 de voturi"
  ]);
  assert.equal(t(home("en"), "home.upvote.signedOut"), "Sign in to upvote");
  assert.equal(t(home("ro"), "home.upvote.signedOut"), "Autentificați-vă pentru a vota");
  assert.equal(t(home("en"), "home.upvote.failed"), "Your vote could not be saved. Try again.");
  assert.equal(t(home("ro"), "home.upvote.failed"), "Votul dvs. nu a putut fi salvat. Încercați din nou.");
});
```

- [ ] **Step 4: Run it and see it fail on the missing words**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/translate.test.mjs
```

Red: `tests 7`, `pass 6`, `fail 1`. The failing test is the new one; the actual value holds the raw key
`'home.upvote.label.other'` four times.

- [ ] **Step 5: Create the words module**

Create `apps/ui/lib/upvoteWords.ts`. No `"use client"`. One import:
`import { formatNumber, type MessageCatalog } from "./i18n/translate.js";`

```ts
export function upvoteMessageCatalog(catalog: MessageCatalog): MessageCatalog
export function shortVoteCount(locale: string, count: number): string
```

- `upvoteMessageCatalog`: the entries whose key starts with `"home.upvote."` (with the final dot), frozen. Its doc
  comment says: the button is a client component, so its props ship to the browser; these values, not the whole
  catalogue; picked by prefix because the plural forms a language has differ; `PublicDebatesBuffer`, a server
  component, calls it, which is why it lives outside the button's file.
- `shortVoteCount`, with `whole` = the count cut to a whole number and never below 0 (a value that is not a finite
  number counts as 0):
  - `whole` below 1000: `String(whole)`. No `Intl` call.
  - 1000 to 99,999: the number `Math.floor(whole / 100) / 10`, then `"k"`.
  - 100,000 to 999,999: the number `Math.floor(whole / 1000)`, then `"k"`.
  - from 1,000,000: the number `Math.floor(whole / 100_000) / 10`, then `"M"`.
  - The number is written by
    `formatNumber(locale, value, { maximumFractionDigits: 1, useGrouping: false, numberingSystem: "latn" })`.
    That call drops a trailing `.0` and gives the language's decimal mark. Divide whole numbers as written above
    (never `whole / 1000 * 10`), so no value is rounded up.
  - Its doc comment says: never rounds up, so the box never shows more votes than there are; the decimal mark is
    the language's own and the digits stay Latin, so the server and the browser write the same characters; the
    exact count is in the button's spoken name.

- [ ] **Step 6: Run the vitest file and see only the catalogue tests fail**

Run the command of Step 2. Expected: `Tests  4 failed | 4 passed (8)`. The three `shortVoteCount` tests and
"covers the 35 shipped locales" pass. The four that read `home.upvote.*` from the catalogues fail.

- [ ] **Step 7: Add the English words**

In `apps/ui/messages/en/home.json`, add a comma at the end of line 158 (`"home.flag.refused": "NOT APPROVED"`) and
append these four lines before the closing `}`:

```json
  "home.upvote.label.one": "Upvote. {count} vote",
  "home.upvote.label.other": "Upvote. {count} votes",
  "home.upvote.signedOut": "Sign in to upvote",
  "home.upvote.failed": "Your vote could not be saved. Try again."
```

- [ ] **Step 8: Add the Romanian words**

In `apps/ui/messages/ro/home.json`, add a comma at the end of line 159 (`"home.flag.refused": "NEAPROBATĂ"`) and
append these five lines before the closing `}`:

```json
  "home.upvote.label.one": "Votați. {count} vot",
  "home.upvote.label.few": "Votați. {count} voturi",
  "home.upvote.label.other": "Votați. {count} de voturi",
  "home.upvote.signedOut": "Autentificați-vă pentru a vota",
  "home.upvote.failed": "Votul dvs. nu a putut fi salvat. Încercați din nou."
```

- [ ] **Step 9: Run the node test of Step 3 and see it pass**

Run the command of Step 4. Green for that file: `tests 7`, `pass 7`, `fail 0`.

- [ ] **Step 10: Write the other 33 languages**

In each remaining `apps/ui/messages/<locale>/home.json`: add a comma to the `home.flag.refused` line and append,
in this order, `home.upvote.label.<form>` for each form of the language (in the order zero, one, two, few, many,
other), then `home.upvote.signedOut`, then `home.upvote.failed`.

| Plural forms the language needs | Locales | `home.flag.refused` is line | `home.sensitiveConsent.failed` is line | Lines to append |
|---|---|---|---|---|
| other | id ja ko vi zh | 157 | 116 | 3 |
| one, other | bg da de el et fi hi hu nl sv tr (and en, done) | 158 | 117 | 4 |
| one, many, other | es fr it pt | 159 | 118 | 5 |
| one, few, other | hr (and ro, done) | 159 | 118 | 5 |
| one, two, other | he | 159 | 118 | 5 |
| zero, one, other | lv | 159 | 118 | 5 |
| one, two, few, other | sl | 160 | 119 | 6 |
| one, few, many, other | cs lt pl ru sk uk | 160 | 119 | 6 |
| one, two, few, many, other | ga mt | 161 | 120 | 7 |
| zero, one, two, few, many, other | ar | 162 | 121 | 8 |

That is 97 forms of the name and 70 plain lines: 167 new lines in 35 files (9 of them written in Steps 7 and 8).

The rule every language follows, taken from the two approved ones:
1. **The name** is `<verb>. {count} <noun>`. The verb is the plain verb "to vote", said to the reader in the form
   of address that file already uses (read line 6, `home.signInToStart`: German "Sie", Romanian the polite plural,
   Polish and Italian the familiar form). Do not coin a word for "upvote" and do not keep the English word. After
   the verb comes that language's own sentence-ending mark, as its `home.sensitiveConsent.failed` line writes it
   (a full stop; `।` in Hindi; `。` in Japanese and Chinese), then a space where the language writes one, then
   `{count}` and the noun "vote".
2. **The noun's form** is the one that plural form needs. Put `{count}`, and any linking word, where the same
   file's `home.models.<form>` line puts them (Romanian `{count} de modele` → `{count} de voturi`).
3. **`{count}` is in every form, exactly once**, the zero, one and two forms included. Do not copy the Arabic
   `home.models.zero` and `.two` or the Hebrew `.two`, which have no numeral. Never write the number as a word:
   the `one` form also serves 0 in French and Portuguese, 21 in Latvian, Lithuanian, Russian, Ukrainian and
   Croatian, and 101 in Slovenian. The `many` form of Spanish, French, Italian and Portuguese serves 1,000,000.
   One form serves fractions only and is never shown for a whole count, but must be present and correct: `many`
   in Czech, Lithuanian and Slovak, `other` in Polish, Russian and Ukrainian.
4. **`home.upvote.signedOut`** is "<sign in> to <vote>": begin with the words the file's line 6
   (`home.signInToStart`) begins with, use the same verb for "vote" as the name, no placeholder, no full stop at
   the end (the English and Romanian lines have none). It is shown as one link.
5. **`home.upvote.failed`** is the file's own `home.sensitiveConsent.failed` sentence with "your vote" in place
   of "your answer". Its second sentence ("Try again.") is copied word for word.
6. **Typography.** The apostrophe the file already uses (`’` in fr, ga, it, mt). No direction-control character,
   no non-breaking space, no `\u` escape. Digits come only from `{count}`.
7. No value may equal the English value of the same key.

Then run:

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/catalog.test.mjs
```

Green: `tests 5`, `pass 5`, `fail 0`. A red line `<locale>/home keys` names a file with a missing or extra form;
`<locale>/home:<key> placeholders` names a form without `{count}`; `… is the English value` names an untranslated
line. Fix the catalogue, never the allow-lists. (Before this step the same command is red at `bg/home keys`.)

- [ ] **Step 11: Add the translators' notes**

In `apps/ui/messages/en/_notes.json`, add a comma at the end of line 84 (the `staff.previewBuyers.locked` note)
and append before the closing `}`:

```json
  "home.upvote.label.other": "The spoken name of the upvote button on a public debate's row, read by screen readers; the browser itself says whether the button is pressed. The verb first (vote for this debate), a full stop, then the debate's total number of upvotes. {count} is that total: keep {count} in EVERY plural form, the forms for zero, one and two included, and never write the number as a word.",
  "home.upvote.signedOut": "A short line that is itself a link to the sign-in page, shown when a person whose session has ended presses the upvote button. Begin with the verb home.signInToStart begins with.",
  "home.upvote.failed": "Shown by the row when a vote, or taking one back, could not be saved. The same shape as home.sensitiveConsent.failed."
```

- [ ] **Step 12: Verify**

Each command takes the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/unit/public-upvote-words.test.ts` | `Tests  8 passed (8)` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/translate.test.mjs` | `tests 7`, `pass 7`, `fail 0` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/catalog.test.mjs` | `tests 5`, `pass 5`, `fail 0`, with both allow-lists unedited |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test scripts/no-hardcoded-english.test.mjs` | `tests 4`, `pass 4` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test scripts/server-client-boundary.source-test.mjs` | `tests 2`, `pass 2` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/catalogThreading.test.mjs` | `tests 5`, `pass 5` |
| `pnpm --filter dialectical-engine-v2ui exec node --import tsx --test lib/i18n/catalogNamespaces.test.mjs` | `tests 2`, `pass 2` |
| `pnpm --filter dialectical-engine-v2ui test` | `tests 306`, `pass 306`, `fail 0` (the untouched tree has 305) |
| `pnpm exec vitest run tests/unit/offered-locales.test.ts` | `Tests  15 passed (15)`, file unedited |
| `pnpm exec vitest run tests/unit/quota-word-catalogues.test.ts` | `Tests  4 passed (4)`, file unedited |
| `pnpm exec vitest run tests/unit/public-lane.test.ts` | `Tests  25 passed (25)`, file unedited (it reads `_notes.json`) |
| `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | `Tests  1 failed \| 1010 passed (1011)`: only "parses every shipped file with no syntactic diagnostic", with `missing: []` and `added` holding only files this slice created (T15's six), `apps/ui/lib/upvoteWords.ts` among them. Expected until T15; do not edit the manifest. Any other red is yours. |
| `pnpm run audit:text-bytes` | `REPOSITORY_TEXT_CONTROL_BYTES=0` |
| `pnpm --filter dialectical-engine-v2ui typecheck` | exit 0 |
| `pnpm run typecheck` | exit 0 |
| `git diff --shortstat -- apps/ui/messages` | `36 files changed, 206 insertions(+), 36 deletions(-)` (per `home.json`: the lines of the Step 10 table plus the comma line; `_notes.json`: 4 and 1) |
| `grep -c 'u061C.u200E.u200F.u202A-.u202E.u2066-.u2069' tests/unit/public-upvote-words.test.ts` | `1`: the class is written with its seven escapes, as text (the text-bytes audit below does not look for these characters, so this line is the check) |
| `git status --short` | 35 `home.json`, `_notes.json`, `translate.test.mjs`, and the two new files, and nothing else of yours. The `??` lines under `docs/superpowers/` were there before and are not staged. |

- [ ] **Step 13: Stage this task's paths and run the limits check**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/ui/messages apps/ui/lib/upvoteWords.ts apps/ui/lib/i18n/translate.test.mjs tests/unit/public-upvote-words.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Never `git add -A` or `git add .`. Expected from the check: a `LIMITS_CHECK_NO_LIST: …` note, then
`LIMITS_CHECK_OK <n> added line(s) read.`, exit 0. `git diff --cached --name-only` then lists 39 paths.

- [ ] **Step 14: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The home catalogue has the upvote button's words in all 35 languages, and a words module picks them and shortens the count." -m "The button has one spoken name, home.upvote.label, with the count in every plural form of every language; whether it is pressed is the browser's to say. home.upvote.signedOut and home.upvote.failed are the two lines under it. upvoteMessageCatalog hands a client component only these keys, and shortVoteCount never rounds up, takes the reader's decimal mark and keeps Latin digits." -m "English and Romanian are the owner's wording. The other 33 languages are machine translations that still need a native review." -m "apps/ui/lib/upvoteWords.ts joins the shipped-file list in the slice's closing task; until then the corpus row of tests/unit/s1-1-depth-contract.test.ts is red by that one name." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
