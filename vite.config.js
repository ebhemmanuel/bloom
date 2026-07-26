import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' is mandatory. The packaged app is loaded via loadFile() over file://,
// where Vite's default absolute /assets/* paths 404 and you get a blank window.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome130',
  },
  css: {
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
