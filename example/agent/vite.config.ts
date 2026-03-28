import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    preserveSymlinks: false,
    alias: [
      { find: 'freesail', replacement: path.resolve(__dirname, '../../packages/freesail/src') },
      { find: '@freesail-community/weathercatalog', replacement: path.resolve(__dirname, '../../packages/@freesail-community/weather-catalog/src') },
      { find: '@freesail/standard-catalog/utils', replacement: path.resolve(__dirname, '../../packages/@freesail/standard-catalog/src/common/common-utils.ts') },
      { find: '@freesail/standard-catalog', replacement: path.resolve(__dirname, '../../packages/@freesail/standard-catalog/src') },
      { find: '@freesail/chat-catalog', replacement: path.resolve(__dirname, '../../packages/@freesail/chat-catalog/src') },
      { find: '@freesail/react', replacement: path.resolve(__dirname, '../../packages/@freesail/react/src') },
      { find: '@freesail/core', replacement: path.resolve(__dirname, '../../packages/@freesail/core/src') },
      { find: '@freesail/logger', replacement: path.resolve(__dirname, '../../packages/@freesail/logger/src') },
      { find: '@freesail/gateway', replacement: path.resolve(__dirname, '../../packages/@freesail/gateway/src') },
      { find: '@freesail/agent-runtime', replacement: path.resolve(__dirname, '../../packages/@freesail/agent-runtime/src') },
    ]
  },
  build: {
    target: 'node18',
    outDir: 'dist',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [
        'express', 
        'cors', 
        'zod', 
        '@modelcontextprotocol/sdk', 
        '@modelcontextprotocol/sdk/client/index.js',
        '@modelcontextprotocol/sdk/client/stdio.js',
        '@modelcontextprotocol/sdk/types.js',
        '@langchain/core', 
        '@langchain/google-genai',
        /^node:/,
        'path',
        'url',
        'fs',
        'http',
        'https',
        'events',
        'child_process',
        'stream',
        'crypto'
      ]
    }
  }
});
