import { defineConfig } from 'tsup';

export default defineConfig([
  // Library build — CJS + ESM with type declarations
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    external: ['@freesail/core', '@freesail/react'],
  },
  // CLI build — CJS only, with shebang banner
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    clean: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['@freesail/core', '@freesail/react', '@freesail/gateway'],
  },
]);
