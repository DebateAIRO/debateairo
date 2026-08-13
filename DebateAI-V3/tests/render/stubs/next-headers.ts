export async function cookies() {
  return { get: () => ({ value: "token:test" }) };
}
