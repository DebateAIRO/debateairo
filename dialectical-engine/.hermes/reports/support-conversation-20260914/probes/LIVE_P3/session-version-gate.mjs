const SHA256 = /^[0-9a-f]{64}$/u;

export function createRuntimeSessionVersionGate(expectedVersion,{ timeoutMs = 2500 } = {}) {
  if (!SHA256.test(expectedVersion)) throw new Error("LIVE_P3_EXPECTED_SESSION_VERSION_INVALID");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("LIVE_P3_SESSION_VERSION_TIMEOUT_INVALID");
  }

  let state = "PENDING";
  let observedVersion = null;
  let failureCode = null;
  const waiters = new Set();

  function settleFailure(code) {
    state = "FAILED";
    failureCode = code;
    for (const waiter of waiters) waiter.reject(new Error(code));
    waiters.clear();
  }

  function observe(body) {
    const record = body !== null && typeof body === "object" && !Array.isArray(body)
      ? body : null;
    const session = record?.session !== null && typeof record?.session === "object"
      && !Array.isArray(record.session) ? record.session : null;
    const version = typeof session?.kb_version === "string" ? session.kb_version : null;
    if (version === null || !SHA256.test(version)) {
      const code = "LIVE_P3_RUNTIME_SESSION_SHAPE_INVALID";
      settleFailure(code);
      throw new Error(code);
    }
    if (version !== expectedVersion) {
      const code = "LIVE_P3_RUNTIME_SESSION_VERSION_MISMATCH";
      settleFailure(code);
      throw new Error(code);
    }
    state = "READY";
    observedVersion = version;
    for (const waiter of waiters) waiter.resolve(version);
    waiters.clear();
    return version;
  }

  function waitUntilReady() {
    if (state === "READY") return Promise.resolve(observedVersion);
    if (state === "FAILED") return Promise.reject(new Error(failureCode));
    return new Promise((resolve,reject) => {
      const waiter = { resolve,reject };
      waiters.add(waiter);
      setTimeout(() => {
        if (!waiters.delete(waiter)) return;
        const code = "LIVE_P3_RUNTIME_SESSION_VERSION_UNAVAILABLE";
        settleFailure(code);
        reject(new Error(code));
      },timeoutMs);
    });
  }

  return Object.freeze({ observe,waitUntilReady,status: () => state });
}
