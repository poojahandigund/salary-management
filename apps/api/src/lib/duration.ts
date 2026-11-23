const UNIT_SECONDS = { s: 1, m: 60, h: 3_600, d: 86_400 } as const;

/**
 * Turns a short duration such as "30m", "8h" or "2d" into seconds. Only whole numbers and
 * the units s, m, h and d are understood. Returns `undefined` for anything else
 * (including zero), so the caller decides how to report it.
 */
export function parseDurationSeconds(value: string): number | undefined {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
  return seconds > 0 && Number.isSafeInteger(seconds) ? seconds : undefined;
}
