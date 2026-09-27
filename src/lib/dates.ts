/**
 * Dates. ARCHITECTURE.md §7: a purchase on the 31st must not become the 1st, so
 * months are handled as 'YYYY-MM' strings and days as 'YYYY-MM-DD' — never as
 * timestamps run through a timezone.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** 'YYYY-MM' → 'SEPTEMBER'. For the §6.2 eyebrow. */
export function monthNameUpper(month: string): string {
  return monthName(month).toUpperCase();
}

/** 'YYYY-MM' → 'September'. */
export function monthName(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTHS[index] ?? '';
}

/** 'YYYY-MM' → 'Sep'. For the segmented month switcher. */
export function monthShort(month: string): string {
  return monthName(month).slice(0, 3);
}

/** The month before a 'YYYY-MM', as 'YYYY-MM'. */
export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  if (index === 1) return `${year - 1}-12`;
  return `${year}-${String(index - 1).padStart(2, '0')}`;
}

/** The month after a 'YYYY-MM', as 'YYYY-MM'. */
export function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  if (index === 12) return `${year + 1}-01`;
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

/**
 * Today on the DEVICE's calendar, as 'YYYY-MM-DD'.
 *
 * Not `new Date().toISOString().slice(0, 10)`, which is today in UTC. In Zagreb
 * that is yesterday until 01:00 or 02:00, so a coffee typed just after midnight on
 * the 1st was filed under the previous month — the exact failure §7 warns about.
 */
export function todayLocal(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** This month on the device's calendar, as 'YYYY-MM'. */
export function currentMonthLocal(now: Date = new Date()): string {
  return todayLocal(now).slice(0, 7);
}

/**
 * The three months the §6.2 switcher shows, oldest first.
 *
 * It used to be "the selected month and the two before it", which meant that once
 * you stepped back — or an import moved you to last month's statement — the current
 * month fell off the end and there was no way forward again. The window now keeps
 * one month AFTER the selection whenever one exists, so today is always one tap
 * away, and never runs past the current month into an empty future.
 */
export function switcherMonths(selected: string, current: string): string[] {
  const end = selected >= current ? current : nextMonth(selected);
  const middle = previousMonth(end);
  return [previousMonth(middle), middle, end];
}

/** Days in a 'YYYY-MM'. */
export function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(year, index, 0).getDate();
}

/** '2026-08-29' -> '29 Aug'. Formatting only; the value stays a date string. */
export function shortDate(occurredOn: string): string {
  const day = Number(occurredOn.slice(8, 10));
  const month = monthShort(occurredOn.slice(0, 7));
  return `${day} ${month}`;
}

/**
 * The inclusive 'YYYY-MM-DD' bounds of a month — or of its first `throughDay` days.
 *
 * The partial form is for comparing a month still in progress. Setting September
 * the 3rd against all of August made every category look like it had collapsed —
 * "Eating out is down 99% on August — nice work" — which is praise for a month
 * that has barely started. Against August's first three days, it is a real
 * comparison.
 *
 * The end is a string bound, so '2026-02-30' simply means "all of February".
 */
export function monthRange(month: string, throughDay?: number): [string, string] {
  const day = throughDay === undefined ? 31 : Math.max(1, Math.min(31, Math.floor(throughDay)));
  return [`${month}-01`, `${month}-${String(day).padStart(2, '0')}`];
}
