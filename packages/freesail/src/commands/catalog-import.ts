/**
 * @fileoverview freesail include catalog
 *
 * Reads `dist/freesailconfig.json` from an installed npm package and adds
 * its components and functions to `src/includes/catalog.include.json`.
 *
 * Usage:
 *   freesail include catalog [options]
 *
 * Options:
 *   --dir, -d <path>          Catalog root directory (default: CWD)
 *   --package, -p <name>      Package to include from
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface ImportArgs {
  dir: string | undefined;
  pkg: string | undefined;
}

function parseArgs(): ImportArgs {
  const args = process.argv.slice(4); // strip: node freesail include catalog
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
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => resolve(answer.trim()));
  });
}

/** Resolve the root directory of an installed package from `fromDir`. */
function resolvePackageRoot(packageName: string, fromDir: string): string {
  const require = createRequire(pathToFileURL(path.join(fromDir, '_')).href);
  // Use resolve.paths() to get the node_modules search directories without
  // needing to load the package (avoids ESM/CJS and exports field issues).
  const searchPaths = require.resolve.paths(packageName) ?? [];
  for (const searchDir of searchPaths) {
    const pkgDir = path.join(searchDir, packageName);
    if (fs.existsSync(path.join(pkgDir, 'package.json'))) return pkgDir;
  }
  throw new Error(
    `Package "${packageName}" not found.\n` +
    `   Run: npm install ${packageName}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  console.log('--- Freesail Import Catalog ---\n');

  const cliArgs = parseArgs();
  const targetDir = path.resolve(process.cwd(), cliArgs.dir ?? '.');

  // Verify this is a catalog directory
  const freesailConfigPath = path.join(targetDir, 'src', 'freesailconfig.json');
  if (!fs.existsSync(freesailConfigPath)) {
    console.error(`❌ No src/freesailconfig.json found in: ${targetDir}`);
    console.error('   Run from a catalog root or use --dir <path>.');
    process.exit(1);
  }

  let freesailConfig: Record<string, unknown>;
  try {
    freesailConfig = JSON.parse(fs.readFileSync(freesailConfigPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    console.error(`❌ Failed to parse src/freesailconfig.json in: ${targetDir}`);
    process.exit(1);
  }

  const targetCatalog = freesailConfig['catalog'] as Record<string, unknown> | undefined;
  if (!targetCatalog?.['catalogFile']) {
    console.error(`❌ Missing "catalog.catalogFile" in src/freesailconfig.json.`);
    process.exit(1);
  }

  const srcPath = path.join(targetDir, 'src');
  const includeJsonPath = path.join(srcPath, 'includes', 'catalog.include.json');
  if (!fs.existsSync(includeJsonPath)) {
    console.error(`❌ src/includes/catalog.include.json not found.`);
    console.error('   Run freesail prepare catalog first.');
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
    rl.close();

    // 2. Find the installed package and read its dist/freesailconfig.json
    let pkgRoot: string;
    try {
      pkgRoot = resolvePackageRoot(pkgName, srcPath);
    } catch (err) {
      console.error(`❌ ${(err as Error).message}`);
      process.exit(1);
    }

    const distFreesailConfigPath = path.join(pkgRoot, 'dist', 'freesailconfig.json');
    if (!fs.existsSync(distFreesailConfigPath)) {
      console.error(`❌ No dist/freesailconfig.json found in "${pkgName}".`);
      console.error('   The package may not have been built with a recent version of the Freesail CLI.');
      process.exit(1);
    }

    let pkgFreesailConfig: Record<string, unknown>;
    try {
      pkgFreesailConfig = JSON.parse(fs.readFileSync(distFreesailConfigPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      console.error(`❌ Failed to parse dist/freesailconfig.json in "${pkgName}".`);
      process.exit(1);
    }

    const pkgCatalog = pkgFreesailConfig['catalog'] as Record<string, unknown> | undefined;
    if (!pkgCatalog?.['catalogFile']) {
      console.error(`❌ No valid catalog entry in dist/freesailconfig.json of "${pkgName}".`);
      process.exit(1);
    }

    // 3. Load the catalog JSON from the installed package (always in dist/)
    const catalogFile = pkgCatalog['catalogFile'] as string;
    const catalogPath = `dist/${catalogFile}`;
    const catalogJsonPath = path.join(pkgRoot, catalogPath);

    if (!fs.existsSync(catalogJsonPath)) {
      console.error(`❌ Catalog file not found: ${catalogJsonPath}`);
      process.exit(1);
    }

    let sourceJson: Record<string, unknown>;
    try {
      sourceJson = JSON.parse(fs.readFileSync(catalogJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      console.error(`❌ Failed to parse catalog JSON: ${catalogJsonPath}`);
      process.exit(1);
    }

    const components = Object.keys((sourceJson['components'] ?? {}) as Record<string, unknown>);
    const functions = Object.keys((sourceJson['functions'] ?? {}) as Record<string, unknown>);

    // 4. Upsert into catalog.include.json
    const existing = JSON.parse(fs.readFileSync(includeJsonPath, 'utf-8')) as {
      includes: Record<string, unknown>;
    };

    const entry: Record<string, unknown> = { catalogPath };
    if (components.length > 0) entry['components'] = components;
    if (functions.length > 0) entry['functions'] = functions;
    existing.includes[pkgName] = entry;

    fs.writeFileSync(includeJsonPath, JSON.stringify(existing, null, 2) + '\n');
    console.log(`✅ Added "${pkgName}"`);
    if (components.length > 0) console.log(`   Components: ${components.length}`);
    if (functions.length > 0) console.log(`   Functions:  ${functions.length}`);
    console.log(`\n✅ Updated src/includes/catalog.include.json`);

    if (components.length === 0 && functions.length === 0) {
      console.warn('   ⚠  No components or functions were found in the included catalog.');
    }

    console.log('\n👉 Run the below command to update your catalog:');
    console.log('   npx freesail prepare catalog');
  } finally {
    rl.close();
  }
}
