import { Fragment, type JSX } from "react";
import { Document, Link, Page, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import { formatNumber } from "../i18n/translate.js";
import { REPORT_FONT_FAMILIES } from "./reportFonts.js";
import { reportLineBreaker } from "./reportLineBreaks.js";
import { reportLayout, reportPrintedText, type ReportLayout } from "./reportLayout.js";
import type { InvestigationReportPdfModel, InvestigationReportPdfPath } from "./investigationReportModel.js";

/**
 * The report's PDF (plan 2026-10-31 decision 17): a plain document over InvestigationReportPdfModel, one flow of pages. It follows
 * ReportDocument's measured rules for react-pdf 4.9.0 (each is explained there): a text's line height is set with its own font
 * size and never on the page; every text sets textkit's infinite penalty between runs and the line breaker of its whole text;
 * a heading sits in an unbreakable View with minPresenceAhead; a right-to-left report gives every text its direction, runs each
 * row from the right and mirrors the indent. Small labels are capitalised by the code, in the report's own locale.
 * The only links leaving the file are the sources' own addresses, printed in full, since a printed link cannot be followed.
 */
const INK = "#29261F";
const STRONG = "#1A1613";
const TEXT_2 = "#555147";
const MUTED = "#6E675C";
const LINE = "#D9D3C8";
const ACCENT = "#C15F3C";
const LINK = "#3D5A80";
const BODY = 10.5;
const FATE_COLUMN = 92;
const FATE_GUTTER = 12;
/** A follow-up debate's path sits one step in per level, up to four steps: a deep tree keeps room for its words. */
const LEVEL_INDENT = 14;
const LEVEL_INDENT_STEPS = 4;
const NEVER_BREAK_BETWEEN_RUNS = 10000;

const styles = StyleSheet.create({
  page: { paddingTop: 58, paddingBottom: 74, paddingHorizontal: 62, fontFamily: REPORT_FONT_FAMILIES.sans, fontSize: BODY, color: INK },
  notice: { marginBottom: 18, paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: LINE, borderRadius: 6 },
  noticeText: { fontSize: 8.5, lineHeight: 1.5, color: MUTED },
  eyebrow: { fontWeight: 700, fontSize: 8, letterSpacing: 1.6, color: ACCENT, marginBottom: 12 },
  question: { fontWeight: 700, fontSize: 21, lineHeight: 1.28, color: STRONG, marginBottom: 12 },
  meta: { fontSize: 9, lineHeight: 1.45, color: MUTED, marginBottom: 2 },
  headingBox: { marginTop: 24, marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: LINE },
  heading: { fontFamily: REPORT_FONT_FAMILIES.serif, fontWeight: 600, fontSize: 16, color: STRONG },
  lead: { fontWeight: 700, fontSize: 13, lineHeight: 1.4, color: STRONG, marginBottom: 8 },
  paragraph: { fontSize: BODY, lineHeight: 1.6, marginBottom: 9 },
  note: { fontSize: 9, lineHeight: 1.5, color: MUTED, marginBottom: 9 },
  pathRow: { flexDirection: "row", marginBottom: 7 },
  pathFate: { width: FATE_COLUMN, paddingRight: FATE_GUTTER, paddingTop: 2.5, fontWeight: 700, fontSize: 8, lineHeight: 1.35, letterSpacing: 0.6, color: MUTED },
  pathBody: { flex: 1 },
  pathLine: { fontSize: BODY, lineHeight: 1.5 },
  pathSummary: { marginTop: 2, fontSize: 9.5, lineHeight: 1.5, color: TEXT_2 },
  listRow: { flexDirection: "row", marginBottom: 6 },
  listMark: { width: 14, fontSize: BODY, lineHeight: 1.55, color: ACCENT },
  listText: { flex: 1, fontSize: BODY, lineHeight: 1.55 },
  source: { marginBottom: 11 },
  sourceSite: { fontWeight: 700, fontSize: 9.5, lineHeight: 1.4, color: STRONG },
  sourceTitle: { fontSize: 9.5, lineHeight: 1.45 },
  sourceNote: { marginTop: 2, fontSize: 9.5, lineHeight: 1.5, color: TEXT_2 },
  sourceQuote: { marginTop: 2, fontSize: 9.5, lineHeight: 1.5, fontStyle: "italic", color: TEXT_2 },
  sourceLinkLine: { marginTop: 2, fontSize: 8.5, lineHeight: 1.4 },
  sourceLink: { color: LINK, textDecoration: "underline" },
  footerLeft: { position: "absolute", bottom: 32, left: 62, fontSize: 8, color: MUTED },
  footerRight: { position: "absolute", bottom: 32, right: 62, fontSize: 8, color: MUTED }
});

type Style = Styles[string];
type TextStyle = Style | Style[];

type Look = Readonly<{
  model: InvestigationReportPdfModel;
  layout: ReportLayout;
  page: Style;
  heading: Style;
  tracked: Style;
  text: Style;
  row: Style;
  fate: Style;
}>;

function lookOf(model: InvestigationReportPdfModel): Look {
  const layout = reportLayout(model.language, reportPrintedText(model));
  const rtl = layout.direction === "rtl";
  return {
    model,
    layout,
    page: rtl ? { fontFamily: [...layout.faces.body], textAlign: layout.textAlign } : { fontFamily: [...layout.faces.body] },
    heading: { fontFamily: [...layout.faces.heading], fontWeight: layout.faces.headingWeight },
    tracked: layout.trackedCapitals ? {} : { letterSpacing: 0 },
    text: rtl ? { direction: "rtl" } : {},
    row: layout.markerSide === "right" ? { flexDirection: "row-reverse" } : {},
    fate: layout.markerSide === "right" ? { paddingRight: 0, paddingLeft: FATE_GUTTER } : {}
  };
}

function Words({ look, style, text, fixed = false }: { look: Look; style: TextStyle; text: string; fixed?: boolean }): JSX.Element {
  return (
    <Text
      style={[...(Array.isArray(style) ? style : [style]), look.text]}
      fixed={fixed}
      hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}
      hyphenationCallback={reportLineBreaker(text)}
    >
      {text}
    </Text>
  );
}

