/**
 * The name a browser's password manager shows for a passkey on this site. The server sends a placeholder name
 * (the same for every account), so the account's email is given instead: it lets a person tell their passkeys
 * apart, and the browser already shows the site next to it. The email is passed straight to the browser and kept
 * nowhere else.
 */

/** A name the passkey options can carry (the server's own limit is 254 characters), or nothing. */
export function passkeyLabel(value: string | undefined): string | undefined {
    const label = value?.trim();
    return label && label.length <= 254 ? label : undefined;
}

type SignalCurrentUserDetails = (details: { rpId: string; userId: string; name: string; displayName: string }) => Promise<void>;

/** The browser call that renames passkeys it already holds; older browsers do not have it. */
function signalCurrentUserDetails(): SignalCurrentUserDetails | null {
    try {
        const call = typeof PublicKeyCredential === 'undefined' ? undefined : (PublicKeyCredential as unknown as { signalCurrentUserDetails?: unknown }).signalCurrentUserDetails;
        return typeof call === 'function' ? (call as SignalCurrentUserDetails).bind(PublicKeyCredential) : null;
    }
    catch {
        return null;
    }
}

/**
 * Asks the browser to show `name` for every passkey it holds for this account on this site (`userHandle` is the
 * account's passkey handle, as the server sent it). This also fixes passkeys made with the old placeholder name.
 * It does nothing where the browser cannot do it and never throws; the answer says whether the browser was asked.
 */
export async function renameConsumerPasskeys({ userHandle, name, rpId }: { userHandle: string; name: string; rpId?: string }): Promise<boolean> {
    const signal = signalCurrentUserDetails();
    const label = passkeyLabel(name);
    if (!signal || !label || !userHandle)
        return false;
    try {
        await signal({ rpId: rpId ?? window.location.hostname, userId: userHandle, name: label, displayName: label });
        return true;
    }
    catch {
        return false;
    }
}

/** How long a finished passkey step waits for the rename before it moves on, so a slow answer never holds anyone up. */
export const PASSKEY_RENAME_WAIT_MS = 1000;

/**
 * Right after a passkey sign-in or sign-up (a session now exists): reads the account's email and gives it to the
 * browser as the name of this account's passkeys. It answers null, and reads nothing, when there is nothing to do
 * (no handle, no way to read the email, or a browser that cannot rename passkeys), so the caller goes on at once.
 * Otherwise the promise settles when the rename is done or after `waitMs`, whichever comes first. It never rejects.
 */
export function namePasskeysForAccount(client: { readAccountEmail?: () => Promise<{ email: string }> }, userHandle: string | undefined, waitMs = PASSKEY_RENAME_WAIT_MS): Promise<void> | null {
    if (!userHandle || !client.readAccountEmail || !signalCurrentUserDetails())
        return null;
    const work = (async () => {
        try {
            const { email } = await client.readAccountEmail!();
            await renameConsumerPasskeys({ userHandle, name: email });
        }
        catch {
            // The name is only a label in the browser; the sign-in itself already succeeded.
        }
    })();
    return new Promise(resolve => {
        const timer = setTimeout(resolve, waitMs);
        void work.then(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}
