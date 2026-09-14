const DIGIT = /^[0-9]$/u;

function fail(code: string): never {
  throw new SyntaxError(code);
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

class UniqueJsonScanner {
  #index = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.#whitespace();
    this.#value();
    this.#whitespace();
    if (this.#index !== this.source.length) fail("FIX09_INVALID_JSON");
  }

  #value(): void {
    this.#whitespace();
    const value = this.source[this.#index];
    if (value === "{") return this.#object();
    if (value === "[") return this.#array();
    if (value === '"') {
      this.#string();
      return;
    }
    if (value === "t") return this.#literal("true");
    if (value === "f") return this.#literal("false");
    if (value === "n") return this.#literal("null");
    if (value === "-" || (value !== undefined && DIGIT.test(value))) {
      this.#number();
      return;
    }
    fail("FIX09_INVALID_JSON");
  }

  #object(): void {
    this.#index += 1;
    this.#whitespace();
    if (this.#consume("}")) return;
    const names = new Set<string>();
    while (true) {
      this.#whitespace();
      if (this.source[this.#index] !== '"') fail("FIX09_INVALID_JSON");
      const name = this.#string();
      if (names.has(name)) fail("FIX09_DUPLICATE_JSON_MEMBER");
      names.add(name);
      this.#whitespace();
      if (!this.#consume(":")) fail("FIX09_INVALID_JSON");
      this.#value();
      this.#whitespace();
      if (this.#consume("}")) return;
      if (!this.#consume(",")) fail("FIX09_INVALID_JSON");
    }
  }

  #array(): void {
    this.#index += 1;
    this.#whitespace();
    if (this.#consume("]")) return;
    while (true) {
      this.#value();
      this.#whitespace();
      if (this.#consume("]")) return;
      if (!this.#consume(",")) fail("FIX09_INVALID_JSON");
    }
  }

  #string(): string {
    const start = this.#index;
    this.#index += 1;
    while (this.#index < this.source.length) {
      const character = this.source[this.#index];
      if (character !== undefined && character.charCodeAt(0) < 0x20) {
        fail("FIX09_INVALID_JSON");
      }
      this.#index += 1;
      if (character === '"') {
        let decoded: string;
        try {
          decoded = JSON.parse(this.source.slice(start, this.#index)) as string;
        } catch {
          fail("FIX09_INVALID_JSON");
        }
        if (hasLoneSurrogate(decoded)) fail("FIX09_JSON_LONE_SURROGATE");
        return decoded;
      }
      if (character === "\\") {
        const escaped = this.source[this.#index];
        if (escaped === "u") {
          const hex = this.source.slice(this.#index + 1, this.#index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) fail("FIX09_INVALID_JSON");
          this.#index += 5;
        } else if (escaped !== undefined && '"\\/bfnrt'.includes(escaped)) {
          this.#index += 1;
        } else {
          fail("FIX09_INVALID_JSON");
        }
      }
    }
    return fail("FIX09_INVALID_JSON");
  }

  #literal(literal: "true" | "false" | "null"): void {
    if (this.source.slice(this.#index, this.#index + literal.length) !== literal) {
      fail("FIX09_INVALID_JSON");
    }
    this.#index += literal.length;
  }

  #number(): void {
    let index = this.#index;
    if (this.source[index] === "-") index += 1;
    if (this.source[index] === "0") {
      index += 1;
    } else {
      const first = this.source[index];
      if (first === undefined || first < "1" || first > "9") fail("FIX09_INVALID_JSON");
      index += 1;
      while (this.source[index] !== undefined && DIGIT.test(this.source[index] ?? "")) index += 1;
    }
    if (this.source[index] === ".") {
      index += 1;
      if (this.source[index] === undefined || !DIGIT.test(this.source[index] ?? "")) fail("FIX09_INVALID_JSON");
      while (this.source[index] !== undefined && DIGIT.test(this.source[index] ?? "")) index += 1;
    }
    if (this.source[index] === "e" || this.source[index] === "E") {
      index += 1;
      if (this.source[index] === "+" || this.source[index] === "-") index += 1;
      if (this.source[index] === undefined || !DIGIT.test(this.source[index] ?? "")) fail("FIX09_INVALID_JSON");
      while (this.source[index] !== undefined && DIGIT.test(this.source[index] ?? "")) index += 1;
    }
    this.#index = index;
  }

  #whitespace(): void {
    while (/^[\u0009\u000a\u000d\u0020]$/u.test(this.source[this.#index] ?? "")) {
      this.#index += 1;
    }
  }

  #consume(character: string): boolean {
    if (this.source[this.#index] !== character) return false;
    this.#index += 1;
    return true;
  }
}

export function parseUniqueJson(source: string): unknown {
  if (typeof source !== "string") fail("FIX09_INVALID_JSON");
  new UniqueJsonScanner(source).scan();
  return JSON.parse(source) as unknown;
}