function Heading({ look, title }: { look: Look; title: string }): JSX.Element {
  return (
    <View wrap={false} minPresenceAhead={60} style={styles.headingBox}>
      <Words look={look} style={[styles.heading, look.heading]} text={title} />
    </View>
  );
}

const capitals = (look: Look, text: string): string => text.toLocaleUpperCase(look.model.language);

function PathRow({ look, path }: { look: Look; path: InvestigationReportPdfPath }): JSX.Element {
  const indent = LEVEL_INDENT * Math.min(path.level, LEVEL_INDENT_STEPS);
  const inward = look.layout.markerSide === "right" ? { marginRight: indent } : { marginLeft: indent };
  return (
    <View style={[styles.pathRow, look.row, inward]} minPresenceAhead={36}>
      {path.fateWords === null
        ? <View style={[styles.pathFate, look.fate]} />
        : <Words look={look} style={[styles.pathFate, look.tracked, look.fate]} text={capitals(look, path.fateWords)} />}
      <View style={styles.pathBody}>
        <Words look={look} style={styles.pathLine} text={path.line} />
        {path.summary === null ? null : <Words look={look} style={styles.pathSummary} text={path.summary} />}
      </View>
    </View>
  );
}

function Source({ look, source }: { look: Look; source: NonNullable<InvestigationReportPdfModel["sources"]>["items"][number] }): JSX.Element {
  return (
    <View style={styles.source} minPresenceAhead={24}>
      <Words look={look} style={styles.sourceSite} text={source.site} />
      {source.title === null ? null : <Words look={look} style={styles.sourceTitle} text={source.title} />}
      {source.note === null ? null : <Words look={look} style={styles.sourceNote} text={source.note} />}
      <Words look={look} style={styles.sourceQuote} text={`“${source.quote}”`} />
      {source.link === null ? null : (
        // An address reads left to right in any report.
        <Text style={[styles.sourceLinkLine, { direction: "ltr" }]} hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS} hyphenationCallback={reportLineBreaker(source.link)}>
          <Link src={source.link} style={styles.sourceLink}>{source.link}</Link>
        </Text>
      )}
    </View>
  );
}

