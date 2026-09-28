// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const { setLocation } = vi.hoisted(() => ({ setLocation: vi.fn() }));

vi.mock('wouter', () => ({
  useLocation: () => ['/login', setLocation],
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setLocation.mockReset();
});

it('validates the admin key against the configured Railway API on Vercel', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.invalid/');
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const { default: Login } = await import('./login');
  const { adminApiUrl } = await import('@/lib/api');

  render(<Login />);
  fireEvent.change(screen.getByTestId('input-admin-key'), {
    target: { value: 'test-admin-key' },
  });
  fireEvent.click(screen.getByTestId('btn-login-submit'));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.example.invalid/api/admin/auth/validate');
  expect(new Headers(options.headers).get('X-Admin-Key')).toBe('test-admin-key');
  expect(adminApiUrl('/stats')).toBe('https://api.example.invalid/api/admin/stats');
  expect(setLocation).toHaveBeenCalledWith('/dashboard');
});