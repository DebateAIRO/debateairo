import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { PublicPageNote } from "./PublicPageNote";

/**
 * Side-by-side uploads spec 2026-10-21 §7 (plan C13): a public debate that a newer version of the site made, which
 * this older page cannot read, is told in one plain sentence instead of "not found". Its words from `chrome`;
 * public-f8: inside the normal header, with the two ways on (V4's words).
 */
export function MadeByNewerRelease({ catalog, v4Catalog }: Readonly<{ catalog: MessageCatalog; v4Catalog: MessageCatalog }>) {
  return <PublicPageNote kind="newer-release" v4Catalog={v4Catalog} line={t(catalog, "chrome.release.madeByNewer")} />;
}
