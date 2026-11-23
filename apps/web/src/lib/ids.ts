/** Reads an employee id from a URL parameter. Anything that is not a plain positive whole number is not an id. */
export function parseId(raw: string | undefined): number | undefined {
  return raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : undefined;
}
