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
