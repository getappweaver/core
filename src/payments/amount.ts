const MILLISATOSHIS_PER_SATOSHI = 1000n;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_PATTERN = /^\d+$/;

export type MonetaryAmountInput = string | bigint;

export class MonetaryAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function parseAmountValue(value: unknown, unit: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new MonetaryAmountError(`${unit} amount cannot be negative.`);
    }

    return value;
  }

  if (typeof value !== 'string') {
    throw new MonetaryAmountError(
      `${unit} amount must be a decimal string or bigint.`,
    );
  }

  const normalized = value.trim();

  if (!INTEGER_PATTERN.test(normalized)) {
    throw new MonetaryAmountError(
      `${unit} amount must be a non-negative integer.`,
    );
  }

  return BigInt(normalized);
}

export class Satoshi {
  readonly #value: bigint;

  private constructor(value: bigint) {
    this.#value = value;
    Object.freeze(this);
  }

  static parse(value: MonetaryAmountInput): Satoshi;
  static parse(value: unknown): Satoshi {
    return new Satoshi(parseAmountValue(value, 'Satoshi'));
  }

  isZero(): boolean {
    return this.#value === 0n;
  }

  equals(other: Satoshi): boolean {
    return this.#value === other.#value;
  }

  compare(other: Satoshi): -1 | 0 | 1 {
    return this.#value < other.#value ? -1 : this.#value > other.#value ? 1 : 0;
  }

  add(other: Satoshi): Satoshi {
    return new Satoshi(this.#value + other.#value);
  }

  subtract(other: Satoshi): Satoshi {
    if (other.#value > this.#value) {
      throw new MonetaryAmountError('Satoshi subtraction cannot be negative.');
    }

    return new Satoshi(this.#value - other.#value);
  }

  toMillisatoshi(): Millisatoshi {
    return Millisatoshi.parse(this.#value * MILLISATOSHIS_PER_SATOSHI);
  }

  toString(): string {
    return this.#value.toString();
  }

  toJSON(): string {
    return this.toString();
  }

  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'string') {
      return this.toString();
    }

    throw new MonetaryAmountError(
      'Satoshi values cannot be coerced to JavaScript numbers.',
    );
  }
}

export class Millisatoshi {
  readonly #value: bigint;

  private constructor(value: bigint) {
    this.#value = value;
    Object.freeze(this);
  }

  static parse(value: MonetaryAmountInput): Millisatoshi;
  static parse(value: unknown): Millisatoshi {
    return new Millisatoshi(parseAmountValue(value, 'Millisatoshi'));
  }

  isZero(): boolean {
    return this.#value === 0n;
  }

  equals(other: Millisatoshi): boolean {
    return this.#value === other.#value;
  }

  compare(other: Millisatoshi): -1 | 0 | 1 {
    return this.#value < other.#value ? -1 : this.#value > other.#value ? 1 : 0;
  }

  add(other: Millisatoshi): Millisatoshi {
    return new Millisatoshi(this.#value + other.#value);
  }

  subtract(other: Millisatoshi): Millisatoshi {
    if (other.#value > this.#value) {
      throw new MonetaryAmountError(
        'Millisatoshi subtraction cannot be negative.',
      );
    }

    return new Millisatoshi(this.#value - other.#value);
  }

  toSatoshiExact(): Satoshi {
    if (this.#value % MILLISATOSHIS_PER_SATOSHI !== 0n) {
      throw new MonetaryAmountError(
        'Millisatoshi amount is not an exact whole-satoshi value.',
      );
    }

    return Satoshi.parse(this.#value / MILLISATOSHIS_PER_SATOSHI);
  }

  toSatoshiFloor(): Satoshi {
    return Satoshi.parse(this.#value / MILLISATOSHIS_PER_SATOSHI);
  }

  /** Convert only at a protocol boundary whose JSON schema requires a number. */
  toNwcWireNumber(): number {
    if (this.#value > MAX_SAFE_INTEGER_BIGINT) {
      throw new MonetaryAmountError(
        'Millisatoshi amount exceeds the NWC JSON safe-integer range.',
      );
    }

    return Number(this.#value);
  }

  toString(): string {
    return this.#value.toString();
  }

  toJSON(): string {
    return this.toString();
  }

  [Symbol.toPrimitive](hint: string): string {
    if (hint === 'string') {
      return this.toString();
    }

    throw new MonetaryAmountError(
      'Millisatoshi values cannot be coerced to JavaScript numbers.',
    );
  }
}
