import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openSync } from "fontkit";
import { LOCALES } from "../i18n/locales.ts";
import { reportSupportedForLocale } from "./reportLanguage.ts";

const fontRoot = new URL("../../assets/fonts/", import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, fontRoot));

// Only the faces the PDF and the story panel use: Fraunces 600 for the fixed
// headings, Plus Jakarta Sans 400, 400 italic and 700 for everything else.
const FONTS = [
  "fraunces/Fraunces9pt-SemiBold.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Regular.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Italic.ttf",
  "plus-jakarta-sans/PlusJakartaSans-Bold.ttf"
];
const SANS = FONTS.filter((font) => font.startsWith("plus-jakarta-sans/"));
// The standard PDF fonts cannot print ș and ț; every vendored face must.
const ROMANIAN = [..."șțăîâȘȚĂÎÂ„”"];
// The list of points and the story text print these in the sans face.
const ARITHMETIC = [..."→≈·—…"];

// R2 (spec §14.3): each interface locale's own letters, upper and lower case,
// the ones a report in that language prints beyond plain a–z. A language the
// report prints must find every one in every vendored face; the ten it refuses
// (reportSupportedForLocale) must not be printable, so the refusal is the fonts'
// truth, not a guess. New script fonts would move a locale from one half to the
// other, and this test with it.
const LETTERS = Object.freeze({
  bg: "абвгдежзийклмнопрстуфхцчшщъьюяАБВГ", cs: "ěščřžýáíéůúťďňĚŠČŘŽÝÁÍÉŮÚŤĎŇ", da: "æøåÆØÅ", de: "äöüßÄÖÜ",
  el: "αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔ", en: "’“”", es: "ñáéíóúü¿¡ÑÁÉ", et: "õäöüšžÕÄÖÜŠŽ", fi: "äöåÄÖÅ",
  fr: "àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ«»", ga: "áéíóúÁÉÍÓÚ", he: "אבגדהוזחטיכלמנסעפצקרשת", hi: "अआइईउऊकखगघ",
  hr: "čćđšžČĆĐŠŽ", hu: "áéíóöőúüűÁÉÍÓÖŐÚÜŰ", id: "", it: "àèéìòùÀÈÉÌÒÙ", ja: "日本語のテキスト", ko: "한국어텍스트",
  lt: "ąčęėįšųūžĄČĘĖĮŠŲŪŽ", lv: "āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ", mt: "ċġħżĊĠĦŻ", nl: "éëïÉËÏ", pl: "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
  pt: "ãõçáéíóúâêôàÃÕÇ", ro: "ăâîșțĂÂÎȘȚ„”", ru: "абвгдеёжзыэюяАБВЁ", sk: "áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ",
  sl: "čšžČŠŽ", sv: "åäöÅÄÖ", tr: "çğıİöşüÇĞÖŞÜ", uk: "абвгґдеєжзиіїйАБВГҐЄІЇ", ar: "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
  vi: "ăâđêôơưĂÂĐÊÔƠƯạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ", zh: "中文文本"
});

const missing = (font, characters) => {
  const face = openSync(path(font));
  return characters.filter((character) => !face.hasGlyphForCodePoint(character.codePointAt(0)));
};

test("every vendored report font prints Romanian letters and quotes", () => {
  for (const font of FONTS) assert.deepEqual(missing(font, ROMANIAN), [], font);
});

test("the sans family prints the report's symbols", () => {
  for (const font of SANS) assert.deepEqual(missing(font, ARITHMETIC), [], font);
});

test("the report prints exactly the languages whose letters every vendored face carries", () => {
  assert.deepEqual(Object.keys(LETTERS).sort(), LOCALES.map(({ code }) => code).sort());
  for (const { code } of LOCALES) {
    const printable = FONTS.every((font) => missing(font, [...LETTERS[code]]).length === 0);
    assert.equal(reportSupportedForLocale(code), printable, `${code}: supported ${reportSupportedForLocale(code)}, printable ${printable}`);
  }
  assert.equal(LOCALES.filter(({ code }) => reportSupportedForLocale(code)).length, 25);
});

// Every family directory under assets/fonts, and every file in it.
const FAMILY_DIRECTORIES = readdirSync(fileURLToPath(fontRoot), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const VENDORED_FILES = FAMILY_DIRECTORIES
  .flatMap((family) => readdirSync(path(`${family}/`)).map((name) => `${family}/${name}`)).sort();

/** The rows of SOURCES.md's file table: path, sha256 and size, as recorded when each file was fetched. */
function recordedSources() {
  const rows = new Map();
  for (const line of readFileSync(path("SOURCES.md"), "utf8").split("\n")) {
    const row = /^\| `([^`]+)` \|[^|]*\| (https:\/\/raw\.githubusercontent\.com\/\S+) \| ([0-9a-f]{64}) \| ([0-9]+) \|$/u.exec(line);
    if (row !== null) rows.set(row[1], { url: row[2], sha256: row[3], bytes: Number(row[4]) });
  }
  return rows;
}

test("each vendored family ships its SIL Open Font License", () => {
  assert.ok(FAMILY_DIRECTORIES.length >= 8, FAMILY_DIRECTORIES.join(", "));
  for (const family of FAMILY_DIRECTORIES) {
    assert.match(readFileSync(path(`${family}/OFL.txt`), "utf8"), /SIL Open Font License/i, family);
  }
});

test("SOURCES.md records every vendored file, with the sha256 and size it has on disk, at a pinned commit", () => {
  const sources = recordedSources();
  assert.deepEqual([...sources.keys()].sort(), VENDORED_FILES);
  for (const [file, { url, sha256, bytes }] of sources) {
    const data = readFileSync(path(file));
    assert.equal(createHash("sha256").update(data).digest("hex"), sha256, file);
    assert.equal(data.length, bytes, file);
    // A full 40-character commit in the URL, never a branch name that can move.
    assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//u, file);
    assert.ok(url.endsWith(`/${file.split("/").at(-1)}`), `${file}: ${url}`);
  }
});

test("the vendored faces are static fonts, never variable ones (react-pdf prints a variable font at its default weight only)", () => {
  for (const file of VENDORED_FILES.filter((name) => /\.(ttf|otf)$/u.test(name))) {
    const face = openSync(path(file));
    assert.equal(face.variationAxes === undefined ? 0 : Object.keys(face.variationAxes).length, 0, file);
  }
});
