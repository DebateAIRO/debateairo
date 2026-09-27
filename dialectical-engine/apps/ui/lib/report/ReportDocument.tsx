import { Fragment, type JSX } from "react";
import { Document, Link, Page, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import type { Answer, AnswerStory } from "@debateai/contract";
import { formatNumber } from "../i18n/translate.js";
import { REPORT_FONT_FAMILIES } from "./reportFonts.js";
import type { ReportCatalogs } from "./reportLanguage.js";
import { reportLineBreaker } from "./reportLineBreaks.js";
import { reportLayout, reportPrintedText, type ReportLayout } from "./reportLayout.js";
import { buildReportModel, reportPageWords, type ReportModel, type ReportParagraph } from "./reportModel.js";

/**
 * The downloadable report (spec 2026-09-26 §10, amended by §14). It renders
 * ReportModel and nothing else: every string is plain text, in the report's one
 * language, and the only links are the code-built internal ones to the entries
 * in the list of points ([Pn] citations, and point numbers the story's text
 * names). In a Latin-script report the serif family prints only the fixed part
 * titles; every model- or user-written string is set in the sans family, which
 * carries ș ț „ → and every Latin letter the report's languages use. A report
 * in another script sets everything in that script's Noto face, and every
 * character a face lacks comes from the next face in the list
 * (lib/report/reportFonts.ts; fonts.test.mjs checks the catalogues against it).
 */
export const REPORT_FONT_SANS = REPORT_FONT_FAMILIES.sans;
export const REPORT_FONT_SERIF = REPORT_FONT_FAMILIES.serif;

// Print colours from the site's light palette (apps/ui/app/globals.css :root): --ink, --text-strong,
// --text-2, --muted, --accent, --gold-bg, --gold-border and --link. LINE is a solid warm
// hairline standing in for the translucent --line-strong, so it prints the same on any paper.
const INK = "#29261F";
const STRONG = "#1A1613";
const TEXT_2 = "#555147";
const MUTED = "#6E675C";
const LINE = "#D9D3C8";
const ACCENT = "#C15F3C";
const NOTE_BG = "#F3ECE0";
const NOTE_BORDER = "#D9C8A9";
const LINK = "#3D5A80";

// Wide enough for the longest fate word in the report's languages, set in capitals ("A REZISTAT PARȚIAL"
// wraps to two lines here), with a gutter before the path line.
const FATE_COLUMN = 108;
const BODY = 10.5;
// textkit's own infinity (linebreak.infinity in @react-pdf/textkit 7.0.1): a penalty this high is never a
// line break. Every run boundary in a text (a word, then a [Pn] citation or an in-text P5 link; a change of
// script or font, as Japanese changes between Han and kana) is a hyphenation point to textkit, and a break
// there would print a stray "-"; at this penalty it never breaks. Every text of the report sets it.
const NEVER_BREAK_BETWEEN_RUNS = 10000;

const styles = StyleSheet.create({
  // No lineHeight here: a Page-level lineHeight together with the fixed page-number footer (a `render` Text)
  // makes @react-pdf/renderer 4.9.0 throw "unsupported number" once the appendix runs past about 15 pages
  // (measured 2026-09-26). Line height is set on each text style instead, and every style that sets one
  // also sets its own fontSize: react-pdf resolves a unitless lineHeight against the fontSize in the SAME
  // style (18 when it has none), not the inherited one, so a bare lineHeight of 1.6 spaced 10.5pt text 29pt.
  page: { paddingTop: 58, paddingBottom: 74, paddingHorizontal: 62, fontFamily: REPORT_FONT_SANS, fontSize: BODY, color: INK },

  // Cover
  eyebrow: { fontWeight: 700, fontSize: 8, letterSpacing: 1.6, color: ACCENT, marginBottom: 12 },
  question: { fontWeight: 700, fontSize: 21, lineHeight: 1.28, color: STRONG, marginBottom: 16 },
  labelRow: { flexDirection: "row", marginBottom: 8 },
  label: { fontWeight: 700, fontSize: 9.5, letterSpacing: 1, paddingTop: 3, paddingBottom: 2, paddingHorizontal: 9, borderWidth: 1, borderColor: NOTE_BORDER, borderRadius: 10, backgroundColor: NOTE_BG },
  confidence: { fontSize: BODY, lineHeight: 1.55, color: TEXT_2, marginBottom: 14 },
  meta: { fontSize: 9, lineHeight: 1.45, color: MUTED, marginBottom: 2 },
  disclosure: { marginTop: 14, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  disclosureLine: { fontSize: 8.5, lineHeight: 1.5, color: MUTED },

  // Headings: the serif prints only the fixed part titles. Every heading-like line sits in an
  // unbreakable View with minPresenceAhead (KeepWithNext): measured with 4.9.0's paginator, a Text alone
  // is left at the foot of a page when its own box straddles the page end, whatever minPresenceAhead says.
  headingBox: { marginTop: 26, marginBottom: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  headingFirstBox: { marginBottom: 12, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  heading: { fontFamily: REPORT_FONT_SERIF, fontWeight: 600, fontSize: 18, color: STRONG },
  intro: { fontSize: 9.5, lineHeight: 1.5, color: MUTED, marginBottom: 12 },
  subheadingBox: { marginTop: 12, marginBottom: 5 },
  subheading: { fontWeight: 700, fontSize: BODY, color: STRONG },

  // Story text
  headline: { fontWeight: 700, fontSize: 13.5, lineHeight: 1.4, color: STRONG, marginBottom: 8 },
  paragraph: { fontSize: BODY, lineHeight: 1.6, marginBottom: 9 },
  cite: { color: LINK, fontSize: 8.5, textDecoration: "none" },
  mention: { color: LINK, textDecoration: "underline" },
  pathRow: { flexDirection: "row", marginBottom: 7 },
  fate: { width: FATE_COLUMN, paddingRight: 12, fontWeight: 700, fontSize: 8, lineHeight: 1.35, letterSpacing: 0.6, color: MUTED, paddingTop: 2.5 },
  pathLine: { flex: 1, fontSize: BODY, lineHeight: 1.5 },
  morePaths: { marginLeft: FATE_COLUMN, fontSize: 9, lineHeight: 1.45, color: MUTED, marginBottom: 2 },
  sectionTitleBox: { marginTop: 18, marginBottom: 7 },
  sectionTitle: { fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: STRONG },

  // The note worth knowing, and the gentle line for a story with a reservation
  box: { marginTop: 16, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: NOTE_BORDER, borderRadius: 6, backgroundColor: NOTE_BG },
  boxTitle: { fontWeight: 700, fontSize: 8, letterSpacing: 1.2, color: MUTED, marginBottom: 6 },
  boxText: { fontSize: BODY, lineHeight: 1.55 },
  reservation: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: LINE, borderRadius: 6, fontSize: 9, lineHeight: 1.5, fontStyle: "italic", color: MUTED },

  // Why this answer: each reason beside its number, then what would change the answer.
  reasonRow: { flexDirection: "row", marginBottom: 9 },
  reasonNumber: { width: 22, fontWeight: 700, fontSize: BODY, lineHeight: 1.6, color: ACCENT },
  reasonText: { flex: 1, fontSize: BODY, lineHeight: 1.6 },

  // Appendix. Each entry's parts sit directly on the page (a Fragment, not a View): react-pdf only
  // applies minPresenceAhead to a node that has earlier siblings, and an entry's head is the anchor.
  entryHeadBox: { marginTop: 10, paddingTop: 9, marginBottom: 3, borderTopWidth: 1, borderTopColor: LINE },
  entryHead: { fontSize: 9, lineHeight: 1.3 },
  entryNumber: { fontWeight: 700, fontSize: 10, color: ACCENT },
  entryStance: { fontWeight: 700, color: MUTED },
  entryClaim: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 4 },
  entryMeta: { fontSize: 9, lineHeight: 1.45, color: MUTED },

  // About this report
  aboutRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  aboutLabel: { width: 150, fontSize: BODY, lineHeight: 1.4, color: MUTED },
  aboutValue: { flex: 1, fontSize: BODY, lineHeight: 1.4 },

  footerLeft: { position: "absolute", bottom: 32, left: 62, fontSize: 8, color: MUTED },
  footerRight: { position: "absolute", bottom: 32, right: 62, fontSize: 8, color: MUTED }
});

/**
 * Small labels are set in capitals by the view, not by a textTransform style: react-pdf 4.9.0 measures a
 * line before it transforms it, so a longer capitalised word ran past its column instead of wrapping.
 * The report's own locale capitalises (Turkish i becomes İ, not I).
 */
function capitals(model: ReportModel, text: string): string {
  return text.toLocaleUpperCase(model.language);
}

type Style = Styles[string];
type TextStyle = Style | Style[];

/** What a report's language adds to the shared styles (lib/report/reportLayout.ts). */
interface Look {
  readonly model: ReportModel;
  /** The text's faces, set on every page. */
  readonly page: Style;
  /** The part titles' faces and weight. */
  readonly heading: Style;
  /** No letter spacing on the small labels in a script without capitals. */
  readonly tracked: Style;
}

function lookOf(model: ReportModel, layout: ReportLayout): Look {
  return {
    model,
    page: { fontFamily: [...layout.faces.body] },
    heading: { fontFamily: [...layout.faces.heading], fontWeight: layout.faces.headingWeight },
    tracked: layout.trackedCapitals ? {} : { letterSpacing: 0 }
  };
}

/**
 * One text of the report. textkit 7.0.1 splits a text into runs wherever its
 * style, font or script changes (a [Pn] citation, a Greek letter in Romanian,
 * every switch between Han and kana in Japanese) and treats each run boundary
 * as a hyphenation point, where a break prints a hyphen. At textkit's own
 * infinity, NEVER_BREAK_BETWEEN_RUNS, it never breaks there. It breaks inside
 * a run only where reportLineBreaker allows, and that rule is built from the
 * whole text, so it knows what stands on both sides of a run boundary.
 */
function Words({ style, text, fixed = false, wrap = true }: {
  style: TextStyle;
  text: string;
  fixed?: boolean;
  wrap?: boolean;
}): JSX.Element {
  return (
    <Text
      style={style}
      fixed={fixed}
      wrap={wrap}
      hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}
      hyphenationCallback={reportLineBreaker(text)}
    >
      {text}
    </Text>
  );
}

/** A paragraph's text as it is printed: its own words, the P-numbers it names, and the [Pn] citations. */
function citationText(label: string): string {
  // A no-break space before each marker keeps "[P5]" with the word before it and with the marker before it.
  return `\u00A0[${label}]`;
}

function paragraphText(paragraph: ReportParagraph): string {
  return paragraph.spans.map((span) => (span.kind === "text" ? span.text : span.kind === "mention" ? span.label : citationText(span.label))).join("");
}

// StyleSheet.create keeps each style's literal shape, so the caller picks a variant rather than passing a style.
function StoryText({ paragraph, variant }: { paragraph: ReportParagraph; variant: "paragraph" | "pathLine" | "box" }): JSX.Element {
  const style = variant === "pathLine" ? styles.pathLine : variant === "box" ? styles.boxText : styles.paragraph;
  return (
    <Text style={style} hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS} hyphenationCallback={reportLineBreaker(paragraphText(paragraph))}>
      {paragraph.spans.map((span, index) => {
        if (span.kind === "text") return <Text key={index}>{span.text}</Text>;
        if (span.kind === "mention") return <Link key={index} src={`#${span.anchor}`} style={styles.mention}>{span.label}</Link>;
        return <Link key={index} src={`#${span.anchor}`} style={styles.cite}>{citationText(span.label)}</Link>;
      })}
    </Text>
  );
}

