// Company-configured income tax and per-employee deduction items.
//
// No statutory rates are built in: tax law differs by country and changes every year, so each company enters
// the slabs it withholds under. Without slabs, payroll keeps using each employee's flat `taxPercent`.

const round2 = (n) => Math.round(n * 100) / 100;

export const ITEM_TYPES = ['fixed', 'percentOfBasic', 'percentOfGross'];
const MAX_SLABS = 12;
const MAX_ITEMS = 20;

// Annual tax for a taxable income under progressive slabs: [{ upTo, ratePercent }], ascending, last upTo null.
// Each rate applies only to the part of income inside its band.
export const annualTax = (slabs, taxable) => {
  let tax = 0;
  let lower = 0;
  for (const { upTo, ratePercent } of slabs) {
    const top = upTo === null ? Infinity : upTo;
    if (taxable > lower) tax += (Math.min(taxable, top) - lower) * (ratePercent / 100);
    if (taxable <= top) break;
    lower = top;
  }
  return round2(tax);
};

// Returns { policy } or { error } for an admin-submitted tax policy
export const validateTaxPolicy = (input) => {
  const slabsIn = input?.slabs ?? [];
  if (!Array.isArray(slabsIn) || slabsIn.length > MAX_SLABS) return { error: `Provide up to ${MAX_SLABS} tax slabs.` };
  const standardDeduction = input?.standardDeduction === undefined || input.standardDeduction === '' ? 0 : Number(input.standardDeduction);
  if (!Number.isFinite(standardDeduction) || standardDeduction < 0) return { error: 'The standard deduction must be zero or more.' };

  const slabs = [];
  let previous = 0;
  for (let i = 0; i < slabsIn.length; i++) {
    const last = i === slabsIn.length - 1;
    const rate = Number(slabsIn[i]?.ratePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: `Slab ${i + 1}: the rate must be between 0 and 100.` };
    const raw = slabsIn[i]?.upTo;
    const open = raw === null || raw === undefined || raw === '';
    if (open && !last) return { error: `Slab ${i + 1}: only the last slab can have no upper limit.` };
    if (!open) {
      const upTo = Number(raw);
      if (!Number.isFinite(upTo) || upTo <= previous) return { error: `Slab ${i + 1}: the upper limit must be higher than the previous slab's.` };
      if (last) return { error: 'The last slab must have no upper limit (it covers all higher income).' };
      slabs.push({ upTo, ratePercent: rate });
      previous = upTo;
    } else {
      slabs.push({ upTo: null, ratePercent: rate });
    }
  }
  return { policy: { slabs, standardDeduction, pfReducesTaxable: input?.pfReducesTaxable !== false } };
};

// Returns { items } or { error } for an employee's deduction items
export const validateDeductionItems = (input) => {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) return { error: `Provide up to ${MAX_ITEMS} deduction items.` };
  const names = new Set();
  const items = [];
  for (const row of input) {
    const name = String(row?.name ?? '').trim();
    if (!name || name.length > 40) return { error: 'Each deduction needs a name of up to 40 characters.' };
    if (names.has(name.toLowerCase())) return { error: `"${name}" is listed twice.` };
    names.add(name.toLowerCase());
    if (!ITEM_TYPES.includes(row.type)) return { error: `Choose how "${name}" is calculated.` };
    const value = Number(row.value);
    if (!Number.isFinite(value) || value < 0 || (row.type !== 'fixed' && value > 100)) {
      return { error: `"${name}" must be a non-negative amount${row.type !== 'fixed' ? ' (a percentage up to 100)' : ''}.` };
    }
    items.push({ name, type: row.type, value, preTax: row.preTax === true });
  }
  return { items };
};

// One item's monthly amount. Fixed amounts are not prorated (a premium is owed in full); percentages follow the earnings.
export const itemAmount = (item, { basic, gross }) =>
  round2(item.type === 'fixed' ? item.value : ((item.type === 'percentOfBasic' ? basic : gross) * item.value) / 100);

// Monthly tax withheld: annualise the regular monthly pay, tax it by slabs, spread over 12 months, then prorate.
export const monthlyTax = (policy, { fullBasic, fullGross, pfPercent, items }, ratio) => {
  const preTax =
    (policy.pfReducesTaxable ? (fullBasic * pfPercent) / 100 : 0) +
    items.filter((i) => i.preTax).reduce((sum, i) => sum + itemAmount(i, { basic: fullBasic, gross: fullGross }), 0);
  const taxable = Math.max((fullGross - preTax) * 12 - policy.standardDeduction, 0);
  return round2((annualTax(policy.slabs, taxable) / 12) * ratio);
};
