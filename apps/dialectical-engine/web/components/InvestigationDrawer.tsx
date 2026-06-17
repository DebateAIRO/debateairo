"use client";

import type { DebateNode } from "@/lib/types";
import { SCRUTINY_STATUS } from "@/lib/scrutiny";

const RESOLUTIONS: { key: string; label: string }[] = [
  { key: "contested", label: "Contested" },
  { key: "strengthened", label: "Strengthened" },
  { key: "refuted", label: "Refuted" }
];

export function InvestigationDrawer({
  node,
  status,
  flagged,
  onClose,
  onResolve,
  onClear
}: {
  node: DebateNode | null;
  status: string;
  flagged?: string;
  onClose: () => void;
  onResolve: (status: string) => void;
  onClear: () => void;
}) {
  const current = SCRUTINY_STATUS[status] ?? SCRUTINY_STATUS.working;
  const resolved = status !== "working";

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Investigation">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="invLabel">Investigation</span>
            <span className="pill" style={{ background: current.bg, borderColor: current.color, color: current.color }}>
              <span className="dot" style={{ background: current.color }} />
              {current.label}
            </span>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="nodeEyebrow">Flagged claim</div>
          <div className="invFlagged" style={{ borderLeftColor: current.color }}>
            <div className="invFlaggedClaim">{node?.claim ?? "—"}</div>
            {flagged ? <div className="invFlaggedSpan">flagged span — “{flagged}”</div> : null}
          </div>

          <div className="drawerDivider" />

          <div className="drawerHistoryHead">
            <span>Resolution</span>
          </div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            Record how this claim held up under scrutiny. The node carries the badge so the rest of the tree reads it
            in context.
          </p>

          <div className="invResolutions">
            {RESOLUTIONS.map((resolution) => {
              const meta = SCRUTINY_STATUS[resolution.key];
              const active = status === resolution.key;
              return (
                <button
                  key={resolution.key}
                  type="button"
                  className={`invResolution${active ? " active" : ""}`}
                  style={
                    active
                      ? { borderColor: meta.color, background: meta.bg, color: meta.color }
                      : undefined
                  }
                  onClick={() => onResolve(resolution.key)}
                >
                  <span className="dot" style={{ background: meta.color }} />
                  {resolution.label}
                </button>
              );
            })}
          </div>

          {resolved ? (
            <div className="invFinal" style={{ background: current.bg, borderColor: current.color }}>
              <div className="invFinalText">{current.label} — this is recorded on the node.</div>
              <button type="button" className="btn" style={{ marginTop: 11 }} onClick={onClear}>
                Resolve &amp; clear scrutiny
              </button>
            </div>
          ) : (
            <div className="invWorking">
              <span className="invWorkingDot" />
              Awaiting your judgement…
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
