/**
 * Date helpers for the seed. Dates are "YYYY-MM-DD" strings (the same form the API and
 * the database use) and all arithmetic is done in UTC, so results never depend on the
 * time zone of the machine running the seed. Strings in this form sort correctly with
 * plain `<` and `>`.
 */
const MS_PER_DAY = 86_400_000;

function toMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(toMs(isoDate) + days * MS_PER_DAY);
}

/** Adds whole years. A 29 February anniversary in a non-leap year falls on 1 March. */
export function addYears(isoDate: string, years: number): string {
  const date = new Date(toMs(isoDate));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIsoDate(date.getTime());
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / MS_PER_DAY);
}
