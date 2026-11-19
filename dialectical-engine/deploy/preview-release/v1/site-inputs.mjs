// The site's numbers for one upload: the server's own file compared with the live settings version, and the new
// version's hosted inputs chosen from the two (release guide SB3; release-artifacts.mjs `site-inputs`).
//
// Plain words: the owner keeps the site's numbers (plan prices and limits, the two ceilings, the room-read budget, the
// abuse limits) in one root-only file on the server. An upload publishes a new settings version, and its numbers are
// the live version's unless the owner names an input to take from the file. Nothing is taken from the file by
// accident, and nothing in the file is ignored without a word: the inputs the owner names must be exactly the inputs
// that differ. Example: the file has a new price for one plan and the owner names `billingPlans`: the new version gets
// the file's plans and the live version's everything else. The same file with nothing named refuses.
//
// A second list is for the people who already have a plan. A plan's prices reach only what is bought or changed from
// then on (a subscriber's renewals charge the price recorded for that subscriber). A plan's limits reach the people
// already on it: each person's month keeps the numbers it started with, so a lower limit reaches them when their own
// next month starts, and the Terms ask that they are told first; a higher limit reaches them at the switch and is not
// taken back before their next month by a later upload or by a switch back to the release before, so a wrong one
// stays that long. What changes with no up or down (the reserve, Free's fixed gauges, a member this file does not
// read) is said to reach them at the switch. In every case the plan must be named a second time, on its own.
//
// Nothing here prints or returns an amount except `composeSiteInputs`'s `hostedBilling`, which the caller writes to a
// file. Every line says only which input, plan and member differs, and whether a number went up or down.

/** The inputs an upload may take from the file. `billing` (on or off) is never one of them. */
export const SITE_INPUT_NAMES = Object.freeze(['perRunCeilingMicros', 'dailyCeilingMicros', 'askRoomReads', 'billingPlans', 'abuseLimits']);
const HOSTED_KEYS = Object.freeze(['billing', ...SITE_INPUT_NAMES]);
/** The plan every other plan's size is shown against, and the one plan that is not paid (packages/billing-core/src/windows.ts allowanceVsPlus; packages/register/src/billing-plans.ts closingReservesOf). */
const PLUS = 'PLUS', FREE = 'FREE';
/** The plan members the lines below account for one by one; any other member that differs is reported as "other members". */
const PLAN_MEMBERS_READ = Object.freeze(['plan_id', 'net_prices', 'monthly_credit_micros', 'day_bp', 'week_bp', 'finish_bp', 'finish_overflow_micros',
  'reserve_micros', 'reserve_held', 'fixed_gauges']);
/**
 * When a changed limit reaches the people already on the plan (packages/billing-core/src/plans-in-force.ts), said on a
 * `limits` line for each kind of change the line names: a figure that went `lower`, one that went `higher`, and what
 * `changed` with no up or down.
 */
const REACH = Object.freeze({
  lower: 'a lower limit from each person\'s own next month',
  higher: 'a higher limit at the switch, not taken back before their next month',
  changed: 'what changed with no up or down at the switch'
});
/** The words after the plan's figures: one part per kind of change among `limits`, in the order lower, higher, changed. */
function reachOf(limits) {
  const kinds = Object.keys(REACH).filter(kind => limits.some(part => part.endsWith(` ${kind}`)));
  return `the people already on this plan: ${kinds.map(kind => REACH[kind]).join('; ')}`;
}
/** The register's own denominator for `day_bp` and `week_bp` (packages/register/src/billing-plans.ts planCapMicros). */
const BASIS_POINTS = 10_000n;

export class SiteInputsRefusal extends Error {
  constructor(code, fields) { super(code); this.code = code; if (fields) this.fields = fields; }
}
const refuse = (code, fields) => { throw new SiteInputsRefusal(code, fields); };

const plain = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
/** One spelling per value, whatever order its keys were typed in. */
const canonical = value => JSON.stringify(value, (_key, item) => (plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item));
const same = (a, b) => canonical(a) === canonical(b);
const whole = value => Number.isSafeInteger(value) && value >= 0;
/** `higher` or `lower` for two whole numbers, `changed` for anything else that differs, null when nothing differs. */
function moved(before, after) {
  if (same(before, after)) return null;
  if (!whole(before) || !whole(after)) return 'changed';
  return after > before ? 'higher' : 'lower';
}
/**
 * A day or week cap, before and after. No cap at all is the most a person can have: a cap that appears where the plan
 * had none is `lower`, and one that goes away is `higher`.
 */
