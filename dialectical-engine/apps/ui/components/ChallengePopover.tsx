"use client";

import { CHALLENGE_ACTIONS, type PopoverState } from "@/lib/scrutiny";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";

export function ChallengePopover({
  state,
  onClose,
  onChoose,
  catalog = debateDrawersEnglish
}: {
  state: PopoverState;
  onClose: () => void;
  onChoose: (actionKey: string) => void;
  catalog?: MessageCatalog;
}) {
  return (
    <>
      <div className="popScrim" onClick={onClose} />
      <div className="popAnchor" style={{ left: state.x, top: state.y }}>
        <div className="popCard">
          {state.text ? <div className="popQuote">“{state.text}”</div> : null}
          <div className="popLabel">{t(catalog, "debateDrawers.challenge.title")}</div>
          {CHALLENGE_ACTIONS.map((action) => (
            <button key={action.key} type="button" className="popAction" onClick={() => onChoose(action.key)}>
              <span className="popActionIcon">{action.icon}</span>
              <span className="popActionText">
                <span className="popActionLabel">{action.label}</span>
                <span className="popActionSub">{action.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
