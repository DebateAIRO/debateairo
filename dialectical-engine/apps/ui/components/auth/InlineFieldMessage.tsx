export function InlineFieldMessage({ id, message }: {
    id: string;
    message?: string | null;
}) {
    return message ? <p id={id} className="authFieldError" role="alert">{message}</p> : null;
}
