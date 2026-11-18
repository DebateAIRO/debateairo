/**
 * How you sign in, in the English Terms and Privacy Policy (18 November 2026). The texts said only "two-factor
 * authentication is mandatory" and named a password, an authenticator app and recovery codes. origin/dev also has
 * passkeys (which sign you in on their own, with the device's face, fingerprint or PIN check), an optional phone number
 * that is never verified and is not a way to sign in, and Google, Apple and X sign-in, which is built but advertised
 * only when the sign-in relay is configured, so the texts say "where the sign-in page offers it". A password, or a
 * Google, Apple or X account, always needs a second step.
 *
 * Each pair is [what the line said, what it says now]. English first: version numbers stay 2.18 and 3.12, and the 34
 * translations follow before release. `legal-sign-in-methods` pins the new English; `legal-privacy-312` undoes these
 * swaps in English before it compares 3.12 with 3.11, so its history checks stay as they were.
 */
export const PRIVACY_SIGN_IN_SWAPS: readonly (readonly [string, string])[] = [
  [
    "password (stored as a hash, never in clear); your two-factor authentication secret (encrypted); ten recovery codes (stored as hashes); your pseudonym | You, at registration |",
    "password (stored as a hash, never in clear), unless you signed up with Google, Apple or X and have none; your two-factor authentication secret (encrypted), if you use an authenticator app; ten recovery codes (stored as hashes); for each passkey you create, the public key and identifier your device gives us, a count of its uses, whether it can be synced between your devices and is backed up, how your device reaches it, the name you give it, if any, and when it was created, last used or removed (the face, fingerprint or PIN check of a passkey happens on your device, and nothing of it reaches us); if you sign in with Google, Apple or X, which of them and the identifier it gives you there (that company also sends us your name and email address there: we use them only to fill in the sign-up form, keep them in our server's memory for at most 5 minutes and do not store them, and if the email address you give us is one Google or Apple has confirmed, we do not send you a verification email; X's permission screen also lists reading your posts, but we ask X only for your identifier, your name and your confirmed email address; that company learns that you use our service, under its own privacy policy); a phone number, if you choose to give one (stored encrypted, and Settings shows only its last four digits; we do not check that it is yours, it is not a way to sign in, and we send no text messages to it); your pseudonym | You, at registration and in Settings; Google, Apple or X, if you sign in with one of them |"
  ],
  [
    "Passwords are hashed with Argon2id. Two-factor authentication is mandatory.",
    "Passwords are hashed with Argon2id. Signing in always takes two checks. A password is never enough on its own, and neither is a Google, Apple or X account: after it you must also give a code from your authenticator app, use a passkey or enter one of your recovery codes. A passkey signs you in on its own because it makes both checks itself: you must have the device it is on, and unlock it with your face, fingerprint or PIN. Your account must always keep a passkey or an authenticator app."
  ],
  [
    "which transfer mechanism each relies on (sections 4 and 5). Version 3.11 replaced",
    "which transfer mechanism each relies on (sections 4 and 5). Version 3.12 also says how you can sign in and what each way keeps: passkeys, your Google, Apple or X account where the sign-in page offers it, and a phone number, which is optional and is not a way to sign in; and that a password, or a Google, Apple or X account, always needs a second step (sections 2 and 9). Version 3.11 replaced"
  ]
];

export const TERMS_SIGN_IN_SWAPS: readonly (readonly [string, string])[] = [
  [
    "You register with an email address, a password, a recovery email address and two-factor authentication, which is mandatory. We give you a random **pseudonym**, which is the name shown on anything you publish. It cannot be changed. Keep your password, your authentication app and your recovery codes safe.",
    "You register with an email address and a recovery email address, and you may add a phone number; we do not check that the number is yours, and you cannot sign in with it. You sign in with a passkey, which uses your device's usual face, fingerprint or PIN check, or with your password, or, where the sign-in page offers it, with your Google, Apple or X account. A password, or a Google, Apple or X account, is never enough on its own: you must also give a code from your authentication app, use a passkey or enter one of your recovery codes, and your account must always keep a passkey or an authentication app. If you sign in with Google, Apple or X, that company's own terms also apply between you and it. We give you a random **pseudonym**, which is the name shown on anything you publish. It cannot be changed. Keep your password, your passkeys, your authentication app and your recovery codes safe."
  ],
  [
    "says for which providers we have confirmed that their terms do not allow training on your content (section 8).",
    "says for which providers we have confirmed that their terms do not allow training on your content (section 8). Version 2.18 also says how you can sign in: with a passkey, or with your password or, where the sign-in page offers it, your Google, Apple or X account, each followed by a second step; and that a phone number is optional and is not a way to sign in (section 6)."
  ]
];

/** The English Privacy Policy as it read before the sign-in swaps: each new text stands in it exactly once. */
export const withoutSignIn = (text: string, swaps: readonly (readonly [string, string])[]): string =>
  swaps.reduce((current, [before, after]) => {
    if (current.split(after).length !== 2) throw new Error(`the sign-in text is not there exactly once: ${after.slice(0, 60)}`);
    return current.replace(after, () => before);
  }, text);
