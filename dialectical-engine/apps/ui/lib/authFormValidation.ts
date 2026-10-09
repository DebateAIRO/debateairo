import { checkDob, isMailAddress, meetsMinimumAge, type DobParts } from '@debateai/kernel';
import { normalizeManualPhone } from '@debateai/kernel/manualPhone';
export type SignupField = 'email' | 'phone' | 'password' | 'dateOfBirth' | 'privacy' | 'terms';
export type SignupFieldErrors = Partial<Record<SignupField, string>>;
/** The server's own address rule (packages/kernel/src/mail-address.ts), so the form never accepts what sign-up refuses. */
export const emailShape = (email: string) => isMailAddress(email.trim());
/**
 * Sign-in and recovery LOOK UP an existing account, so they keep the older, wider shape: an account created before
 * the shared rule (2026-10-09) must still be able to sign in and ask for help, even if its address is now refused
 * for new sign-ups and mail.
 */
export const signInEmailShape = (email: string) => email.length <= 254 && /^[^\s@,;]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email.trim());
export function validateSignup(input: {
    email: string;
    phone: string;
    password?: string;
    dateOfBirth: DobParts;
    privacy: boolean;
    terms: boolean;
}): SignupFieldErrors {
    const errors: SignupFieldErrors = {};
    if (!emailShape(input.email))
        errors.email = 'auth.invalidEmail';
    try {
        normalizeManualPhone(input.phone);
    }
    catch {
        errors.phone = 'auth.phone.invalid';
    }
    if (input.password !== undefined && (input.password.length < 8 || input.password.length > 1024))
        errors.password = 'auth.signUp.passwordInvalid';
    if (checkDob(input.dateOfBirth).code !== 'ok' || !meetsMinimumAge(input.dateOfBirth))
        errors.dateOfBirth = 'auth.dob.underAge';
    if (!input.privacy)
        errors.privacy = 'auth.signUp.privacyRequired';
    if (!input.terms)
        errors.terms = 'auth.signUp.termsRequired';
    return errors;
}
