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
 * 3. Right to left. textkit shapes every run left to right and reverses a
 *    right-to-left run's glyphs afterwards (its bidi reordering, UAX #9 L2),
 *    so fontkit places each Hebrew point for left-to-right drawing: once the
 *    run is reversed, a point lands one letter off. A right-to-left run is
 *    shaped right to left here, as fontkit shapes it by itself (without its
 *    mirrored-bracket forms: textkit has already mirrored the brackets), each
 *    letter is drawn before its points, the offsets move into the advances,
 *    and the glyphs go back in the order textkit then reverses.
 */

export interface ReportGlyphPosition {
  xAdvance: number;
  xOffset: number;
}

/**
 * Draws a run's glyphs (given left to right, as the font placed them) in
 * `order`, each where the font placed it, with no offset: the x offsets move
 * into the advances, in place. The first glyph drawn stays where the run
 * starts, as nothing is drawn before it to move it with; the run ends where it
 * did.
 */
export function placeGlyphs<G>(glyphs: G[], positions: ReportGlyphPosition[], order: readonly number[]): void {
  let pen = 0;
  const spots = positions.map((position) => {
    const spot = pen + position.xOffset;
    pen += position.xAdvance;
    return spot;
  });
  const drawnGlyphs = order.map((index) => glyphs[index]!);
  const drawnPositions = order.map((index) => positions[index]!);
  const drawnSpots = order.map((index, at) => (at === 0 ? 0 : spots[index]!));
  drawnPositions.forEach((position, at) => {
    position.xAdvance = (at + 1 < drawnSpots.length ? drawnSpots[at + 1]! : pen) - drawnSpots[at]!;
    position.xOffset = 0;
  });
  glyphs.splice(0, glyphs.length, ...drawnGlyphs);
  positions.splice(0, positions.length, ...drawnPositions);
}

/** Moves the x offsets of `positions` (in the order the glyphs are drawn) into their advances, in place. */
export function bakeGlyphOffsets(positions: ReportGlyphPosition[]): void {
  placeGlyphs(positions.map(() => null), positions, positions.map((_, index) => index));
}

/**
 * The drawing order that puts each letter before its marks. fontkit gives a
 * right-to-left run left to right, each letter after its marks (the marks
 * follow it in the text, and the run is reversed); a mark takes no room.
 */
export function basesBeforeTheirMarks(positions: readonly ReportGlyphPosition[]): number[] {
  const order: number[] = [];
  let marks: number[] = [];
  positions.forEach((position, index) => {
    if (position.xAdvance === 0) {
      marks.push(index);
    } else {
      order.push(index, ...marks);
      marks = [];
    }
  });
  return [...order, ...marks];
}

interface ShapedRun {
  readonly glyphs: unknown[];
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

/** A letter of a right-to-left script: its run is at an odd bidi level, and textkit reverses it. */
const RIGHT_TO_LEFT = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;

/** The features textkit asked for, with fontkit's mirrored forms off (textkit mirrors the characters itself). */
function withoutMirroredForms(features: unknown): Record<string, boolean> {
  const asked = Array.isArray(features)
    ? Object.fromEntries(features.map((tag) => [String(tag), true]))
    : { ...(features as Record<string, boolean> | undefined) };
  return { ...asked, rtlm: false };
}

/**
 * The font as react-pdf should see it: every run it lays out comes back with
 * a glyph object of its own for every glyph, right-to-left runs shaped right
 * to left, and its x offsets moved into its advances. Everything else passes
 * through to the font itself, so pdfkit embeds and subsets it as before.
 */
export function reportPlacedFont<T extends object>(font: T): T {
  const target = font as T & ShapingFont;
  return new Proxy(target, {
    get(object, key) {
      if (key === "layout") {
        return (text: string, features?: unknown, script?: unknown, language?: unknown, direction?: unknown): ShapedRun => {
          if (typeof text === "string" && RIGHT_TO_LEFT.test(text)) {
            const run = withFreshGlyphs(object, () => object.layout(text, withoutMirroredForms(features), script, language, "rtl"));
            placeGlyphs(run.glyphs, run.positions, basesBeforeTheirMarks(run.positions));
            run.glyphs.reverse();
            run.positions.reverse();
            return run;
          }
          const run = withFreshGlyphs(object, () => object.layout(text, features, script, language, direction));
          bakeGlyphOffsets(run.positions);
          return run;
        };
      }
      const value: unknown = Reflect.get(object, key, object);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(object) : value;
    }
  });
}
