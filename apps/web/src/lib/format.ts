import { COUNTRIES, type CountryCode } from '@acme/shared';

/** "2022-04-01" becomes "1 Apr 2022". Done by hand: parsing it as a Date could show the day before in some time zones. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return isoDate;
  const [, year, month, day] = match;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(day)} ${months[Number(month) - 1] ?? month} ${year}`;
}

/** Seniority is stored as a number and shown as "L3". */
export function formatLevel(level: number): string {
  return `L${level}`;
}

export function countryName(code: CountryCode): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}
