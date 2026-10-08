import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { InlineFieldMessage } from './InlineFieldMessage';
export function PhoneField({ value, onChange, catalog, error, disabled = false, id = 'signup-phone' }: {
    value: string;
    onChange: (raw: string) => void;
    catalog: MessageCatalog;
    error?: string;
    disabled?: boolean;
    id?: string;
}) {
    return <div className="authField"><label htmlFor={id}>{t(catalog, "auth.phone.label")}</label><input id={id} name="phone" type="tel" autoComplete="tel" inputMode="tel" value={value} onChange={e => onChange(e.target.value)} required disabled={disabled} aria-invalid={!!error || undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}/><p id={`${id}-hint`} className="authFieldHint">{t(catalog, "auth.phone.hint")}</p><InlineFieldMessage id={`${id}-error`} message={error}/></div>;
}
