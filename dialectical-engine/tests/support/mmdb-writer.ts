/**
 * A TEST-ONLY MaxMind DB writer (MMDB format 2.0, https://maxmind.github.io/MaxMind-DB/) — just
 * enough of the format to build a tiny country database inside a test, so the repository carries
 * no binary fixture and no test downloads anything. The reader under test (mmdb-lib) is what proves
 * the writer right: a wrong byte here fails every lookup.
 *
 * File layout: the binary search tree (node_count nodes of two 24-bit big-endian records), sixteen
 * zero bytes (the data section separator), the data section, the metadata start marker
 * "\xAB\xCD\xEFMaxMind.com", and the metadata map. A record value v means: v < node_count, go to
 * node v; v === node_count, no data; v > node_count, the data at offset v - node_count - 16 from
 * the start of the data section. The tree is IPv6 (ip_version 6); an IPv4 network a.b.c.d/n sits
 * at ::a.b.c.d/(96 + n), which is where every reader looks IPv4 addresses up in an IPv6 tree.
 */
export type MmdbCountryNetwork = Readonly<{ network: string; country: string }>;

type MmdbValue =
  | Readonly<{ type: "string"; value: string }>
  | Readonly<{ type: "uint16" | "uint32"; value: number }>
  | Readonly<{ type: "uint64"; value: bigint }>
  | Readonly<{ type: "map"; value: ReadonlyArray<readonly [string, MmdbValue]> }>
  | Readonly<{ type: "array"; value: ReadonlyArray<MmdbValue> }>;

type Slot =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "node"; index: number }>
  | Readonly<{ kind: "data"; offset: number }>;

const EMPTY: Slot = Object.freeze({ kind: "empty" });
const METADATA_MARKER = Buffer.from("abcdef4d61784d696e642e636f6d", "hex");
const DATA_SECTION_SEPARATOR_BYTES = 16;
const RECORD_BYTES = 3;

/** Control byte(s): 3 type bits + 5 size bits; types above 7 are "extended" (type bits 000 + one byte). */
function control(type: number, size: number): Buffer {
  let sizeBits: number;
  let extension: Buffer;
  if (size < 29) {
    sizeBits = size;
    extension = Buffer.alloc(0);
  } else if (size < 29 + 256) {
    sizeBits = 29;
    extension = Buffer.from([size - 29]);
  } else if (size < 285 + 65_536) {
    sizeBits = 30;
    extension = Buffer.from([(size - 285) >> 8, (size - 285) & 0xff]);
  } else {
    throw new Error("MMDB_WRITER_SIZE_UNSUPPORTED");
  }
  const head = type <= 7 ? Buffer.from([(type << 5) | sizeBits]) : Buffer.from([sizeBits, type - 7]);
  return Buffer.concat([head, extension]);
}

function unsigned(value: bigint, maximumBytes: number): Buffer {
  const bytes: number[] = [];
  for (let rest = value; rest > 0n; rest >>= 8n) bytes.unshift(Number(rest & 0xffn));
  if (value < 0n || bytes.length > maximumBytes) throw new Error("MMDB_WRITER_INTEGER_INVALID");
  return Buffer.from(bytes);
}

function encode(value: MmdbValue): Buffer {
  switch (value.type) {
    case "string": {
      const bytes = Buffer.from(value.value, "utf8");
      return Buffer.concat([control(2, bytes.length), bytes]);
    }
    case "uint16": {
      const bytes = unsigned(BigInt(value.value), 2);
      return Buffer.concat([control(5, bytes.length), bytes]);
    }
    case "uint32": {
      const bytes = unsigned(BigInt(value.value), 4);
      return Buffer.concat([control(6, bytes.length), bytes]);
    }
    case "uint64": {
      const bytes = unsigned(value.value, 8);
      return Buffer.concat([control(9, bytes.length), bytes]);
    }
    case "map":
      return Buffer.concat([
        control(7, value.value.length),
        ...value.value.flatMap(([key, member]) => [encode({ type: "string", value: key }), encode(member)])
      ]);
    case "array":
      return Buffer.concat([control(11, value.value.length), ...value.value.map(encode)]);
    default: {
      const unreachable: never = value;
      throw new Error(`MMDB_WRITER_TYPE_UNKNOWN:${String(unreachable)}`);
    }
  }
}

