// Currency helpers. Rates are Frankfurter's (ECB) with base INR: rates[X] = units of X per 1 INR.
import type { Expense } from './types';

export interface Rates { base: 'INR'; date: string; rates: Record<string, number> }

export const toINR = (amount: number, cur: string, r: Rates | null | undefined): number | null => {
  if (!cur || cur === 'INR') return amount;
  const x = r?.rates[cur];
  return x ? amount / x : null;
};

export const fromINR = (inr: number, cur: string, r: Rates | null | undefined): number | null => {
  if (!cur || cur === 'INR') return inr;
  const x = r?.rates[cur];
  return x ? inr * x : null;
};

/** The INR value of an expense (fixed when it was entered). */
export const inrOf = (e: Pick<Expense, 'amt' | 'inr' | 'cur'>) => (e.inr != null ? e.inr : e.amt);

export function money(amount: number, cur = 'INR'): string {
  if (cur === 'INR') {
    const n = Math.round(amount || 0);
    return (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
  }
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(amount).replace('-', '−');
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}
