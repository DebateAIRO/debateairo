import fs from "node:fs";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";

const SOURCE_PATH = "packages/obs-capture/native/fix09-openat-read.c";
const VERIFIER_PATH = "packages/obs-capture/scripts/verify-fix09-native-wipe.mjs";
const REQUIRED_SYMBOLS = Object.freeze(["_fix09_run_session", "_fix09_wipe_secret_buffers", "_fix09_scan_secret_buffers_zero"]);
const PREDECESSORS = Object.freeze(["success", "partial_write", "read_error", "protocol_error", "early_error"]);
const PREDECESSOR_SYMBOLS = Object.freeze(PREDECESSORS.map((name) => `_fix09_cleanup_${name}`));
const INPUT_KEYS = Object.freeze(["architecture", "artifact_command_set_sha256", "build_output_sha256", "cleanup_predecessors", "command_stream_byte_length", "deployment_contract_sha256", "endianness", "macho_byte_length", "memset_s_symbol", "object_byte_length", "object_output_sha256", "schema", "secret_buffers", "session_symbol", "source_byte_length", "source_sha256", "wipe_symbol", "wipe_verifier_runtime_sha256", "wipe_verifier_source_sha256", "zero_scan_symbol"]);
const HEX64 = /^[0-9a-f]{64}$/;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const TOKEN = /^[A-Z][A-Z0-9_]*$/;
const MAX_MANIFEST = 65536;
const MAX_ARTIFACT = 64 * 1024 * 1024;
const MAX_COMMAND_STREAM = 64 * 1024 * 1024;
const COMMAND_LABELS = Object.freeze(["find_otool", "otool_version", "find_nm", "nm_version", "object_nm", "object_relocations", "object_wipe_disasm", "object_session_disasm", "executable_nm", "executable_loads", "executable_libraries", "executable_indirect", "executable_wipe_disasm", "executable_session_disasm"]);

class Refusal extends Error {
  constructor(code, phase) {
    super(code);
    this.code = code;
    this.phase = phase;
  }
}

function refuse(code, phase) {
  if (!TOKEN.test(code) || !TOKEN.test(phase)) throw new Error("BAD_REFUSAL_TOKEN");
  throw new Refusal(code, phase);
}

function u32(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) refuse("INTEGER_RANGE", "HASH");
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function u64(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse("INTEGER_RANGE", "HASH");
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

function lp(bytes) {
  return Buffer.concat([u32(bytes.length), bytes]);
}

function argvBytes(argv) {
  return Buffer.concat([u32(argv.length), ...argv.map((value) => lp(Buffer.from(value, "utf8")))]);
}

function digest(domain, parts) {
  const preimage = Buffer.concat([Buffer.from(domain, "ascii"), Buffer.from([0]), u32(parts.length), ...parts.map(lp)]);
  return crypto.createHash("sha256").update(preimage).digest("hex");
}

function d32(value) {
  if (!HEX64.test(value)) refuse("DIGEST_FORMAT", "HASH");
  return Buffer.from(value, "hex");
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) refuse("JSON_NUMBER", "JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  refuse("JSON_TYPE", "JSON");
}

function canonicalBytes(value) {
  return Buffer.from(canonical(value), "utf8");
}

function strictUtf8(bytes, phase) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || bytes.includes(0)) refuse("UTF8", phase);
  return text;
}

function parseCanonicalJson(bytes, phase) {
  const text = strictUtf8(bytes, phase);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    refuse("JSON_PARSE", phase);
  }
  if (canonical(value) !== text) refuse("JSON_CANONICAL", phase);
  return value;
}

function exactKeys(value, expected, phase) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) refuse("SCHEMA", phase);
  const observed = Object.keys(value).sort();
  if (canonical(observed) !== canonical([...expected].sort())) refuse("SCHEMA", phase);
}

function positiveDecimal(value, cap, phase) {
  if (typeof value !== "string" || !DECIMAL.test(value) || value === "0") refuse("LENGTH", phase);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > cap) refuse("LENGTH", phase);
  return number;
}

function readExactly(fd, count, phase) {
  const out = Buffer.alloc(count);
  let offset = 0;
  while (offset < count) {
    const size = fs.readSync(fd, out, offset, count - offset, null);
    if (size === 0) refuse("TRUNCATED", phase);
    offset += size;
  }
  return out;
}

function readU32(fd, phase) {
  return readExactly(fd, 4, phase).readUInt32BE(0);
}

function readU64(fd, phase) {
  const value = readExactly(fd, 8, phase).readBigUInt64BE(0);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) refuse("LENGTH", phase);
  return Number(value);
}

function validateManifest(value) {
  exactKeys(value, INPUT_KEYS, "MANIFEST");
  if (value.schema !== "obs-chain-helper-wipe-verifier-input/v1" || value.architecture !== "arm64" || value.endianness !== "little") refuse("MANIFEST_VALUE", "MANIFEST");
  if (value.session_symbol !== REQUIRED_SYMBOLS[0] || value.wipe_symbol !== REQUIRED_SYMBOLS[1] || value.zero_scan_symbol !== REQUIRED_SYMBOLS[2] || value.memset_s_symbol !== "_memset_s") refuse("MANIFEST_SYMBOL", "MANIFEST");
  if (canonical(value.cleanup_predecessors) !== canonical(PREDECESSORS)) refuse("MANIFEST_PREDECESSOR", "MANIFEST");
  if (canonical(value.secret_buffers) !== canonical([{ name: "key_read_buffer", capacity: "256" }, { name: "key_frame_buffer", capacity: "768" }])) refuse("MANIFEST_BUFFER", "MANIFEST");
  for (const key of ["source_sha256", "object_output_sha256", "build_output_sha256", "deployment_contract_sha256", "wipe_verifier_source_sha256", "wipe_verifier_runtime_sha256", "artifact_command_set_sha256"]) if (!HEX64.test(value[key])) refuse("DIGEST_FORMAT", "MANIFEST");
}

