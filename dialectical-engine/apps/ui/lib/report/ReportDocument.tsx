import { Fragment, type JSX } from "react";
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Answer, AnswerStory } from "@debateai/contract";
import { buildReportModel, type ReportModel, type ReportParagraph } from "./reportModel.js";

/**
 * The downloadable report (spec 2026-09-26 §10). It renders ReportModel and
 * nothing else: every string is plain text, and the only links are the
 * code-built internal ones to the appendix anchors ([Pn] citations, and point
 * numbers the story's text names). The serif family prints only the fixed
 * English headings (REPORT_TITLES); every model- or user-written string is set
 * in the sans family, which carries ș ț „ → ≤ ≥ (see fonts.test.mjs).
 */
export const REPORT_FONT_SANS = "ReportSans";
export const REPORT_FONT_SERIF = "ReportSerif";

// Print colours from the site's light palette (apps/ui/app/globals.css :root): --ink, --text-strong,
// --text-2, --muted, --surface-2, --accent, --gold-bg, --gold-border and --link. LINE is a solid warm
// hairline standing in for the translucent --line-strong, so it prints the same on any paper.
const INK = "#29261F";
const STRONG = "#1A1613";
const TEXT_2 = "#555147";
const MUTED = "#6E675C";
const LINE = "#D9D3C8";
const SHELL = "#F4F0E8";
const ACCENT = "#C15F3C";
const NOTE_BG = "#F3ECE0";
const NOTE_BORDER = "#D9C8A9";
const LINK = "#3D5A80";

const FATE_COLUMN = 86;
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
  eyebrow: { fontWeight: 700, fontSize: 8, letterSpacing: 1.6, textTransform: "uppercase", color: ACCENT, marginBottom: 12 },
  question: { fontWeight: 700, fontSize: 21, lineHeight: 1.28, color: STRONG, marginBottom: 16 },
  labelRow: { flexDirection: "row", marginBottom: 8 },
  label: { fontWeight: 700, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", paddingTop: 3, paddingBottom: 2, paddingHorizontal: 9, borderWidth: 1, borderColor: NOTE_BORDER, borderRadius: 10, backgroundColor: NOTE_BG },
  confidence: { fontSize: 9.5, lineHeight: 1.45, color: MUTED, marginBottom: 8 },
  sentence: { fontSize: BODY, lineHeight: 1.55, color: TEXT_2, marginBottom: 14 },
  meta: { fontSize: 9, lineHeight: 1.45, color: MUTED, marginBottom: 2 },
  disclosure: { marginTop: 14, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  disclosureLine: { fontSize: 8.5, lineHeight: 1.5, color: MUTED },
  disclosureGap: { marginTop: 4 },

  // Headings: the serif prints only the fixed English titles. Every heading-like line sits in an
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
  fate: { width: FATE_COLUMN, fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.6, color: MUTED, paddingTop: 2.5 },
  pathLine: { flex: 1, fontSize: BODY, lineHeight: 1.5 },
  morePaths: { marginLeft: FATE_COLUMN, fontSize: 9, lineHeight: 1.45, color: MUTED, marginBottom: 2 },
  sectionTitleBox: { marginTop: 18, marginBottom: 7 },
  sectionTitle: { fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: STRONG },

  // The reviewer's note and the checker's reservation
  box: { marginTop: 16, paddingVertical: 11, paddingHorizontal: 13, borderWidth: 1, borderColor: NOTE_BORDER, borderRadius: 6, backgroundColor: NOTE_BG },
  boxTitle: { fontWeight: 700, fontSize: 8, letterSpacing: 1.2, textTransform: "uppercase", color: MUTED, marginBottom: 6 },
  boxText: { fontSize: BODY, lineHeight: 1.55 },
  boxCaveat: { marginTop: 6, fontSize: 8.5, lineHeight: 1.45, fontStyle: "italic", color: MUTED },

  // How this verdict was computed
  ruleHead: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: MUTED },
  ruleHeadText: { fontWeight: 700, fontSize: 7.5, letterSpacing: 0.8, textTransform: "uppercase", color: MUTED },
  ruleRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  ruleRowApplied: { backgroundColor: SHELL },
  ruleNumber: { width: 38, fontSize: BODY, fontWeight: 700, color: MUTED },
  ruleCondition: { flex: 1, paddingRight: 10, fontSize: BODY, lineHeight: 1.45 },
  ruleResult: { width: 82, fontSize: BODY, fontWeight: 700 },
  ruleMarker: { width: 70, fontWeight: 700, fontSize: 7.5, letterSpacing: 0.6, textTransform: "uppercase", color: ACCENT, paddingTop: 1.5 },
  numberRow: { flexDirection: "row", paddingVertical: 3 },
  numberLabel: { width: 200, fontSize: BODY, lineHeight: 1.4, color: MUTED },
  numberValue: { flex: 1, fontSize: BODY, lineHeight: 1.4, fontWeight: 700 },
  decision: { marginTop: 14, marginBottom: 10, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: SHELL, borderRadius: 6, fontSize: BODY, lineHeight: 1.45, fontWeight: 700 },

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

function Footer({ footer }: { footer: ReportModel["footer"] }): JSX.Element {
  return (
    <>
      <Text style={styles.footerLeft} fixed>{footer.text}</Text>
      <Text
        style={styles.footerRight}
        fixed
        render={({ pageNumber, totalPages }) => footer.pageWords.replace("{page}", String(pageNumber)).replace("{pages}", String(totalPages))}
      />
    </>
  );
}

function CoverAndShort({ model }: { model: ReportModel }): JSX.Element {
  const { cover, inShort } = model;
  return (
    <>
      <Text style={styles.eyebrow}>{cover.eyebrow}</Text>
      <Text style={styles.question}>{cover.question}</Text>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{cover.labelWords}</Text>
      </View>
      {cover.confidenceWords === null ? null : <Text style={styles.confidence}>{cover.confidenceWords}</Text>}
      <Text style={styles.sentence}>{cover.labelSentence}</Text>
      <Text style={styles.meta}>{cover.generatedLine}</Text>
      <Text style={styles.meta}>{cover.modelsLine}</Text>
      <View style={styles.disclosure}>
        {cover.disclosure.map((line, index) => (
          <Text key={index} style={index === 0 ? styles.disclosureLine : [styles.disclosureLine, styles.disclosureGap]}>{line}</Text>
        ))}
      </View>
      <Heading title={inShort.title} />
      <Text style={styles.headline}>{inShort.headline}</Text>
      <Text style={styles.paragraph}>{inShort.summary}</Text>
      {inShort.paths.map((path, index) => (
        <View key={index} style={styles.pathRow} wrap={false}>
          <Text style={styles.fate}>{path.fateWords}</Text>
          <StoryText paragraph={path.line} variant="pathLine" />
        </View>
      ))}
      {inShort.morePaths === null ? null : <Text style={styles.morePaths}>{inShort.morePaths}</Text>}
      <Subheading text={inShort.changeLead} />
      <StoryText paragraph={inShort.change} variant="paragraph" />
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
          <Text style={styles.boxTitle}>{model.reviewerNote.title}</Text>
          <StoryText paragraph={model.reviewerNote.paragraph} variant="box" />
          <Text style={styles.boxCaveat}>{model.reviewerNote.caveat}</Text>
        </View>
      )}
      {model.reservation === null ? null : (
        <View style={styles.box} wrap={false}>
          <Text style={styles.boxTitle}>{model.reservation.title}</Text>
          <StoryText paragraph={model.reservation.paragraph} variant="box" />
        </View>
      )}
    </>
  );
}

