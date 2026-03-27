/**
 * @fileoverview freesail import catalog
 *
 * Adds or updates a package entry in `src/catalog.include.json` with all of
 * the package's components and functions, then re-runs `freesail prepare catalog`.
 * Edit catalog.include.json afterwards to remove anything you don't need.
 *
 * Usage:
 *   freesail import catalog [options]
 *
 * Options:
 *   --dir, -d <path>          Catalog root directory (default: CWD)
 *   --package, -p <name>      Package to import from
 *   --catalog-path <path>     Path to catalog JSON within the package
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import {
  buildCatalogConfig,
  prepareCatalog,
  resolvePackageCatalogJson,
} from './catalog-prepare.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface ImportArgs {
  dir: string | undefined;
  pkg: string | undefined;
  catalogPath: string | undefined;
}

function parseArgs(): ImportArgs {
  const args = process.argv.slice(4); // strip: node freesail import catalog
  const get = (flags: string[]): string | undefined => {
    for (const flag of flags) {
      const idx = args.indexOf(flag);
      if (idx !== -1 && args[idx + 1] && !args[idx + 1]!.startsWith('-')) {
        return args[idx + 1];
      }
    }
    return undefined;
  };

  return {
    dir: get(['--dir', '-d']),
    pkg: get(['--package', '-p']),
    catalogPath: get(['--catalog-path']),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const prompt = defaultValue !== undefined ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/** Derive a default catalog JSON path from a package name.
 *  @freesail/standard-catalog → dist/StandardCatalog.json
 *  @scope/my-catalog          → dist/MyCatalog.json
 *  my-catalog                 → dist/MyCatalog.json
 */
function defaultCatalogPath(packageName: string): string | undefined {
  const bare = packageName.replace(/^@[^/]+\//, ''); // strip scope
  const slugMatch = bare.match(/^(.+?)[-_]catalog/);
  if (slugMatch) return `dist/${bare}.json`;
  return undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  console.log('--- Freesail Import Catalog ---\n');

  const cliArgs = parseArgs();
  const targetDir = path.resolve(process.cwd(), cliArgs.dir ?? '.');

  // Verify this is a catalog directory
  const includeJsonPath = path.join(targetDir, 'src', 'includes', 'catalog.include.json');
  if (!fs.existsSync(includeJsonPath)) {
    console.error(`❌ Not a catalog directory: ${targetDir}`);
    console.error('   Expected src/includes/catalog.include.json to be present.');
    console.error('   Run from a catalog root or use --dir <path>.');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // 1. Resolve package name
    const pkgName = cliArgs.pkg ?? await ask(rl, 'Package to import from');
    if (!pkgName) {
      console.error('Package name is required.');
      process.exit(1);
    }

    // 2. Resolve catalogPath
    const derivedPath = defaultCatalogPath(pkgName);
    const resolvedCatalogPath =
      cliArgs.catalogPath ??
      (derivedPath ? derivedPath : await ask(rl, 'Path to catalog JSON within the package'));

    if (!resolvedCatalogPath) {
      console.error('Catalog JSON path is required.');
      process.exit(1);
    }

    rl.close();

    // 3. Try to load the catalog JSON from the installed package
    let sourceJson: Record<string, unknown> | null = null;
    try {
      sourceJson = resolvePackageCatalogJson(pkgName, resolvedCatalogPath, path.join(targetDir, 'src'));
    } catch {
      // package not installed
    }

    if (!sourceJson) {
      console.warn(`   ⚠  Package "${pkgName}" is not installed in this project.`);
      console.warn(`      Install it first: npm install ${pkgName}`);
      console.warn('      Then re-run this command.');
      process.exit(1);
    }

    const components = Object.keys((sourceJson['components'] ?? {}) as Record<string, unknown>);
    const functions = Object.keys((sourceJson['functions'] ?? {}) as Record<string, unknown>);

    // 4. Read existing catalog.include.json and upsert the entry
    const existing = JSON.parse(fs.readFileSync(includeJsonPath, 'utf-8')) as {
      includes: Record<string, unknown>;
    };

    const entry: Record<string, unknown> = { catalogPath: resolvedCatalogPath };
    if (components.length > 0) entry['components'] = components;
    if (functions.length > 0) entry['functions'] = functions;

    existing.includes[pkgName] = entry;

    fs.writeFileSync(includeJsonPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`✅ Updated src/includes/catalog.include.json`);
    console.log(`   Package:    ${pkgName}`);
    if (components.length > 0) console.log(`   Components: ${components.length}`);
    if (functions.length > 0) console.log(`   Functions:  ${functions.length}`);
    console.log('   Edit catalog.include.json to remove anything you don\'t need.\n');

    // 5. Re-run prepare
    prepareCatalog(buildCatalogConfig(targetDir, path.join(targetDir, 'src')));
  } finally {
    rl.close();
  }
}
