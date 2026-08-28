export interface ReferenceQueue<T> {
  readonly capacity: number;
  readonly size: number;
  offer(value: T): boolean;
  drain(): readonly T[];
}

/** A bounded in-memory ring that stores the exact references it receives. */
export class BoundedReferenceQueue<T> implements ReferenceQueue<T> {
  readonly #items: Array<T | undefined>;
  #head = 0;
  #tail = 0;
  #size = 0;

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("CAPTURE_QUEUE_CAPACITY_INVALID");
    }
    this.#items = Array.from({ length: capacity });
  }

  get size(): number {
    return this.#size;
  }

  offer(value: T): boolean {
    if (this.#size === this.capacity) {
      return false;
    }
    this.#items[this.#tail] = value;
    this.#tail = (this.#tail + 1) % this.capacity;
    this.#size += 1;
    return true;
  }

  drain(): readonly T[] {
    const values: T[] = [];
    while (this.#size > 0) {
      const value = this.#items[this.#head];
      this.#items[this.#head] = undefined;
      this.#head = (this.#head + 1) % this.capacity;
      this.#size -= 1;
      if (value !== undefined) {
        values.push(value);
      }
    }
    return values;
  }
}

