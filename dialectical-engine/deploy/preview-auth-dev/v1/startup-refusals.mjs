/**
 * The refusals a launcher may name beside its one-line "startup refused" message, so the journal says which owner
 * setting is wrong. Only a code of these closed forms is ever printed, never a setting's value: upper-case words, and
 * for a few an ending of lower-case words or counts. Every other failure prints the bare line, as before.
 */
const NAMED_REFUSALS = Object.freeze([
  /^PREVIEW_(?:ORIGIN|MAIN_ORIGIN|STAFF_ORIGIN|ASKS_OPEN_TO|MAIL|LIVE_PAYMENTS)_[A-Z]{1,24}(?:_[A-Z]{1,24}){0,5}(?::[a-z]{1,20}(?:-[a-z]{1,20}){0,3})?$/
]);
export const isNamedRefusal = code => typeof code === 'string' && code.length <= 120 && NAMED_REFUSALS.some(form => form.test(code));
/** The named code an error carries (its cause, its code or its message, in that order), or undefined. */
export function namedRefusal(error) {
  for (const candidate of [error?.cause, error?.code, error?.message]) if (isNamedRefusal(candidate)) return candidate;
  return undefined;
}
/**
 * Refuse a setting by name. The message stays the launcher's one refusal, so callers that match it are unchanged; the
 * name rides in the error's cause. A code outside the closed forms is refused without a name.
 */
export function refuseNamed(code) {
  throw new TypeError('PREVIEW_ENVIRONMENT_REFUSED', isNamedRefusal(code) ? { cause: code } : undefined);
}
/** A launcher's refusal line: the bare line, or the line and the named code. */
export const startupRefusedLine = (line, error) => { const code = namedRefusal(error); return code === undefined ? line : `${line} ${code}`; };