function pageWords(model: InvestigationReportPdfModel, page: number, total: number): string {
  return model.footer.pageWords.replace("{page}", formatNumber(model.language, page)).replace("{total}", formatNumber(model.language, total));
}

export function InvestigationReportDocument({ model }: { model: InvestigationReportPdfModel }): JSX.Element {
  const look = lookOf(model);
  const pagesLeft = look.layout.pageNumberSide === "left";
  return (
    <Document
      title={model.documentTitle}
      author="Dialectical Engine"
      subject={model.metadataSubject}
      creator="Dialectical Engine"
      producer="Dialectical Engine"
      keywords="AI-generated"
      language={model.language}
    >
      <Page size="A4" style={[styles.page, look.page]}>
        <View style={styles.notice}><Words look={look} style={styles.noticeText} text={model.notAdvice} /></View>
        <Words look={look} style={[styles.eyebrow, look.tracked]} text={capitals(look, model.eyebrow)} />
        <Words look={look} style={styles.question} text={model.question} />
        <Words look={look} style={styles.meta} text={model.versionLine} />
        <Words look={look} style={styles.meta} text={model.disclosure} />
        {model.shortened === null ? null : <Words look={look} style={styles.meta} text={model.shortened} />}

        <Heading look={look} title={model.pointsTo.title} />
        {model.pointsTo.lead === null ? null : <Words look={look} style={styles.lead} text={model.pointsTo.lead} />}
        {model.pointsTo.paragraphs.map((paragraph, at) => <Words key={at} look={look} style={styles.paragraph} text={paragraph} />)}
        {model.pointsTo.reservation === null ? null : <Words look={look} style={styles.note} text={model.pointsTo.reservation} />}

        {model.wouldChange === null ? null : (
          <>
            <Heading look={look} title={model.wouldChange.title} />
            <Words look={look} style={styles.paragraph} text={model.wouldChange.text} />
          </>
        )}

        {model.paths === null ? null : (
          <>
            <Heading look={look} title={model.paths.title} />
            <Words look={look} style={styles.note} text={model.paths.intro} />
            {model.paths.items.map((path, at) => <PathRow key={at} look={look} path={path} />)}
          </>
        )}

        {model.howItWent === null ? null : (
          <>
            <Heading look={look} title={model.howItWent.title} />
            {model.howItWent.paragraphs.map((paragraph, at) => <Words key={at} look={look} style={styles.paragraph} text={paragraph} />)}
          </>
        )}

        {model.stillOpen === null ? null : (
          <>
            <Heading look={look} title={model.stillOpen.title} />
            {model.stillOpen.items.map((item, at) => (
              <View key={at} style={[styles.listRow, look.row]}>
                <Words look={look} style={styles.listMark} text="•" />
                <Words look={look} style={styles.listText} text={item} />
              </View>
            ))}
          </>
        )}

        {model.sources === null ? null : (
          <Fragment>
            <Heading look={look} title={model.sources.title} />
            {model.sources.items.map((source, at) => <Source key={at} look={look} source={source} />)}
          </Fragment>
        )}

        <Words look={look} style={pagesLeft ? styles.footerRight : styles.footerLeft} fixed text={model.footer.text} />
        <Text
          style={[pagesLeft ? styles.footerLeft : styles.footerRight, look.text]}
          fixed
          hyphenationPenalty={NEVER_BREAK_BETWEEN_RUNS}
          render={({ pageNumber, totalPages }) => pageWords(model, pageNumber, totalPages)}
        />
      </Page>
    </Document>
  );
}
