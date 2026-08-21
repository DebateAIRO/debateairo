"use client";

import { CHALLENGE_ACTIONS, type PopoverState } from "@/lib/scrutiny";

export function ChallengePopover({
  state,
  onClose,
  onChoose
}: {
  state: PopoverState;
  onClose: () => void;
  onChoose: (actionKey: string) => void;
}) {
  return (
    <>
      <div className="popScrim" onClick={onClose} />
      <div className="popAnchor" style={{ left: state.x, top: state.y }}>
        <div className="popCard">
          {state.text ? <div className="popQuote">“{state.text}”</div> : null}
          <div className="popLabel">Challenge this</div>
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
