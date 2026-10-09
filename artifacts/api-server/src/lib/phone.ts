/** Normalize and validate an incoming international number as E.164.
 * Supported requested markets have stricter national digit checks; other
 * supported countries still use the generic E.164 8-15 total digit rule.
 */
export function normalizeSmsE164(value: unknown): string | null {
  const input = String(value ?? "").trim();
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (input.startsWith("00")) digits = digits.slice(2);
  else if (!input.startsWith("+")) return null;
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) return null;

  const nationalLength = (countryPrefix: string) =>
    digits.startsWith(countryPrefix) ? digits.length - countryPrefix.length : -1;
  const phoneRules: Record<string, [number, number]> = {
    "1": [10, 10],
    "95": [7, 10],
    "51": [9, 9],
    "52": [10, 10],
    "55": [10, 11],
  };
  const prefix = Object.keys(phoneRules).sort((a, b) => b.length - a.length).find((candidate) =>
    digits.startsWith(candidate),
  );
  if (prefix) {
    let national = digits.slice(prefix.length);
    // Myanmar domestic numbers sometimes include a trunk 0 after country code.
    if (prefix === "95" && national.startsWith("0")) national = national.slice(1);
    const [minLength, maxLength] = phoneRules[prefix];
    if (national.length < minLength || national.length > maxLength) return null;
    digits = prefix + national;
  } else if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return `+${digits}`;
}
