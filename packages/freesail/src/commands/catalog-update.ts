/**
 * @fileoverview freesail update catalog
 *
 * Updates an existing catalog's common components, functions, schemas,
 * and related files with the latest versions bundled in the freesail CLI.
 *
 * Files replaced:
 *   src/common/CommonComponents.tsx
 *   src/common/CommonFunctions.ts
 *   src/common/common-utils.ts
 *   src/common/common_components.json
 *   src/common/common_functions.json
 *   src/common/common_types.json
 *   src/common/index.ts
 *   src/schemas/catalog-schema.json
 *   README.md
 *
 * After updating, `freesail prepare catalog` is run to regenerate the
 * resolved catalog JSON.
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { prepareCatalog, type CatalogConfig } from './catalog-prepare.js';
import readmeTemplate from './catalog-readme.md';

// When running as an npm lifecycle script, npm sets process.cwd() to
// the package root — INIT_CWD would point to the workspace root.
const CWD = process.env['npm_lifecycle_event']
  ? process.cwd()
  : (process.env['INIT_CWD'] || process.cwd());

function parseDirArg(): string | undefined {
  const args = process.argv.slice(4);
  const idx = args.findIndex((a) => a === '--dir' || a === '-d');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

// Files copied into src/common/
const COMMON_FILES = [
  'CommonComponents.tsx',
  'CommonFunctions.ts',
  'common-utils.ts',
  'common_components.json',
  'common_functions.json',
  'common_types.json',
  'index.ts',
];

// Files copied into src/schemas/
const SCHEMA_FILES = [
  'catalog-schema.json',
];

// ---------------------------------------------------------------------------
// Discovery (same pattern as catalog-prepare)
// ---------------------------------------------------------------------------

function getCatalogConfig(dir: string, nameOverride?: string): CatalogConfig | null {
  const folderName = nameOverride ?? path.basename(dir);
  const match = folderName.match(/^(.+)_catalog(?:_(v\d+))?$/);
  if (!match) return null;

  const prefix = match[1] as string;

  for (const probe of [path.join(dir, 'src'), dir]) {
    if (!fs.existsSync(probe)) continue;
    if (!fs.existsSync(path.join(probe, 'index.ts'))) continue;
    return { name: folderName, packagePath: dir, srcPath: probe, prefix };
  }

  return null;
}

function discoverCatalogs(baseDir: string): CatalogConfig[] {
  const config = getCatalogConfig(baseDir);
  if (config) return [config];

  const fromSrc = getCatalogConfig(baseDir, path.basename(baseDir));
  if (fromSrc) return [fromSrc];

  // Scan direct subdirectories of baseDir
  const directCatalogs: CatalogConfig[] = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = getCatalogConfig(path.join(baseDir, entry.name));
    if (sub) directCatalogs.push(sub);
  }
  if (directCatalogs.length > 0) return directCatalogs;

  // Scan baseDir/src subdirectories
  const srcPath = path.join(baseDir, 'src');
  if (fs.existsSync(srcPath)) {
    const catalogs: CatalogConfig[] = [];
    for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sub = getCatalogConfig(path.join(srcPath, entry.name));
      if (sub) catalogs.push(sub);
    }
    if (catalogs.length > 0) return catalogs;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Locate the bundled catalog directory shipped with the freesail CLI.
 */
function findCatalogDir(): string {
  return path.join(__dirname, 'catalog');
}

/**
 * Read catalog title and description from package.json.
 */
function readCatalogMeta(packagePath: string, prefix: string): { title: string; description: string } {
  const fallback = {
    title: `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Catalog`,
    description: `A Freesail catalog for ${prefix}`,
  };

  let dir = packagePath;
  let pkgPath: string | null = null;
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      pkgPath = candidate;
      break;
    }
    dir = path.dirname(dir);
  }
  if (!pkgPath) return fallback;

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return fallback;
  }

  const freesail = pkg['freesail'] as Record<string, unknown> | undefined;
  if (!freesail) return fallback;

  const catalogs = freesail['catalogs'] as Record<string, Record<string, string>> | undefined;
  if (catalogs?.[prefix]) {
    const meta = catalogs[prefix]!;
    return {
      title: meta['title'] ?? fallback.title,
      description: meta['description'] ?? fallback.description,
    };
  }

  return {
    title: (freesail['title'] as string) ?? fallback.title,
    description: (freesail['description'] as string) ?? fallback.description,
  };
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

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Update a single catalog
// ---------------------------------------------------------------------------

function resolveCommonPath(srcPath: string): string | null {
  // Primary: common/ inside srcPath
  const direct = path.join(srcPath, 'common');
  if (fs.existsSync(direct)) return direct;
  // Fallback: shared common/ in parent directory (monorepo / shared-src layout)
  const sibling = path.join(path.dirname(srcPath), 'common');
  if (fs.existsSync(sibling)) return sibling;
  return null;
}

