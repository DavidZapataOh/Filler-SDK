import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// `vitest/config`'s defineConfig extends Vite's with a `test:` block —
// using Vite's own defineConfig fails type-checking on the `test` property.
import { defineConfig } from 'vitest/config';

/**
 * Filler SDK dashboard — Vite + React 18 + Tailwind v4.
 *
 * Tailwind v4 is CSS-first (`@theme` block in `src/index.css`), so we don't
 * ship a `tailwind.config.ts`. The `@tailwindcss/vite` plugin auto-discovers
 * the `@import "tailwindcss"` directive + scans `src/**` for class usage.
 *
 * Bundle strategy: split vendor chunks so the money counter + chart vendors
 * are cached independently across rebuilds — Recharts in particular is the
 * single biggest dep (~70 KB gzip) and rarely changes.
 *
 * Test config is co-located here (vitest 4.x reads `test:` from
 * `vite.config.ts` when no `vitest.config.ts` is present). jsdom is the
 * environment because Plans 02-05 will exercise React Testing Library
 * which needs a DOM.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'esnext',
    sourcemap: true,
    cssCodeSplit: true,
    // esbuild minify is faster than terser + comparable size for ESM.
    // Plan 01 chooses esbuild (Vite 6 default); revisit if specific
    // post-build hooks (e.g. license-comment preservation) require terser.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Vendor chunks — Recharts is the heaviest and rarely changes.
        // Function form (rollup's typing exposes the function overload
        // cleanly across both vite + vitest's bundled rollup; the record
        // form trips type widening under verbatimModuleSyntax).
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }
          if (id.includes('node_modules/recharts')) return 'recharts';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'dist/**',
        'test/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        'vite.config.ts',
        'vitest.setup.ts',
      ],
    },
  },
});
