// The site's numbers for an upload (deploy/preview-release/v1/site-inputs.mjs; release guide SB3): the owner's server
// file compared with the live settings version, and the new version's hosted inputs chosen from the two. Every number
// below is made up (a multiple of eleven), as in tests/support/hostedRegisterRows.ts; none is a real price or limit.
import { describe, expect, it } from 'vitest';

const site = await import('../../deploy/' + 'preview-release/v1/site-inputs.mjs');

type Plan = Record<string, unknown>;
const plan = (id: string, price: number, credit: number, patch: Plan = {}): Plan => ({
  plan_id: id, tier: id === 'FREE' ? 'free' : 'premium', net_prices: { USD: price, EUR: price, RON: price * 5 },
  monthly_credit_micros: credit, day_bp: id === 'FREE' ? null : 2200, week_bp: id === 'FREE' ? null : 5500, finish_bp: 10_000,
  finish_overflow_micros: 110_000, reserve_micros: 220_000, reserve_held: id === 'FREE' ? 'ON_TOP_OF_CREDIT' : 'INSIDE_LIMITS',
  fixed_gauges: id === 'FREE' ? { risk_tier: 'standard', composition_budget_tier: 'low', depth: 1 } : null, ...patch
});
const LIVE = Object.freeze({
  billing: 'on', perRunCeilingMicros: 3_300_000, dailyCeilingMicros: 11_000_000, askRoomReads: { limit: 66, windowMs: 66_000, capacity: 65_536 },
  billingPlans: {
    kind: 'BILLING_PLANS', credit_currency: 'USD', currency_by_country: { default: 'USD', countries: { RO: 'RON', DE: 'EUR' } }, minor_units_per_unit: 1_000_000,
    plans: [plan('FREE', 0, 440_000), plan('PLUS', 11_000_000, 7_700_000), plan('PRO', 33_000_000, 44_000_000), plan('MAX', 110_000_000, 330_000_000)]
  },
  abuseLimits: { kind: 'ABUSE_LIMITS', clarify_per_hour: 11, clarify_per_day: 22, flag_per_person_hour: 11, flag_per_debate_day: 22, flag_per_site_day: 99, cancel_links_per_day: 11, mail_domain_checks_per_minute: 110 }
});
/** A copy the test may change, as the owner's file. */
const copy = (): any => JSON.parse(JSON.stringify(LIVE));
/** The file with one plan patched. */
const withPlan = (id: string, patch: Plan): any => {
  const next = copy();
  next.billingPlans.plans = next.billingPlans.plans.map((entry: Plan) => (entry.plan_id === id ? { ...entry, ...patch } : entry));
  return next;
};
const lineOf = (report: { lines: string[] }, start: string) => report.lines.find(line => line.startsWith(start));
const refusal = (work: () => unknown) => { try { work(); } catch (error) { const { code, fields } = error as { code: string; fields?: string[] }; return { code, fields }; } return null; };
const amount = /\d{3,}/;

