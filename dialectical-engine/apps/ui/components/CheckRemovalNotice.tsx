"use client";

import * as React from "react";
import { useModalSurface } from "@/components/consent/modalSemantics";
import { useHideOutside } from "@/components/dialogSurface";
import { CrisisHelpNumbers } from "@/components/CrisisSupport";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type NoticeProps = Readonly<{
  catalog: MessageCatalog;
  locale: string;
  countryHint: string | null;
}>;

const CrisisCountryHintContext = React.createContext<string | null>(null);

export function CrisisCountryHintProvider({ countryHint, children }: Readonly<{
  countryHint: string | null;
  children: React.ReactNode;
}>) {
  return <CrisisCountryHintContext.Provider value={countryHint}>{children}</CrisisCountryHintContext.Provider>;
}

export function useCrisisCountryHint(): string | null {
  return React.useContext(CrisisCountryHintContext);
}

export function CheckRemovalNotice({ catalog, locale, countryHint, onClose }: NoticeProps & { onClose?: () => void }) {
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const titleRef = React.useRef<HTMLElement | null>(null);
  const close = onClose ?? (() => window.location.assign("/?tab=yours"));
  useHideOutside(dialogRef);
  useModalSurface(true, { containerRef: dialogRef, initialFocusRef: titleRef, onClose: close });
  return <div className="policyScrim">
    <div className="policyBezel crisisSupport" role="dialog" aria-modal="true"
      aria-labelledby="removal-notice-title" aria-describedby="removal-notice-what"
      data-dialog="removal-notice" ref={(node) => { dialogRef.current = node; }}>
      <div className="policyCore">
        <span className="policyTab" aria-hidden="true" />
        <div className="policyHead"><div className="policyHeadText">
          <h2 id="removal-notice-title" className="policyTitle" tabIndex={-1}
            ref={(node) => { titleRef.current = node; }}>{t(catalog, "home.removal.title")}</h2>
          <p id="removal-notice-what" className="crisisSupportLede">{t(catalog, "home.removal.what")}</p>
        </div></div>
        <div className="crisisSupportBody">
          <CrisisHelpNumbers catalog={catalog} locale={locale} countryHint={countryHint} />
          <div className="removalNoticeReasons">
            {(["reach", "facts", "automatic", "ground", "complain"] as const).map((reason) =>
              <p key={reason}>{t(catalog, `home.removal.${reason}`)}</p>)}
          </div>
        </div>
        <div className="policyFoot">
          <span className="policyFootSpacer" />
          <button type="button" className="crisisSupportBack" onClick={close}>{t(catalog, "home.removal.close")}</button>
        </div>
      </div>
    </div>
  </div>;
}

export function RemovalNoticeLatch({ taken, ...props }: NoticeProps & { taken: boolean }) {
  const [open, setOpen] = React.useState(taken);
  React.useEffect(() => { if (taken) setOpen(true); }, [taken]);
  return open ? <CheckRemovalNotice {...props} onClose={() => setOpen(false)} /> : null;
}
