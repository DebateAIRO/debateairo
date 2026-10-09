"use client";
import { t, type MessageCatalog } from '@/lib/i18n/translate';
/** Codes are owned by the mounted caller only. Saving is optional; no type-back or storage. */
export function EphemeralCodes({ codes, catalog, kind = 'replacement' }: {
    codes: readonly string[];
    catalog: MessageCatalog;
    /** 'new': a freshly generated set (Settings). 'replacement': the one code that replaced a used one. */
    kind?: 'new' | 'replacement';
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
    return <aside className="authCodes"><p>{kind === 'new' ? t(catalog, "auth.codes.newNotice") : t(catalog, "auth.login.replacementCodeNotice")}</p><pre className="authRecoveryCode">{content}</pre><div className="authCodesActions"><button type="button" className="authSecondary" onClick={() => void navigator.clipboard.writeText(content)}>{t(catalog, "auth.codes.copy")}</button><button type="button" className="authSecondary" onClick={download}>{t(catalog, "auth.codes.download")}</button></div></aside>;
}
