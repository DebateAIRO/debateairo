import { reportFaces, reportScript, type ReportFaces } from "./reportFonts.js";
import type { ReportModel } from "./reportModel.js";

/**
 * How a report is set in its language: its faces, and the small labels'
 * letter-spaced capitals. Pure data, so it is tested without drawing a PDF;
 * ReportDocument turns it into styles.
 */
export interface ReportLayout {
  readonly faces: ReportFaces;
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
  return Object.freeze({
    faces: reportFaces(locale, printed),
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
