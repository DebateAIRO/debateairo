/**
 * A deliberately narrow QR encoder for the S4 otpauth provisioning payload.
 *
 * It emits one fixed, well-supported symbol: QR version 10, error correction
 * level L, byte mode, mask 0. Version 10-L carries up to 271 UTF-8 bytes,
 * comfortably above DebateAIRO's ruled issuer + pseudonym URI. Keeping the
 * profile fixed avoids a browser dependency and, critically, avoids sending
 * the TOTP seed to a third-party QR service.
 */

const VERSION = 10;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 274;
const EC_CODEWORDS_PER_BLOCK = 18;
const BLOCK_DATA_LENGTHS = [68, 68, 69, 69] as const;
const ALIGNMENT_CENTERS = [6, 28, 50] as const;

type Module = boolean | null;

function appendBits(target: number[], value: number, count: number): void {
  if (!Number.isInteger(value) || value < 0 || count < 0 || count > 31 || value >>> count !== 0) {
    throw new TypeError("TOTP_QR_BITS_INVALID");
  }
  for (let bit = count - 1; bit >= 0; bit -= 1) target.push(((value >>> bit) & 1) !== 0 ? 1 : 0);
}

function gfMultiply(left: number, right: number): number {
  let x = left;
  let y = right;
  let product = 0;
  while (y !== 0) {
    if ((y & 1) !== 0) product ^= x;
    y >>>= 1;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= 0x11d;
  }
  return product;
}

function reedSolomonDivisor(degree: number): number[] {
  const divisor = Array<number>(degree).fill(0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < divisor.length; coefficient += 1) {
      divisor[coefficient] = gfMultiply(divisor[coefficient]!, root);
      if (coefficient + 1 < divisor.length) {
        divisor[coefficient] = divisor[coefficient]! ^ divisor[coefficient + 1]!;
      }
    }
    root = gfMultiply(root, 2);
  }
  return divisor;
}

function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const remainder = Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[remainder.length - 1] = 0;
    for (let index = 0; index < remainder.length; index += 1) {
      remainder[index] = remainder[index]! ^ gfMultiply(divisor[index]!, factor);
    }
  }
  return remainder;
}

function dataCodewords(payload: string): number[] {
  const bytes = [...new TextEncoder().encode(payload)];
  // Version 10 byte mode uses a 16-bit character-count field. Four mode bits,
  // sixteen count bits and a terminator leave 271 payload bytes.
  if (bytes.length > 271) throw new RangeError("TOTP_QR_PAYLOAD_TOO_LONG");
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 16);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const capacity = DATA_CODEWORDS * 8;
  for (let count = Math.min(4, capacity - bits.length); count > 0; count -= 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const result: number[] = [];
  for (let offset = 0; offset < bits.length; offset += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[offset + bit]!;
    result.push(byte);
  }
  for (let pad = 0; result.length < DATA_CODEWORDS; pad += 1) result.push(pad % 2 === 0 ? 0xec : 0x11);
  return result;
}

function interleavedCodewords(payload: string): number[] {
  const data = dataCodewords(payload);
  const divisor = reedSolomonDivisor(EC_CODEWORDS_PER_BLOCK);
  const blocks: number[][] = [];
  const checks: number[][] = [];
  let offset = 0;
  for (const length of BLOCK_DATA_LENGTHS) {
    const block = data.slice(offset, offset + length);
    offset += length;
    blocks.push(block);
    checks.push(reedSolomonRemainder(block, divisor));
  }
  const result: number[] = [];
  for (let column = 0; column < Math.max(...BLOCK_DATA_LENGTHS); column += 1) {
    for (const block of blocks) if (column < block.length) result.push(block[column]!);
  }
  for (let column = 0; column < EC_CODEWORDS_PER_BLOCK; column += 1) {
    for (const check of checks) result.push(check[column]!);
  }
  return result;
}

function bchRemainder(value: number, polynomial: number): number {
  let remainder = value;
  const polynomialDegree = 31 - Math.clz32(polynomial);
  while (remainder !== 0 && 31 - Math.clz32(remainder) >= polynomialDegree) {
    remainder ^= polynomial << (31 - Math.clz32(remainder) - polynomialDegree);
  }
  return remainder;
}

