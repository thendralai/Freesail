/**
 * @fileoverview freesail new catalog
 *
 * Scaffolds a new Freesail catalog package using the fork-and-own model.
 *
 * Common files (components, functions, types) are copied from
 * the bundled catalog/ directory into the new catalog's src/common/ folder.
 * The developer owns all files and can modify them freely.
 *
 * After scaffolding, `freesail prepare catalog` is run to generate the
 * resolved catalog JSON from common + custom schema files.
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { prepareCatalog } from './catalog-prepare.js';
import readmeTemplate from './catalog-readme.md';

// ---------------------------------------------------------------------------
// Catalog domain generation
// ---------------------------------------------------------------------------

const BOAT_TYPES = ['dinghy', 'cruiser', 'racer', 'catamaran', 'trimaran', 'sloop', 'cutter', 'ketch', 'yawl'];

function generateCatalogDomain(): string {
  const boat = BOAT_TYPES[Math.floor(Math.random() * BOAT_TYPES.length)]!;
  const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `${boat}${hex}`;
}

/**
 * Derive a .local domain from a package name.
 * @scope/name  → scope.local
 * name (no scope) → falls back to the provided fallback domain
 */
function domainFromPackageName(packageName: string, fallback: string): string {
  const match = packageName.match(/^@([^/]+)\//); 
  return match ? `${match[1]}.local` : fallback;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Locate the bundled catalog directory shipped with the freesail CLI.
 */
function findCatalogDir(): string {
  return path.join(__dirname, 'catalog');
}

/**
 * Read a common source file from the bundled catalog/ directory.
 */
function readCommonFile(catalogDir: string, filename: string): string {
  const filePath = path.join(catalogDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Common file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Scaffold generation
// ---------------------------------------------------------------------------

function generateComponentsTsx(prefix: string): string {
  const camelPrefix = prefix.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const pascalPrefix = camelPrefix.charAt(0).toUpperCase() + camelPrefix.slice(1);

  return `/**
 * @fileoverview ${pascalPrefix} Catalog Components
 *
 * Extends the common component set with catalog-specific components.
 */

import React, { useState, useEffect, type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import type { FunctionCall } from '@freesail/core';
import { commonComponents } from './common/CommonComponents.js';
import {
  getSemanticColor,
  getSemanticBackground,
  mapJustify,
  toInputFormat,
  validateChecks,
} from './common/common-utils.js';
import { commonFunctions } from './common/CommonFunctions.js';

// Add custom components here, for example:
//
// export function MyWidget({ component, children }: FreesailComponentProps) {
//   const style: CSSProperties = {
//     color: getSemanticColor(component['color'] as string),
//   };
//   return <div style={style}>{children}</div>;
// }

export const ${camelPrefix}CatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  ...commonComponents,
  // MyWidget,
};
`;
}

function generateFunctionsTs(prefix: string): string {
  const camelPrefix = prefix.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  return `/**
 * @fileoverview ${camelPrefix} Catalog Functions
 *
 * Re-exports all common functions. Add catalog-specific functions below.
 */

import type { FunctionImplementation } from '@freesail/react';
import { commonFunctions } from './common/CommonFunctions.js';

// Add custom functions here, for example:
//
// const myCustomFn: FunctionImplementation = (value: unknown) => {
//   return String(value).toUpperCase();
// };

export const ${camelPrefix}CatalogFunctions: Record<string, FunctionImplementation> = {
  ...commonFunctions,
  // myCustomFn,
};
`;
}

function generateIndexTs(prefix: string): string {
  const camelPrefix = prefix.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const pascalPrefix = camelPrefix.charAt(0).toUpperCase() + camelPrefix.slice(1);
  const constName = `${pascalPrefix}Catalog`;

  return `/**
 * @fileoverview ${pascalPrefix} Catalog
 */

import type { CatalogDefinition } from '@freesail/react';
import { ${camelPrefix}CatalogComponents } from './components.js';
import { ${camelPrefix}CatalogFunctions } from './functions.js';
import catalogSchema from './${prefix}_catalog.json';

export const ${constName}: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: ${camelPrefix}CatalogComponents,
  functions: ${camelPrefix}CatalogFunctions,
};
`;
}

function generatePackageJson(
  packageName: string,
  prefix: string,
  title: string,
  description: string,
): string {
  const pkg = {
    name: packageName,
    version: '0.1.0',
    description: `Freesail ${prefix} catalog`,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
      },
    },
    files: ['dist', 'src/schemas', 'LICENSE'],
    scripts: {
      'prepare:catalog': 'freesail prepare catalog',
      build: 'tsc',
      dev: 'tsc --watch',
      clean: 'rm -rf dist *.tsbuildinfo',
      prebuild: 'freesail prepare catalog && freesail validate catalog',
    },
    peerDependencies: {
      '@freesail/react': '*',
      react: '^18.0.0 || ^19.0.0',
    },
    devDependencies: {
      '@freesail/react': '*',
      '@types/react': '^18.2.0',
      react: '^18.2.0',
      freesail: '*',
    },
    license: 'MIT',
  };

  return JSON.stringify(pkg, null, 2);
}

function generateTsconfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      declaration: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: 'react-jsx',
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ['src'],
  };

  return JSON.stringify(config, null, 2);
}

