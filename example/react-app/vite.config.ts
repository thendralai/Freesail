import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    sourcemapIgnoreList: false,
    proxy: {
      // Forward gateway endpoints to the local gateway process.
      // This mirrors what nginx does in production, allowing the same
      // VITE_GATEWAY_URL=/ setting to work in both dev and prod.
      '/sse': {
        target: `http://localhost:${process.env['GATEWAY_PORT'] ?? '3001'}`,
        changeOrigin: true,
        // SSE requires no buffering
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Forwarded-Proto', 'http');
          });
        },
      },
      '/message': {
        target: `http://localhost:${process.env['GATEWAY_PORT'] ?? '3001'}`,
        changeOrigin: true,
      },
      '/register-catalogs': {
        target: `http://localhost:${process.env['GATEWAY_PORT'] ?? '3001'}`,
        changeOrigin: true,
      },
      '/register-surface': {
        target: `http://localhost:${process.env['GATEWAY_PORT'] ?? '3001'}`,
        changeOrigin: true,
      },
      '/send': {
        target: `http://localhost:${process.env['GATEWAY_PORT'] ?? '3001'}`,
        changeOrigin: true,
      },
    },
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
