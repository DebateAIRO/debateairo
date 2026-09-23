"use client";

import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";

const GUIDE_ITEMS = [
  {
    icon: "⚡",
    iconBg: "var(--gen-bg)",
    titleKey: "debateDrawers.guide.liveGenerationTitle",
    bodyKey: "debateDrawers.guide.liveGenerationBody"
  },
  {
    icon: "●",
    iconBg: "var(--pro-bg)",
    iconColor: "var(--reasoning)",
    titleKey: "debateDrawers.guide.attributionTitle",
    bodyKey: "debateDrawers.guide.attributionBody"
  },
  {
    icon: "⚐",
    iconBg: "var(--score-uncertainty-bg)",
    iconColor: "var(--score-uncertainty-text)",
    titleKey: "debateDrawers.guide.challengeTitle",
    bodyKey: "debateDrawers.guide.challengeBody"
  },
  {
    icon: "↻",
    iconBg: "var(--surface-sunken)",
    titleKey: "debateDrawers.guide.compareTitle",
    bodyKey: "debateDrawers.guide.compareBody"
  }
];

export function GuideModal({
  onClose,
  catalog = debateDrawersEnglish
}: {
  onClose: () => void;
  catalog?: MessageCatalog;
}) {
  return (
    <div className="modalScrim" onClick={onClose}>
      <div className="modalCard scroll" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="modalHead">
          <div>
            <div className="nodeEyebrow" style={{ marginBottom: 6 }}>
              {t(catalog, "debateDrawers.guide.eyebrow")}
            </div>
            <div className="modalTitle">{t(catalog, "debateDrawers.guide.title")}</div>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "debateDrawers.common.close")}>
            ×
          </button>
        </div>
        <div className="guideList">
          {GUIDE_ITEMS.map((item) => (
            <div key={item.titleKey} className="guideRow">
              <span className="guideIcon" style={{ background: item.iconBg, color: item.iconColor }}>
                {item.icon}
              </span>
              <div>
                <div className="guideRowTitle">{t(catalog, item.titleKey)}</div>
                <div className="guideRowBody">{t(catalog, item.bodyKey)}</div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btnDark guideDone" onClick={onClose}>
          {t(catalog, "debateDrawers.guide.gotIt")}
        </button>
      </div>
    </div>
  );
}
