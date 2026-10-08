"use client";
import { t, type MessageCatalog } from '@/lib/i18n/translate';
/** Codes are owned by the mounted caller only. Saving is optional; no type-back or storage. */
export function EphemeralCodes({ codes, catalog }: {
    codes: readonly string[];
    catalog: MessageCatalog;
}) {
    const content = codes.join('\n');
    function download() {
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'recovery-codes.txt';
        link.click();
        URL.revokeObjectURL(url);
    }
    return <aside><p>{t(catalog, "auth.login.replacementCodeNotice")}</p><pre>{content}</pre><button type="button" onClick={() => void navigator.clipboard.writeText(content)}>{t(catalog, "auth.codes.copy")}</button><button type="button" onClick={download}>{t(catalog, "auth.codes.download")}</button></aside>;
}
