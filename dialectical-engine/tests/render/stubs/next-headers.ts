export async function cookies() {
  return { get: () => ({ value: "token:test" }) };
}

export async function headers() {
  return new Headers({ "user-agent": "vitest-render-browser" });
}
