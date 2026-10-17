"use client";

import { challengeActions, type PopoverState } from "@/lib/scrutiny";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";
import composeEnglish from "@/messages/en/compose.json";
import { useDialogSurface } from "@/components/dialogSurface";

export function ChallengePopover({
  state,
  onClose,
  onChoose,
  catalog = debateDrawersEnglish,
  composeCatalog = composeEnglish
}: {
  state: PopoverState;
  onClose: () => void;
  onChoose: (actionKey: string) => void;
  catalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: the challenge actions. */
  composeCatalog?: MessageCatalog;
}) {
  const dialogRef = useDialogSurface<HTMLDivElement>(onClose);
  return (
    <>
      <div className="popScrim" onClick={onClose} />
      <div className="popAnchor" style={{ left: state.x, top: state.y }}>
        <div
          ref={dialogRef}
          tabIndex={-1}
          className="popCard"
          role="dialog"
          aria-modal
          aria-label={t(catalog, "debateDrawers.challenge.title")}
        >
          {state.text ? <div className="popQuote">“{state.text}”</div> : null}
          <div className="popLabel" aria-hidden="true">{t(catalog, "debateDrawers.challenge.title")}</div>
          {challengeActions(composeCatalog).map((action) => (
            <button key={action.key} type="button" className="popAction" onClick={() => onChoose(action.key)}>
              <span className="popActionIcon" aria-hidden="true">{action.icon}</span>
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
