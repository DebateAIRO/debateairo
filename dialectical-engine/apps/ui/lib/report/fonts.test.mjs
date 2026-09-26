import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openSync } from "fontkit";

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
// The "How this verdict was computed" page and the appendix print these in the sans face.
const ARITHMETIC = [..."→≤≥≈·—…"];

const missing = (font, characters) => {
  const face = openSync(path(font));
  return characters.filter((character) => !face.hasGlyphForCodePoint(character.codePointAt(0)));
};

test("every vendored report font prints Romanian letters and quotes", () => {
  for (const font of FONTS) assert.deepEqual(missing(font, ROMANIAN), [], font);
});

test("the sans family prints the arithmetic page's symbols", () => {
  for (const font of SANS) assert.deepEqual(missing(font, ARITHMETIC), [], font);
});

test("each vendored family ships its SIL Open Font License", () => {
  for (const family of ["fraunces", "plus-jakarta-sans"]) {
    assert.match(readFileSync(path(`${family}/OFL.txt`), "utf8"), /SIL Open Font License/i, family);
  }
});