function generateReadme(prefix: string, title: string, description: string): string {
  const camelPrefix = prefix.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const pascalPrefix = camelPrefix.charAt(0).toUpperCase() + camelPrefix.slice(1);

  return readmeTemplate
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{description\}\}/g, description)
    .replace(/\{\{prefix\}\}/g, prefix)
    .replace(/\{\{pascalPrefix\}\}/g, pascalPrefix);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  console.log('--- Freesail New Catalog ---\n');
  console.log('This will scaffold a new catalog. Common components and functions will be copied into your catalog.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const prefix = await ask(rl, 'Catalog prefix (e.g. "weather", "finance")', '');
    if (!prefix) {
      console.error('Prefix is required.');
      process.exit(1);
    }

    // Validate prefix: lowercase, underscores allowed, no spaces
    if (!/^[a-z][a-z0-9_]*$/.test(prefix)) {
      console.error('Prefix must start with a lowercase letter and contain only [a-z0-9_].');
      process.exit(1);
    }

    const domain = generateCatalogDomain();

    const title = await ask(rl, 'Catalog title', `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Catalog`);
    const description = await ask(rl, 'Catalog description', `A custom Freesail catalog for ${prefix}`);
    const packageName = await ask(rl, 'npm package name', `@${domain}/${prefix}_catalog`);
    const outputDir = await ask(rl, 'Output directory', `./${prefix}_catalog`);

    // Derive catalogId from the package org scope (e.g. @sloop-3f2a1c → sloop-3f2a1c.local)
    const catalogDomain = domainFromPackageName(packageName, domain);
    const catalogId = `https://${catalogDomain}/catalogs/${prefix}_catalog_v1.json`;

    rl.close();

    // Resolve output path
    const outPath = path.resolve(process.cwd(), outputDir);
    const srcPath = path.join(outPath, 'src');

    if (fs.existsSync(outPath) && fs.readdirSync(outPath).length > 0) {
      console.error(`\n❌ Directory already exists and is not empty: ${outPath}`);
      process.exit(1);
    }

    // Find bundled catalog common source files
    const catalogDir = findCatalogDir();
    if (!fs.existsSync(catalogDir)) {
      console.error(
        '\n❌ Cannot find bundled catalog directory.\n' +
        '   Reinstall the freesail package.'
      );
      process.exit(1);
    }

    console.log('\n📦 Scaffolding catalog...\n');

    // Create directories
    const commonPath = path.join(srcPath, 'common');
    const schemasPath = path.join(srcPath, 'schemas');
    fs.mkdirSync(commonPath, { recursive: true });
    fs.mkdirSync(schemasPath, { recursive: true });

    // Copy catalog schema file
    const schemaSource = path.join(catalogDir, 'catalog-schema.json');
    if (fs.existsSync(schemaSource)) {
      fs.writeFileSync(path.join(schemasPath, 'catalog-schema.json'), fs.readFileSync(schemaSource, 'utf-8'));
      console.log('   📄 src/schemas/catalog-schema.json');
    }

    // Copy common source files into src/common/
    const filesToCopy = ['CommonComponents.tsx', 'CommonFunctions.ts', 'common_types.json', 'common_components.json', 'common_functions.json'];
    for (const file of filesToCopy) {
      const content = readCommonFile(catalogDir, file);
      fs.writeFileSync(path.join(commonPath, file), content);
      console.log(`   📄 src/common/${file}`);
    }

    // Generate empty custom schema stubs
    fs.writeFileSync(path.join(srcPath, 'components.json'), JSON.stringify({ components: {} }, null, 2) + '\n');
    console.log('   📄 src/components.json');

    fs.writeFileSync(path.join(srcPath, 'functions.json'), JSON.stringify({ functions: {} }, null, 2) + '\n');
    console.log('   📄 src/functions.json');

    fs.writeFileSync(path.join(srcPath, 'catalog.exclude.json'), JSON.stringify({ components: [], functions: [] }, null, 2) + '\n');
    console.log('   📄 src/catalog.exclude.json');

    // Generate TypeScript files
    fs.writeFileSync(path.join(srcPath, 'components.tsx'), generateComponentsTsx(prefix));
    console.log('   📄 src/components.tsx');

    fs.writeFileSync(path.join(srcPath, 'functions.ts'), generateFunctionsTs(prefix));
    console.log('   📄 src/functions.ts');

    fs.writeFileSync(path.join(srcPath, 'index.ts'), generateIndexTs(prefix));
    console.log('   📄 src/index.ts');

    // Generate package files
    fs.writeFileSync(path.join(outPath, 'package.json'), generatePackageJson(packageName, prefix, title, description));
    console.log('   📄 package.json');

    fs.writeFileSync(path.join(outPath, 'tsconfig.json'), generateTsconfig());
    console.log('   📄 tsconfig.json');

    fs.writeFileSync(path.join(outPath, 'README.md'), generateReadme(prefix, title, description));
    console.log('   📄 README.md');

    // Generate resolved catalog JSON via prepare
    console.log('');
    prepareCatalog({
      name: `${prefix}_catalog`,
      packagePath: outPath,
      srcPath,
      prefix,
    });

    console.log(`\n✅ Catalog scaffolded at: ${outPath}`);
    console.log('\nNext steps:');
    console.log(`  cd ${outputDir}`);
    console.log('  npm install');
    console.log('  npm run build');
    console.log('\nAdd custom components in src/components.tsx');
    console.log(`  and define their schemas in src/components.json`);
    console.log('Add custom functions in src/functions.ts');
    console.log(`  and define their schemas in src/functions.json`);
    console.log('\nAfter schema changes, run: npx freesail prepare catalog');
    console.log('\n⚠  Update the package scope (e.g. @myorg) before publishing.');
  } finally {
    rl.close();
  }
}
