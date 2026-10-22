/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Dev server port: the agent's own port from VITE_PORT, or Vite's default. */
function devPort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 5173;
  const port = /^[0-9]{1,5}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_PORT must be an integer from 1 to 65535');
  }
  return port;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: devPort(process.env.VITE_PORT),
    // Fail instead of moving to another port: each agent owns its port block.
    strictPort: true,
    // Same-origin in development too: no CORS anywhere.
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:8081' } },
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: '../coverage/frontend',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/shared/api/schema.gen.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
