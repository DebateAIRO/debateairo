"use client";

const GUIDE_ITEMS = [
  {
    icon: "⚡",
    iconBg: "oklch(0.95 0.04 78)",
    title: "Live generation",
    body: "The skeleton appears first, then each model writes its claim in with a cursor while the bar tracks progress."
  },
  {
    icon: "●",
    iconBg: "oklch(0.95 0.03 165)",
    iconColor: "oklch(0.58 0.13 255)",
    title: "Who said what, and which side",
    body: "Every claim names the model that wrote it (colored dot). Pro supports its parent claim; Con opposes it."
  },
  {
    icon: "⚐",
    iconBg: "oklch(0.95 0.04 78)",
    iconColor: "oklch(0.45 0.06 55)",
    title: "Challenge a flaw anywhere",
    body: "Click Challenge on a claim — or select any sentence inside an argument — to send focused scrutiny at that exact spot."
  },
  {
    icon: "↻",
    iconBg: "oklch(0.94 0.01 75)",
    title: "Compare, switch, export",
    body: "Open any claim for its generation history and compare versions. Toggle Tree / Outline, and Export for Markdown."
  }
];

export function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modalScrim" onClick={onClose}>
      <div className="modalCard scroll" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal>
        <div className="modalHead">
          <div>
            <div className="nodeEyebrow" style={{ marginBottom: 6 }}>
              How to read this
            </div>
            <div className="modalTitle">A debate is an argument tree several models build together.</div>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="guideList">
          {GUIDE_ITEMS.map((item) => (
            <div key={item.title} className="guideRow">
              <span className="guideIcon" style={{ background: item.iconBg, color: item.iconColor }}>
                {item.icon}
              </span>
              <div>
                <div className="guideRowTitle">{item.title}</div>
                <div className="guideRowBody">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btnDark guideDone" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