function readInput() {
  const fd = 3;
  const st = fs.fstatSync(fd, { bigint: true });
  if (!st.isFile() || st.nlink !== 1n || st.size <= 0n || st.size > BigInt(3 * MAX_ARTIFACT + MAX_COMMAND_STREAM + MAX_MANIFEST + 128)) refuse("INPUT_FD", "FRAME");
  if (!readExactly(fd, 8, "FRAME").equals(Buffer.from("F10WIPE8", "ascii"))) refuse("MAGIC", "FRAME");
  const manifestLength = readU32(fd, "FRAME");
  if (manifestLength === 0 || manifestLength > MAX_MANIFEST) refuse("MANIFEST_LENGTH", "FRAME");
  const manifestBytes = readExactly(fd, manifestLength, "MANIFEST");
  const manifest = parseCanonicalJson(manifestBytes, "MANIFEST");
  validateManifest(manifest);
  const declared = {
    source: positiveDecimal(manifest.source_byte_length, MAX_ARTIFACT, "MANIFEST"),
    object: positiveDecimal(manifest.object_byte_length, MAX_ARTIFACT, "MANIFEST"),
    macho: positiveDecimal(manifest.macho_byte_length, MAX_ARTIFACT, "MANIFEST"),
    commands: positiveDecimal(manifest.command_stream_byte_length, MAX_COMMAND_STREAM, "MANIFEST")
  };
  const readFramed = (name, phase) => {
    const length = readU64(fd, phase);
    if (length !== declared[name]) refuse("LENGTH_MISMATCH", phase);
    return readExactly(fd, length, phase);
  };
  const source = readFramed("source", "SOURCE");
  const object = readFramed("object", "OBJECT");
  const macho = readFramed("macho", "EXECUTABLE");
  const commandBytes = readExactly(fd, declared.commands, "COMMANDS");
  const tail = Buffer.alloc(1);
  if (fs.readSync(fd, tail, 0, 1, null) !== 0) refuse("TRAILING_BYTES", "FRAME");
  const expectedSize = 8 + 4 + manifestLength + 24 + declared.source + declared.object + declared.macho + declared.commands;
  if (BigInt(expectedSize) !== st.size) refuse("INPUT_SIZE", "FRAME");
  const complete = Buffer.concat([Buffer.from("F10WIPE8", "ascii"), u32(manifestLength), manifestBytes, u64(source.length), source, u64(object.length), object, u64(macho.length), macho, commandBytes]);
  return { manifest, source, object, macho, commandBytes, inputSha256: digest("obs-chain-helper-wipe-verifier-input/v1", [complete]) };
}

class View {
  constructor(bytes, phase) {
    this.bytes = bytes;
    this.phase = phase;
  }
  bounds(offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > this.bytes.length) refuse("MACHO_BOUNDS", this.phase);
  }
  u8(offset) { this.bounds(offset, 1); return this.bytes.readUInt8(offset); }
  u16(offset) { this.bounds(offset, 2); return this.bytes.readUInt16LE(offset); }
  u32(offset) { this.bounds(offset, 4); return this.bytes.readUInt32LE(offset); }
  i32(offset) { this.bounds(offset, 4); return this.bytes.readInt32LE(offset); }
  u64(offset) {
    this.bounds(offset, 8);
    const value = this.bytes.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) refuse("MACHO_INTEGER", this.phase);
    return Number(value);
  }
  fixed(offset, size) {
    this.bounds(offset, size);
    const field = this.bytes.subarray(offset, offset + size);
    const nul = field.indexOf(0);
    const used = nul < 0 ? field : field.subarray(0, nul);
    if (nul >= 0 && field.subarray(nul).some((value) => value !== 0)) refuse("MACHO_STRING", this.phase);
    return strictUtf8(used, this.phase);
  }
  cstring(offset, end) {
    this.bounds(offset, 1);
    if (offset >= end) refuse("MACHO_STRING", this.phase);
    const nul = this.bytes.indexOf(0, offset);
    if (nul < offset || nul >= end) refuse("MACHO_STRING", this.phase);
    return strictUtf8(this.bytes.subarray(offset, nul), this.phase);
  }
}

function hex(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse("HEX_RANGE", "PROJECTION");
  return value.toString(16);
}

