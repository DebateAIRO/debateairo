import { checkDob, meetsMinimumAge, type DobParts } from '@debateai/kernel';
import { normalizeManualPhone } from '@debateai/kernel/manualPhone';
export type SignupField = 'email' | 'phone' | 'password' | 'dateOfBirth' | 'privacy' | 'terms';
export type SignupFieldErrors = Partial<Record<SignupField, string>>;
export const emailShape = (email: string) => email.length <= 254 && /^[^\s@,;]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email.trim());
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
    // Optional (owner ruling 2026-10-09): an empty field is fine; a typed number must parse.
    if (input.phone.trim() !== '') {
        try {
            normalizeManualPhone(input.phone);
        }
        catch {
            errors.phone = 'auth.phone.invalid';
        }
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
