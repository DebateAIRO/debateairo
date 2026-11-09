"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

/*
 * V4 screen review, 3 Nov (dig-f23): the page's own question before a link would lose words the person typed and has
 * not added yet: "Leave this page? Your view isn't added yet." [Stay] [Leave]. Stay is the first choice and has the
 * focus; Escape stays. A real modal: Tab stays on its two buttons. It appears at once (no motion).
 */
export function V4LeaveQuestion(props: Readonly<{ onStay: () => void; onLeave: () => void; catalog: MessageCatalog }>) {
  const { onStay, onLeave, catalog } = props;
  const titleId = useId();
  const stayRef = useRef<HTMLButtonElement | null>(null);
  const leaveRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    stayRef.current?.focus();
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onStay();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    (document.activeElement === stayRef.current ? leaveRef.current : stayRef.current)?.focus();
  };
  return (
    <div className="v4LeaveBackdrop">
      <div className="v4Card v4Leave" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <p className="v4LeaveTitle" id={titleId}>{t(catalog, "v4.suggest.leaveQuestion")}</p>
        <div className="v4LeaveActions">
          <button ref={stayRef} type="button" className="v4Btn v4BtnPrimary" onClick={onStay}>{t(catalog, "v4.suggest.leaveStay")}</button>
          <button ref={leaveRef} type="button" className="v4Btn" onClick={onLeave}>{t(catalog, "v4.suggest.leaveGo")}</button>
        </div>
      </div>
    </div>
  );
}
