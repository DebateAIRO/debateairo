import { t, type MessageCatalog } from "@/lib/i18n/translate";

/**
 * Side-by-side uploads spec 2026-10-21 §7 (plan C13): a public debate that a newer version of the site made, which
 * this older page cannot read, is told in one plain sentence instead of "not found". Words from `chrome`.
 */
export function MadeByNewerRelease({ catalog }: Readonly<{ catalog: MessageCatalog }>) {
  return (
    <div className="newVersionNote newVersionNotePage" role="status">
      <span>{t(catalog, "chrome.release.madeByNewer")}</span>
    </div>
  );
}