function capMoved(before, after) {
  if (before === null && whole(after)) return 'lower';
  if (whole(before) && after === null) return 'higher';
  return moved(before, after);
}
/** A member's name as the file spells it, when it is a plain name; a key that could carry a number or a control character is never printed. */
const nameOf = key => (/^[A-Za-z_]{1,64}$/.test(key) ? key : 'another member');
/** Each member of two flat objects that differs, as `<member> higher|lower|changed`, in name order. */
function membersMoved(before, after) {
  if (!plain(before) || !plain(after)) return same(before, after) ? [] : ['changed'];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .map(key => [key, moved(before[key], after[key])]).filter(([, how]) => how !== null).map(([key, how]) => `${nameOf(key)} ${how}`);
}

/** The shape the comparison needs, nothing more: the reviewed checks stay the native operator's and the kit's. */
function assertShape(value, flag) {
  const plans = plain(value) ? value.billingPlans : null;
  const ids = plain(plans) && Array.isArray(plans.plans) ? plans.plans.map(plan => (plain(plan) ? plan.plan_id : null)) : null;
  if (!plain(value) || Object.keys(value).sort().join(',') !== [...HOSTED_KEYS].sort().join(',') || !['on', 'off'].includes(value.billing)
    || !plain(value.askRoomReads) || !plain(value.abuseLimits) || ids === null || ids.length < 1 || ids.length > 16
    || ids.some(id => typeof id !== 'string' || !/^[A-Z]{1,16}$/.test(id)) || new Set(ids).size !== ids.length) refuse('SITE_INPUTS_REFUSED', [flag]);
}

/** A day or week cap in micro-units, as the register computes it; null when the plan has none; undefined when unreadable. */
function capOf(plan, member) {
  if (plan[member] === null) return null;
  if (!whole(plan.monthly_credit_micros) || !whole(plan[member])) return undefined;
  return Number((BigInt(plan.monthly_credit_micros) * BigInt(plan[member])) / BASIS_POINTS);
}

/** The reserve every paid plan's closing is admitted against: the smallest among the paid plans; undefined when unreadable. */
function paidReserveOf(plans) {
  const reserves = plans.filter(plan => plan.plan_id !== FREE).map(plan => plan.reserve_micros);
  return reserves.length > 0 && reserves.every(whole) ? Math.min(...reserves) : undefined;
}
/** A plan's size as the pricing page shows it, in hundredths of the Plus credit; undefined when unreadable. */
function shownSizeOf(plans, plan) {
  const plus = plans.find(entry => entry.plan_id === PLUS)?.monthly_credit_micros;
  if (!whole(plus) || plus < 1 || !whole(plan.monthly_credit_micros)) return undefined;
  return Number((BigInt(plan.monthly_credit_micros) * 100n) / BigInt(plus));
}

/**
 * One plan, before and after. `prices`: its net prices that differ. `limits`: what a person on the plan may use, each
 * figure that differs, with the way it moved; the reserve, where it is held, Free's fixed gauges and a member this file
 * does not read have no up or down here and are said to have changed.
 */
function planMoved(before, after) {
  const prices = membersMoved(before.net_prices, after.net_prices);
  const figures = [
    ['month credit', moved(before.monthly_credit_micros, after.monthly_credit_micros)],
    ['day cap', capMoved(capOf(before, 'day_bp'), capOf(after, 'day_bp'))],
    ['week cap', capMoved(capOf(before, 'week_bp'), capOf(after, 'week_bp'))],
    ['finish share', moved(before.finish_bp, after.finish_bp)],
    ['finish overflow', moved(before.finish_overflow_micros, after.finish_overflow_micros)]
  ].filter(([, how]) => how !== null);
  const limits = figures.map(([name, how]) => `${name} ${how}`);
  const named = new Set(figures.map(([name]) => name));
  // A share that differs while its cap comes out the same (rounding) is still a changed row: say so.
  if (!named.has('day cap') && !same(before.day_bp, after.day_bp)) limits.push('day share changed');
  if (!named.has('week cap') && !same(before.week_bp, after.week_bp)) limits.push('week share changed');
  if (!same([before.reserve_micros, before.reserve_held], [after.reserve_micros, after.reserve_held])) limits.push('closing reserve changed');
  if (!same(before.fixed_gauges, after.fixed_gauges)) limits.push('fixed gauges changed');
  const rest = plan => Object.fromEntries(Object.entries(plan).filter(([key]) => !PLAN_MEMBERS_READ.includes(key)));
  if (!same(rest(before), rest(after))) limits.push('other members changed');
  return { prices, limits };
}

