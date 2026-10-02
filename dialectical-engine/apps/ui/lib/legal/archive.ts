import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { archivedDocument, type LegalArchiveKind } from "@debateai/legal-manifest";
import { LOCALES } from "@/lib/i18n/locales";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const UI_PREFIX = "apps/ui/";

export type ArchivedLegalText = Readonly<{ version: string; sha256: string; locale: string; text: string }>;

/**
 * Ruling Q-3: one published Terms or Privacy text, found by its sha256 in the manifest's archive (the reader's
 * language first, then any: a hash names one text wherever the link was copied from) and read from the repository
 * file L2 wrote. `entry.path` is relative to dialectical-engine/; the UI runs from apps/ui (debateai-ui.service's
 * WorkingDirectory) and the root tests from the repository, so the file is looked for relative to both, like
 * availablePaymentMarks. The bytes must still hash to the name (the check P17's resolver makes). Anything else is
 * null, and the page answers "not found". Server components only: this reads the disk.
 */
export function archivedLegalText(
  kind: LegalArchiveKind,
  sha256: string,
  preferredLocale: string,
  cwd: string = process.cwd()
): ArchivedLegalText | null {
  if (!SHA256_HEX.test(sha256)) return null;
  const locales = [preferredLocale, ...LOCALES.map(({ code }) => code).filter((code) => code !== preferredLocale)];
  for (const locale of locales) {
    const entry = archivedDocument(kind, locale, sha256);
    if (entry === null) continue;
    const inUi = entry.path.startsWith(UI_PREFIX) ? entry.path.slice(UI_PREFIX.length) : entry.path;
    const file = [resolve(cwd, entry.path), resolve(cwd, inUi)].find((candidate) => existsSync(candidate));
    if (file === undefined) return null;
    const bytes = readFileSync(file);
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) return null;
    return Object.freeze({ version: entry.version, sha256, locale, text: bytes.toString("utf8") });
  }
  return null;
}