function byteSort(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function signed(value, bits) {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

function version(value) {
  return `${value >>> 16}.${(value >>> 8) & 255}.${value & 255}`.replace(/\.0$/, "");
}

const COMMAND_NAMES = new Map([[0x2, "lc_symtab"], [0xb, "lc_dysymtab"], [0xc, "lc_load_dylib"], [0x19, "lc_segment_64"], [0x1b, "lc_uuid"], [0x22, "lc_dyld_info"], [0x80000022, "lc_dyld_info_only"], [0x24, "lc_version_min_macosx"], [0x26, "lc_function_starts"], [0x29, "lc_data_in_code"], [0x2a, "lc_source_version"], [0x32, "lc_build_version"], [0x80000028, "lc_main"], [0x80000033, "lc_dyld_exports_trie"], [0x80000034, "lc_dyld_chained_fixups"]]);
const FLAG_NAMES = new Map([[0x1, "noundefs"], [0x4, "dyldlink"], [0x80, "twolevel"], [0x2000, "pie"], [0x200000, "app_extension_safe"]]);

function nonoverlap(ranges, phase) {
  const sorted = [...ranges].filter((range) => range.size > 0).sort((a, b) => a.offset - b.offset || a.size - b.size);
  for (let index = 1; index < sorted.length; index++) if (sorted[index - 1].offset + sorted[index - 1].size > sorted[index].offset) refuse("MACHO_OVERLAP", phase);
}

function parseFunctionStarts(view, command, textVmaddr) {
  const offset = view.u32(command.offset + 8);
  const size = view.u32(command.offset + 12);
  view.bounds(offset, size);
  const starts = [];
  let cursor = offset;
  let address = textVmaddr;
  while (cursor < offset + size) {
    let delta = 0;
    let shift = 0;
    for (;;) {
      if (cursor >= offset + size || shift > 63) refuse("ULEB128", view.phase);
      const byte = view.u8(cursor++);
      delta += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    if (delta === 0) break;
    address += delta;
    if (!Number.isSafeInteger(address) || starts.includes(address)) refuse("FUNCTION_STARTS", view.phase);
    starts.push(address);
  }
  if (view.bytes.subarray(cursor, offset + size).some((byte) => byte !== 0)) refuse("FUNCTION_STARTS", view.phase);
  return starts;
}

function parseMachO(bytes, expectedFiletype, phase) {
  const view = new View(bytes, phase);
  if (view.u32(0) !== 0xfeedfacf || view.u32(4) !== 0x0100000c || view.u32(12) !== expectedFiletype) refuse("MACHO_HEADER", phase);
  const ncmds = view.u32(16);
  const sizeofcmds = view.u32(20);
  const rawFlags = view.u32(24);
  if (ncmds === 0 || ncmds > 4096 || 32 + sizeofcmds > bytes.length) refuse("MACHO_COMMANDS", phase);
  const commands = [];
  const sections = [];
  const dependencies = [];
  const ranges = [{ offset: 0, size: 32 + sizeofcmds, label: "header" }];
  let symtab = null;
  let dysymtab = null;
  let build = null;
  let functionStartsCommand = null;
  let textVmaddr = null;
  let cursor = 32;
  for (let ordinal = 0; ordinal < ncmds; ordinal++) {
    const cmd = view.u32(cursor);
    const cmdsize = view.u32(cursor + 4);
    if (cmdsize < 8 || (cmdsize & 7) !== 0 || cursor + cmdsize > 32 + sizeofcmds) refuse("MACHO_COMMAND", phase);
    const cmdName = COMMAND_NAMES.get(cmd);
    if (cmdName === undefined) refuse("MACHO_COMMAND", phase);
    let name = null;
    if (cmd === 0x19) {
      if (cmdsize < 72) refuse("MACHO_SEGMENT", phase);
      name = view.fixed(cursor + 8, 16);
      const vmaddr = view.u64(cursor + 24);
      const fileoff = view.u64(cursor + 40);
      const filesize = view.u64(cursor + 48);
      const nsects = view.u32(cursor + 64);
      if (72 + nsects * 80 !== cmdsize) refuse("MACHO_SEGMENT", phase);
      if (name === "__TEXT" && (textVmaddr === null || vmaddr < textVmaddr)) textVmaddr = vmaddr;
      if (filesize > 0) { view.bounds(fileoff, filesize); ranges.push({ offset: fileoff, size: filesize, label: `segment:${name}` }); }
      for (let index = 0; index < nsects; index++) {
        const base = cursor + 72 + index * 80;
        const section = { sectname: view.fixed(base, 16), segname: view.fixed(base + 16, 16), addr: view.u64(base + 32), size: view.u64(base + 40), offset: view.u32(base + 48), align: view.u32(base + 52), reloff: view.u32(base + 56), nreloc: view.u32(base + 60), flags: view.u32(base + 64), reserved1: view.u32(base + 68), reserved2: view.u32(base + 72), index: sections.length + 1 };
        if (section.size > 0 && (section.flags & 0xff) !== 1) view.bounds(section.offset, section.size);
        if (section.nreloc > 0) { view.bounds(section.reloff, section.nreloc * 8); ranges.push({ offset: section.reloff, size: section.nreloc * 8, label: `reloc:${section.sectname}` }); }
        sections.push(section);
      }
    } else if (cmd === 0x2) {
      if (symtab !== null || cmdsize !== 24) refuse("MACHO_SYMTAB", phase);
      symtab = { symoff: view.u32(cursor + 8), nsyms: view.u32(cursor + 12), stroff: view.u32(cursor + 16), strsize: view.u32(cursor + 20) };
    } else if (cmd === 0xb) {
      if (dysymtab !== null || cmdsize !== 80) refuse("MACHO_DYSYMTAB", phase);
      dysymtab = { indirectsymoff: view.u32(cursor + 56), nindirectsyms: view.u32(cursor + 60) };
    } else if (cmd === 0xc) {
      const nameOffset = view.u32(cursor + 8);
      if (nameOffset < 24 || nameOffset >= cmdsize) refuse("MACHO_DYLIB", phase);
      name = view.cstring(cursor + nameOffset, cursor + cmdsize);
      dependencies.push(name);
    } else if (cmd === 0x32) {
      if (build !== null || cmdsize < 24 || view.u32(cursor + 8) !== 1) refuse("MACHO_BUILD", phase);
      build = { minos: version(view.u32(cursor + 12)), sdk: version(view.u32(cursor + 16)) };
    } else if (cmd === 0x26) {
      if (functionStartsCommand !== null || cmdsize !== 16) refuse("FUNCTION_STARTS", phase);
      functionStartsCommand = { offset: cursor };
    }
    commands.push({ ordinal: String(ordinal), cmd: cmdName, cmdsize: String(cmdsize), name });
    cursor += cmdsize;
  }
  if (cursor !== 32 + sizeofcmds || symtab === null) refuse("MACHO_COMMANDS", phase);
  view.bounds(symtab.symoff, symtab.nsyms * 16);
  view.bounds(symtab.stroff, symtab.strsize);
  ranges.push({ offset: symtab.symoff, size: symtab.nsyms * 16, label: "symbols" }, { offset: symtab.stroff, size: symtab.strsize, label: "strings" });
  if (dysymtab !== null) { view.bounds(dysymtab.indirectsymoff, dysymtab.nindirectsyms * 4); ranges.push({ offset: dysymtab.indirectsymoff, size: dysymtab.nindirectsyms * 4, label: "indirect" }); }
  nonoverlap(ranges.filter((range) => !range.label.startsWith("segment:")), phase);
  const symbols = [];
  for (let index = 0; index < symtab.nsyms; index++) {
    const base = symtab.symoff + index * 16;
    const strx = view.u32(base);
    if (strx >= symtab.strsize) refuse("MACHO_SYMBOL", phase);
    const symbol = { index, name: view.cstring(symtab.stroff + strx, symtab.stroff + symtab.strsize), type: view.u8(base + 4), sect: view.u8(base + 5), desc: view.u16(base + 6), value: view.u64(base + 8) };
    if (symbol.name.includes("\n") || symbol.name.includes("\r")) refuse("MACHO_SYMBOL", phase);
    symbols.push(symbol);
  }
  const unknownFlags = [...FLAG_NAMES.keys()].reduce((value, flag) => value & ~flag, rawFlags);
  if (unknownFlags !== 0) refuse("MACHO_FLAGS", phase);
  const flags = [...FLAG_NAMES].filter(([flag]) => (rawFlags & flag) !== 0).map(([, name]) => name).sort(byteSort);
  const functionStarts = functionStartsCommand === null ? [] : parseFunctionStarts(view, functionStartsCommand, textVmaddr ?? 0);
  return { bytes, view, filetype: expectedFiletype, cpusubtype: view.u32(8), commands, sections, symtab, dysymtab, symbols, dependencies, build, functionStarts, flags };
}

function definedFunction(artifact, name) {
  const candidates = artifact.symbols.filter((symbol) => symbol.name === name && (symbol.type & 0x0e) === 0x0e && symbol.sect > 0);
  if (candidates.length !== 1) refuse("FUNCTION_SYMBOL", artifact.view.phase);
  const symbol = candidates[0];
  const section = artifact.sections[symbol.sect - 1];
  if (section === undefined || (section.flags & 0x80000000) === 0 || (symbol.value & 3) !== 0) refuse("FUNCTION_SECTION", artifact.view.phase);
  const sameSection = artifact.symbols.filter((candidate) => candidate.sect === symbol.sect && (candidate.type & 0x0e) === 0x0e && !PREDECESSOR_SYMBOLS.includes(candidate.name) && candidate.value > symbol.value).map((candidate) => candidate.value);
  const sectionEnd = section.addr + section.size;
  const end = Math.min(sectionEnd, ...sameSection);
  if (symbol.value < section.addr || end <= symbol.value || end > sectionEnd || ((end - symbol.value) & 3) !== 0) refuse("FUNCTION_BOUNDS", artifact.view.phase);
  if (artifact.filetype === 2) {
    const ordered = artifact.functionStarts.filter((start) => start >= symbol.value).sort((a, b) => a - b);
    if (ordered[0] !== symbol.value || ordered[1] !== end) refuse("FUNCTION_STARTS", artifact.view.phase);
  }
  const fileStart = section.offset + (symbol.value - section.addr);
  artifact.view.bounds(fileStart, end - symbol.value);
  return { name, start: symbol.value, end, fileStart, section };
}

function definedLabel(artifact, name, container) {
  const candidates = artifact.symbols.filter((symbol) => symbol.name === name && (symbol.type & 0x0e) === 0x0e && symbol.sect === container.section.index);
  if (candidates.length !== 1 || candidates[0].value < container.start || candidates[0].value >= container.end || (candidates[0].value & 3) !== 0) refuse("MARKER_SYMBOL", artifact.view.phase);
  return candidates[0].value;
}

function decodeFunction(artifact, fn) {
  const instructions = [];
  for (let address = fn.start; address < fn.end; address += 4) {
    const offset = fn.fileStart + address - fn.start;
    const word = artifact.view.u32(offset);
    let kind = "data";
    let target = null;
    if ((word & 0xfc000000) === 0x94000000) { kind = "call"; target = address + signed(word & 0x03ffffff, 26) * 4; }
    else if ((word & 0xfc000000) === 0x14000000) { kind = "branch"; target = address + signed(word & 0x03ffffff, 26) * 4; }
    else if ((word & 0xff000010) === 0x54000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x7ffff, 19) * 4; }
    else if ((word & 0x7e000000) === 0x34000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x7ffff, 19) * 4; }
    else if ((word & 0x7e000000) === 0x36000000) { kind = "conditional"; target = address + signed((word >>> 5) & 0x3fff, 14) * 4; }
    else if ((word & 0xfffffc1f) === 0xd65f0000) kind = "return";
    else if ((word & 0xfffffc1f) === 0xd61f0000 || (word & 0xfffffc1f) === 0xd63f0000 || (word & 0xffe0001f) === 0xd4000001 || (word & 0xffffffe0) === 0xd4200000) refuse("INDIRECT_OR_EXCEPTION", "ARM64");
    else if (!admittedDataInstruction(word)) refuse("ARM64_OPCODE", "ARM64");
    if ((kind === "branch" || kind === "conditional") && (target < fn.start || target >= fn.end || (target & 3) !== 0)) refuse("BRANCH_TARGET", "ARM64");
    instructions.push({ address, offset, word, kind, target });
  }
  return instructions;
}

function admittedDataInstruction(word) {
  if (word === 0xd503201f) return true;
  const families = [
    [0x1f000000, 0x11000000], [0x1f000000, 0x0b000000], [0x1f000000, 0x12000000], [0x1f000000, 0x0a000000],
    [0x1f800000, 0x12800000], [0x1f800000, 0x13000000], [0x1f800000, 0x13800000], [0x1f000000, 0x10000000],
    [0x0a000000, 0x08000000], [0x1fe00000, 0x1a800000], [0x1fe00000, 0x1ac00000], [0x7f000000, 0x71000000]
  ];
  return families.some(([mask, value]) => (word & mask) === value);
}

function graphFor(instructions) {
  const byAddress = new Map(instructions.map((instruction) => [instruction.address, instruction]));
  const edges = [];
  for (const instruction of instructions) {
    const next = instruction.address + 4;
    if (instruction.kind === "return") continue;
    if (instruction.kind === "branch") edges.push({ from: instruction.address, to: instruction.target, kind: "branch_true" });
    else if (instruction.kind === "conditional") {
      edges.push({ from: instruction.address, to: instruction.target, kind: "branch_true" });
      if (!byAddress.has(next)) refuse("FALLTHROUGH", "CFG");
      edges.push({ from: instruction.address, to: next, kind: "branch_false" });
    } else {
      if (!byAddress.has(next)) refuse("FALLTHROUGH", "CFG");
      edges.push({ from: instruction.address, to: next, kind: instruction.kind === "call" ? "call_return" : "fallthrough" });
    }
  }
  const successors = new Map(instructions.map((instruction) => [instruction.address, []]));
  for (const edge of edges) successors.get(edge.from).push(edge.to);
  const reachable = new Set();
  const pending = [instructions[0].address];
  while (pending.length) {
    const current = pending.pop();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of successors.get(current) ?? []) pending.push(next);
  }
  const exits = instructions.filter((instruction) => instruction.kind === "return" && reachable.has(instruction.address));
  if (exits.length !== 1) refuse("CFG_EXIT", "CFG");
  return { byAddress, edges: edges.filter((edge) => reachable.has(edge.from)), successors, reachable, exit: exits[0].address };
}

