import { createHash } from 'node:crypto';
import { createRecipientPolicy, ownedForwardingMessage as forward, submitVerification as submit } from './sendmail-owned-preview.mjs';
export const aliases = Object.freeze({
 'verification-forward-primary':'primary@example.test',
 'verification-forward-secondary':'secondary@example.test',
 'verification-direct-and-recovery-proof':'proof@example.test',
 'recovery-notice-secondary':'notice@example.test'
});
export const recipientSha256 = Object.freeze(Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')])));
export const recipientPolicy = createRecipientPolicy(recipientSha256, aliases['verification-forward-secondary']);
export const ownedForwardingMessage = message => forward(message, recipientPolicy);
export const submitVerification = input => submit({...input, recipientPolicy});
