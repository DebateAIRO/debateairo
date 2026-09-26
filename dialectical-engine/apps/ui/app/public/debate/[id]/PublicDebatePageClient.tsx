"use client";

import { useMemo } from "react";
import type { PublicDebate } from "@debateai/contract";
import DebatePageClient from "@/app/debate/[id]/DebatePageClient";
import { PublicAnswerDisclosure } from "@/components/PublicAnswerDisclosure";
import { PublicDebateOverview } from "@/components/PublicDebateOverview";
import { PublicHonestyDrawer } from "@/components/PublicHonestyDrawer";
import { SupportWidget } from "@/components/support/SupportWidget";
import {
  contractNodesById,
  debateDetailFromAnswer,
  type TreeProjectableAnswer
} from "@/lib/v3/adapter";
import type { AnswerExport } from "@/lib/v3/answerExport";
import { buildPublicAnswerExport } from "@/lib/v3/publicAnswerExport";
import type { LocaleCode } from "@/lib/i18n/locales";
import { formatDate, t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * A published debate is the private workspace seen by a stranger. This is a
 * projection, not a second implementation: the public envelope is adapted into
 * the shapes DebatePageClient already consumes, and that component renders in
 * `publicMode`. Anything the workspace gains — views, panels, chrome — a public
 * reader gains with it, and the two can never drift apart.
 */
export function PublicDebatePageClient({
  debate,
  locale,
  publicCatalog,
  timeCatalog,
  debateChromeCatalog,
  debateDrawersCatalog,
  miscCatalog,
  composeCatalog,
  homeCatalog
}: {
  debate: PublicDebate;
  locale: LocaleCode;
  publicCatalog: MessageCatalog;
  timeCatalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  debateDrawersCatalog: MessageCatalog;
  miscCatalog: MessageCatalog;
  composeCatalog: MessageCatalog;
  homeCatalog: MessageCatalog;
}) {
  // Publications made before trees were carried have no nodes. That is not an
  // error: the verdict, the summary and the honesty surface are still the
  // debate, so they project the same way and the canvas renders its own empty
  // state rather than a failure screen.
  const projection = useMemo(() => {
    const projectable: TreeProjectableAnswer = {
      nodes: debate.answer.nodes ?? [],
      edges: debate.answer.edges ?? [],
      condition_mark_records: [],
      answer_id: debate.public_ref,
      answer_version: 1,
      question_line: debate.question,
      terminal: debate.answer.terminal,
      composed_text: debate.answer.summary_segments,
      serve_state: debate.answer.terminal === "COMPONENTS_ONLY" ? "COMPONENTS_ONLY" : "COMPOSED"
    };
    const detail = debateDetailFromAnswer(projectable, composeCatalog);
    return {
      // An answer-only publication carries no argument graph. The adapter would
      // still synthesise a root from the question line, which would light up the
      // reading-mode controls over a tree that was never published — so the tree
      // is dropped and the workspace shows its own empty state instead.
      detail: debate.answer.tree_included === true ? detail : { ...detail, tree: null },
      nodesById: contractNodesById({ nodes: debate.answer.nodes ?? [] })
    };
  }, [composeCatalog, debate]);

  // S14's dual gate, public edition: the label must never outrun the bytes.
  // buildPublicAnswerExport ships exactly what the public envelope carries, so
  // the label says that and nothing more.
  const publicExport = useMemo<AnswerExport>(() => {
    const built = buildPublicAnswerExport(debate, publicCatalog);
    return {
      available: true,
      href: built.href,
      filename: built.filename,
      label: t(publicCatalog, "public.export.publishedSnapshotLabel"),
      toast: t(publicCatalog, "public.export.publishedSnapshotToast")
    };
  }, [debate, publicCatalog]);

  // The Turn-3b overview re-emits verdict, confidence and summary, but the
  // rest of the published envelope — pseudonym, published date, badges,
  // residual objections, the reversal point and the indexing disclosure — has
  // no other public home. It collapses behind one summary line rather than
  // being dropped. A closed <details> keeps its children in the DOM, so
  // nothing stops being reachable or assertable.
  const publicHeader = (
    <details className="publicationDetails">
      <summary>
        {t(publicCatalog, "public.header.summary", {
          author: debate.author_pseudonym,
          date: formatDate(locale, debate.published_at)
        })}
      </summary>
      <section className="card">
        <PublicAnswerDisclosure answer={debate.answer} catalog={publicCatalog} locale={locale} />
      </section>
      {debate.answer.badges.length > 0 ? (
        <section className="card"><h2>{t(publicCatalog, "public.badges.heading")}</h2><p>{debate.answer.badges.join(" · ")}</p></section>
      ) : null}
      {debate.answer.residual_objections.length > 0 ? (
        <section className="card">
          <h2>{t(publicCatalog, "public.residualObjections.heading")}</h2>
          {debate.answer.residual_objections.map((objection, index) => <p key={index}>{objection}</p>)}
        </section>
      ) : null}
      <section className="card"><h2>{t(publicCatalog, "public.reversalPoint.questionHeading")}</h2><p>{debate.answer.reversal_point}</p></section>
    </details>
  );

  return (
    <>
      <DebatePageClient
      id={debate.public_ref}
      initialDebate={projection.detail}
      initialAnswer={null}
      initialError={null}
      timeCatalog={timeCatalog}
      debateChromeCatalog={debateChromeCatalog}
      debateDrawersCatalog={debateDrawersCatalog}
      miscCatalog={miscCatalog}
      publicCatalog={publicCatalog}
      composeCatalog={composeCatalog}
      homeCatalog={homeCatalog}
      publicMode
      publicNodesById={projection.nodesById}
      publicExport={publicExport}
      publicHeader={publicHeader}
      publicOverview={({ onDetails, onRead }) => (
        <PublicDebateOverview
          debate={debate}
          catalog={publicCatalog}
          composeCatalog={composeCatalog}
          onDetails={onDetails}
          onRead={onRead}
        />
      )}
      renderPublicHonesty={(close) => (
        <PublicHonestyDrawer
          answer={debate.answer}
          catalog={publicCatalog}
          locale={locale}
          onClose={close}
        />
      )}
      />
      <SupportWidget />
    </>
  );
}
