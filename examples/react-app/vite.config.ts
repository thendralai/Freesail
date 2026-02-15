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
    alias: {
      '@freesail/react': path.resolve(__dirname, '../../packages/@freesail/react/src'),
      '@freesail/core': path.resolve(__dirname, '../../packages/@freesail/core/src'),
      '@freesail/catalogs/standard': path.resolve(__dirname, '../../packages/@freesail/catalogs/src/standard_catalog_v1'),
      '@freesail/catalogs/chat': path.resolve(__dirname, '../../packages/@freesail/catalogs/src/chat_catalog_v1'),
      '@freesail/catalogs/weather': path.resolve(__dirname, '../../packages/@freesail/catalogs/src/weather_catalog_v1')
    }
  },
  optimizeDeps: {
    exclude: [
      '@freesail/react',
      '@freesail/core',
      '@freesail/catalogs/standard',
      '@freesail/catalogs/chat',
      '@freesail/catalogs/weather'
    ]
  }
});