function resolvedCalls(artifact, fn, instructions) {
  const calls = [];
  if (artifact.filetype === 1) {
    const relocations = new Map();
    const section = fn.section;
    for (let index = 0; index < section.nreloc; index++) {
      const base = section.reloff + index * 8;
      const address = artifact.view.i32(base);
      const info = artifact.view.u32(base + 4);
      const symbolIndex = info & 0x00ffffff;
      const pcrel = (info >>> 24) & 1;
      const length = (info >>> 25) & 3;
      const external = (info >>> 27) & 1;
      const type = info >>> 28;
      if (address < 0 || relocations.has(address)) refuse("RELOCATION", "OBJECT");
      relocations.set(address, { symbolIndex, pcrel, length, external, type });
    }
    for (const instruction of instructions.filter((item) => item.kind === "call")) {
      const sectionOffset = instruction.address - section.addr;
      const relocation = relocations.get(sectionOffset);
      if (relocation === undefined || relocation.pcrel !== 1 || relocation.length !== 2 || relocation.external !== 1 || relocation.type !== 2 || relocation.symbolIndex >= artifact.symbols.length || (instruction.word & 0x03ffffff) !== 0) refuse("BRANCH26_RELOCATION", "OBJECT");
      calls.push({ offset: instruction.address, target: artifact.symbols[relocation.symbolIndex].name, relocation: "arm64_reloc_branch26" });
    }
  } else {
    if (artifact.dysymtab === null) refuse("INDIRECT_TABLE", "EXECUTABLE");
    const stubs = artifact.sections.filter((section) => (section.flags & 0xff) === 0x8);
    for (const instruction of instructions.filter((item) => item.kind === "call")) {
      const internal = artifact.symbols.filter((symbol) => (symbol.type & 0x0e) === 0x0e && symbol.value === instruction.target);
      if (internal.length === 1) { calls.push({ offset: instruction.address, target: internal[0].name, stubOffset: null }); continue; }
      const matches = [];
      for (const section of stubs) {
        if (section.reserved2 === 0 || section.size % section.reserved2 !== 0) refuse("STUB_TABLE", "EXECUTABLE");
        const ordinal = (instruction.target - section.addr) / section.reserved2;
        if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= section.size / section.reserved2) continue;
        const indirectIndex = section.reserved1 + ordinal;
        if (indirectIndex >= artifact.dysymtab.nindirectsyms) refuse("STUB_TABLE", "EXECUTABLE");
        const symbolIndex = artifact.view.u32(artifact.dysymtab.indirectsymoff + indirectIndex * 4);
        if ((symbolIndex & 0xc0000000) !== 0 || symbolIndex >= artifact.symbols.length) refuse("STUB_TABLE", "EXECUTABLE");
        matches.push({ offset: instruction.address, target: artifact.symbols[symbolIndex].name, stubOffset: instruction.target });
      }
      if (matches.length !== 1) refuse("STUB_RESOLUTION", "EXECUTABLE");
      calls.push(matches[0]);
    }
  }
  return calls;
}