function drawFinder(modules: Module[][], top: number, left: number): void {
  for (let row = -1; row <= 7; row += 1) {
    for (let column = -1; column <= 7; column += 1) {
      const targetRow = top + row;
      const targetColumn = left + column;
      if (targetRow < 0 || targetRow >= SIZE || targetColumn < 0 || targetColumn >= SIZE) continue;
      modules[targetRow]![targetColumn] = row >= 0 && row <= 6 && column >= 0 && column <= 6
        && (row === 0 || row === 6 || column === 0 || column === 6
          || (row >= 2 && row <= 4 && column >= 2 && column <= 4));
    }
  }
}

function drawFunctionPatterns(modules: Module[][]): void {
  drawFinder(modules, 0, 0);
  drawFinder(modules, SIZE - 7, 0);
  drawFinder(modules, 0, SIZE - 7);
  for (const row of ALIGNMENT_CENTERS) {
    for (const column of ALIGNMENT_CENTERS) {
      if (modules[row]![column] !== null) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          modules[row + dy]![column + dx] = distance === 2 || distance === 0;
        }
      }
    }
  }
  for (let index = 8; index < SIZE - 8; index += 1) {
    if (modules[6]![index] === null) modules[6]![index] = index % 2 === 0;
    if (modules[index]![6] === null) modules[index]![6] = index % 2 === 0;
  }

  const versionBits = (VERSION << 12) | bchRemainder(VERSION << 12, 0x1f25);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((versionBits >>> index) & 1) !== 0;
    modules[Math.floor(index / 3)]![index % 3 + SIZE - 11] = dark;
    modules[index % 3 + SIZE - 11]![Math.floor(index / 3)] = dark;
  }

  // Error-correction level L is binary 01; this encoder intentionally fixes
  // mask 0. The XOR constant is the QR format-information mask.
  const formatPayload = 0b01 << 3;
  const formatBits = ((formatPayload << 10) | bchRemainder(formatPayload << 10, 0x537)) ^ 0x5412;
  for (let index = 0; index < 15; index += 1) {
    const dark = ((formatBits >>> index) & 1) !== 0;
    const verticalRow = index < 6 ? index : index < 8 ? index + 1 : SIZE - 15 + index;
    modules[verticalRow]![8] = dark;
    const horizontalColumn = index < 8 ? SIZE - index - 1 : index === 8 ? 7 : 15 - index - 1;
    modules[8]![horizontalColumn] = dark;
  }
  modules[SIZE - 8]![8] = true;
}

function drawData(modules: Module[][], codewords: readonly number[]): void {
  let byteIndex = 0;
  let bitIndex = 7;
  let row = SIZE - 1;
  let direction = -1;
  for (let right = SIZE - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (;;) {
      for (let side = 0; side < 2; side += 1) {
        const column = right - side;
        if (modules[row]![column] !== null) continue;
        let dark = byteIndex < codewords.length && ((codewords[byteIndex]! >>> bitIndex) & 1) !== 0;
        if ((row + column) % 2 === 0) dark = !dark; // mask 0
        modules[row]![column] = dark;
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row >= 0 && row < SIZE) continue;
      row -= direction;
      direction = -direction;
      break;
    }
  }
  if (byteIndex !== codewords.length) {
    throw new Error(`TOTP_QR_CAPACITY_MISMATCH:${byteIndex}/${codewords.length}`);
  }
}

export function totpQrMatrix(otpauthUri: string): readonly (readonly boolean[])[] {
  if (!otpauthUri.startsWith("otpauth://totp/")) throw new TypeError("TOTP_QR_URI_INVALID");
  const modules = Array.from({ length: SIZE }, () => Array<Module>(SIZE).fill(null));
  drawFunctionPatterns(modules);
  drawData(modules, interleavedCodewords(otpauthUri));
  if (modules.some((row) => row.some((module) => module === null))) {
    throw new Error("TOTP_QR_MATRIX_INCOMPLETE");
  }
  return Object.freeze(modules.map((row) => Object.freeze(row as boolean[])));
}
