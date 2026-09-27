import { localeDirection } from "../i18n/questionLocale.js";
import { reportFaces, reportScript, type ReportFaces } from "./reportFonts.js";
import type { ReportModel } from "./reportModel.js";

/**
 * How a report is set in its language: its faces, its direction, the side its
 * columns and page numbers sit on, and the small labels' letter-spaced
 * capitals. Pure data, so it is tested without drawing a PDF; ReportDocument
 * turns it into styles.
 *
 * Right to left (Hebrew): react-pdf 4.9.0 orders the text itself. textkit
 * 7.0.1 runs the Unicode bidi algorithm (bidi-js) over each paragraph from the
 * direction of its first run, mirrors brackets and reverses each
 * right-to-left run (measured in the installed source), so a Latin model
 * name, a number or a [P3] keeps its own order inside Hebrew. What it does not
 * do is lay the page out: the direction is not inherited, and Yoga rows run
 * left to right. So every text is given the direction, the page is aligned to
 * the right, and each row (a fate and its line, a reason's number, an About
 * label) runs from the right.
 */
export interface ReportLayout {
  readonly faces: ReportFaces;
  readonly direction: "ltr" | "rtl";
  /** Where a line starts: every paragraph is aligned to it. */
  readonly textAlign: "left" | "right";
  /** The side the fate words, the reasons' numbers and the About labels sit on: where a line starts. */
  readonly markerSide: "left" | "right";
  /** The side the page numbers sit on, the side a reader finishes a line on; the footer's words sit opposite. */
  readonly pageNumberSide: "left" | "right";
  /**
   * The small labels (the eyebrow, the label, the fates, the box titles) are
   * set in letter-spaced capitals only in a script that has capitals: Latin,
   * Cyrillic and Greek. Spacing the letters apart would break the joined
   * strokes of Devanagari, and Hebrew and CJK have no capitals to space.
   */
  readonly trackedCapitals: boolean;
}

export function reportLayout(locale: string, printed: string): ReportLayout {
  const script = reportScript(locale);
  const direction = localeDirection(locale);
  const start = direction === "rtl" ? "right" : "left";
  return Object.freeze({
    faces: reportFaces(locale, printed),
    direction,
    textAlign: start,
    markerSide: start,
    pageNumberSide: start === "left" ? "right" : "left",
    trackedCapitals: script === "latin" || script === "cyrillicGreek"
  });
}

/** Every string the report prints, joined: what its faces must cover. */
export function reportPrintedText(model: ReportModel): string {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(model);
  return strings.join("\n");
}
