/**
 * @fileoverview freesail validate catalog
 *
 * Validates a Freesail catalog package for structural integrity and
 * mandatory protocol requirements.
 *
 * Checks performed:
 *   1. JSON schema is parseable and has a catalogId
 *   2. Components declared in JSON have matching exports in components.tsx
 *   3. Functions declared in JSON have matching exports in functions.ts
 *   4. Mandatory Freesail functions (formatString) are present in the
 *      catalog's runtime function map (index.ts)
 *
 * Run as a prebuild step via the generated package.json:
 *   "prebuild": "freesail validate catalog"
 *
 * Note: This command performs static analysis on the TypeScript source.
 * For a full runtime check (dynamic import of compiled output), use:
 *   npm run verify  (via tsx scripts/verify-catalogs.ts)
 */

import fs from 'fs';
import path from 'path';

const CWD = process.cwd();

/**
 * Functions that are part of the A2UI protocol and cannot be removed.
 * `formatString` is documented in the system prompt and required for
 * template rendering in every surface.
 */
const MANDATORY_FUNCTIONS = ['formatString'];

interface CatalogConfig {
  name: string;
  packagePath: string;
  srcPath: string;
  jsonFile: string;
  prefix: string;
}

function getCatalogConfig(dir: string, nameOverride?: string): CatalogConfig | null {
  const folderName = nameOverride ?? path.basename(dir);
  const match = folderName.match(/^(.+)_catalog(?:_(v\d+))?$/);
  if (!match) return null;

  const prefix = match[1] as string;

  // Probe for the JSON file — must be in src/
  const srcDir = path.join(dir, 'src');
  if (!fs.existsSync(srcDir)) return null;

  const candidates = [
    `${prefix}_catalog.json`,
    `${prefix}_catalog_v1.json`,
  ];

  let jsonFile: string | null = null;
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(srcDir, candidate))) {
      jsonFile = candidate;
      break;
    }
  }

  if (!jsonFile) return null;
  if (!fs.existsSync(path.join(srcDir, 'index.ts'))) return null;

  return { name: folderName, packagePath: dir, srcPath: srcDir, jsonFile, prefix };
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
      const sub = getCatalogConfig(path.join(CWD, 'src', entry.name));
      if (sub) catalogs.push(sub);
    }
    if (catalogs.length > 0) return catalogs;
  }

  return [];
}

/**
 * Extract exported names from a TypeScript source file using a simple regex.
 * Matches: export function Foo, export const Foo, export class Foo, export { Foo }
 */
function extractExports(source: string): Set<string> {
  const names = new Set<string>();

  // export function/const/class/type Name
  for (const m of source.matchAll(/export\s+(?:function|const|class|type|enum)\s+(\w+)/g)) {
    if (m[1]) names.add(m[1]);
  }

  // export { Name, Name as Alias }
  for (const block of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    if (!block[1]) continue;
    for (const entry of block[1].split(',')) {
      const asMatch = entry.match(/(\w+)\s+as\s+(\w+)/);
      if (asMatch?.[2]) {
        names.add(asMatch[2]);
      } else {
        const name = entry.trim().match(/^\w+$/)?.[0];
        if (name) names.add(name);
      }
    }
  }

  return names;
}

/**
 * Check whether the catalog's merged function map includes each mandatory function.
 *
 * Strategy (static analysis, no dynamic import):
 *   - If index.ts spreads `...commonFunctions` → all common functions present ✓
 *   - Otherwise check if each mandatory function is exported from functions.ts or index.ts
 */
function checkMandatoryFunctions(srcPath: string, isOk: boolean): boolean {
  let ok = isOk;

  const indexPath = path.join(srcPath, 'index.ts');
  const functionsPath = path.join(srcPath, 'functions.ts');

  const indexSource = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';
  const functionsSource = fs.existsSync(functionsPath) ? fs.readFileSync(functionsPath, 'utf-8') : '';

  const hasCommonSpread = /\.\.\.\s*commonFunctions/.test(indexSource);
  const functionExports = extractExports(functionsSource);
  const indexExports = extractExports(indexSource);

  for (const fn of MANDATORY_FUNCTIONS) {
    const presentViaSpread = hasCommonSpread;
    const presentExplicitly = functionExports.has(fn) || indexExports.has(fn);

    if (!presentViaSpread && !presentExplicitly) {
      console.error(
        `   ❌ Mandatory Freesail function removed: ${fn}. Required by the system prompt and cannot be omitted.`
      );
      ok = false;
    }
  }

  return ok;
}