function Computation({ model }: { model: ReportModel }): JSX.Element {
  const { computation } = model;
  return (
    <>
      <Heading title={computation.title} first />
      <Text style={styles.paragraph}>{computation.intro}</Text>
      {computation.rules.length === 0 ? null : (
        <View style={styles.ruleHead}>
          <Text style={[styles.ruleNumber, styles.ruleHeadText]}>{computation.tableHead.rule}</Text>
          <Text style={[styles.ruleCondition, styles.ruleHeadText]}>{computation.tableHead.when}</Text>
          <Text style={[styles.ruleResult, styles.ruleHeadText]}>{computation.tableHead.label}</Text>
          <Text style={[styles.ruleMarker, styles.ruleHeadText]}>{" "}</Text>
        </View>
      )}
      {computation.rules.map((rule) => (
        <View key={rule.number} style={rule.applied ? [styles.ruleRow, styles.ruleRowApplied] : styles.ruleRow} wrap={false}>
          <Text style={styles.ruleNumber}>{rule.number}</Text>
          <Text style={styles.ruleCondition}>{rule.condition}</Text>
          <Text style={styles.ruleResult}>{rule.result}</Text>
          <Text style={styles.ruleMarker}>{rule.applied ? computation.appliedWords : ""}</Text>
        </View>
      ))}
      {computation.numbersTitle === null ? null : <Subheading text={computation.numbersTitle} />}
      {computation.numbers.map((row, index) => (
        <View key={index} style={styles.numberRow} wrap={false}>
          <Text style={styles.numberLabel}>{row.label}</Text>
          <Text style={styles.numberValue}>{row.value}</Text>
        </View>
      ))}
      <Text style={styles.decision} wrap={false}>{computation.decision}</Text>
      {computation.explanation.length === 0 ? null : <Text style={styles.paragraph}>{computation.explanation}</Text>}
      {computation.marksLine === null ? null : <Text style={styles.meta}>{computation.marksLine}</Text>}
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
          <Text style={styles.entryMeta}>{`${entry.scores} · ${entry.wayOfKnowing}`}</Text>
          <Text style={styles.entryMeta}>{entry.author}</Text>
          <Text style={styles.entryMeta}>{entry.review}</Text>
          {entry.setAsideLine === null ? null : <Text style={styles.entryMeta}>{entry.setAsideLine}</Text>}
          {entry.marksLine === null ? null : <Text style={styles.entryMeta}>{entry.marksLine}</Text>}
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
    <Document title={model.documentTitle} author="DebateAI" subject="AI-generated debate report" creator="DebateAI" producer="DebateAI" keywords="AI-generated">
      <Page size="A4" style={styles.page} bookmark={model.inShort.title}>
        <CoverAndShort model={model} />
        <Footer footer={model.footer} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.storyTitle}>
        <LongStory model={model} />
        <Footer footer={model.footer} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.computation.title}>
        <Computation model={model} />
        <Footer footer={model.footer} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.appendix.title}>
        <Appendix model={model} />
        <Footer footer={model.footer} />
      </Page>
      <Page size="A4" style={styles.page} bookmark={model.about.title}>
        <About model={model} />
        <Footer footer={model.footer} />
      </Page>
    </Document>
  );
}

export function ReportDocument(props: { answer: Answer; story: AnswerStory; generatedAt: Date }): JSX.Element {
  return <ReportDocumentView model={buildReportModel(props.answer, props.story, props.generatedAt)} />;
}
