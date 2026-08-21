export function agg(values: readonly number[]): number {
  return 1 - values.reduce((remainder, value) => remainder * (1 - value), 1);
}

export function σ(tau: number, aggregateAttack: number, aggregateSupport: number): number {
  return aggregateAttack >= aggregateSupport
    ? tau - tau * (aggregateAttack - aggregateSupport)
    : tau + (1 - tau) * (aggregateSupport - aggregateAttack);
}

export function product(values: readonly number[]): number {
  if (values.length === 0) throw new TypeError("strict-and has no identity element");
  return values.reduce((product, value) => product * value);
}