function pathsAvoiding(graph, start, mandatory, exit) {
  const pending = [start];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === mandatory) continue;
    if (current === exit) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of graph.successors.get(current) ?? []) pending.push(next);
  }
  return false;
}

function nearestCall(calls, target) {
  const matches = calls.filter((call) => call.target === target);
  if (matches.length !== 1) refuse("CALL_CARDINALITY", "CFG");
  return matches[0].offset;
}

function analyzeSession(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const wipeOffset = nearestCall(calls, REQUIRED_SYMBOLS[1]);
  const zeroOffset = nearestCall(calls, REQUIRED_SYMBOLS[2]);
  if (wipeOffset >= zeroOffset || pathsAvoiding(graph, fn.start, wipeOffset, graph.exit) || pathsAvoiding(graph, wipeOffset + 4, zeroOffset, graph.exit)) refuse("CLEANUP_POSTDOM", "CFG");
  const markerAddresses = PREDECESSOR_SYMBOLS.map((name) => definedLabel(artifact, name, fn));
  if (new Set(markerAddresses).size !== PREDECESSORS.length || markerAddresses.some((address) => !graph.reachable.has(address) || pathsAvoiding(graph, address, wipeOffset, graph.exit))) refuse("CLEANUP_PREDECESSOR", "CFG");
  const forbidden = new Set(["_exit", "__exit", "_abort", "___assert_rtn"]);
  if (calls.some((call) => forbidden.has(call.target))) refuse("TERMINATING_CALL", "CFG");
  const readCalls = calls.filter((call) => call.target === "_read");
  const writeCalls = calls.filter((call) => call.target === "_write");
  if (readCalls.length !== 1 || writeCalls.length < 1 || pathsAvoiding(graph, readCalls[0].offset + 4, wipeOffset, graph.exit)) refuse("SECRET_FLOW", "CFG");
  const intervals = discoverStackIntervals(instructions, wipeOffset);
  const blocks = [...graph.reachable].sort((a, b) => a - b).map((address) => ({ start: hex(address), end: hex(address + 4), successors: [...(graph.successors.get(address) ?? [])].sort((a, b) => a - b).map(hex), predecessor_class: markerAddresses.includes(address) ? PREDECESSORS[markerAddresses.indexOf(address)] : null, secret_state: address < readCalls[0].offset ? "none" : address < wipeOffset ? "live" : address < zeroOffset ? "wiped" : "verified_zero" }));
  const edges = graph.edges.slice().sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind)).map((edge) => ({ from: hex(edge.from), to: hex(edge.to), kind: edge.kind }));
  const secretIntervals = [{ name: "key_read_buffer", start: hex(intervals[0].start), end: hex(intervals[0].end), capacity: "256" }, { name: "key_frame_buffer", start: hex(intervals[1].start), end: hex(intervals[1].end), capacity: "768" }];
  const exit = { offset: hex(graph.exit), kind: "return", classified_predecessors: [...PREDECESSORS].sort(), wipe_call_offset: hex(wipeOffset), zero_scan_call_offset: hex(zeroOffset) };
  const cleanupCfg = { schema: "obs-chain-helper-cleanup-cfg/v1", blocks, edges, secret_intervals: secretIntervals, exits: [exit] };
  return { graph, intervals, wipeOffset, zeroOffset, cleanupCfg, cleanupCfgSha256: digest("obs-chain-helper-cleanup-cfg/v1", [canonicalBytes(cleanupCfg)]), exit };
}

function discoverStackIntervals(instructions, wipeOffset) {
  const before = instructions.filter((instruction) => instruction.address < wipeOffset);
  const candidates = [];
  for (const instruction of before) {
    const word = instruction.word;
    if ((word & 0x7f000000) !== 0x11000000) continue;
    const rd = word & 31;
    const rn = (word >>> 5) & 31;
    const shift = (word >>> 22) & 1;
    const immediate = ((word >>> 10) & 0xfff) << (shift ? 12 : 0);
    if (rn === 31 && (rd === 0 || rd === 1)) candidates.push({ register: rd, start: immediate });
  }
  const read = candidates.filter((candidate) => candidate.register === 0).at(-1);
  const frame = candidates.filter((candidate) => candidate.register === 1).at(-1);
  if (read === undefined || frame === undefined) refuse("STACK_INTERVAL", "DATAFLOW");
  const intervals = [{ start: read.start, end: read.start + 256 }, { start: frame.start, end: frame.start + 768 }];
  if (intervals[0].start < 0 || intervals[1].start < 0 || Math.max(intervals[0].start, intervals[1].start) < Math.min(intervals[0].end, intervals[1].end)) refuse("STACK_INTERVAL", "DATAFLOW");
  return intervals;
}

