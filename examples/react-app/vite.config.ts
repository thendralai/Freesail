import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    sourcemapIgnoreList: false
  },
  build: {
    sourcemap: true
  },
  resolve: {
    preserveSymlinks: false,
    alias: [
      // Use array form — these take priority over package.json `exports`
      { find: 'freesail', replacement: path.resolve(__dirname, '../../packages/freesail/src') },
      { find: '@freesail-community/weathercatalog', replacement: path.resolve(__dirname, '../../packages/@freesail-community/weather_catalog/src') },
      { find: '@freesail/catalogs', replacement: path.resolve(__dirname, '../../packages/@freesail/catalogs/src') },
      { find: '@freesail/react', replacement: path.resolve(__dirname, '../../packages/@freesail/react/src') },
      { find: '@freesail/core', replacement: path.resolve(__dirname, '../../packages/@freesail/core/src') },
    ]
  },
  optimizeDeps: {
    exclude: [
      '@freesail/react',
      '@freesail/core',
      '@freesail/catalogs',
      '@freesail-community/weathercatalog',
    ]
  }
});
