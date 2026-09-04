const JSON_NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;

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
      (character !== undefined && /\d/u.test(character))
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

    const keys = new Set<string>();
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') this.invalidJson();
      const key = this.scanString();
      if (keys.has(key)) throw new SyntaxError("DUPLICATE_JSON_MEMBER");
      keys.add(key);

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
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (character === "\\") this.index += 1;
    }
    return this.invalidJson();
  }

  private scanLiteral(literal: "true" | "false" | "null"): void {
    if (!this.source.startsWith(literal, this.index)) this.invalidJson();
    this.index += literal.length;
  }

  private scanNumber(): void {
    JSON_NUMBER.lastIndex = this.index;
    const match = JSON_NUMBER.exec(this.source);
    if (match === null) this.invalidJson();
    this.index = JSON_NUMBER.lastIndex;
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