describe('site-inputs: comparing the owner\'s file with the live numbers', () => {
  it('says SAME for every input when the file holds the live numbers, whatever order its keys were typed in', () => {
    const typed = Object.fromEntries(Object.entries(copy()).reverse());
    const report = site.compareSiteInputs(LIVE, typed);
    expect(report.lines).toEqual(['SAME billing', 'SAME perRunCeilingMicros', 'SAME dailyCeilingMicros', 'SAME askRoomReads', 'SAME abuseLimits', 'SAME billingPlans']);
    expect(report).toMatchObject({ differing: [], limitPlans: [], billingDiffers: false });
  });

  it('names each input that differs and which way a number moved, and never prints an amount', () => {
    const file = copy();
    file.perRunCeilingMicros = 2_200_000;
    file.dailyCeilingMicros = 22_000_000;
    file.askRoomReads.limit = 77;
    file.abuseLimits.clarify_per_hour = 22;
    file.abuseLimits.flag_per_site_day = 88;
    const report = site.compareSiteInputs(LIVE, file);
    expect(report.lines).toEqual(['SAME billing', 'DIFFERENT perRunCeilingMicros: lower', 'DIFFERENT dailyCeilingMicros: higher',
      'DIFFERENT askRoomReads: limit higher', 'DIFFERENT abuseLimits: clarify_per_hour higher, flag_per_site_day lower', 'SAME billingPlans']);
    expect(report.differing).toEqual(['perRunCeilingMicros', 'dailyCeilingMicros', 'askRoomReads', 'abuseLimits']);
    for (const line of report.lines) expect(line).not.toMatch(amount);
  });

  it('a price change reaches purchases only: the plan is named in a prices line and needs no second naming', () => {
    const report = site.compareSiteInputs(LIVE, withPlan('PLUS', { net_prices: { USD: 22_000_000, EUR: 11_000_000, RON: 44_000_000 } }));
    expect(report.lines.at(-1)).toBe('DIFFERENT billingPlans PLUS prices: RON lower, USD higher [purchases and plan changes from the switch on; a subscriber\'s renewals keep their own price]');
    expect(report).toMatchObject({ differing: ['billingPlans'], limitPlans: [] });
  });

  it('a limit that only goes up gives the people on the plan more; one that goes down, or has no up or down, names the plan', () => {
    const more = site.compareSiteInputs(LIVE, withPlan('PRO', { monthly_credit_micros: 55_000_000 }));
    expect(lineOf(more, 'DIFFERENT billingPlans PRO limits')).toBe('DIFFERENT billingPlans PRO limits: month credit higher, day cap higher, week cap higher [the people already on this plan get more from the switch on; someone who changed plan this month, from their next month]');
    expect(more.limitPlans).toEqual([]);
    const less = site.compareSiteInputs(LIVE, withPlan('PRO', { monthly_credit_micros: 33_000_000 }));
    expect(lineOf(less, 'DIFFERENT billingPlans PRO limits')).toBe('DIFFERENT billingPlans PRO limits: month credit lower, day cap lower, week cap lower [the people already on this plan get less or something else, at the switch and counted over the month they are in]');
    expect(less.limitPlans).toEqual(['PRO']);
    for (const patch of [{ reserve_micros: 330_000 }, { reserve_held: 'ON_TOP_OF_CREDIT' }, { fixed_gauges: { risk_tier: 'high', composition_budget_tier: 'low', depth: 1 } },
      { finish_overflow_micros: undefined }, { finish_bp: 9900 }, { tier: 'free' }, { a_new_member: 11 }]) {
      expect(site.compareSiteInputs(LIVE, withPlan('PLUS', patch)).limitPlans, JSON.stringify(patch)).toEqual(['PLUS']);
    }
  });

  it('judges a day or week cap by what it comes to in money, not by its share alone', () => {
    // More credit with a smaller day share: the month goes up, the day's cap goes down (7.7 x 22% above 8.8 x 11%).
    const mixed = site.compareSiteInputs(LIVE, withPlan('PLUS', { monthly_credit_micros: 8_800_000, day_bp: 1100 }));
expect(lineOf(mixed, 'DIFFERENT billingPlans PLUS limits')).toContain('PLUS limits: month credit higher, day cap lower, week cap higher [the people already on this plan get less or something else');
    expect(mixed.limitPlans).toEqual(['PLUS']);
    // A share that differs while its cap comes out the same still shows, and still names the plan.
    const tiny = (bp: number) => withPlan('PLUS', { monthly_credit_micros: 11, day_bp: bp });
    const rounded = site.compareSiteInputs(tiny(2200), tiny(2300));
    expect(lineOf(rounded, 'DIFFERENT billingPlans PLUS limits')).toContain('PLUS limits: day share changed');
    expect(rounded.limitPlans).toEqual(['PLUS']);
  });

  it('several plans and the countries\' currencies each get their own line', () => {
    const file = withPlan('PLUS', { net_prices: { USD: 22_000_000, EUR: 22_000_000, RON: 110_000_000 }, monthly_credit_micros: 6_600_000 });
    file.billingPlans.plans[3] = { ...file.billingPlans.plans[3]!, week_bp: 6600 };
    file.billingPlans.currency_by_country.countries = { RO: 'RON' } as never;
    const report = site.compareSiteInputs(LIVE, file);
    expect(report.lines.slice(5).map((line: string) => line.replace(/ \[.*$/, ''))).toEqual([
      'DIFFERENT billingPlans PLUS prices: EUR higher, RON higher, USD higher',
      'DIFFERENT billingPlans PLUS limits: month credit lower, day cap lower, week cap lower',
      'DIFFERENT billingPlans MAX limits: week cap higher',
      // Plus is the measure the pricing page shows every plan against: a smaller Plus makes the others look larger.
      'DIFFERENT billingPlans FREE size shown on the pricing page (times the Plus credit): higher',
      'DIFFERENT billingPlans PRO size shown on the pricing page (times the Plus credit): higher',
      'DIFFERENT billingPlans MAX size shown on the pricing page (times the Plus credit): higher',
      'DIFFERENT billingPlans currency_by_country'
    ]);
    expect(report.limitPlans).toEqual(['PLUS']);
    for (const line of report.lines) expect(line).not.toMatch(amount);
  });

  it('one reserve serves every paid plan\'s closing: when the smallest paid reserve moves, every paid plan is named', () => {
    // Plus's reserve goes up while the others stay: the smallest is unchanged, so only Plus's own people are reached.
    expect(site.compareSiteInputs(LIVE, withPlan('PLUS', { reserve_micros: 330_000 })).limitPlans).toEqual(['PLUS']);
    // Pro's reserve goes down: it is now the smallest, and Plus's and Max's closings are admitted against it too.
    const lower = site.compareSiteInputs(LIVE, withPlan('PRO', { reserve_micros: 110_000 }));
    expect(lower.limitPlans).toEqual(['PLUS', 'PRO', 'MAX']);
    expect(lower.lines).toContain('DIFFERENT billingPlans paid plans\' closing reserve (the smallest of them): lower [every paid plan\'s closings]');
    expect(refusal(() => site.composeSiteInputs(LIVE, withPlan('PRO', { reserve_micros: 110_000 }), { change: 'billingPlans', limits: 'PRO' }))).toEqual({ code: 'SITE_LIMITS_NOT_NAMED', fields: ['PLUS', 'MAX'] });
    // Free's reserve is its own.
    expect(site.compareSiteInputs(LIVE, withPlan('FREE', { reserve_micros: 110_000 })).limitPlans).toEqual(['FREE']);
  });

  it('raising the Plus credit alone changes what the pricing page shows for the other plans, and names no plan', () => {
    const report = site.compareSiteInputs(LIVE, withPlan('PLUS', { monthly_credit_micros: 8_800_000 }));
    expect(report.lines.slice(5)).toEqual([
      'DIFFERENT billingPlans PLUS limits: month credit higher, day cap higher, week cap higher [the people already on this plan get more from the switch on; someone who changed plan this month, from their next month]',
      'DIFFERENT billingPlans PRO size shown on the pricing page (times the Plus credit): lower',
      'DIFFERENT billingPlans MAX size shown on the pricing page (times the Plus credit): lower'
    ]);
    expect(report.limitPlans).toEqual([]);
  });

  it('notes a plan whose credit is no longer above the plan before it', () => {
    const report = site.compareSiteInputs(LIVE, withPlan('PLUS', { monthly_credit_micros: 44_000_000 }));
    expect(report.lines).toContain('NOTE billingPlans PRO: its month credit is no longer above PLUS\'s');
  });

  it('prints a member\'s name only when it is a plain name: a key typed as a number never reaches the lines', () => {
    const file = copy();
    file.abuseLimits['5500000'] = 11;
    file.askRoomReads['window\u001b[2J'] = 11;
    file.billingPlans.plans[1].net_prices['7700000'] = 11;
    const report = site.compareSiteInputs(LIVE, file);
    expect(report.lines).toContain('DIFFERENT abuseLimits: another member changed');
    expect(report.lines).toContain('DIFFERENT askRoomReads: another member changed');
    expect(lineOf(report, 'DIFFERENT billingPlans PLUS prices')).toContain('PLUS prices: another member changed [');
    for (const line of report.lines) { expect(line).not.toMatch(amount); expect(line).not.toMatch(/[\u0000-\u001f]/); }
  });

  it('refuses a side that is not the six hosted inputs, and a file that lists other plans', () => {
    const { abuseLimits: _dropped, ...five } = copy();
    expect(refusal(() => site.compareSiteInputs(LIVE, five))).toEqual({ code: 'SITE_INPUTS_REFUSED', fields: ['--site'] });
    expect(refusal(() => site.compareSiteInputs({ ...copy(), extra: 1 }, LIVE))).toEqual({ code: 'SITE_INPUTS_REFUSED', fields: ['--from'] });
    for (const bad of [null, [], 'text', { ...copy(), billing: 'yes' }, { ...copy(), billingPlans: { plans: 'four' } }, { ...copy(), billingPlans: { plans: [{ plan_id: 'PLUS' }, { plan_id: 'PLUS' }] } },
      { ...copy(), askRoomReads: 66 }]) expect(refusal(() => site.compareSiteInputs(LIVE, bad)), JSON.stringify(bad)).toEqual({ code: 'SITE_INPUTS_REFUSED', fields: ['--site'] });
    const fewer = copy(); fewer.billingPlans.plans.pop();
    expect(refusal(() => site.compareSiteInputs(LIVE, fewer))).toMatchObject({ code: 'SITE_PLAN_LIST_DIFFERS' });
    const reordered = copy(); reordered.billingPlans.plans.reverse();
    expect(refusal(() => site.compareSiteInputs(LIVE, reordered))).toMatchObject({ code: 'SITE_PLAN_LIST_DIFFERS' });
  });
});

describe('site-inputs: the new version\'s numbers', () => {
  it('nothing named and nothing different: the live numbers, and no row to change', () => {
    const composed = site.composeSiteInputs(LIVE, copy());
    expect(composed.hostedBilling).toEqual(LIVE);
    expect(composed).toMatchObject({ change: [], limits: [] });
    expect(composed.lines).toEqual(site.compareSiteInputs(LIVE, copy()).lines);
  });

  it('takes exactly the named inputs from the file and every other one from the live version', () => {
    const file = withPlan('PLUS', { net_prices: { USD: 22_000_000, EUR: 22_000_000, RON: 110_000_000 } });
    file.dailyCeilingMicros = 22_000_000;
    const composed = site.composeSiteInputs(LIVE, file, { change: 'billingPlans dailyCeilingMicros' });
    expect(composed.hostedBilling).toEqual({ ...LIVE, dailyCeilingMicros: 22_000_000, billingPlans: file.billingPlans });
    expect(Object.keys(composed.hostedBilling)).toEqual(['billing', 'perRunCeilingMicros', 'dailyCeilingMicros', 'askRoomReads', 'billingPlans', 'abuseLimits']);
    expect(composed).toMatchObject({ change: ['billingPlans', 'dailyCeilingMicros'], limits: [] });
    const reads = copy(); reads.askRoomReads.capacity = 131_072; reads.abuseLimits.cancel_links_per_day = 22; reads.perRunCeilingMicros = 2_200_000;
    const three = site.composeSiteInputs(LIVE, reads, { change: 'perRunCeilingMicros askRoomReads abuseLimits' });
    expect(three.change).toEqual(['abuseLimits', 'askRoomReads', 'perRunCeilingMicros']);
    expect(three.hostedBilling).toEqual({ ...LIVE, perRunCeilingMicros: 2_200_000, askRoomReads: reads.askRoomReads, abuseLimits: reads.abuseLimits });
  });

  it('a number that differs is never published, or left out, without being named', () => {
    const file = copy(); file.perRunCeilingMicros = 2_200_000; file.abuseLimits.clarify_per_day = 33;
    expect(refusal(() => site.composeSiteInputs(LIVE, file))).toEqual({ code: 'SITE_CHANGE_NOT_NAMED', fields: ['perRunCeilingMicros', 'abuseLimits'] });
    expect(refusal(() => site.composeSiteInputs(LIVE, file, { change: 'abuseLimits' }))).toEqual({ code: 'SITE_CHANGE_NOT_NAMED', fields: ['perRunCeilingMicros'] });
    expect(refusal(() => site.composeSiteInputs(LIVE, file, { change: 'abuseLimits perRunCeilingMicros billingPlans' }))).toEqual({ code: 'SITE_CHANGE_NAMED_BUT_SAME', fields: ['billingPlans'] });
    expect(refusal(() => site.composeSiteInputs(LIVE, copy(), { change: 'askRoomReads' }))).toEqual({ code: 'SITE_CHANGE_NAMED_BUT_SAME', fields: ['askRoomReads'] });
  });

  it('a plan whose people get less is named a second time, and only such a plan', () => {
    const file = withPlan('PLUS', { monthly_credit_micros: 6_600_000 });
    file.billingPlans.plans[2] = { ...file.billingPlans.plans[2]!, monthly_credit_micros: 55_000_000 };
    expect(refusal(() => site.composeSiteInputs(LIVE, file, { change: 'billingPlans' }))).toEqual({ code: 'SITE_LIMITS_NOT_NAMED', fields: ['PLUS'] });
    expect(refusal(() => site.composeSiteInputs(LIVE, file, { change: 'billingPlans', limits: 'PLUS PRO' }))).toEqual({ code: 'SITE_LIMITS_NAMED_BUT_SAME', fields: ['PRO'] });
    const composed = site.composeSiteInputs(LIVE, file, { change: 'billingPlans', limits: 'PLUS' });
    expect(composed).toMatchObject({ change: ['billingPlans'], limits: ['PLUS'] });
    expect(composed.hostedBilling.billingPlans).toEqual(file.billingPlans);
    // Naming the plan does not stand in for naming the input.
    expect(refusal(() => site.composeSiteInputs(LIVE, file, { limits: 'PLUS' }))).toEqual({ code: 'SITE_CHANGE_NOT_NAMED', fields: ['billingPlans'] });
    // Prices alone need no second naming, and refuse one.
    const priced = withPlan('MAX', { net_prices: { USD: 121_000_000, EUR: 121_000_000, RON: 605_000_000 } });
    expect(site.composeSiteInputs(LIVE, priced, { change: 'billingPlans' }).limits).toEqual([]);
    expect(refusal(() => site.composeSiteInputs(LIVE, priced, { change: 'billingPlans', limits: 'MAX' }))).toEqual({ code: 'SITE_LIMITS_NAMED_BUT_SAME', fields: ['MAX'] });
  });

  it('notes a plan whose smallest window newly falls below the per-debate ceiling, in the mix that will be published', () => {
    const raised = copy(); raised.perRunCeilingMicros = 5_500_000;
    const note = (id: string) => `NOTE ${id}: its smallest window is now below the per-debate ceiling [one debate may use more than a day of it]`;
    // Free (0.44 a month) and Plus (1.694 a day) were below the live ceiling already: nothing new to say about them.
    expect(site.composeSiteInputs(LIVE, raised, { change: 'perRunCeilingMicros' }).lines.filter((line: string) => line.startsWith('NOTE '))).toEqual([]);
    // A smaller Pro credit brings Pro's day cap (44 x 22% = 9.68, then 11 x 22% = 2.42) below the ceiling of 3.3.
    const smaller = withPlan('PRO', { monthly_credit_micros: 11_000_000 });
    expect(site.composeSiteInputs(LIVE, smaller, { change: 'billingPlans', limits: 'PRO' }).lines.at(-1)).toBe(note('PRO'));
  });

  it('never changes the billing switch', () => {
    expect(refusal(() => site.composeSiteInputs({ ...copy(), billing: 'off' }, LIVE))).toMatchObject({ code: 'SITE_BILLING_SWITCH_DIFFERS' });
    expect(site.composeSiteInputs({ ...copy(), billing: 'off' }, { ...copy(), billing: 'off' }).hostedBilling.billing).toBe('off');
  });

  it.each([
    ['an unknown input', { change: 'billing' }, '--change'], ['an input named twice', { change: 'abuseLimits abuseLimits' }, '--change'],
    ['two spaces', { change: 'abuseLimits  askRoomReads' }, '--change'], ['a comma', { change: 'abuseLimits,askRoomReads' }, '--change'], ['an empty list', { change: '' }, '--change'],
    ['an unknown plan', { limits: 'GOLD' }, '--limits'], ['a plan named twice', { limits: 'PLUS PLUS' }, '--limits'], ['a plan in lower case', { limits: 'plus' }, '--limits']
  ])('refuses %s', (_name, lists, flag) => {
    expect(refusal(() => site.composeSiteInputs(LIVE, copy(), lists))).toEqual({ code: 'ARGUMENTS_REFUSED', fields: [flag] });
  });
});
