/** SPDX-License-Identifier: MIT
 * Adapted layout/encoding/schema portions: Copyright (c) 2020 Matthew Miller;
 * CBOR length/constants portions: Copyright (c) 2025 Levi.
 * Full retained notices and symbol provenance: third_party/webauthn/ADAPTATIONS.md.
 */
/** Bounded layout/CBOR adaptations, MIT; original copyrights and symbol mapping:
 * third_party/webauthn/ADAPTATIONS.md. No upstream module is imported. */
export function invalid(): never { throw new Error('STAFF_WEBAUTHN_INVALID'); }
export function encodeBase64url(bytes: Uint8Array): string { return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64url'); }
export function decodeBase64url(value: string, maxBytes: number): Uint8Array {
    if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes * 4 / 3) || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/u.test(value))
        invalid();
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.byteLength > maxBytes || encodeBase64url(decoded) !== value)
        invalid();
    return decoded;
}
export type CborValue = number | string | Uint8Array | Map<number | string, CborValue>;
/** Needed CBOR majors only; every read is relative to the supplied byte view. */
export function decodeCbor(bytes: Uint8Array): {
    value: CborValue;
    consumed: number;
} {
    if (bytes.byteLength === 0 || bytes.byteLength > 16384)
        invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0, items = 0;
    const read = (count: number) => { if (count > bytes.byteLength - offset)
        invalid(); const start = offset; offset += count; return start; };
    const next = (depth: number): CborValue => {
        if (depth > 8 || ++items > 128)
            invalid();
        const first = view.getUint8(read(1)), major = first >>> 5, ai = first & 31;
        let n: number;
        if (ai < 24)
            n = ai;
        else if (ai === 24) {
            n = view.getUint8(read(1));
            if (n < 24)
                invalid();
        }
        else if (ai === 25) {
            n = view.getUint16(read(2));
            if (n < 256)
                invalid();
        }
        else if (ai === 26) {
            n = view.getUint32(read(4));
            if (n < 65536)
                invalid();
        }
        else if (ai === 27) {
            const x = view.getBigUint64(read(8));
            if (x <= 4294967295n || x > BigInt(Number.MAX_SAFE_INTEGER))
                invalid();
            n = Number(x);
        }
        else
            return invalid();
        if (major === 0)
            return n;
        if (major === 1)
            return -1 - n;
        if (major === 2 || major === 3) {
            const start = read(n), slice = bytes.subarray(start, offset);
            if (major === 2)
                return slice;
            try {
                return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(slice);
            }
            catch {
                return invalid();
            }
        }
        if (major === 5) {
            if (n > 32)
                invalid();
            const map = new Map<number | string, CborValue>();
            for (let i = 0; i < n; i++) {
                const k = next(depth + 1);
                if ((typeof k !== 'number' && typeof k !== 'string') || map.has(k))
                    invalid();
                map.set(k, next(depth + 1));
            }
            return map;
        }
        return invalid();
    };
    const value = next(0);
    if (offset !== bytes.byteLength)
        invalid();
    return { value, consumed: offset };
}
/** Strict JSON grammar with duplicate-member checks before JSON.parse can erase them.
 * Unknown standard client members are opaque. TextDecoder strips a leading UTF8 BOM;
 * callers hash the untouched bytes. Objects have no prototype. */
export function parseClientData(bytes: Uint8Array): Record<string, unknown> {
    if (bytes.byteLength === 0 || bytes.byteLength > 4096)
        invalid();
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        return invalid();
    }
    let pos = 0, items = 0;
    const space = () => { while (/[ \t\r\n]/u.test(text[pos] ?? 'x'))
        pos++; };
    const string = (): string => { const start = pos; if (text[pos++] !== '"')
        invalid(); while (pos < text.length) {
        const char = text[pos++];
        if (char === '"') {
            try {
                return JSON.parse(text.slice(start, pos)) as string;
            }
            catch {
                return invalid();
            }
        }
        if (char === '\\')
            pos++;
    } return invalid(); };
    const value = (depth: number): unknown => {
        space();
        if (depth > 8 || ++items > 256)
            invalid();
        const ch = text[pos];
        if (ch === '"')
            return string();
        if (ch === '{') {
            pos++;
            const object: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
            const names = new Set<string>();
            space();
            if (text[pos] === '}') {
                pos++;
                return object;
            }
            for (;;) {
                space();
                const name = string();
                if (names.has(name) || ['__proto__', 'prototype', 'constructor'].includes(name) || names.size >= 64)
                    invalid();
                names.add(name);
                space();
                if (text[pos++] !== ':')
                    invalid();
                object[name] = value(depth + 1);
                space();
                const end = text[pos++];
                if (end === '}')
                    return object;
                if (end !== ',')
                    invalid();
            }
        }
        if (ch === '[') {
            pos++;
            const array: unknown[] = [];
            space();
            if (text[pos] === ']') {
                pos++;
                return array;
            }
            for (;;) {
                array.push(value(depth + 1));
                space();
                const end = text[pos++];
                if (end === ']')
                    return array;
                if (end !== ',')
                    invalid();
            }
        }
        for (const literal of ['true', 'false', 'null'])
            if (text.startsWith(literal, pos)) {
                pos += literal.length;
                return JSON.parse(literal) as unknown;
            }
        const token = text.slice(pos).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)?.[0];
        if (token === undefined)
            invalid();
        pos += token.length;
        const number = Number(token);
        if (!Number.isFinite(number))
            invalid();
        return number;
    };
    const result = value(0);
    space();
    if (pos !== text.length || result === null || typeof result !== 'object' || Array.isArray(result))
        invalid();
    return result as Record<string, unknown>;
}
export function parseAuthenticatorData(bytes: Uint8Array, registration: boolean): Readonly<{
    rpIdHash: Uint8Array;
    counter: number;
    credentialId?: Uint8Array;
    coseKey?: Uint8Array;
}> {
    if (bytes.byteLength < 37 || bytes.byteLength > 8192)
        invalid();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Exact flags simultaneously seal reserved bits, AT/ED, UP/UV and BE/BS.
    if (view.getUint8(32) !== (registration ? 0x45 : 0x05))
        invalid();
    const rpIdHash = bytes.subarray(0, 32), counter = view.getUint32(33);
    if (!registration) {
        if (bytes.byteLength !== 37)
            invalid();
        return { rpIdHash, counter };
    }
    if (bytes.byteLength < 55)
        invalid();
    const idLength = view.getUint16(53);
    if (idLength === 0 || idLength > 768 || 55 + idLength >= bytes.byteLength)
        invalid();
    const start = 55 + idLength;
    const wire = bytes.subarray(start);
    const { consumed } = decodeCbor(wire);
    return { rpIdHash, counter, credentialId: bytes.subarray(55, start), coseKey: wire.subarray(0, consumed) };
}
