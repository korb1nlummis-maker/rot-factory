import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` writes dist/index.html: the whole game in one file that opens by double-click.
export default defineConfig({
  plugins: [viteSingleFile()],
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
});
