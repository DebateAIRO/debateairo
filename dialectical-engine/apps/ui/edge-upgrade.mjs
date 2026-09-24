const HMR_PATH = "/_next/webpack-hmr";

/**
 * L3-F2: which HTTP Upgrade requests the edge hands to Next. Production has
 * no WebSocket surface (the run stream is fetch-SSE through the proxy), so
 * none; development has exactly Next's HMR endpoint. Everything else is
 * destroyed at the socket: Next leaves an unmatched upgrade open forever
 * ("a custom WS server may be listening"), which hands an attacker one idle
 * socket per file descriptor.
 */
export function acceptsUpgrade(development, url) {
  if (!development || typeof url !== "string") return false;
  return url === HMR_PATH || url.startsWith(`${HMR_PATH}?`);
}
