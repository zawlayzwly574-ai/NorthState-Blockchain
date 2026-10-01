import { describe, expect, it } from 'vitest';
import { buildAdminApiUrl, resolveAdminApiBaseUrl } from './api';

describe('admin API URL resolution', () => {
  it('falls back to the current origin when no explicit API base URL is configured', () => {
    const base = resolveAdminApiBaseUrl('https://example.test');
    expect(base).toBe('https://example.test');
    expect(buildAdminApiUrl('/transactions', 'https://example.test')).toBe('https://example.test/api/admin/transactions');
  });
});
