/**
 * How each glyph of the report is handed to react-pdf.
 *
 * fontkit shapes a run of text: it picks the glyphs (joining, conjuncts,
 * ligatures), records which characters each glyph stands for, and places every
 * glyph: its advance, and for a mark (a vowel sign, a nukta, a Hebrew point, a
 * combining accent) an offset that puts it over or under its letter.
 * @react-pdf/renderer 4.9.0 (textkit 7.0.1, render 4.7.0, fontkit 2.0.4) gets
 * two of these wrong, measured in the installed source:
 *
 * 1. The characters. fontkit keeps one glyph object per glyph id for the life
 *    of the font (`getGlyph` caches it), with the characters of the FIRST text
 *    it was shaped from. Noto Sans Devanagari draws "ें" in "में" with the same
 *    glyph as the "ें" left over from "ों" in "क़दमों", where it stands for one
 *    character, not two. textkit counts each glyph's characters to find where a
 *    line ends in the glyphs, so after such a glyph every line of the
 *    paragraph was cut one glyph off: "कुछ ि / दन" for "कुछ दिन". So each run
 *    is shaped with a fresh glyph object for every glyph, carrying the
 *    characters of its own place in the text.
 * 2. The marks' offsets. textkit scales the x offset to points
 *    (`scalePositions`), and render's `_renderGlyphs` multiplies it by
 *    fontSize / 1000 a second time, so at 10.5 pt a mark moves about 1% of the
 *    way the font asked for; textkit's `resolveYOffset` overwrites every y
 *    offset with the run's superscript offset, zero for ordinary text. A mark
 *    then sits beside its letter instead of on it. The x offsets are kept here,
 *    as advances: each glyph's advance becomes the distance from where it is
 *    drawn to where the next one is drawn, and every x offset becomes zero. The
 *    pen ends where it did, so words keep their width and lines break where
 *    they did. The y offsets cannot be kept this way; reportLanguage.ts names
 *    the script that cannot do without them.
 */

export interface ReportGlyphPosition {
  xAdvance: number;
  xOffset: number;
}

/**
 * Moves the x offsets of `positions` (in the order the glyphs are drawn, left
 * to right) into their advances, in place. The first glyph keeps its drawing
 * spot: nothing is drawn before it to move it with.
 */
export function bakeGlyphOffsets(positions: ReportGlyphPosition[]): void {
  for (let index = 0; index < positions.length; index += 1) {
    const here = index === 0 ? 0 : positions[index]!.xOffset;
    const next = index + 1 < positions.length ? positions[index + 1]!.xOffset : 0;
    positions[index]!.xAdvance += next - here;
  }
  for (const position of positions) position.xOffset = 0;
}

interface ShapedRun {
  readonly positions: ReportGlyphPosition[];
}

/** The parts of a fontkit font this module uses: its layout, and its glyph cache. */
interface ShapingFont {
  layout(text: string, ...rest: unknown[]): ShapedRun;
  getGlyph(id: number, codePoints?: number[]): unknown;
  _glyphs: Record<number, unknown>;
}

/**
 * Runs `shape` with fontkit's glyph cache bypassed: every glyph it asks for is
 * a new object, with the characters it is asked for (see 1 above). The cache
 * itself is left as it was for everyone else (pdfkit reads glyph outlines
 * through it).
 */
function withFreshGlyphs<T>(font: ShapingFont, shape: () => T): T {
  const cached = Object.getPrototypeOf(font).getGlyph as ShapingFont["getGlyph"];
  font.getGlyph = function freshGlyph(this: ShapingFont, id: number, codePoints?: number[]) {
    const previous = Object.prototype.hasOwnProperty.call(this._glyphs, id) ? this._glyphs[id] : undefined;
    delete this._glyphs[id];
    const glyph = cached.call(this, id, codePoints);
    if (previous === undefined) delete this._glyphs[id];
    else this._glyphs[id] = previous;
    return glyph;
  };
  try {
    return shape();
  } finally {
    delete (font as Partial<ShapingFont>).getGlyph;
  }
}

/**
 * The font as react-pdf should see it: every run it lays out comes back with
 * a glyph object of its own for every glyph, and its x offsets moved into its
 * advances. Everything else passes through to the font itself, so pdfkit
 * embeds and subsets it as before.
 */
export function reportPlacedFont<T extends object>(font: T): T {
  const target = font as T & ShapingFont;
  return new Proxy(target, {
    get(object, key) {
      if (key === "layout") {
        return (text: string, ...rest: unknown[]): ShapedRun => {
          const run = withFreshGlyphs(object, () => object.layout(text, ...rest));
          bakeGlyphOffsets(run.positions);
          return run;
        };
      }
      const value: unknown = Reflect.get(object, key, object);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(object) : value;
    }
  });
}
