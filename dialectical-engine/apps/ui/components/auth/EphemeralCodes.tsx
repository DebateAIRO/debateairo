"use client";
import { t, type MessageCatalog } from '@/lib/i18n/translate';
/** A freshly generated set of recovery codes, owned by the mounted caller only. Saving is optional; no type-back or
 * storage. Since 2026-10-09 a used code is never refilled, so there is no single "replacement" code to show any more. */
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
    return <aside className="authCodes"><p>{t(catalog, "auth.codes.newNotice")}</p><pre className="authRecoveryCode">{content}</pre><div className="authCodesActions"><button type="button" className="authSecondary" onClick={() => void navigator.clipboard.writeText(content)}>{t(catalog, "auth.codes.copy")}</button><button type="button" className="authSecondary" onClick={download}>{t(catalog, "auth.codes.download")}</button></div></aside>;
}
