"use client";

import { useEffect, useRef, useState } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { stepStates, type DigFinding, type DigProgress } from "@/lib/v4/digProgress";
import type { DigView } from "@/lib/v4/types";
import { V4WaitCard } from "./V4WaitCard";

/*
 * Owner's screen review, 3 Nov 2026: a running dig's own panel (dig-d1 B, which includes A; dig-f32). Top to bottom:
 *  1. the one waiting card (journey-d2, wave 1's V4WaitCard, inline): the one true state line "Looking into it" with its
 *     slow pulse, "Started 14:31", the mode word (left out on Free, dig-f8) and, when the server reports them, the steps
 *     "✓ Finding sources › ✓ Reading › Checking › Writing what changed" (done ones ticked, the current one in bold; with no
 *     web search "Arguing for and against › Checking › Writing what changed"); then "You can leave this page. It keeps
 *     going." (the account-wide "Email me when it's done?" will sit there once the server keeps that choice, journey-f9);
 *  2. "Checked so far": each finding the moment it passes its checks, with its trust word; before the first, "Findings
 *     show here once they pass their checks." Nothing unchecked is ever shown;
 *  3. "This path says now ▾", folded: the path's current text, so the change has something to be compared with later.
 * With no progress read from the server (today's API), part 1 is the calm line alone and part 2 is left out: the page
 * never shows a step it is only guessing (journey-f3). While the path is being rewritten it then says so in today's words.
 *
 * Motion (journey-d1 and the chat answer "Six moves"): a finding that arrives while the panel is open flies in (the shared
 * --v4-move-fly, under 0.5 s) with the 1-second soft highlight; one already there when the panel opened does not move. A
 * step that moves on changes at once with the highlight. Under reduced motion the fly is instant; the highlight and the
 * words stay. No sound. Screen readers hear each new finding once (a polite live list) and the state line as before.
 */

/** The 1-second soft highlight of a step that moved on (the owner's motion rule; .v4Highlight in v4-base.css). */
const HIGHLIGHT_MS = 1_000;

/** True for one second after `value` changes (never on the first show). */
function useChanged(value: string): boolean {
  const previous = useRef(value);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setLit(true);
    const timer = window.setTimeout(() => setLit(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return lit;
}

function DigSteps(props: Readonly<{ progress: DigProgress; catalog: MessageCatalog }>) {
  const { progress, catalog } = props;
  const moved = useChanged(progress.now ?? "");
  return (
    <ol className="v4DigSteps" aria-label={t(catalog, "v4.digLive.stepsLabel")} data-dig-steps="">
      {stepStates(progress).map(({ step, state }) => (
        <li
          key={step}
          className={`v4DigStep v4DigStep-${state}${state === "NOW" && moved ? " v4Highlight" : ""}`}
          aria-current={state === "NOW" ? "step" : undefined}
          data-step={step}
          data-step-state={state}
        >
          {state === "DONE" ? <span className="v4DigStepTick" aria-hidden="true">✓</span> : null}
          <span>{t(catalog, `v4.digLive.step.${step}`)}</span>
          {state === "DONE" ? <span className="v4SrOnly"> {t(catalog, "v4.digLive.stepDone")}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function DigFindings(props: Readonly<{ findings: readonly DigFinding[]; catalog: MessageCatalog }>) {
  const { findings, catalog } = props;
  // The findings already there when the panel opened are not news: only later ones fly in.
  const [before] = useState<ReadonlySet<string>>(() => new Set(findings.map((finding) => finding.id)));
  return (
    <section className="v4DigFound" data-dig-found="">
      <h3 className="v4PanelH3">{t(catalog, "v4.digLive.found")}</h3>
      {findings.length === 0 ? <p className="v4Muted v4DigFoundNone">{t(catalog, "v4.digLive.foundNone")}</p> : null}
      {/* Always in the page, so a screen reader hears each finding as it is added. */}
      <ol className="v4DigFindings" aria-live="polite" aria-relevant="additions">
        {findings.map((finding) => (
          <li
            key={finding.id}
            className={`v4DigFinding v4DigFinding${finding.trust}${before.has(finding.id) ? "" : " v4DigFindingNew"}`}
            data-finding={finding.id}
          >
            <p className="v4DigFindingText" data-ai-generated="true">{finding.text}</p>
            <span className={`v4MapTrust v4MapTrust${finding.trust}`}>{t(catalog, `v4.trust.${finding.trust}`)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type V4DigRunningProps = Readonly<{
  /** The dig, while it works: running, or done and rewriting the path it came from. */
  dig: DigView;
  /** What the server reported of its steps and checked findings (lib/v4/digProgress.ts); null: none. */
  progress: DigProgress | null;
  /** The current text of the path the dig came from (AI text); null for a dig under the question itself. */
  pathLine: string | null;
  /** Owner N13: false on Free, which has no Quick look / Thorough choice (no mode word). */
  showMode: boolean;
  /** When a check last answered (the reduced-motion "Still working · checked 14:09"); null before one. */
  checkedAt: number | null;
  catalog: MessageCatalog;
  locale: string;
}>;

export function V4DigRunning(props: V4DigRunningProps) {
  const { dig, progress, catalog } = props;
  const rewriting = dig.state === "DONE" && dig.rewrite?.state === "WRITING";
  const steps = progress !== null && progress.steps.length > 0 ? progress : null;
  const pathLine = props.pathLine?.trim() ?? "";
  return (
    <div className="v4DigLive" data-dig-live="">
      <V4WaitCard
        variant="inline"
        state={{ kind: "LOOKING" }}
        startedAt={dig.link.startedAt}
        checkedAt={props.checkedAt}
        catalog={catalog}
        locale={props.locale}
      >
        {props.showMode && dig.link.mode !== null
          ? <p className="v4PanelText"><span className="v4PanelModeTag">{t(catalog, `v4.digMode.${dig.link.mode}`)}</span></p>
          : null}
        {steps !== null
          ? <DigSteps progress={steps} catalog={catalog} />
          : rewriting ? <p className="v4PanelText v4DigLiveRewriting">{t(catalog, "v4.rewrite.digCard.REWRITING")}</p> : null}
      </V4WaitCard>
      {progress !== null ? <DigFindings findings={progress.findings} catalog={catalog} /> : null}
      {pathLine.length > 0 ? (
        <details className="v4DigPathNow">
          <summary>{t(catalog, "v4.digLive.pathNow")}</summary>
          <p className="v4PanelText" data-ai-generated="true">{pathLine}</p>
        </details>
      ) : null}
    </div>
  );
}
