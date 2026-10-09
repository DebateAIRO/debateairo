export function InlineFieldMessage({ id, message }: {
    id: string;
    message?: string | null;
}) {
    // Not a live region: the field points here with aria-describedby and the form moves focus to the first
    // invalid field, so one submit is announced once instead of once per field (auth UI repair, 2026-10-09).
    return message ? <p id={id} className="authFieldError">{message}</p> : null;
}
