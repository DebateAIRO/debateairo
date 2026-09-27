import { Fragment, type JSX } from "react";
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Answer, AnswerStory } from "@debateai/contract";
import { formatNumber } from "../i18n/translate.js";
import type { ReportCatalogs } from "./reportLanguage.js";
import { buildReportModel, reportPageWords, type ReportModel, type ReportParagraph } from "./reportModel.js";

/**
 * The downloadable report (spec 2026-09-26 §10, amended by §14). It renders
 * ReportModel and nothing else: every string is plain text, in the report's one
 * language, and the only links are the code-built internal ones to the entries
 * in the list of points ([Pn] citations, and point numbers the story's text
 * names). The serif family prints only the fixed part titles; every model- or
 * user-written string is set in the sans family, which carries ș ț „ → and
 * every Latin letter the report's languages use (see fonts.test.mjs).
 */
export const REPORT_FONT_SANS = "ReportSans";
export const REPORT_FONT_SERIF = "ReportSerif";

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
// line break. Every run boundary in story text (a word, then a [Pn] citation or an in-text P5 link) is a
// hyphenation point to textkit, and a break there would print a stray "-"; at this penalty it never breaks.
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

// StyleSheet.create keeps each style's literal shape, so the caller picks a variant rather than passing a style.
function StoryText({ paragraph, variant }: { paragraph: ReportParagraph; variant: "paragraph" | "pathLine" | "box" }): JSX.Element {
  const style = variant === "pathLine" ? styles.pathLine : variant === "box" ? styles.boxText : styles.paragraph;
  return (
    <Text style={style} hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}>
      {paragraph.spans.map((span, index) => {
        if (span.kind === "text") return <Text key={index}>{span.text}</Text>;
        if (span.kind === "mention") return <Link key={index} src={`#${span.anchor}`} style={styles.mention}>{span.label}</Link>;
        // A no-break space before each marker keeps "[P5]" with the word before it and with the marker before it.
        return <Link key={index} src={`#${span.anchor}`} style={styles.cite}>{`\u00A0[${span.label}]`}</Link>;
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

function Heading({ title, first = false }: { title: string; first?: boolean }): JSX.Element {
  return (
    <KeepWithNext ahead={60} style={first ? styles.headingFirstBox : styles.headingBox}>
      <Text style={styles.heading}>{title}</Text>
    </KeepWithNext>
  );
}

function Subheading({ text }: { text: string }): JSX.Element {
  return (
    <KeepWithNext ahead={30} style={styles.subheadingBox}>
      <Text style={styles.subheading}>{text}</Text>
    </KeepWithNext>
  );
}

function Footer({ model }: { model: ReportModel }): JSX.Element {
  return (
    <>
      <Text style={styles.footerLeft} fixed>{model.footer.text}</Text>
      <Text
        style={styles.footerRight}
        fixed
        render={({ pageNumber, totalPages }) => reportPageWords(model, pageNumber, totalPages)}
      />
    </>
  );
}

function CoverAndShort({ model }: { model: ReportModel }): JSX.Element {
  const { cover, inShort } = model;
  return (
    <>
      <Text style={styles.eyebrow}>{capitals(model, cover.eyebrow)}</Text>
      <Text style={styles.question}>{cover.question}</Text>
      {cover.labelWords === null ? null : (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{capitals(model, cover.labelWords)}</Text>
        </View>
      )}
      <Text style={styles.confidence}>{cover.confidence}</Text>
      <Text style={styles.meta}>{cover.generatedLine}</Text>
      <Text style={styles.meta}>{cover.modelsLine}</Text>
      <View style={styles.disclosure}>
        <Text style={styles.disclosureLine}>{cover.disclosure}</Text>
      </View>
      <Heading title={inShort.title} />
      <Text style={styles.headline}>{inShort.headline}</Text>
      <Text style={styles.paragraph}>{inShort.summary}</Text>
      {inShort.paths.map((path, index) => (
        <View key={index} style={styles.pathRow} wrap={false}>
          <Text style={styles.fate}>{capitals(model, path.fateWords)}</Text>
          <StoryText paragraph={path.line} variant="pathLine" />
        </View>
      ))}
      {inShort.morePaths === null ? null : <Text style={styles.morePaths}>{inShort.morePaths}</Text>}
    </>
  );
}

function LongStory({ model }: { model: ReportModel }): JSX.Element {
  return (
    <>
      <Heading title={model.storyTitle} first />
      <Text style={styles.intro}>{model.storyIntro}</Text>
      {model.sections.map((section, index) => (
        <Fragment key={index}>
          <KeepWithNext ahead={48} style={styles.sectionTitleBox}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </KeepWithNext>
          {section.paragraphs.map((item, itemIndex) => (
            <StoryText key={itemIndex} paragraph={item} variant="paragraph" />
          ))}
        </Fragment>
      ))}
      {model.reviewerNote === null ? null : (
        <View style={styles.box} wrap={false}>
          <Text style={styles.boxTitle}>{capitals(model, model.reviewerNote.title)}</Text>
          <StoryText paragraph={model.reviewerNote.paragraph} variant="box" />
        </View>
      )}
      {model.reservation === null ? null : <Text style={styles.reservation} wrap={false}>{model.reservation}</Text>}
    </>
  );
}

/** A reason's number, written the way the report's language writes numbers. */
function reasonNumber(model: ReportModel, index: number): string {
  return formatNumber(model.language, index + 1);
}

function Why({ model }: { model: ReportModel }): JSX.Element {
  const { why } = model;
  return (
    <>
      <Heading title={why.title} first />
      {why.reasons.map((reason, index) => (
        <View key={index} style={styles.reasonRow}>
          <Text style={styles.reasonNumber}>{reasonNumber(model, index)}</Text>
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

function Appendix({ model }: { model: ReportModel }): JSX.Element {
  return (
    <>
      <Heading title={model.appendix.title} first />
      <Text style={styles.intro}>{model.appendix.intro}</Text>
      {model.appendix.entries.map((entry) => (
        <Fragment key={entry.anchor}>
          <KeepWithNext ahead={52} style={styles.entryHeadBox} id={entry.anchor}>
            <Text style={styles.entryHead}>
              <Text style={styles.entryNumber}>{entry.number}</Text>
              <Text style={styles.entryStance}>{`   ${entry.stance}`}</Text>
            </Text>
          </KeepWithNext>
          <Text style={styles.entryClaim}>{entry.claim}</Text>
          <Text style={styles.entryMeta}>{`${entry.strength} · ${entry.wayOfKnowing}`}</Text>
          <Text style={styles.entryMeta}>{entry.author}</Text>
          <Text style={styles.entryMeta}>{entry.review}</Text>
          {entry.setAsideLine === null ? null : <Text style={styles.entryMeta}>{entry.setAsideLine}</Text>}
          {entry.notesLine === null ? null : <Text style={styles.entryMeta}>{entry.notesLine}</Text>}
        </Fragment>
      ))}
    </>
  );
}

function About({ model }: { model: ReportModel }): JSX.Element {
  return (
    <>
      <Heading title={model.about.title} first />
      {model.about.rows.map((row, index) => (
        <View key={index} style={styles.aboutRow} wrap={false}>
          <Text style={styles.aboutLabel}>{row.label}</Text>
          <Text style={styles.aboutValue}>{row.value}</Text>
        </View>
      ))}
    </>
  );
}

export function ReportDocumentView({ model }: { model: ReportModel }): JSX.Element {
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
      <Page size="A4" style={styles.page} bookmark={model.inShort.title}>
        <CoverAndShort model={model} />
        <Footer model={model} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.storyTitle}>
        <LongStory model={model} />
        <Footer model={model} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.why.title}>
        <Why model={model} />
        <Footer model={model} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.appendix.title}>
        <Appendix model={model} />
        <Footer model={model} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.about.title}>
        <About model={model} />
        <Footer model={model} />
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
