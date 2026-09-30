import { isIP } from "node:net";

/**
 * Paid plans G1. One parsed address: 4 bytes for IPv4, 16 for IPv6. An IPv4-mapped IPv6 address
 * (::ffff:a.b.c.d) IS an IPv4 address and parses as one. Zone ids, ports, lists and hostnames do
 * not parse.
 */
export type ParsedIp = Readonly<{ version: 4 | 6; bytes: Uint8Array }>;

function ipv6Bytes(text: string): Uint8Array | null {
  let address = text;
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const parts = address.split("::");
  if (parts.length > 2) return null;
  const groups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const left = groups(parts[0]!);
  const right = parts.length === 2 ? groups(parts[1]!) : [];
  const missing = 8 - left.length - right.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) return null;
  const hextets = [...left, ...Array<string>(parts.length === 2 ? missing : 0).fill("0"), ...right];
  if (hextets.some((hextet) => !/^[0-9a-f]{1,4}$/iu.test(hextet))) return null;
  return Uint8Array.from(hextets.flatMap((hextet) => {
    const value = Number.parseInt(hextet, 16);
    return [value >> 8, value & 0xff];
  }));
}

export function parseIp(text: string): ParsedIp | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 64 || text.includes("%")) return null;
  const family = isIP(text);
  if (family === 4) return Object.freeze({ version: 4, bytes: Uint8Array.from(text.split(".").map(Number)) });
  if (family !== 6) return null;
  const bytes = ipv6Bytes(text);
  if (bytes === null) return null;
  if (bytes.subarray(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return Object.freeze({ version: 4, bytes: bytes.slice(12) });
  }
  return Object.freeze({ version: 6, bytes });
}

/** The text a reader accepts: dotted IPv4, or eight uncompressed hextets. */
export function ipText(ip: ParsedIp): string {
  if (ip.version === 4) return [...ip.bytes].join(".");
  const hextets: string[] = [];
  for (let index = 0; index < 16; index += 2) hextets.push(((ip.bytes[index]! << 8) | ip.bytes[index + 1]!).toString(16));
  return hextets.join(":");
}

/** A set key that is the same for every spelling of one address. */
export function ipKey(ip: ParsedIp): string {
  return `${ip.version}:${Buffer.from(ip.bytes).toString("hex")}`;
}

type Prefix = Readonly<{ bytes: readonly number[]; length: number }>;

const PRIVATE_OR_RESERVED_V4: readonly Prefix[] = Object.freeze([
  { bytes: [0, 0, 0, 0], length: 8 },        // "this network"
  { bytes: [10, 0, 0, 0], length: 8 },       // private
  { bytes: [100, 64, 0, 0], length: 10 },    // carrier-grade NAT
  { bytes: [127, 0, 0, 0], length: 8 },      // loopback
  { bytes: [169, 254, 0, 0], length: 16 },   // link-local
  { bytes: [172, 16, 0, 0], length: 12 },    // private
  { bytes: [192, 0, 0, 0], length: 24 },     // IETF protocol assignments
  { bytes: [192, 168, 0, 0], length: 16 },   // private
  { bytes: [198, 18, 0, 0], length: 15 },    // benchmarking
  { bytes: [224, 0, 0, 0], length: 3 }       // multicast, reserved, broadcast
]);

const PRIVATE_OR_RESERVED_V6: readonly Prefix[] = Object.freeze([
  { bytes: Array<number>(16).fill(0), length: 128 },                  // unspecified
  { bytes: [...Array<number>(15).fill(0), 1], length: 128 },          // loopback
  { bytes: [0xfc, ...Array<number>(15).fill(0)], length: 7 },         // unique local
  { bytes: [0xfe, 0x80, ...Array<number>(14).fill(0)], length: 10 },  // link-local
  { bytes: [0xff, ...Array<number>(15).fill(0)], length: 8 }          // multicast
]);

function inPrefix(bytes: Uint8Array, prefix: Prefix): boolean {
  const whole = Math.floor(prefix.length / 8);
  for (let index = 0; index < whole; index += 1) if (bytes[index] !== prefix.bytes[index]) return false;
  const rest = prefix.length % 8;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (bytes[whole]! & mask) === (prefix.bytes[whole]! & mask);
}

/** A private, loopback, link-local or otherwise non-public address: never a country. */
export function isPrivateOrReserved(ip: ParsedIp): boolean {
  return (ip.version === 4 ? PRIVATE_OR_RESERVED_V4 : PRIVATE_OR_RESERVED_V6).some((prefix) => inPrefix(ip.bytes, prefix));
}