type BoxStyle = typeof styles.headingBox | typeof styles.headingFirstBox | typeof styles.subheadingBox
  | typeof styles.sectionTitleBox | typeof styles.entryHeadBox;

/** A heading-like line that never ends a page: it moves to the next page unless `ahead` points of what follows fit after it. */
function KeepWithNext({ ahead, style, id, children }: {
  ahead: number;
  style: BoxStyle;
  id?: string;
  children: JSX.Element;
}): JSX.Element {
  // An id only where there is one: react-pdf names a destination for any node that has the prop, even undefined.
  return <View wrap={false} minPresenceAhead={ahead} style={style} {...(id === undefined ? {} : { id })}>{children}</View>;
}

function Heading({ look, title, first = false }: { look: Look; title: string; first?: boolean }): JSX.Element {
  return (
    <KeepWithNext ahead={60} style={first ? styles.headingFirstBox : styles.headingBox}>
      <Words style={[styles.heading, look.heading]} text={title} />
    </KeepWithNext>
  );
}

function Subheading({ text }: { text: string }): JSX.Element {
  return (
    <KeepWithNext ahead={30} style={styles.subheadingBox}>
      <Words style={styles.subheading} text={text} />
    </KeepWithNext>
  );
}

function Footer({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  return (
    <>
      <Words style={styles.footerLeft} fixed text={model.footer.text} />
      <Text
        style={styles.footerRight}
        fixed
        hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}
        render={({ pageNumber, totalPages }) => reportPageWords(model, pageNumber, totalPages)}
      />
    </>
  );
}

