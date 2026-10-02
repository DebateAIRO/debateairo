export type ConsentDocumentKind = "CONSENT_RENEWAL" | "CONSENT_IMMEDIATE_START";
export declare const CONSENT_KEYS: Readonly<Record<ConsentDocumentKind, string>>;
export declare function consentDocument(text: string): Readonly<{ version: string; sha256: string }>;
export declare function buildConsentManifestEntries(input: Readonly<{ messagesRoot: string; locales: readonly string[] }>):
  Readonly<Record<string, Readonly<Record<ConsentDocumentKind, Readonly<{ version: string; sha256: string }>>>>>;