/**
 * The live version's hosted inputs (`active`) against the server file's (`site`), input by input. Returns the lines
 * for the owner (no amount in any of them), the inputs that differ, and the plans whose limits change, up or down, for
 * the people already on them. Refuses `SITE_INPUTS_REFUSED` when either side is not the hosted inputs' shape, and
 * `SITE_PLAN_LIST_DIFFERS` when the two do not list the same plans in the same order.
 */
export function compareSiteInputs(active, site) {
  assertShape(active, '--from');
  assertShape(site, '--site');
  const lines = [], differing = [], limitPlans = [];
  const billingDiffers = active.billing !== site.billing;
  lines.push(`${billingDiffers ? 'DIFFERENT' : 'SAME'} billing`);
  for (const name of ['perRunCeilingMicros', 'dailyCeilingMicros']) {
    const how = moved(active[name], site[name]);
    if (how !== null) differing.push(name);
    lines.push(how === null ? `SAME ${name}` : `DIFFERENT ${name}: ${how}`);
  }
  for (const name of ['askRoomReads', 'abuseLimits']) {
    const parts = membersMoved(active[name], site[name]);
    if (parts.length > 0) differing.push(name);
    lines.push(parts.length === 0 ? `SAME ${name}` : `DIFFERENT ${name}: ${parts.join(', ')}`);
  }
  const before = active.billingPlans, after = site.billingPlans;
  if (!same(before.plans.map(plan => plan.plan_id), after.plans.map(plan => plan.plan_id))) refuse('SITE_PLAN_LIST_DIFFERS');
  if (same(before, after)) lines.push('SAME billingPlans');
  else {
    differing.push('billingPlans');
    const planLines = [];
    for (const [index, plan] of before.plans.entries()) {
      const id = plan.plan_id, { prices, limits } = planMoved(plan, after.plans[index]);
      if (prices.length > 0) planLines.push(`DIFFERENT billingPlans ${id} prices: ${prices.join(', ')} [purchases and plan changes from the switch on; a subscriber's renewals keep their own price]`);
      if (limits.length > 0) {
        planLines.push(`DIFFERENT billingPlans ${id} limits: ${limits.join(', ')} [${reachOf(limits)}]`);
        limitPlans.push(id);
      }
    }
    // One reserve pays every paid plan's closing, read from the version in force: when the smallest one moves, each
    // paid plan's people are reached at the switch.
    const reserve = moved(paidReserveOf(before.plans), paidReserveOf(after.plans));
    if (reserve !== null) {
      planLines.push(`DIFFERENT billingPlans paid plans' closing reserve (the smallest of them): ${reserve} [every paid plan's closings, at the switch]`);
      for (const plan of before.plans) if (plan.plan_id !== FREE && !limitPlans.includes(plan.plan_id)) limitPlans.push(plan.plan_id);
    }
    // What the pricing page says about a plan can move while the plan's own limits stay (Plus's credit is the measure).
    for (const [index, plan] of before.plans.entries()) {
      const shown = moved(shownSizeOf(before.plans, plan), shownSizeOf(after.plans, after.plans[index]));
      if (shown !== null) planLines.push(`DIFFERENT billingPlans ${plan.plan_id} size shown on the pricing page (times the Plus credit): ${shown}`);
    }
    // A plan with no more credit than the one before it: an upgrade would add nothing.
    for (const [index, plan] of after.plans.entries()) {
      const below = after.plans[index - 1];
      if (below && whole(plan.monthly_credit_micros) && whole(below.monthly_credit_micros) && plan.monthly_credit_micros <= below.monthly_credit_micros
        && before.plans[index].monthly_credit_micros > before.plans[index - 1].monthly_credit_micros) planLines.push(`NOTE billingPlans ${plan.plan_id}: its month credit is no longer above ${below.plan_id}'s`);
    }
    if (!same(before.currency_by_country, after.currency_by_country)) planLines.push('DIFFERENT billingPlans currency_by_country [purchases from the switch on]');
    const rest = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'plans' && key !== 'currency_by_country'));
    if (!same(rest(before), rest(after)) || planLines.length === 0) planLines.push('DIFFERENT billingPlans other members');
    lines.push(...planLines);
  }
  const inPlanOrder = before.plans.map(plan => plan.plan_id).filter(id => limitPlans.includes(id));
  return Object.freeze({ lines: Object.freeze(lines), differing: Object.freeze(differing), limitPlans: Object.freeze(inPlanOrder), billingDiffers });
}