function updateCommonFiles(commonPath: string, catalogDir: string): number {
  let updatedCount = 0;
  for (const file of COMMON_FILES) {
    const source = path.join(catalogDir, file);
    if (!fs.existsSync(source)) {
      console.warn(`   ⚠  Bundled file not found (skipping): ${file}`);
      continue;
    }
    fs.writeFileSync(path.join(commonPath, file), fs.readFileSync(source, 'utf-8'));
    console.log(`   📄 common/${file}`);
    updatedCount++;
  }
  return updatedCount;
}

function updateCatalog(config: CatalogConfig, catalogDir: string, updatedCommonPaths: Set<string>): boolean {
  const commonPath = resolveCommonPath(config.srcPath);
  const schemasPath = path.join(config.srcPath, 'schemas');

  if (!commonPath) {
    console.error(`   ❌ Common directory not found (checked ${config.srcPath}/common and sibling)`);
    return false;
  }

  // Copy common files (skip if this common path was already updated by a sibling catalog)
  let updatedCount = 0;
  if (!updatedCommonPaths.has(commonPath)) {
    updatedCommonPaths.add(commonPath);
    updatedCount += updateCommonFiles(commonPath, catalogDir);
  } else {
    console.log(`   ℹ  Common files already updated for: ${commonPath}`);
  }

  // Copy schema files
  if (fs.existsSync(schemasPath)) {
    for (const file of SCHEMA_FILES) {
      const source = path.join(catalogDir, file);
      if (!fs.existsSync(source)) {
        console.warn(`   ⚠  Bundled schema not found (skipping): ${file}`);
        continue;
      }
      const dest = path.join(schemasPath, file);
      fs.writeFileSync(dest, fs.readFileSync(source, 'utf-8'));
      console.log(`   📄 src/schemas/${file}`);
      updatedCount++;
    }
  } else {
    console.warn(`   ⚠  Schemas directory not found, skipping schema update.`);
  }

  // Update README.md
  const meta = readCatalogMeta(config.packagePath, config.prefix);
  const readmePath = path.join(config.packagePath, 'README.md');
  fs.writeFileSync(readmePath, generateReadme(config.prefix, meta.title, meta.description));
  console.log(`   📄 README.md`);
  updatedCount++;

  console.log(`   ✅ Updated ${updatedCount} file(s) for ${config.name}`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  console.log('--- Freesail Update Catalog ---\n');

  const dirArg = parseDirArg();
  const baseDir = dirArg ? path.resolve(process.cwd(), dirArg) : CWD;
  if (dirArg) console.log(`Using directory: ${baseDir}\n`);

  const catalogs = discoverCatalogs(baseDir);

  if (catalogs.length === 0) {
    console.error(
      '❌ No catalogs found. Run this command from a catalog package directory\n' +
      '   (folder must be named {prefix}_catalog or contain src/{prefix}_catalog/),\n' +
      '   or specify a directory with --dir/-d <path>.',
    );
    process.exit(1);
  }

  const catalogDir = findCatalogDir();
  if (!fs.existsSync(catalogDir)) {
    console.error(
      '❌ Cannot find bundled catalog directory.\n' +
      '   Reinstall the freesail package.',
    );
    process.exit(1);
  }

  const names = catalogs.map((c) => c.name).join(', ');
  console.log(`Found catalog(s): ${names}\n`);
  console.log('⚠  This will replace the following files with the latest versions:');
  console.log('   Common files (src/common/):');
  for (const f of COMMON_FILES) {
    console.log(`     - ${f}`);
  }
  console.log('   Schema files (src/schemas/):');
  for (const f of SCHEMA_FILES) {
    console.log(`     - ${f}`);
  }
  console.log('   Other files:');
  console.log('     - README.md');
  console.log(
    '\n⚠  Any customizations you have made to these common catalog files will be lost.',
  );

  const proceed = await confirm('\nDo you want to continue? (Y/n): ');
  if (!proceed) {
    console.log('\nUpdate cancelled.');
    return;
  }

  console.log('');

  let allPassed = true;
  const updatedCommonPaths = new Set<string>();
  for (const config of catalogs) {
    console.log(`🔄 Updating: ${config.name}`);
    try {
      if (!updateCatalog(config, catalogDir, updatedCommonPaths)) allPassed = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   💥 ${config.name}: ${message}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\n💥 Update failed. Fix the errors above.');
    process.exit(1);
  }

  // Re-run prepare to regenerate resolved catalog JSON
  console.log('\n📦 Regenerating catalog JSON...\n');
  for (const config of catalogs) {
    try {
      prepareCatalog(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   💥 Prepare failed for ${config.name}: ${message}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\n💥 Some catalogs failed to prepare after update.');
    process.exit(1);
  }

  console.log('\n✅ Catalog update complete.');
}