function decodeImmediateWrites(instructions) {
  const writes = [];
  for (const instruction of instructions) {
    const word = instruction.word;
    if ((word & 0x7f800000) === 0x52800000 || (word & 0x7f800000) === 0x12800000) {
      const rd = word & 31;
      const immediate = (word >>> 5) & 0xffff;
      const shift = ((word >>> 21) & 3) * 16;
      writes.push({ address: instruction.address, register: rd, value: immediate * 2 ** shift });
    }
  }
  return writes;
}

function analyzeWipe(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const wipeCalls = calls.filter((call) => call.target === "_memset_s").sort((a, b) => a.offset - b.offset);
  if (wipeCalls.length !== 2 || wipeCalls[0].offset >= wipeCalls[1].offset) refuse("MEMSET_CALLS", "DATAFLOW");
  for (const call of wipeCalls) if (pathsAvoiding(graph, fn.start, call.offset, graph.exit)) refuse("MEMSET_BYPASS", "DATAFLOW");
  const immediates = decodeImmediateWrites(instructions);
  for (const [index, capacity] of [256, 768].entries()) {
    const window = immediates.filter((write) => write.address < wipeCalls[index].offset && write.address + 64 >= wipeCalls[index].offset);
    if (window.filter((write) => (write.register === 1 || write.register === 3) && write.value === capacity).length < 2 || !window.some((write) => write.register === 2 && write.value === 0)) refuse("MEMSET_ARGUMENTS", "DATAFLOW");
    const post = instructions.filter((instruction) => instruction.address > wipeCalls[index].offset && instruction.address <= wipeCalls[index].offset + 16);
    if (!post.some((instruction) => instruction.kind === "conditional")) refuse("MEMSET_RETURN_CHECK", "DATAFLOW");
  }
  return { graph, calls: wipeCalls };
}

function analyzeZeroScan(artifact, fn, instructions, calls) {
  const graph = graphFor(instructions);
  const loads = instructions.filter((instruction) => (instruction.word & 0x0a000000) === 0x08000000);
  const constants = decodeImmediateWrites(instructions).map((write) => write.value);
  if (calls.length !== 0 || loads.length < 2 || !constants.includes(256) || !constants.includes(768) || instructions.filter((instruction) => instruction.kind === "conditional").length < 2) refuse("VOLATILE_ZERO_SCAN", "DATAFLOW");
  return graph;
}

