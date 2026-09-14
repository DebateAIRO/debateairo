// @ts-nocheck -- intentionally invalid inventory specimen
async function send(): Promise<void> {
  await Promise.resolve();
}

export function launch(): void {
  void send();
}
