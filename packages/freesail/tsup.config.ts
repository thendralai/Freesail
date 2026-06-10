import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

function copyCatalogFiles() {
  const src = join(__dirname, 'src', 'catalog');
  const dest = join(__dirname, 'dist', 'catalog');
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    if (file.endsWith('.json') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      copyFileSync(join(src, file), join(dest, file));
    }
  }
}

export default defineConfig([
  // Library build — CJS + ESM with type declarations
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    external: ['react', 'react-dom', 'react/jsx-runtime', '@freesail/core', '@freesail/react', '@freesail/standard-catalog'],
  },
  // CLI build — CJS only, with shebang banner
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    clean: false,
    loader: {
      '.md': 'text',
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['@freesail/core', '@freesail/react', '@freesail/gateway', '@freesail/standard-catalog'],
    onSuccess: async () => {
      copyCatalogFiles();
      console.log('CLI ✅ Copied catalog files to dist/catalog/');
    },
  },
]);
