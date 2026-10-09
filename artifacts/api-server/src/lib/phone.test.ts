import { describe, expect, it } from 'vitest';
import { normalizeSmsE164 } from './phone';

describe('normalizeSmsE164', () => {
  it('accepts valid E.164 numbers for requested countries', () => {
    expect(normalizeSmsE164('+12025550100')).toBe('+12025550100');
    expect(normalizeSmsE164('+95912345678')).toBe('+95912345678');
    expect(normalizeSmsE164('+51987654321')).toBe('+51987654321');
    expect(normalizeSmsE164('+525512345678')).toBe('+525512345678');
    expect(normalizeSmsE164('+5511987654321')).toBe('+5511987654321');
  });

  it('normalizes 00 international prefix and the Myanmar trunk zero', () => {
    expect(normalizeSmsE164('0012025550100')).toBe('+12025550100');
    expect(normalizeSmsE164('+950912345678')).toBe('+95912345678');
  });

  it('rejects local-only numbers and invalid country-specific lengths', () => {
    expect(normalizeSmsE164('2025550100')).toBeNull();
    expect(normalizeSmsE164('+5198765432')).toBeNull();
    expect(normalizeSmsE164('+52551234567')).toBeNull();
    expect(normalizeSmsE164('+15555555555')).toBe('+15555555555');
    expect(normalizeSmsE164('not-a-number')).toBeNull();
  });
});
