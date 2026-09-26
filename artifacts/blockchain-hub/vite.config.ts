import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const port = Number(process.env.PORT ?? 5173);

if (Number.isNaN(port) || port <= 0) {
  throw new Error("PORT must be a positive number.");
}

const basePath = process.env.BASE_PATH?.trim() || "/";
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim();
if (process.env.VERCEL && !apiBaseUrl) {
  throw new Error("VITE_API_BASE_URL is required when building the Vercel frontend.");
}

// The frontend is wired to authenticate against the same Clerk application
// the backend verifies sessions against (CLERK_PUBLISHABLE_KEY), rather than
// the separate VITE_CLERK_PUBLISHABLE_KEY value, so sign-in on the client and
// session verification on the server point at one Clerk app instead of two.
const serverClerkPublishableKey =
  process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

if (!serverClerkPublishableKey) {
  throw new Error(
    'Set VITE_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY) for the frontend build.',
  );
}

export default defineConfig({
  base: basePath,
  define: {
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(
      serverClerkPublishableKey,
    ),
  },
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
