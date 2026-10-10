import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type PaymentMarks = Readonly<{ netopia: boolean; visa: boolean; mastercard: boolean }>;

/**
 * The owner supplies the official artwork at apps/ui/public/payment-marks/: NETOPIA's logo (netopia.svg) beside the
 * Visa and Mastercard marks (visa.svg, mastercard.svg), the marks NETOPIA's shop approval asks for in the footer and on
 * the checkout (spec §2.10, §2.18). No machine path: the UI runs from apps/ui (debateai-ui.service WorkingDirectory)
 * and the root tests from the repository, so the directory is deduced from the working directory, like
 * resolveReportFontDirectory. A missing file renders nothing. Server components only: this reads the disk.
 */
export function availablePaymentMarks(cwd: string = process.cwd()): PaymentMarks {
  const directory = [resolve(cwd, "public/payment-marks"), resolve(cwd, "apps/ui/public/payment-marks")]
    .find((candidate) => existsSync(candidate)) ?? null;
  const present = (file: string): boolean => directory !== null && existsSync(join(directory, file));
  return Object.freeze({ netopia: present("netopia.svg"), visa: present("visa.svg"), mastercard: present("mastercard.svg") });
}
