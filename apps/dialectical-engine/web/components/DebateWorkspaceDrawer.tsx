"use client";

import type { DebateDetail, SingleShotResult } from "@/lib/types";

function provenanceLabel(provenance: Record<string, unknown>): string {
  const model = typeof provenance.model_id === "string" ? provenance.model_id : "";
  const worker = typeof provenance.worker_id === "string" ? provenance.worker_id : "";
  const prompt = typeof provenance.prompt_id === "string" ? provenance.prompt_id : "";
  return [model, worker, prompt].filter(Boolean).join(" · ");
}

export function DebateWorkspaceDrawer({
  debate,
  singleShot,
  onClose
}: {
  debate: DebateDetail;
  singleShot: SingleShotResult | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Workspace artifacts">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="invLabel">Workspace</span>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          {debate.analyzer_runs.length ? (
            <section className="wsSection">
              <div className="drawerHistoryHead">
                <span>Analyzers</span>
              </div>
              <div className="wsList">
                {debate.analyzer_runs.map((run) => (
                  <article key={run.id} className="wsCard">
                    <div className="wsCardHead">
                      <h3>{run.analyzer_type}</h3>
                      <span className="pill">{run.status}</span>
                    </div>
                    <p>{run.output.findings?.[0] || "No finding recorded."}</p>
                    <p className="wsMuted">{provenanceLabel(run.provenance)}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {debate.agent_runs.length ? (
            <section className="wsSection">
              <div className="drawerHistoryHead">
                <span>Agent breakdown</span>
              </div>
              <div className="wsList">
                {debate.agent_runs.map((run) => (
                  <article key={run.id} className="wsCard">
                    <div className="wsCardHead">
                      <h3>{run.agent_name || run.role || run.id}</h3>
                      <span className="pill">{run.status}</span>
                    </div>
                    <p>{run.summary || run.agent.description || "No summary recorded."}</p>
                    {run.skills_used.length ? (
                      <p className="wsMuted">Skills: {run.skills_used.map((s) => s.name || s.id).join(", ")}</p>
                    ) : null}
                    <div className="wsColumns">
                      <div>
                        <div className="wsColLabel">Pros ({run.pros.length})</div>
                        <ul>
                          {run.pros.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="wsColLabel">Cons ({run.cons.length})</div>
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
                <span>Single-shot</span>
              </div>
              <article className="wsCard">
                <p>{singleShot.final_text}</p>
                <p className="wsMuted">
                  {singleShot.model_id} · winner: {singleShot.global_winner.side}
                </p>
              </article>
            </section>
          ) : null}

          {!debate.analyzer_runs.length && !debate.agent_runs.length && !singleShot ? (
            <div className="muted">No workspace artifacts for this debate.</div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