function ipv6Bytes(address: string): number[] {
  const parts = address.split("::");
  if (parts.length > 2) throw new Error("MMDB_WRITER_NETWORK_INVALID");
  const groups = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const left = groups(parts[0]!);
  const right = parts.length === 2 ? groups(parts[1]!) : [];
  const missing = 8 - left.length - right.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) throw new Error("MMDB_WRITER_NETWORK_INVALID");
  const hextets = [...left, ...Array<string>(parts.length === 2 ? missing : 0).fill("0"), ...right];
  return hextets.flatMap((hextet) => {
    if (!/^[0-9a-f]{1,4}$/iu.test(hextet)) throw new Error("MMDB_WRITER_NETWORK_INVALID");
    const number = Number.parseInt(hextet, 16);
    return [number >> 8, number & 0xff];
  });
}

function bitsOf(bytes: readonly number[]): number[] {
  return bytes.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((shift) => (byte >> shift) & 1));
}

function networkBits(network: string): number[] {
  const [address = "", prefixText = ""] = network.split("/");
  const prefix = Number(prefixText);
  if (address.includes(".")) {
    const octets = address.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) {
      throw new Error("MMDB_WRITER_NETWORK_INVALID");
    }
    return [...Array<number>(96).fill(0), ...bitsOf(octets)].slice(0, 96 + prefix);
  }
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 128) throw new Error("MMDB_WRITER_NETWORK_INVALID");
  return bitsOf(ipv6Bytes(address)).slice(0, prefix);
}

/**
 * A country database: every network maps to `{ country: { iso_code } }`, the GeoIP2-Country
 * shape DB-IP's Lite file uses. Networks must not overlap.
 */
export function writeCountryMmdb(networks: ReadonlyArray<MmdbCountryNetwork>): Buffer {
  const data: Buffer[] = [];
  const offsets = new Map<string, number>();
  let dataLength = 0;
  const offsetFor = (country: string): number => {
    const known = offsets.get(country);
    if (known !== undefined) return known;
    const encoded = encode({ type: "map", value: [
      ["country", { type: "map", value: [["iso_code", { type: "string", value: country }]] }]
    ] });
    offsets.set(country, dataLength);
    data.push(encoded);
    dataLength += encoded.length;
    return dataLength - encoded.length;
  };
  const nodes: Slot[][] = [[EMPTY, EMPTY]];
  for (const { network, country } of networks) {
    const bits = networkBits(network);
    const leaf: Slot = Object.freeze({ kind: "data", offset: offsetFor(country) });
    let node = 0;
    for (let depth = 0; depth < bits.length; depth += 1) {
      const bit = bits[depth]!;
      const current = nodes[node]![bit]!;
      if (depth === bits.length - 1) {
        if (current.kind !== "empty") throw new Error("MMDB_WRITER_NETWORKS_OVERLAP");
        nodes[node]![bit] = leaf;
        break;
      }
      if (current.kind === "data") throw new Error("MMDB_WRITER_NETWORKS_OVERLAP");
      if (current.kind === "empty") {
        nodes.push([EMPTY, EMPTY]);
        nodes[node]![bit] = Object.freeze({ kind: "node", index: nodes.length - 1 });
      }
      node = (nodes[node]![bit] as Readonly<{ kind: "node"; index: number }>).index;
    }
  }
  const nodeCount = nodes.length;
  const recordOf = (slot: Slot): number => slot.kind === "empty" ? nodeCount
    : slot.kind === "node" ? slot.index : nodeCount + DATA_SECTION_SEPARATOR_BYTES + slot.offset;
  const tree = Buffer.alloc(nodeCount * RECORD_BYTES * 2);
  nodes.forEach(([left, right], index) => {
    tree.writeUIntBE(recordOf(left!), index * RECORD_BYTES * 2, RECORD_BYTES);
    tree.writeUIntBE(recordOf(right!), index * RECORD_BYTES * 2 + RECORD_BYTES, RECORD_BYTES);
  });
  const metadata = encode({ type: "map", value: [
    ["binary_format_major_version", { type: "uint16", value: 2 }],
    ["binary_format_minor_version", { type: "uint16", value: 0 }],
    ["build_epoch", { type: "uint64", value: 1_790_000_000n }],
    ["database_type", { type: "string", value: "DBIP-Country-Lite" }],
    ["description", { type: "map", value: [["en", { type: "string", value: "DebateAI test fixture" }]] }],
    ["ip_version", { type: "uint16", value: 6 }],
    ["languages", { type: "array", value: [{ type: "string", value: "en" }] }],
    ["node_count", { type: "uint32", value: nodeCount }],
    ["record_size", { type: "uint16", value: 24 }]
  ] });
  return Buffer.concat([tree, Buffer.alloc(DATA_SECTION_SEPARATOR_BYTES), ...data, METADATA_MARKER, metadata]);
}
