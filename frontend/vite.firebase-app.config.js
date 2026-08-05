import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundle storefront/js/firebase-app.js for Firebase Hosting.
 *
 * Why a separate build?
 * - Dev (`vite`) rewrites bare imports like `firebase/app` from node_modules.
 * - Hosting serves raw /storefront/js/*.js; browsers cannot resolve bare specifiers.
 * - This lib build inlines firebase + replaces import.meta.env.VITE_* at build time.
 *
 * Output: dist-firebase-app/firebase-app.js → copied over hosting-out/storefront/js/
 */
export default defineConfig({
  // Do not copy frontend/public (yurui-env.js belongs to the MPA build / assemble).
  publicDir: false,
  build: {
    emptyOutDir: true,
    outDir: 'dist-firebase-app',
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'storefront/js/firebase-app.js'),
      formats: ['es'],
      // Stable path so main.js / booking / admin keep:
      //   import('/storefront/js/firebase-app.js')
      fileName: () => 'firebase-app.js',
    },
    rollupOptions: {
      output: {
        // One file — no extra chunk URLs that Hosting must also host under /assets/.
        inlineDynamicImports: true,
      },
    },
  },
});
