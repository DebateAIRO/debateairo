import type { JSX } from "react";
import type { FloorAnswerView } from "@/lib/v3/floorAnswer";

/**
 * The floor answer (spec 2026-09-26 §14.4.4, Task M6): what the reader sees
 * when no answer could be written but the engine kept its label. The label in
 * human words (where no pill already says it), "Our best answer:", the leading
 * position's own statement, and one plain line when the label rests on less
 * than usual. Every word is already in `view` (lib/v3/floorAnswer.ts); the
 * statement is the debate's own text, a React text child, never HTML. The
 * block carries the fixed words' language, and the statement its own.
 */
export function FloorAnswer({ view, showLabel }: { view: FloorAnswerView; showLabel: boolean }): JSX.Element {
  return (
    <div className="floorAnswer" lang={view.locale} dir={view.direction} data-floor-answer="true">
      {showLabel ? (
        <span className="floorAnswerLabel" data-verdict={view.verdictState}>{view.labelWords}</span>
      ) : null}
      <p className="floorAnswerLead">{view.lead}</p>
      <p className="floorAnswerStatement" lang={view.statementLocale} dir={view.statementDirection} data-ai-generated="true">
        {view.statement}
      </p>
      {view.thinBasis === null ? null : <p className="floorAnswerNote">{view.thinBasis}</p>}
    </div>
  );
}
