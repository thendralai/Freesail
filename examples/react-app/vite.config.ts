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
      '@freesail/react': path.resolve(__dirname, '../../packages/react/src'),
      '@freesail/core': path.resolve(__dirname, '../../packages/core/src'),
      '@freesail/standard-catalog': path.resolve(__dirname, '../../packages/standard_catalog_v1/src'),
      '@freesail/chat-catalog': path.resolve(__dirname, '../../packages/chat_catalog_v1/src'),
      '@freesail/weather-catalog': path.resolve(__dirname, '../../packages/weather_catalog_v1/src')
    }
  },
  optimizeDeps: {
    exclude: [
      '@freesail/react',
      '@freesail/core',
      '@freesail/standard-catalog',
      '@freesail/chat-catalog',
      '@freesail/weather-catalog'
    ]
  }
});
