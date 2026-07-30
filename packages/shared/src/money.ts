export const MINOR_UNITS_PER_MAJOR = 100;

export const MAX_AMOUNT_MINOR = 2_147_483_647;

export const MAX_AMOUNT_MAJOR_DIGITS = 7;

const MONETARY_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export function toMinorUnits(value: string | number): number {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError(`Not a valid monetary amount: ${String(value)}`);
  }

  const raw = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = MONETARY_PATTERN.exec(raw);
  if (!match) {
    throw new RangeError(`Not a valid monetary amount: "${String(value)}"`);
  }

  const [, sign, whole = "0", fraction = ""] = match;
  const minor = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(fraction.padEnd(2, "0"));

  if (minor > MAX_AMOUNT_MINOR) {
    throw new RangeError(`Amount exceeds the maximum supported value: "${String(value)}"`);
  }

  return sign === "-" ? -minor : minor;
}

export function toDecimalString(minor: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = absolute % MINOR_UNITS_PER_MAJOR;
  return `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
}

export function formatAmount(minor: number, currency = "MYR", locale = "en-MY"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / MINOR_UNITS_PER_MAJOR);
}