/** A list the owner typed, as words separated by spaces: each one known, none twice. `undefined` (not given) is the empty list. */
function namesOf(text, allowed, flag) {
  if (text === undefined) return [];
  const names = typeof text === 'string' ? text.split(' ') : [];
  if (names.length < 1 || names.some(name => !allowed.includes(name)) || new Set(names).size !== names.length) refuse('ARGUMENTS_REFUSED', [flag]);
  return names;
}
const missingFrom = (list, other) => list.filter(item => !other.includes(item));

/**
 * The new version's hosted inputs: the live version's, with exactly the inputs the owner named (`change`) taken from
 * the file. Refuses, naming the inputs or plans, unless:
 *  - `billing` is the same on both sides (`SITE_BILLING_SWITCH_DIFFERS`: the switch is never changed here);
 *  - every input that differs is named (`SITE_CHANGE_NOT_NAMED`) and every named input differs (`SITE_CHANGE_NAMED_BUT_SAME`);
 *  - every plan whose limits change, up or down, is named in `limits` (`SITE_LIMITS_NOT_NAMED`), and no other plan is
 *    (`SITE_LIMITS_NAMED_BUT_SAME`).
 * A `NOTE` line is added for each plan whose smallest window (its day cap, or Free's month) newly falls below the
 * per-debate ceiling: one debate may then use more than that window.
 */
export function composeSiteInputs(active, site, { change, limits } = {}) {
  const report = compareSiteInputs(active, site);
  const named = namesOf(change, SITE_INPUT_NAMES, '--change');
  const plans = namesOf(limits, active.billingPlans.plans.map(plan => plan.plan_id), '--limits');
  if (report.billingDiffers) refuse('SITE_BILLING_SWITCH_DIFFERS');
  const unnamed = missingFrom(report.differing, named), unchanged = missingFrom(named, report.differing);
  if (unnamed.length > 0) refuse('SITE_CHANGE_NOT_NAMED', unnamed);
  if (unchanged.length > 0) refuse('SITE_CHANGE_NAMED_BUT_SAME', unchanged);
  const quiet = missingFrom(report.limitPlans, plans), loud = missingFrom(plans, report.limitPlans);
  if (quiet.length > 0) refuse('SITE_LIMITS_NOT_NAMED', quiet);
  if (loud.length > 0) refuse('SITE_LIMITS_NAMED_BUT_SAME', loud);
  const hostedBilling = Object.fromEntries(HOSTED_KEYS.map(key => [key, named.includes(key) ? site[key] : active[key]]));
  const smallWindow = (hosted, plan) => { const window = capOf(plan, 'day_bp') ?? plan.monthly_credit_micros; return whole(window) && window < hosted.perRunCeilingMicros; };
  const notes = hostedBilling.billingPlans.plans.filter((plan, index) => smallWindow(hostedBilling, plan) && !smallWindow(active, active.billingPlans.plans[index]))
    .map(plan => `NOTE ${plan.plan_id}: its smallest window is now below the per-debate ceiling [one debate may use more than a day of it]`);
  const sorted = list => [...list].sort();
  return Object.freeze({ ...report, lines: Object.freeze([...report.lines, ...notes]), change: Object.freeze(sorted(named)), limits: Object.freeze(sorted(plans)), hostedBilling });
}
