export type DevLocalCertificate = Readonly<{
  certificatePath: string;
  privateKeyPath: string;
  reused: boolean;
}>;

export function ensureDevLocalCertificate(options?: Readonly<{
  tlsDirectory?: string;
  mkcertExecutable?: string;
}>): Promise<DevLocalCertificate>;
