import { decrypt, type ReadableUserDekStore } from '@debateai/crypto';
import type { PostgresConsumerSecurityNoticeRepository } from '@debateai/db';
import { isSingleDeliverableRecipient, type ConsumerSecurityNoticeSender } from './mail-channel.js';
export class ConsumerSecurityNoticeReconciler {
    constructor(private readonly repository: PostgresConsumerSecurityNoticeRepository, private readonly users: ReadableUserDekStore, private readonly sender: ConsumerSecurityNoticeSender) { }
    async reconcile(limit = 100): Promise<void> {
        for (const claim of await this.repository.claim(limit))
            try {
                await this.repository.deliver(claim, async (notice) => {
                    let dek: Buffer | undefined, plain: Buffer | undefined;
                    try {
                        dek = await this.users.load(notice.userId);
                        plain = decrypt(dek, notice.addressCiphertext, ['identity', notice.channelType === 'email' ? 'user.email_ciphertext' : 'user.recovery_email_ciphertext', notice.userId, 'run:none', notice.userId, `user-dek:${notice.userId}`, '1']);
                        const recipient = plain.toString('utf8');
                        if (!isSingleDeliverableRecipient(recipient))
                            throw new Error('MAIL_INPUT_INVALID');
                        await this.sender.sendConsumerSecurityNotice({ recipient, messageId: notice.messageId, eventKind: notice.eventKind, happenedAt: new Date(notice.happenedAt) });
                    }
                    finally {
                        plain?.fill(0);
                        dek?.fill(0);
                    }
                });
            }
            catch {
                await this.repository.fail(claim);
            }
    }
}
