/**
 * Seniority levels, 1 (most junior) to 10. This range is also enforced by the database
 * (employees_level_range), so the two must stay in step; a test checks that they do.
 */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 10;

export function isValidLevel(level: number): boolean {
  return Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL;
}

/** Levels are stored as numbers but shown to people as "L1", "L2", and so on. */
export function formatLevel(level: number): string {
  if (!isValidLevel(level)) {
    throw new RangeError(`Level must be a whole number from ${MIN_LEVEL} to ${MAX_LEVEL}`);
  }
  return `L${level}`;
}
