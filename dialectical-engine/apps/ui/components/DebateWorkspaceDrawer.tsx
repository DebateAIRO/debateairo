"use client";

import type { DebateDetail, SingleShotResult } from "@/lib/types";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";

function provenanceLabel(provenance: Record<string, unknown>): string {
  const model = typeof provenance.model_id === "string" ? provenance.model_id : "";
  const worker = typeof provenance.worker_id === "string" ? provenance.worker_id : "";
  const prompt = typeof provenance.prompt_id === "string" ? provenance.prompt_id : "";
  return [model, worker, prompt].filter(Boolean).join(" · ");
}

export function DebateWorkspaceDrawer({
  debate,
  singleShot,
  onClose,
  catalog = debateDrawersEnglish
}: {
  debate: DebateDetail;
  singleShot: SingleShotResult | null;
  onClose: () => void;
  catalog?: MessageCatalog;
}) {
  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label={t(catalog, "debateDrawers.workspace.ariaLabel")}>
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="invLabel">{t(catalog, "debateDrawers.workspace.title")}</span>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "debateDrawers.common.close")}>
            ×
          </button>
        </div>

        <div className="drawerBody">
          {debate.analyzer_runs.length ? (
            <section className="wsSection">
              <div className="drawerHistoryHead">
                <span>{t(catalog, "debateDrawers.workspace.analyzers")}</span>
              </div>
              <div className="wsList">
                {debate.analyzer_runs.map((run) => (
                  <article key={run.id} className="wsCard">
                    <div className="wsCardHead">
                      <h3>{run.analyzer_type}</h3>
                      <span className="pill">{run.status}</span>
                    </div>
                    <p>{run.output.findings?.[0] || t(catalog, "debateDrawers.workspace.noFinding")}</p>
                    <p className="wsMuted">{provenanceLabel(run.provenance)}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {debate.agent_runs.length ? (
            <section className="wsSection">
              <div className="drawerHistoryHead">
                <span>{t(catalog, "debateDrawers.workspace.agentBreakdown")}</span>
              </div>
              <div className="wsList">
                {debate.agent_runs.map((run) => (
                  <article key={run.id} className="wsCard">
                    <div className="wsCardHead">
                      <h3>{run.agent_name || run.role || run.id}</h3>
                      <span className="pill">{run.status}</span>
                    </div>
                    <p>{run.summary || run.agent.description || t(catalog, "debateDrawers.workspace.noSummary")}</p>
                    {run.skills_used.length ? (
                      <p className="wsMuted">{t(catalog, "debateDrawers.workspace.skills", { skills: run.skills_used.map((s) => s.name || s.id).join(", ") })}</p>
                    ) : null}
                    <div className="wsColumns">
                      <div>
                        <div className="wsColLabel">{t(catalog, "debateDrawers.workspace.pros", { count: run.pros.length })}</div>
                        <ul>
                          {run.pros.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="wsColLabel">{t(catalog, "debateDrawers.workspace.cons", { count: run.cons.length })}</div>
                        <ul>
                          {run.cons.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <p className="wsMuted">{provenanceLabel(run.provenance)}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {singleShot ? (
            <section className="wsSection">
              <div className="drawerHistoryHead">
                <span>{t(catalog, "debateDrawers.workspace.singleShot")}</span>
              </div>
              <article className="wsCard">
                <p>{singleShot.final_text}</p>
                <p className="wsMuted">
                  {t(catalog, "debateDrawers.workspace.singleShotWinner", { model: singleShot.model_id, side: singleShot.global_winner.side })}
                </p>
              </article>
            </section>
          ) : null}

          {!debate.analyzer_runs.length && !debate.agent_runs.length && !singleShot ? (
            <div className="muted">{t(catalog, "debateDrawers.workspace.empty")}</div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
