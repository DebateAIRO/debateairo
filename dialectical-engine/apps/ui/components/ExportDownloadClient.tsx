"use client";
import { useEffect, useState } from "react";
import { ContractHttpError, type ContractClient } from "@debateai/contract";
import { contractClient } from "@/lib/api";
import { clearPendingExport, readExportLinkOutcome, readPendingExport, rememberExportLinkOutcome, stashPendingExport } from "@/lib/dataExportPending";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

type Download = { bytes: ArrayBuffer; filename: string };
type View = "checking" | "starting" | "noLink" | "incomplete" | "reopenFromEmail" | "invalid" | "wrongAccount" | "held" | "unavailable";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function startDownload(file: Download): void {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ExportDownloadClient({ catalog, client = contractClient }: { catalog: MessageCatalog; client?: ContractClient }) {
  const [view, setView] = useState<View>("checking");
  const [file, setFile] = useState<Download | null>(null);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    const open = (fromHashChange: boolean) => {
      const fragment = window.location.hash.slice(1);
      if (fromHashChange && !fragment) return;
      const currentRequest = ++requestId;
      setFile(null);
      setView("checking");
      if (fragment) {
        window.history.replaceState(null, "", "/export");
        if (TOKEN.test(fragment)) stashPendingExport(fragment);
      }
      const token = TOKEN.test(fragment) ? fragment : fragment ? null : readPendingExport();
      if (!token || !TOKEN.test(token)) {
        if (fragment || token) {
          clearPendingExport();
          rememberExportLinkOutcome("incomplete");
          setView("incomplete");
        } else {
          const outcome = readExportLinkOutcome();
          setView(outcome === "downloaded" ? "reopenFromEmail" : outcome ?? "noLink");
        }
        return;
      }
      void client.downloadDataExport(token).then((download) => {
        if (!active || currentRequest !== requestId) return;
        const ready = { bytes: download.bytes, filename: download.filename };
        setFile(ready);
        setView("starting");
        startDownload(ready);
        clearPendingExport();
        rememberExportLinkOutcome("downloaded");
      }, (failure: unknown) => {
        if (!active || currentRequest !== requestId) return;
        if (failure instanceof ContractHttpError && (failure.code === "SESSION_REQUIRED" || failure.serverCode === "COOKIE_SESSION_REQUIRED" || failure.serverCode === "SESSION_REQUIRED")) {
          window.location.assign("/login?next=/export");
          return;
        }
        if (failure instanceof ContractHttpError && failure.serverCode === "EXPORT_WRONG_ACCOUNT") {
          clearPendingExport(); rememberExportLinkOutcome("wrongAccount"); setView("wrongAccount");
        } else if (failure instanceof ContractHttpError && failure.serverCode === "EXPORT_LINK_INVALID") {
          clearPendingExport(); rememberExportLinkOutcome("invalid"); setView("invalid");
        } else if (failure instanceof ContractHttpError && failure.serverCode === "EXPORT_ACCOUNT_HELD") {
          setView("held");
        } else {
          setView("unavailable");
        }
      });
    };
    const onHashChange = () => open(true);
    window.addEventListener("hashchange", onHashChange);
    open(false);
    return () => { active = false; window.removeEventListener("hashchange", onHashChange); };
  }, [client]);

  const message = view === "starting" ? t(catalog, "settings.export.download.starting")
    : view === "noLink" ? t(catalog, "settings.export.download.noLink")
    : view === "incomplete" ? t(catalog, "settings.export.download.incomplete")
    : view === "reopenFromEmail" ? t(catalog, "settings.export.download.reopenFromEmail")
    : view === "invalid" ? t(catalog, "settings.export.download.invalid")
    : view === "wrongAccount" ? t(catalog, "settings.export.download.wrongAccount")
    : view === "held" ? t(catalog, "settings.export.held")
    : view === "unavailable" ? t(catalog, "settings.export.unavailable") : null;
  return <main className="setBody"><div className="setInner">
    <h1 className="setTitle exportPageTitle">{t(catalog, "settings.export.download.title")}</h1>
    <section className="setCard">
      {message ? <p className="setCardHint exportMessage" role="status">{message}</p> : null}
      {view === "starting" && file ? <div className="setCardRow"><button type="button" className="setBtn setBtnPrimary" onClick={() => startDownload(file)}>{t(catalog, "settings.export.download.button")}</button></div> : null}
      {view === "invalid" ? <form action="/settings" method="get" className="setCardRow"><button type="submit" className="setBtn" name="request-export" value="1">{t(catalog, "settings.export.requestAgain")}</button></form> : null}
      {(view === "noLink" || view === "incomplete" || view === "reopenFromEmail" || view === "held" || view === "unavailable") ? <div className="setCardRow"><a className="setBtn" href="/settings">{t(catalog, "settings.export.download.backToSettings")}</a></div> : null}
    </section>
  </div></main>;
}