function parseCommandFrames(bytes) {
  let offset = 0;
  const read = () => {
    if (offset + 8 > bytes.length) refuse("COMMAND_FRAME", "COMMANDS");
    const lengthBig = bytes.readBigUInt64BE(offset);
    offset += 8;
    if (lengthBig > BigInt(MAX_COMMAND_STREAM) || lengthBig > BigInt(Number.MAX_SAFE_INTEGER)) refuse("COMMAND_LENGTH", "COMMANDS");
    const length = Number(lengthBig);
    if (offset + length > bytes.length) refuse("COMMAND_FRAME", "COMMANDS");
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const streams = COMMAND_LABELS.map((label) => ({ label, stdout: read(), stderr: read() }));
  if (offset !== bytes.length) refuse("COMMAND_TRAILING", "COMMANDS");
  return streams;
}

function commandArgv(otool, nm) {
  return [
    ["/usr/bin/xcrun", "--sdk", "macosx", "--find", "otool"], [otool, "--version"],
    ["/usr/bin/xcrun", "--sdk", "macosx", "--find", "nm"], [nm, "--version"],
    [nm, "--arch=arm64", "--format=posix", "--numeric-sort", "--print-size", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-r", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_wipe_secret_buffers", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_run_session", "/dev/fd/3"],
    [nm, "--arch=arm64", "--format=posix", "--numeric-sort", "--print-size", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-l", "/dev/fd/3"], [otool, "-arch", "arm64", "-L", "/dev/fd/3"], [otool, "-arch", "arm64", "-I", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_wipe_secret_buffers", "/dev/fd/3"],
    [otool, "-arch", "arm64", "-t", "-v", "-V", "-j", "-p", "_fix09_run_session", "/dev/fd/3"]
  ];
}

function parseToolEvidence(commandBytes, manifest, objectHash, executableHash) {
  const streams = parseCommandFrames(commandBytes);
  const findPath = (stream) => {
    if (stream.stderr.length !== 0) refuse("TOOL_FIND_STDERR", "COMMANDS");
    const text = strictUtf8(stream.stdout, "COMMANDS");
    if (!/^\/[^\n\r]+\n$/.test(text)) refuse("TOOL_FIND_PATH", "COMMANDS");
    return text.slice(0, -1);
  };
  const otool = findPath(streams[0]);
  const nm = findPath(streams[2]);
  const argvs = commandArgv(otool, nm);
  const records = streams.map((stream, index) => {
    const artifactKind = index >= 4 && index <= 7 ? "object" : index >= 8 ? "executable" : "none";
    const artifactHash = artifactKind === "object" ? objectHash : artifactKind === "executable" ? executableHash : "0".repeat(64);
    const stdoutHash = digest("obs-chain-helper-artifact-command-stdout/v1", [Buffer.from(stream.label), stream.stdout]);
    const stderrHash = digest("obs-chain-helper-artifact-command-stderr/v1", [Buffer.from(stream.label), stream.stderr]);
    const commandHash = digest("obs-chain-helper-artifact-command/v1", [Buffer.from(stream.label), argvBytes(argvs[index]), u32(0), d32(stdoutHash), d32(stderrHash), Buffer.from(artifactKind), d32(artifactHash)]);
    return { label: stream.label, argv: argvs[index], exit_code: "0", stdout_bytes: String(stream.stdout.length), stdout_sha256: stdoutHash, stderr_bytes: String(stream.stderr.length), stderr_sha256: stderrHash, artifact_kind: artifactKind, artifact_sha256: artifactHash, command_sha256: commandHash };
  });
  const set = { schema: "obs-chain-helper-artifact-command-set/v1", records };
  if (digest("obs-chain-helper-artifact-command-set/v1", [canonicalBytes(set)]) !== manifest.artifact_command_set_sha256) refuse("COMMAND_SET_HASH", "COMMANDS");
  return { streams, records, otool, nm };
}

function requireToolAgreement(tool, object, executable, objectFunctions, executableFunctions, objectCalls, executableCalls) {
  const texts = tool.streams.map((stream) => strictUtf8(stream.stdout, "TOOLS"));
  for (const [index, artifact, functions] of [[4, object, objectFunctions], [8, executable, executableFunctions]]) {
    const text = texts[index];
    for (const fn of functions) if (!new RegExp(`${fn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[A-Za-z?]\\s+0*${hex(fn.start)}\\s+0*${hex(fn.end - fn.start)}(?:\\s|$)`, "m").test(text)) refuse("NM_DISAGREEMENT", "TOOLS");
    const undefinedNames = artifact.symbols.filter((symbol) => (symbol.type & 0x0e) === 0 && symbol.value === 0).map((symbol) => symbol.name);
    for (const name of undefinedNames) if (!text.includes(name)) refuse("NM_UNDEFINED_DISAGREEMENT", "TOOLS");
  }
  if (!texts[5].includes("ARM64_RELOC_BRANCH26") || objectCalls.filter((call) => call.target === "_memset_s").some((call) => !texts[5].includes(hex(call.offset)))) refuse("RELOCATION_DISAGREEMENT", "TOOLS");
  for (const [index, calls] of [[6, objectCalls], [12, executableCalls]]) for (const call of calls.filter((value) => value.target === "_memset_s")) if (!texts[index].includes(hex(call.offset)) || !texts[index].includes("_memset_s")) refuse("DISASSEMBLY_DISAGREEMENT", "TOOLS");
  if (!texts[9].includes("LC_BUILD_VERSION") || !texts[9].includes(executable.build.minos) || !texts[10].includes("/usr/lib/libSystem.B.dylib")) refuse("LOAD_DISAGREEMENT", "TOOLS");
  for (const call of executableCalls.filter((value) => value.stubOffset !== null)) if (!texts[11].includes(hex(call.stubOffset)) || !texts[11].includes(call.target)) refuse("INDIRECT_DISAGREEMENT", "TOOLS");
}

function sourceChecks(source, sourceHash) {
  if (digest("obs-chain-helper-source/v2", [Buffer.from(SOURCE_PATH), source]) !== sourceHash) refuse("SOURCE_HASH", "SOURCE");
  const text = strictUtf8(source, "SOURCE");
  if (!text.startsWith("#define __STDC_WANT_LIB_EXT1__ 1\n") || (text.match(/\bmemset_s\s*\(/g) ?? []).length !== 2 || /\b(?:memset|explicit_bzero|bzero|dlsym)\s*\(/.test(text) || !text.includes("fix09_wipe_secret_buffers") || !text.includes("fix09_scan_secret_buffers_zero")) refuse("SOURCE_POLICY", "SOURCE");
  for (const token of PREDECESSORS) if (!text.includes(token)) refuse("SOURCE_PREDECESSOR", "SOURCE");
}

function main() {
  const input = readInput();
  const { manifest, source, object, macho, commandBytes } = input;
  sourceChecks(source, manifest.source_sha256);
  const objectHash = digest("obs-chain-helper-object/v1", [object]);
  const executableHash = digest("obs-chain-helper-output/v1", [macho]);
  if (objectHash !== manifest.object_output_sha256 || executableHash !== manifest.build_output_sha256) refuse("ARTIFACT_HASH", "ARTIFACT");
  const parsedObject = parseMachO(object, 1, "OBJECT");
  const parsedExecutable = parseMachO(macho, 2, "EXECUTABLE");
  if (parsedExecutable.build === null || parsedExecutable.dependencies.length !== 1 || parsedExecutable.dependencies[0] !== "/usr/lib/libSystem.B.dylib") refuse("EXECUTABLE_POLICY", "EXECUTABLE");
  const deploymentParts = parsedExecutable.build.minos.split(".");
  const targetTriple = `arm64-apple-macosx${parsedExecutable.build.minos}`;
  const deploymentValue = { schema: "obs-chain-helper-deployment-contract/v1", architecture: "arm64", deployment_target: parsedExecutable.build.minos, target_triple: targetTriple, deployment_flag: `-mmacosx-version-min=${parsedExecutable.build.minos}`, macho_platform: "macos", macho_minos: parsedExecutable.build.minos, memset_s_first_macos: "10.9" };
  if (digest("obs-chain-helper-deployment-contract/v1", [canonicalBytes(deploymentValue)]) !== manifest.deployment_contract_sha256 || Number(deploymentParts[0]) < 10 || (Number(deploymentParts[0]) === 10 && Number(deploymentParts[1] ?? 0) < 9)) refuse("DEPLOYMENT", "EXECUTABLE");
  const objectFns = REQUIRED_SYMBOLS.map((name) => definedFunction(parsedObject, name));
  const executableFns = REQUIRED_SYMBOLS.map((name) => definedFunction(parsedExecutable, name));
  const objectDecoded = new Map(objectFns.map((fn) => [fn.name, decodeFunction(parsedObject, fn)]));
  const executableDecoded = new Map(executableFns.map((fn) => [fn.name, decodeFunction(parsedExecutable, fn)]));
  const objectCallMap = new Map(objectFns.map((fn) => [fn.name, resolvedCalls(parsedObject, fn, objectDecoded.get(fn.name))]));
  const executableCallMap = new Map(executableFns.map((fn) => [fn.name, resolvedCalls(parsedExecutable, fn, executableDecoded.get(fn.name))]));
  const objectSession = analyzeSession(parsedObject, objectFns[0], objectDecoded.get(REQUIRED_SYMBOLS[0]), objectCallMap.get(REQUIRED_SYMBOLS[0]));
  const executableSession = analyzeSession(parsedExecutable, executableFns[0], executableDecoded.get(REQUIRED_SYMBOLS[0]), executableCallMap.get(REQUIRED_SYMBOLS[0]));
  const objectWipe = analyzeWipe(parsedObject, objectFns[1], objectDecoded.get(REQUIRED_SYMBOLS[1]), objectCallMap.get(REQUIRED_SYMBOLS[1]));
  const executableWipe = analyzeWipe(parsedExecutable, executableFns[1], executableDecoded.get(REQUIRED_SYMBOLS[1]), executableCallMap.get(REQUIRED_SYMBOLS[1]));
  analyzeZeroScan(parsedObject, objectFns[2], objectDecoded.get(REQUIRED_SYMBOLS[2]), objectCallMap.get(REQUIRED_SYMBOLS[2]));
  analyzeZeroScan(parsedExecutable, executableFns[2], executableDecoded.get(REQUIRED_SYMBOLS[2]), executableCallMap.get(REQUIRED_SYMBOLS[2]));
  if (canonical(objectSession.intervals) !== canonical(executableSession.intervals)) refuse("INTERVAL_DISAGREEMENT", "DATAFLOW");
  const tool = parseToolEvidence(commandBytes, manifest, objectHash, executableHash);
  requireToolAgreement(tool, parsedObject, parsedExecutable, objectFns.slice(0, 3), executableFns.slice(0, 3), objectCallMap.get(REQUIRED_SYMBOLS[1]), executableCallMap.get(REQUIRED_SYMBOLS[1]));
  const objectWipeSpan = object.subarray(objectFns[1].fileStart, objectFns[1].fileStart + objectFns[1].end - objectFns[1].start);
  const executableWipeSpan = macho.subarray(executableFns[1].fileStart, executableFns[1].fileStart + executableFns[1].end - executableFns[1].start);
  const objectSpanHash = digest("obs-chain-helper-arm64-function-bytes/v1", [Buffer.from("object"), Buffer.from(REQUIRED_SYMBOLS[1]), objectWipeSpan]);
  const executableSpanHash = digest("obs-chain-helper-arm64-function-bytes/v1", [Buffer.from("executable"), Buffer.from(REQUIRED_SYMBOLS[1]), executableWipeSpan]);
  const instructionHash = digest("obs-chain-helper-wipe-instructions/v1", [executableWipeSpan]);
  const undefinedSymbols = [...new Set(parsedExecutable.symbols.filter((symbol) => (symbol.type & 0x0e) === 0 && symbol.value === 0).map((symbol) => symbol.name))].sort(byteSort);
  const machoProjection = { schema: "obs-chain-helper-macho/v1", cputype: "arm64", cpusubtype: parsedExecutable.cpusubtype === 0 ? "arm64_all" : `arm64_${parsedExecutable.cpusubtype.toString(16)}`, filetype: "mh_execute", flags: parsedExecutable.flags, minos: parsedExecutable.build.minos, sdk: parsedExecutable.build.sdk, load_commands: parsedExecutable.commands, external_dependencies: parsedExecutable.dependencies, undefined_symbols: undefinedSymbols };
  const wipeObjectProjection = { schema: "obs-chain-helper-wipe-object/v1", object_output_sha256: objectHash, memset_s_undefined_symbol: "_memset_s", memset_s_undefined_symbol_count: String(parsedObject.symbols.filter((symbol) => symbol.name === "_memset_s" && (symbol.type & 0x0e) === 0).length), secret_allocations: [{ name: "key_read_buffer", capacity: "256" }, { name: "key_frame_buffer", capacity: "768" }], direct_calls: [{ caller: REQUIRED_SYMBOLS[1], ordinal: "1", callee: "_memset_s" }, { caller: REQUIRED_SYMBOLS[1], ordinal: "2", callee: "_memset_s" }], ordinary_memset_secret_calls: "0", fallback_symbols: [] };
  if (wipeObjectProjection.memset_s_undefined_symbol_count !== "1") refuse("MEMSET_SYMBOL_COUNT", "PROJECTION");
  const wipeDisassemblyProjection = { schema: "obs-chain-helper-wipe-disassembly/v1", build_output_sha256: executableHash, function: REQUIRED_SYMBOLS[1], function_instructions_sha256: instructionHash, memset_s_call_offsets: executableWipe.calls.map((call) => hex(call.offset)), memset_s_call_targets: ["_memset_s", "_memset_s"], cleanup_predecessors: PREDECESSORS, exit_without_cleanup_paths: "0" };
  const secretBuffers = [{ name: "key_read_buffer", capacity: "256", stack_start: hex(executableSession.intervals[0].start), stack_end: hex(executableSession.intervals[0].end) }, { name: "key_frame_buffer", capacity: "768", stack_start: hex(executableSession.intervals[1].start), stack_end: hex(executableSession.intervals[1].end) }];
  const objectRecord = { filetype: "mh_object", architecture: "arm64", session_bounds: { start: hex(objectFns[0].start), end: hex(objectFns[0].end) }, wipe_bounds: { start: hex(objectFns[1].start), end: hex(objectFns[1].end) }, wipe_instruction_sha256: objectSpanHash, memset_s_calls: objectWipe.calls.map((call) => ({ offset: hex(call.offset), relocation: call.relocation, target: call.target })) };
  const executableRecord = { filetype: "mh_execute", architecture: "arm64", minos: parsedExecutable.build.minos, session_bounds: { start: hex(executableFns[0].start), end: hex(executableFns[0].end) }, wipe_bounds: { start: hex(executableFns[1].start), end: hex(executableFns[1].end) }, wipe_instruction_sha256: executableSpanHash, memset_s_calls: executableWipe.calls.map((call) => ({ offset: hex(call.offset), stub_offset: hex(call.stubOffset), target: call.target })) };
  const output = { schema: "obs-chain-helper-wipe-verifier-output/v1", verifier_source_sha256: manifest.wipe_verifier_source_sha256, verifier_runtime_sha256: manifest.wipe_verifier_runtime_sha256, input_sha256: input.inputSha256, source_sha256: manifest.source_sha256, object_output_sha256: objectHash, build_output_sha256: executableHash, deployment_contract_sha256: manifest.deployment_contract_sha256, artifact_command_set_sha256: manifest.artifact_command_set_sha256, object: objectRecord, executable: executableRecord, macho_projection: machoProjection, wipe_object_projection: wipeObjectProjection, wipe_disassembly_projection: wipeDisassemblyProjection, secret_buffers: secretBuffers, cleanup_cfg: executableSession.cleanupCfg, cleanup_cfg_sha256: executableSession.cleanupCfgSha256, cleanup_predecessors: PREDECESSORS, reachable_exits: [{ offset: executableSession.exit.offset, kind: "return", predecessors: [...PREDECESSORS].sort(), wipe_call_offset: hex(executableSession.wipeOffset), zero_scan_call_offset: hex(executableSession.zeroOffset) }], exit_without_cleanup_paths: "0", memset_s_call_count: "2", secret_buffer_count: "2" };
  if (!HEX64.test(digest("obs-chain-helper-macho-projection/v1", [canonicalBytes(machoProjection)])) || !HEX64.test(digest("obs-chain-helper-wipe-object/v1", [canonicalBytes(wipeObjectProjection)])) || !HEX64.test(digest("obs-chain-helper-wipe-disassembly/v1", [canonicalBytes(wipeDisassemblyProjection)]))) refuse("PROJECTION_HASH", "PROJECTION");
  fs.writeSync(1, canonicalBytes(output));
}

try {
  main();
} catch (error) {
  const failure = error instanceof Refusal ? error : new Refusal("INTERNAL", "VERIFIER");
  fs.writeSync(2, canonicalBytes({ schema: "obs-chain-helper-wipe-verifier-error/v1", code: failure.code, phase: failure.phase }));
  process.exitCode = 1;
}
