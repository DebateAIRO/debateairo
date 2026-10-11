import type { TemplatedMailChannel } from "../mail-channel.js";
import type { DataExportMailPort } from "./service.js";

export class TemplatedDataExportMail implements DataExportMailPort {
  constructor(private readonly channel: Pick<TemplatedMailChannel, "sendTemplated">) {}

  async sendExportReady(input: Parameters<DataExportMailPort["sendExportReady"]>[0]): Promise<void> {
    await this.channel.sendTemplated({
      to: input.to,
      templateId: "DATA_EXPORT",
      locale: input.locale,
      params: { requested: input.requestedAt.toISOString(), expires: input.expiresAt.toISOString(), downloadUrl: input.downloadUrl },
      messageId: input.exportId
    });
  }
}
