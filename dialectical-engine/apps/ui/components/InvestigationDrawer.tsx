"use client";

import type { DebateNode } from "@/lib/types";
import { scrutinyStatus as scrutinyStatuses } from "@/lib/scrutiny";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";
import composeEnglish from "@/messages/en/compose.json";

const RESOLUTIONS: { key: string; labelKey: string }[] = [
  { key: "contested", labelKey: "debateDrawers.investigation.contested" },
  { key: "strengthened", labelKey: "debateDrawers.investigation.strengthened" },
  { key: "refuted", labelKey: "debateDrawers.investigation.refuted" }
];

const STATUS_LABEL_KEYS: Record<string, string> = {
  working: "debateDrawers.investigation.investigating",
  contested: "debateDrawers.investigation.contested",
  strengthened: "debateDrawers.investigation.strengthened",
  refuted: "debateDrawers.investigation.refuted"
};

export function InvestigationDrawer({
  node,
  status,
  flagged,
  onClose,
  onResolve,
  onClear,
  catalog = debateDrawersEnglish,
  composeCatalog = composeEnglish
}: {
  node: DebateNode | null;
  status: string;
  flagged?: string;
  onClose: () => void;
  onResolve: (status: string) => void;
  onClear: () => void;
  catalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: the scrutiny status table. */
  composeCatalog?: MessageCatalog;
}) {
  const statuses = scrutinyStatuses(composeCatalog);
  const current = statuses[status] ?? statuses.working;
  const currentLabel = t(catalog, STATUS_LABEL_KEYS[status] ?? STATUS_LABEL_KEYS.working);
  const resolved = status !== "working";

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label={t(catalog, "debateDrawers.investigation.title")}>
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="invLabel">{t(catalog, "debateDrawers.investigation.title")}</span>
            <span className="pill" style={{ background: current.bg, borderColor: current.color, color: current.color }}>
              <span className="dot" style={{ background: current.color }} />
              {currentLabel}
            </span>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "debateDrawers.common.close")}>
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="nodeEyebrow">{t(catalog, "debateDrawers.investigation.flaggedClaim")}</div>
          <div className="invFlagged" style={{ borderLeftColor: current.color }}>
            <div className="invFlaggedClaim">{node?.claim ?? "—"}</div>
            {flagged ? <div className="invFlaggedSpan">{t(catalog, "debateDrawers.investigation.flaggedSpan", { text: flagged })}</div> : null}
          </div>

          <div className="drawerDivider" />

          <div className="drawerHistoryHead">
            <span>{t(catalog, "debateDrawers.investigation.resolution")}</span>
          </div>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            {t(catalog, "debateDrawers.investigation.instructions")}
          </p>

          <div className="invResolutions">
            {RESOLUTIONS.map((resolution) => {
              const meta = statuses[resolution.key];
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
                  {t(catalog, resolution.labelKey)}
                </button>
              );
            })}
          </div>

          {resolved ? (
            <div className="invFinal" style={{ background: current.bg, borderColor: current.color }}>
              <div className="invFinalText">{t(catalog, "debateDrawers.investigation.recorded", { status: currentLabel })}</div>
              <button type="button" className="btn" style={{ marginTop: 11 }} onClick={onClear}>
                {t(catalog, "debateDrawers.investigation.resolveAndClear")}
              </button>
            </div>
          ) : (
            <div className="invWorking">
              <span className="invWorkingDot" />
              {t(catalog, "debateDrawers.investigation.awaitingJudgement")}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