function CoverAndShort({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  const { cover, inShort } = model;
  return (
    <>
      <Words style={[styles.eyebrow, look.tracked]} text={capitals(model, cover.eyebrow)} />
      <Words style={styles.question} text={cover.question} />
      {cover.labelWords === null ? null : (
        <View style={styles.labelRow}>
          <Words style={[styles.label, look.tracked]} text={capitals(model, cover.labelWords)} />
        </View>
      )}
      <Words style={styles.confidence} text={cover.confidence} />
      <Words style={styles.meta} text={cover.generatedLine} />
      <Words style={styles.meta} text={cover.modelsLine} />
      <View style={styles.disclosure}>
        <Words style={styles.disclosureLine} text={cover.disclosure} />
      </View>
      <Heading look={look} title={inShort.title} />
      <Words style={styles.headline} text={inShort.headline} />
      <Words style={styles.paragraph} text={inShort.summary} />
      {inShort.paths.map((path, index) => (
        <View key={index} style={styles.pathRow} wrap={false}>
          <Words style={[styles.fate, look.tracked]} text={capitals(model, path.fateWords)} />
          <StoryText paragraph={path.line} variant="pathLine" />
        </View>
      ))}
      {inShort.morePaths === null ? null : <Words style={styles.morePaths} text={inShort.morePaths} />}
    </>
  );
}

function LongStory({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  return (
    <>
      <Heading look={look} title={model.storyTitle} first />
      <Words style={styles.intro} text={model.storyIntro} />
      {model.sections.map((section, index) => (
        <Fragment key={index}>
          <KeepWithNext ahead={48} style={styles.sectionTitleBox}>
            <Words style={styles.sectionTitle} text={section.title} />
          </KeepWithNext>
          {section.paragraphs.map((item, itemIndex) => (
            <StoryText key={itemIndex} paragraph={item} variant="paragraph" />
          ))}
        </Fragment>
      ))}
      {model.reviewerNote === null ? null : (
        <View style={styles.box} wrap={false}>
          <Words style={[styles.boxTitle, look.tracked]} text={capitals(model, model.reviewerNote.title)} />
          <StoryText paragraph={model.reviewerNote.paragraph} variant="box" />
        </View>
      )}
      {model.reservation === null ? null : <Words style={styles.reservation} wrap={false} text={model.reservation} />}
    </>
  );
}

/** A reason's number, written the way the report's language writes numbers. */
function reasonNumber(model: ReportModel, index: number): string {
  return formatNumber(model.language, index + 1);
}

function Why({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  const { why } = model;
  return (
    <>
      <Heading look={look} title={why.title} first />
      {why.reasons.map((reason, index) => (
        <View key={index} style={styles.reasonRow}>
          <Words style={styles.reasonNumber} text={reasonNumber(model, index)} />
          <View style={styles.reasonText}>
            <StoryText paragraph={reason} variant="paragraph" />
          </View>
        </View>
      ))}
      <Subheading text={why.changeLead} />
      <StoryText paragraph={why.change} variant="paragraph" />
    </>
  );
}

function Appendix({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  return (
    <>
      <Heading look={look} title={model.appendix.title} first />
      <Words style={styles.intro} text={model.appendix.intro} />
      {model.appendix.entries.map((entry) => (
        <Fragment key={entry.anchor}>
          <KeepWithNext ahead={52} style={styles.entryHeadBox} id={entry.anchor}>
            <Text
              style={styles.entryHead}
              hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}
              hyphenationCallback={reportLineBreaker(`${entry.number}   ${entry.stance}`)}
            >
              <Text style={styles.entryNumber}>{entry.number}</Text>
              <Text style={styles.entryStance}>{`   ${entry.stance}`}</Text>
            </Text>
          </KeepWithNext>
          <Words style={styles.entryClaim} text={entry.claim} />
          <Words style={styles.entryMeta} text={`${entry.strength} · ${entry.wayOfKnowing}`} />
          <Words style={styles.entryMeta} text={entry.author} />
          <Words style={styles.entryMeta} text={entry.review} />
          {entry.setAsideLine === null ? null : <Words style={styles.entryMeta} text={entry.setAsideLine} />}
          {entry.notesLine === null ? null : <Words style={styles.entryMeta} text={entry.notesLine} />}
        </Fragment>
      ))}
    </>
  );
}

function About({ look }: { look: Look }): JSX.Element {
  const { model } = look;
  return (
    <>
      <Heading look={look} title={model.about.title} first />
      {model.about.rows.map((row, index) => (
        <View key={index} style={styles.aboutRow} wrap={false}>
          <Words style={styles.aboutLabel} text={row.label} />
          <Words style={styles.aboutValue} text={row.value} />
        </View>
      ))}
    </>
  );
}

export function ReportDocumentView({ model }: { model: ReportModel }): JSX.Element {
  const look = lookOf(model, reportLayout(model.language, reportPrintedText(model)));
  const page = [styles.page, look.page];
  return (
    <Document
      title={model.documentTitle}
      author="DebateAI"
      subject={model.metadataSubject}
      creator="DebateAI"
      producer="DebateAI"
      keywords="AI-generated"
      language={model.language}
    >
      <Page size="A4" style={page} bookmark={model.inShort.title}>
        <CoverAndShort look={look} />
        <Footer look={look} />
      </Page>
      <Page size="A4" style={page} bookmark={model.storyTitle}>
        <LongStory look={look} />
        <Footer look={look} />
      </Page>
      <Page size="A4" style={page} bookmark={model.why.title}>
        <Why look={look} />
        <Footer look={look} />
      </Page>
      <Page size="A4" style={page} bookmark={model.appendix.title}>
        <Appendix look={look} />
        <Footer look={look} />
      </Page>
      <Page size="A4" style={page} bookmark={model.about.title}>
        <About look={look} />
        <Footer look={look} />
      </Page>
    </Document>
  );
}

export function ReportDocument(props: {
  answer: Answer;
  story: AnswerStory;
  generatedAt: Date;
  catalogs: ReportCatalogs;
}): JSX.Element {
  return <ReportDocumentView model={buildReportModel(props.answer, props.story, props.generatedAt, props.catalogs)} />;
}
