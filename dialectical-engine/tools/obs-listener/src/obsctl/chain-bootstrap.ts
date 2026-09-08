export interface BootstrapPort {
  readonly alreadyCommitted?: boolean;
  stage(): Promise<void>;
  assertParity(): Promise<void>;
  commitDatabase(): Promise<void>;
  publishFile(): Promise<void>;
  release(): Promise<void>;
}

export async function bootstrapChain(port: BootstrapPort): Promise<void> {
  await port.stage();
  await port.assertParity();
  if (port.alreadyCommitted !== true) await port.commitDatabase();
  await port.publishFile();
  await port.release();
}
