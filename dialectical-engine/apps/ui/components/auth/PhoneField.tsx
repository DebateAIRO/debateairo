import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { InlineFieldMessage } from './InlineFieldMessage';
/** `optional` (sign-up, owner ruling 2026-10-09): may be left empty, and the hint says what the number is for. */
export function PhoneField({ value, onChange, catalog, error, disabled = false, id = 'signup-phone', optional = false }: {
    value: string;
    onChange: (raw: string) => void;
    catalog: MessageCatalog;
    error?: string;
    disabled?: boolean;
    id?: string;
    optional?: boolean;
}) {
    return <div className="authField"><label htmlFor={id}>{t(catalog, optional ? "auth.phone.optionalLabel" : "auth.phone.label")}</label><input id={id} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={value} onChange={e => onChange(e.target.value)} required={!optional} disabled={disabled} aria-invalid={!!error || undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}/><p id={`${id}-hint`} className="authFieldHint">{optional ? <>{t(catalog, "auth.phone.purpose")} </> : null}{t(catalog, "auth.phone.hint")}</p><InlineFieldMessage id={`${id}-error`} message={error}/></div>;
}
