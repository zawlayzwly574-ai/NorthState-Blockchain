import { describe, expect, it } from 'vitest';
import { normalizeInternationalPhone } from './phone';

describe('normalizeInternationalPhone', () => {
  it('normalizes a US national number to E.164', () => {
    expect(normalizeInternationalPhone('+1', '(202) 555-0100')).toBe('+12025550100');
  });

  it('removes the Myanmar national trunk zero', () => {
    expect(normalizeInternationalPhone('+95', '09 123 45678')).toBe('+95912345678');
  });

  it('accepts a matching pasted E.164 number without duplicating its country code', () => {
    expect(normalizeInternationalPhone('+95', '+95 9 1234 5678')).toBe('+95912345678');
  });

  it('normalizes Peru (+51), Mexico (+52), and Brazil (+55)', () => {
    expect(normalizeInternationalPhone('+51', '987 654 321')).toBe('+51987654321');
    expect(normalizeInternationalPhone('+52', '55 1234 5678')).toBe('+525512345678');
    expect(normalizeInternationalPhone('+55', '11 98765 4321')).toBe('+5511987654321');
  });

  it('rejects invalid lengths and pasted numbers with a different selected country', () => {
    expect(normalizeInternationalPhone('+51', '98765432')).toBeNull();
    expect(normalizeInternationalPhone('+52', '+51987654321')).toBeNull();
    expect(normalizeInternationalPhone('+1', '0000000000')).toBeNull();
  });
});
