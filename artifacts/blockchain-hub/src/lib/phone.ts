export type PhoneCountryOption = { code: string; label: string };

export const PHONE_SIGNUP_COUNTRIES: PhoneCountryOption[] = [
  { code: '+1', label: '🇺🇸 United States (+1)' },
  { code: '+95', label: '🇲🇲 Myanmar (+95)' },
  { code: '+51', label: '🇵🇪 Peru (+51)' },
  { code: '+55', label: '🇧🇷 Brazil (+55)' },
  { code: '+52', label: '🇲🇽 Mexico (+52)' },
];

const NATIONAL_PHONE_LENGTHS: Record<string, [number, number]> = {
  '+1': [10, 10],
  '+95': [7, 10],
  '+51': [9, 9],
  '+52': [10, 10],
  '+55': [10, 11],
};

/** Return an E.164 value or null when the number is inconsistent with the selected calling code. */
export function normalizeInternationalPhone(countryCode: string, input: string): string | null {
  const raw = input.trim();
  const countryDigits = countryCode.replace(/\D/g, '');
  let nationalDigits = raw.replace(/\D/g, '');
  if (!countryDigits || !nationalDigits) return null;

  // If a member pastes an E.164 value, ensure its country prefix matches the
  // selected country rather than accidentally double-prefixing the number.
  if (raw.startsWith('+') || raw.startsWith('00')) {
    if (raw.startsWith('00')) nationalDigits = nationalDigits.slice(2);
    if (!nationalDigits.startsWith(countryDigits)) return null;
    nationalDigits = nationalDigits.slice(countryDigits.length);
  }

  // Myanmar users commonly enter the domestic leading zero; it is not part
  // of the international E.164 number.
  if (countryCode === '+95' && nationalDigits.startsWith('0')) {
    nationalDigits = nationalDigits.slice(1);
  }

  const [minLength, maxLength] = NATIONAL_PHONE_LENGTHS[countryCode] ?? [6, 12];
  if (!/^\d+$/.test(nationalDigits) ||
      nationalDigits.length < minLength ||
      nationalDigits.length > maxLength ||
      nationalDigits.split('').every((digit) => digit === '0') ||
      countryDigits.length + nationalDigits.length > 15) {
    return null;
  }
  return `+${countryDigits}${nationalDigits}`;
}
