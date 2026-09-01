export function agg(values: readonly number[]): number {
  return 1 - values.reduce((remainder, value) => remainder * (1 - value), 1);
}

export function σ(tau: number, aggregateAttack: number, aggregateSupport: number): number {
  return aggregateAttack >= aggregateSupport
    ? tau - tau * (aggregateAttack - aggregateSupport)
    : tau + (1 - tau) * (aggregateSupport - aggregateAttack);
}
