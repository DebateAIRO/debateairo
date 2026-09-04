function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

class UniqueKeyScanner {
  private index = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) this.invalidJson();
  }

  private scanValue(): void {
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === "{") return this.scanObject();
    if (character === "[") return this.scanArray();
    if (character === '"') {
      this.scanString();
      return;
    }
    if (character === "t") return this.scanLiteral("true");
    if (character === "f") return this.scanLiteral("false");
    if (character === "n") return this.scanLiteral("null");
    if (
      character === "-" ||
      isDigit(character)
    ) {
      this.scanNumber();
      return;
    }
    this.invalidJson();
  }

  private scanObject(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.consume("}")) return;

    const keys = Object.create(null) as Record<string, true>;
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') this.invalidJson();
      const key = this.scanString();
      if (Object.hasOwn(keys, key)) {
        throw new SyntaxError("DUPLICATE_JSON_MEMBER");
      }
      Object.defineProperty(keys, key, {
        configurable: true,
        enumerable: true,
        value: true,
        writable: true,
      });

      this.skipWhitespace();
      if (!this.consume(":")) this.invalidJson();
      this.scanValue();
      this.skipWhitespace();
      if (this.consume("}")) return;
      if (!this.consume(",")) this.invalidJson();
    }
  }

  private scanArray(): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.consume("]")) return;

    while (true) {
      this.scanValue();
      this.skipWhitespace();
      if (this.consume("]")) return;
      if (!this.consume(",")) this.invalidJson();
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === '"') {
        let encoded = "";
        for (let index = start; index < this.index; index += 1) {
          encoded += this.source[index];
        }
        return JSON.parse(encoded) as string;
      }
      if (character === "\\") this.index += 1;
    }
    return this.invalidJson();
  }

  private scanLiteral(literal: "true" | "false" | "null"): void {
    for (let offset = 0; offset < literal.length; offset += 1) {
      if (this.source[this.index + offset] !== literal[offset]) {
        this.invalidJson();
      }
    }
    this.index += literal.length;
  }

  private scanNumber(): void {
    let index = this.index;
    if (this.source[index] === "-") index += 1;

    if (this.source[index] === "0") {
      index += 1;
    } else {
      const first = this.source[index];
      if (first === undefined || first < "1" || first > "9") {
        this.invalidJson();
      }
      index += 1;
      while (isDigit(this.source[index])) index += 1;
    }

    if (this.source[index] === ".") {
      index += 1;
      if (!isDigit(this.source[index])) this.invalidJson();
      while (isDigit(this.source[index])) index += 1;
    }

    if (this.source[index] === "e" || this.source[index] === "E") {
      index += 1;
      if (this.source[index] === "+" || this.source[index] === "-") {
        index += 1;
      }
      if (!isDigit(this.source[index])) this.invalidJson();
      while (isDigit(this.source[index])) index += 1;
    }
    this.index = index;
  }

  private skipWhitespace(): void {
    while (
      this.source[this.index] === " " ||
      this.source[this.index] === "\t" ||
      this.source[this.index] === "\n" ||
      this.source[this.index] === "\r"
    ) {
      this.index += 1;
    }
  }

  private consume(character: string): boolean {
    if (this.source[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private invalidJson(): never {
    throw new SyntaxError("INVALID_JSON");
  }
}

export function parseJsonWithUniqueKeys(source: string): unknown {
  new UniqueKeyScanner(source).scan();
  return JSON.parse(source) as unknown;
}