function validateCatalog(config: CatalogConfig): boolean {
  console.log(`🔍 Validating: ${config.name}`);
  let isOk = true;

  // 1. Parse catalog JSON
  const jsonPath = path.join(config.srcPath, config.jsonFile);
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    console.error(`   ❌ Cannot parse JSON: ${config.jsonFile}`);
    return false;
  }

  const catalogId = schema['catalogId'] ?? schema['$id'] ?? schema['id'];
  if (!catalogId) {
    console.error(`   ❌ Missing catalogId in ${config.jsonFile}`);
    isOk = false;
  }

  if (!schema['title']) {
    console.error(`   ❌ Missing title in ${config.jsonFile} — required by the gateway system prompt`);
    isOk = false;
  }

  if (catalogId && String(catalogId).includes('.local/')) {
    console.warn(`   ⚠  Catalog ID is a placeholder: ${catalogId}`);
    console.warn(`      Update $id and catalogId in ${config.jsonFile} before publishing.`);
  }

  // 2. Check components: JSON-declared components have exports in components.tsx
  const jsonComponents = Object.keys((schema['components'] as Record<string, unknown>) ?? {});

  // Check each component has allOf or properties (required for gateway converter)
  const components = (schema['components'] as Record<string, unknown>) ?? {};
  for (const [compName, compDef] of Object.entries(components)) {
    const def = compDef as Record<string, unknown>;
    const hasAllOf = Array.isArray(def['allOf']) && (def['allOf'] as unknown[]).length > 0;
    const hasProperties = def['properties'] && typeof def['properties'] === 'object';
    if (!hasAllOf && !hasProperties) {
      console.error(
        `   ❌ Component '${compName}' has neither allOf nor properties — gateway converter cannot build an MCP tool from it`
      );
      isOk = false;
    } else {
      // Warn if no description is found anywhere in the component definition
      const inlineSchemas = hasAllOf
        ? (def['allOf'] as Record<string, unknown>[]).filter(s => !s['$ref'])
        : [];
      const hasDescription =
        def['description'] ||
        inlineSchemas.some(s => s['description']);
      if (!hasDescription) {
        console.warn(
          `   ⚠  Component '${compName}' has no description — agent will have less context for this component`
        );
      }
    }
  }

  const componentsPath = path.join(config.srcPath, 'components.tsx');
  if (jsonComponents.length > 0) {
    if (!fs.existsSync(componentsPath)) {
      console.error(`   ❌ Missing components.tsx`);
      isOk = false;
    } else {
      const componentSource = fs.readFileSync(componentsPath, 'utf-8');
      const exported = extractExports(componentSource);
      // Also scan the component map object literal for key names
      const mapKeys = new Set<string>();
      for (const m of componentSource.matchAll(/['"]?(\w+)['"]?\s*:/g)) {
        if (m[1] && /^[A-Z]/.test(m[1])) mapKeys.add(m[1]);
      }
      const allKnown = new Set([...exported, ...mapKeys]);

      const missing = jsonComponents.filter((c) => !allKnown.has(c));
      if (missing.length > 0) {
        console.error(`   ❌ Unimplemented components: ${missing.join(', ')}`);
        isOk = false;
      }
    }
  }

  // 3. Check functions: JSON-declared functions have exports (excluding common functions)
  const jsonFunctions: string[] = Array.isArray(schema['functions'])
    ? (schema['functions'] as Array<{ name: string }>).map((f) => f.name)
    : [];

  const functionsPath = path.join(config.srcPath, 'functions.ts');
  const indexPath = path.join(config.srcPath, 'index.ts');
  const indexSource = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';
  const hasCommonSpread = /\.\.\.\s*commonFunctions/.test(indexSource);

  if (jsonFunctions.length > 0 && !hasCommonSpread) {
    if (!fs.existsSync(functionsPath)) {
      console.error(`   ❌ Missing functions.ts`);
      isOk = false;
    } else {
      const functionsSource = fs.readFileSync(functionsPath, 'utf-8');
      const exported = extractExports(functionsSource);
      const missing = jsonFunctions.filter((f) => !exported.has(f));
      if (missing.length > 0) {
        console.error(`   ❌ Unimplemented functions: ${missing.join(', ')}`);
        isOk = false;
      }
    }
  }

  // 4. Mandatory functions check (always runs, independent of JSON declarations)
  isOk = checkMandatoryFunctions(config.srcPath, isOk);

  if (isOk) {
    console.log(
      `   ✅ Validated ${jsonComponents.length} component(s) and ${jsonFunctions.length} function(s).`
    );
  }

  return isOk;
}

export function run(): void {
  console.log('--- Freesail Catalog Validate ---');
  const catalogs = discoverCatalogs();

  if (catalogs.length === 0) {
    console.error(
      '❌ No catalogs found. Run this command from a catalog package directory\n' +
        '   (folder must be named {prefix}_catalog or contain src/{prefix}_catalog.json).'
    );
    process.exit(1);
  }

  let allPassed = true;
  for (const config of catalogs) {
    if (!validateCatalog(config)) allPassed = false;
  }

  if (!allPassed) {
    console.error('\n💥 Validation failed. Fix the errors above before building.');
    process.exit(1);
  }

  console.log('\n✨ All catalogs validated successfully.');
}
