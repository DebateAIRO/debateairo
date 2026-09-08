export interface RotationPort {
  readonly kind: "row" | "witness";
  validate(): Promise<void>;
  publishKeyring(): Promise<void>;
  publishPrivateKey(): Promise<void>;
}

export async function rotateChainKey(port: RotationPort): Promise<void> {
  await port.validate();
  await port.publishKeyring();
  await port.publishPrivateKey();
}
