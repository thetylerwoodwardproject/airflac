import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const DEV_SERVER_PORT = process.env.AIRFLAC_PORT ?? '8080';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${DEV_SERVER_PORT}`,
        changeOrigin: true,
        // Progress arrives over SSE, which must not be buffered by the dev proxy.
        ws: false,
      },
    },
  },
});
