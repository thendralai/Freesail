/**
 * @fileoverview freesail prepare catalog
 *
 * Generates a resolved catalog JSON by merging common and custom schema files.
 *
 * Convention-based file discovery:
 *   common/common_components.json  → shared component schemas + $defs
 *   common/common_functions.json   → shared function schemas (object-keyed)
 *   components.json               → custom component schemas (optional)
 *   functions.json                → custom function schemas (optional)
 *
 * Catalog metadata is read from package.json:
 *   { "freesail": { "catalogId": "...", "title": "...", "description": "..." } }
 * or for multi-catalog packages:
 *   { "freesail": { "catalogs": { "{prefix}": { ... } } } }
 *
 * Output: {prefix}_catalog.json written to the catalog's source directory.
 */

import fs from 'fs';
import path from 'path';

// When running as an npm lifecycle script (e.g. prebuild), npm sets
// process.cwd() to the package root — INIT_CWD would incorrectly point
// to the workspace root during workspace builds.
const CWD = process.env['npm_lifecycle_event']
  ? process.cwd()
  : (process.env['INIT_CWD'] || process.cwd());

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogConfig {
  name: string;
  packagePath: string;
  srcPath: string;
  prefix: string;
}

interface CatalogMeta {
  catalogId: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Discovery (same pattern as catalog-validate)
// ---------------------------------------------------------------------------

function getCatalogConfig(dir: string, nameOverride?: string): CatalogConfig | null {
  const folderName = nameOverride ?? path.basename(dir);
  const match = folderName.match(/^(.+)_catalog(?:_(v\d+))?$/);
  if (!match) return null;

  const prefix = match[1] as string;

  // Check for src/ first (standalone), then dir itself (monorepo sub-catalog)
  for (const probe of [path.join(dir, 'src'), dir]) {
    if (!fs.existsSync(probe)) continue;
    if (!fs.existsSync(path.join(probe, 'index.ts'))) continue;
    return { name: folderName, packagePath: dir, srcPath: probe, prefix };
  }

  return null;
}

function discoverCatalogs(): CatalogConfig[] {
  // 1. CWD is the catalog package root (named {prefix}_catalog)
  const config = getCatalogConfig(CWD);
  if (config) return [config];

  // 2. CWD contains a src/ with catalog files (package name = {prefix}_catalog)
  const fromSrc = getCatalogConfig(CWD, path.basename(CWD));
  if (fromSrc) return [fromSrc];

  // 3. Scan src/ subdirectories (monorepo: multiple catalogs in one package)
  const srcPath = path.join(CWD, 'src');
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
// Common file location
// ---------------------------------------------------------------------------

/**
 * Find the common/ directory relative to the catalog source path.
 * Probes: {srcPath}/common/ (standalone) then {srcPath}/../common/ (monorepo).
 */
function findCommonDir(srcPath: string): string | null {
  // Standalone: src/common/
  const standalone = path.join(srcPath, 'common');
  if (fs.existsSync(standalone)) {
    return standalone;
  }

  // Monorepo: src/standard_catalog/../common/ → src/common/
  const monorepo = path.join(srcPath, '..', 'common');
  if (fs.existsSync(monorepo)) {
    return monorepo;
  }

  return null;
}

// ---------------------------------------------------------------------------
// $ref rewriting
// ---------------------------------------------------------------------------

/**
 * Recursively rewrite $ref values in a JSON structure.
 * Rewrites refs to common files (common_types.json, common_components.json)
 * to internal $defs references, since those types are inlined into the output catalog.
 * e.g. `./common_types.json#/$defs/Foo` → `#/$defs/Foo`
 */
function rewriteRefs(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => rewriteRefs(item));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      // Rewrite external file refs to internal refs (types are inlined in output):
      //   ./common_types.json, ../common/common_types.json, ./common/common_types.json → #/...
      //   catalog.json (self-reference) → #/...
      result[key] = value.replace(/^(?:(?:\.\.\/common\/|\.\/common\/|\.\/)?common(?:_types|_components)|catalog)\.json(#.*)$/, '$1');
    } else {
      result[key] = rewriteRefs(value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Catalog ID derivation from package name
// ---------------------------------------------------------------------------

/**
 * Derive a .local domain from a scoped package name.
 * @scope/name → scope.local
 * Falls back to freesail.local if unscoped.
 */
function domainFromPackageName(packageName: string): string {
  const match = packageName.match(/^@([^/]+)\//);
  return match ? `${match[1]}.local` : 'freesail.local';
}

// ---------------------------------------------------------------------------
// Metadata from package.json
// ---------------------------------------------------------------------------

function readCatalogMeta(packagePath: string, prefix: string): CatalogMeta {
  const fallback: CatalogMeta = {
    catalogId: `https://freesail.local/catalogs/${prefix}_catalog_v1.json`,
    title: `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} Catalog`,
    description: `A Freesail catalog for ${prefix}`,
  };

  // Walk up to find the nearest package.json
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

  // Derive catalogId from package name org scope
  const pkgName = (pkg['name'] as string) ?? '';
  const domain = domainFromPackageName(pkgName);
  const derivedCatalogId = `https://${domain}/catalogs/${prefix}_catalog_v1.json`;

  const freesail = pkg['freesail'] as Record<string, unknown> | undefined;
  if (!freesail) {
    return { ...fallback, catalogId: derivedCatalogId };
  }

  // Multi-catalog: freesail.catalogs.{prefix}
  const catalogs = freesail['catalogs'] as Record<string, Record<string, string>> | undefined;
  if (catalogs?.[prefix]) {
    const meta = catalogs[prefix]!;
    return {
      catalogId: meta['catalogId'] ?? derivedCatalogId,
      title: meta['title'] ?? fallback.title,
      description: meta['description'] ?? fallback.description,
    };
  }

  // Single catalog: optional overrides from freesail block
  return {
    catalogId: (freesail['catalogId'] as string) ?? derivedCatalogId,
    title: (freesail['title'] as string) ?? fallback.title,
    description: (freesail['description'] as string) ?? fallback.description,
  };
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ Failed to parse: ${filePath}\n      ${message}`);
    throw new Error(`Invalid JSON in ${path.basename(filePath)}`);
  }
}

// ---------------------------------------------------------------------------
// Prepare a single catalog
// ---------------------------------------------------------------------------

export function prepareCatalog(config: CatalogConfig): boolean {
  console.log(`📦 Preparing: ${config.name}`);

  // 1. Read catalog metadata
  const meta = readCatalogMeta(config.packagePath, config.prefix);

  // 2. Read common schemas
  let rewrittenComponents: Record<string, unknown> = {};
  let rewrittenFunctions: Record<string, unknown> = {};
  let rewrittenDefs: Record<string, unknown> = {};

  const commonDir = findCommonDir(config.srcPath);
  if (commonDir) {
    const commonComponentsJson = readJsonSafe(path.join(commonDir, 'common_components.json'));
    const commonFunctionsJson = readJsonSafe(path.join(commonDir, 'common_functions.json'));
    const commonTypesJson = readJsonSafe(path.join(commonDir, 'common_types.json'));

    const commonComponents = (commonComponentsJson?.['components'] ?? {}) as Record<string, unknown>;
    const commonFunctions = (commonFunctionsJson?.['functions'] ?? {}) as Record<string, unknown>;
    const commonComponentDefs = (commonComponentsJson?.['$defs'] ?? {}) as Record<string, unknown>;
    const commonTypeDefs = (commonTypesJson?.['$defs'] ?? {}) as Record<string, unknown>;

    // Merge: common_types.$defs first (lowest precedence), then common_components.$defs
    const commonDefs: Record<string, unknown> = { ...commonTypeDefs, ...commonComponentDefs };

    rewrittenComponents = rewriteRefs(commonComponents) as Record<string, unknown>;
    rewrittenFunctions = rewriteRefs(commonFunctions) as Record<string, unknown>;
    rewrittenDefs = rewriteRefs(commonDefs) as Record<string, unknown>;
  }

  // 3. Read custom schemas (optional)
  const customComponentsJson = readJsonSafe(path.join(config.srcPath, 'components.json'));
  const customFunctionsJson = readJsonSafe(path.join(config.srcPath, 'functions.json'));

  const customComponents = rewriteRefs((customComponentsJson?.['components'] ?? {})) as Record<string, unknown>;
  const customFunctions = rewriteRefs((customFunctionsJson?.['functions'] ?? {})) as Record<string, unknown>;
  const customDefs = rewriteRefs((customComponentsJson?.['$defs'] ?? {})) as Record<string, unknown>;

  // 4. Set $schema to canonical URL
  const CATALOG_SCHEMA_URL = 'https://freesail.dev/schemas/catalog-schema-v1.json';

  // 5. Merge everything (catalog's own entries first, then common; custom overrides on collision)
  const mergedComponents: Record<string, unknown> = { ...customComponents };
  for (const [k, v] of Object.entries(rewrittenComponents)) {
    if (!(k in mergedComponents)) mergedComponents[k] = v;
  }
  const mergedFunctions: Record<string, unknown> = { ...customFunctions };
  for (const [k, v] of Object.entries(rewrittenFunctions)) {
    if (!(k in mergedFunctions)) mergedFunctions[k] = v;
  }
  const mergedDefs: Record<string, unknown> = { ...customDefs };
  for (const [k, v] of Object.entries(rewrittenDefs)) {
    if (!(k in mergedDefs)) mergedDefs[k] = v;
  }

  // 6. Apply exclusions from catalog.exclude.json (if present)
  const excludeJson = readJsonSafe(path.join(config.srcPath, 'catalog.exclude.json'));
  if (excludeJson) {
    const excludeComponents = Array.isArray(excludeJson['components']) ? excludeJson['components'] as string[] : [];
    const excludeFunctions = Array.isArray(excludeJson['functions']) ? excludeJson['functions'] as string[] : [];

    let excludedCount = 0;
    for (const name of excludeComponents) {
      if (name in mergedComponents) {
        delete mergedComponents[name];
        excludedCount++;
      } else {
        console.warn(`   ⚠  Exclusion target not found in components: ${name}`);
      }
    }
    for (const name of excludeFunctions) {
      if (name in mergedFunctions) {
        delete mergedFunctions[name];
        excludedCount++;
      } else {
        console.warn(`   ⚠  Exclusion target not found in functions: ${name}`);
      }
    }
    if (excludedCount > 0) {
      console.log(`   🚫 Excluded ${excludedCount} item(s) via catalog.exclude.json`);
    }
  }

  // 7. Warn if mandatory functions are missing
  const MANDATORY_FUNCTIONS = ['formatString'];
  for (const fn of MANDATORY_FUNCTIONS) {
    if (!(fn in mergedFunctions)) {
      console.warn(`   ⚠  Mandatory function "${fn}" is missing from the catalog.`);
      console.warn(`      This function is required for efficient functioning of Freesail components. Do not remove.`);
    }
  }

  // 8. Generate anyComponent and anyFunction discriminated unions
  const anyComponent: Record<string, unknown> = {
    oneOf: Object.keys(mergedComponents).map(name => ({ $ref: `#/components/${name}` })),
    discriminator: { propertyName: 'component' },
  };
  const finalDefs: Record<string, unknown> = { ...mergedDefs, anyComponent };
  if (Object.keys(mergedFunctions).length > 0) {
    finalDefs['anyFunction'] = {
      oneOf: Object.keys(mergedFunctions).map(name => ({ $ref: `#/functions/${name}` })),
    };
  }

  const catalog: Record<string, unknown> = {};
  catalog['$schema'] = CATALOG_SCHEMA_URL;
  catalog['$id'] = meta.catalogId;
  catalog['title'] = meta.title;
  catalog['description'] = meta.description;
  catalog['catalogId'] = meta.catalogId;
  catalog['components'] = mergedComponents;

  if (Object.keys(mergedFunctions).length > 0) {
    catalog['functions'] = mergedFunctions;
  }

  catalog['$defs'] = finalDefs;

  // 8. Write output
  const outputFile = `${config.prefix}_catalog.json`;
  const outputPath = path.join(config.srcPath, outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + '\n');

  const componentCount = Object.keys(mergedComponents).length;
  const functionCount = Object.keys(mergedFunctions).length;
  console.log(`   ✅ Prepared ${componentCount} component(s) and ${functionCount} function(s) → ${outputFile}`);

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function run(): void {
  console.log('--- Freesail Prepare Catalog ---');
  const catalogs = discoverCatalogs();

  if (catalogs.length === 0) {
    console.error(
      '❌ No catalogs found. Run this command from a catalog package directory\n' +
      '   (folder must be named {prefix}_catalog or contain src/{prefix}_catalog/).'
    );
    process.exit(1);
  }

  let allPassed = true;
  for (const config of catalogs) {
    try {
      if (!prepareCatalog(config)) allPassed = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   💥 ${config.name}: ${message}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\n💥 Prepare failed. Fix the errors above.');
    process.exit(1);
  }

  console.log('\n✅ All catalogs prepared successfully.');
}
