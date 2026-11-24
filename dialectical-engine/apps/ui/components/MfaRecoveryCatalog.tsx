"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MessageCatalog } from "@/lib/i18n/translate";
import english from "@/messages/en/mfa-recovery.json";

/**
 * The reader's `mfa-recovery` catalogue for client screens that show a few of its
 * sentences away from the recovery pages: the "Know your password…" link on /recover
 * and the backup-email card in Settings → Security. Those routes serve it with the
 * server render, the way AuthCatalogProvider serves `auth`, so the sentences paint in
 * the reader's locale with no client chunk (owner, 2026-10-09: "clear plain screens
 * in all 35 locales"). A component rendered without a served catalogue reads English.
 */
/** Where the layout of /recover puts the name of the password-reset link, taken from the reader's password-reset catalogue. */
export const PASSWORD_RESET_LINK_KEY = "password-reset.request.title";

const MfaRecoveryCatalogContext = createContext<MessageCatalog | null>(null);

export function MfaRecoveryCatalogProvider({ catalog, children }: { catalog: MessageCatalog; children: ReactNode }) {
  return <MfaRecoveryCatalogContext.Provider value={catalog}>{children}</MfaRecoveryCatalogContext.Provider>;
}

export function useMfaRecoveryCatalog(): MessageCatalog {
  return useContext(MfaRecoveryCatalogContext) ?? english;
}
