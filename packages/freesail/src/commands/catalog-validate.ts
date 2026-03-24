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
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
// process.cwd() to the package root — INIT_CWD would incorrectly point
// to the workspace root during workspace builds.
// For direct CLI invocations (npx freesail …), INIT_CWD preserves the
// user's shell CWD which is what we want.
const CWD = process.env['npm_lifecycle_event']
  ? process.cwd()
  : (process.env['INIT_CWD'] || process.cwd());

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

  const candidates = [
    `${prefix}_catalog.json`,
    `${prefix}_catalog_v1.json`,
  ];

  // Probe for the JSON file — check dir/src/ first (standalone catalog),
  // then dir/ itself (monorepo sub-catalog where sources live directly in the folder).
  let srcDir: string | null = null;
  let jsonFile: string | null = null;

  for (const probe of [path.join(dir, 'src'), dir]) {
    if (!fs.existsSync(probe)) continue;
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(probe, candidate))) {
        srcDir = probe;
        jsonFile = candidate;
        break;
      }
    }
    if (jsonFile) break;
  }

  if (!srcDir || !jsonFile) return null;
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

// ---------------------------------------------------------------------------
// $ref validation helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all $ref values from a JSON structure, recording the
 * JSON-Pointer-style path to each occurrence.
 */
function collectRefs(
  node: unknown,
  path: string,
  results: Array<{ ref: string; path: string }>
): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectRefs(item, `${path}/${i}`, results));
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      results.push({ ref: value, path: path || '/' });
    }
    collectRefs(value, path ? `${path}/${key}` : key, results);
  }
}

/**
 * Resolve a JSON Pointer fragment (the part after `#`) against the catalog root.
 * Returns true if the target node exists, false otherwise.
 * Implements RFC 6901 token unescaping (~1 → /, ~0 → ~).
 */
function resolveJsonPointer(catalog: Record<string, unknown>, pointer: string): boolean {
  if (pointer === '' || pointer === '/') return true;
  const tokens = pointer.replace(/^\//, '').split('/').map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node: unknown = catalog;
  for (const token of tokens) {
    if (node === null || typeof node !== 'object') return false;
    node = (node as Record<string, unknown>)[token];
    if (node === undefined) return false;
  }
  return true;
}

/**
 * Walk all $refs in the catalog, resolve internal ones, warn on external ones.
 * Returns true if no broken refs were found.
 */
function validateRefs(catalog: Record<string, unknown>): boolean {
  const found: Array<{ ref: string; path: string }> = [];
  collectRefs(catalog, '', found);

  if (found.length === 0) {
    console.log(`   ✅ $ref check: no $refs found.`);
    return true;
  }

  const broken: Array<{ ref: string; path: string }> = [];
  const warnings: Array<{ ref: string; path: string }> = [];
  let validCount = 0;

  for (const { ref, path } of found) {
    if (ref.startsWith('#')) {
      if (resolveJsonPointer(catalog, ref.slice(1))) {
        validCount++;
      } else {
        broken.push({ ref, path });
      }
    } else {
      warnings.push({ ref, path });
      validCount++;
    }
  }

  for (const { ref, path } of warnings) {
    console.warn(`   ⚠  External $ref not inlined: "${ref}" at ${path}`);
    console.warn(`      Run 'freesail prepare catalog' to inline external refs.`);
  }
  for (const { ref, path } of broken) {
    console.error(`   ❌ Broken $ref: "${ref}" at ${path} — target not found in catalog`);
  }

  if (broken.length > 0) {
    console.error(`   ❌ $ref check: ${validCount} valid, ${broken.length} broken (${found.length} total)`);
    return false;
  }
  if (warnings.length > 0) {
    console.log(`   ✅ $ref check: ${validCount} valid, ${warnings.length} external warning(s) (${found.length} total)`);
  } else {
    console.log(`   ✅ $ref check: all ${validCount} refs resolve correctly`);
  }
  return true;
}

// ---------------------------------------------------------------------------

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
 *   - If index.ts or functions.ts imports/re-exports commonFunctions → all common functions present ✓
 *   - Otherwise check if each mandatory function is exported from functions.ts or index.ts
 */
function checkMandatoryFunctions(srcPath: string, isOk: boolean): boolean {
  let ok = isOk;

  const indexPath = path.join(srcPath, 'index.ts');
  const functionsPath = path.join(srcPath, 'functions.ts');

  const indexSource = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : '';
  const functionsSource = fs.existsSync(functionsPath) ? fs.readFileSync(functionsPath, 'utf-8') : '';

  const functionExports = extractExports(functionsSource);
  const indexExports = extractExports(indexSource);
  const allKnown = new Set([...functionExports, ...indexExports]);

  // If commonFunctions is spread, resolve actual exports from CommonFunctions.ts
  const combined = indexSource + '\n' + functionsSource;
  if (/commonFunctions/.test(combined)) {
    for (const probe of [
      path.join(srcPath, 'CommonFunctions.ts'),
      path.join(srcPath, 'common', 'CommonFunctions.ts'),
      path.join(srcPath, '..', 'common', 'CommonFunctions.ts'),
    ]) {
      if (fs.existsSync(probe)) {
        const commonSource = fs.readFileSync(probe, 'utf-8');
        for (const name of extractExports(commonSource)) {
          allKnown.add(name);
        }
        break;
      }
    }
  }

  for (const fn of MANDATORY_FUNCTIONS) {
    if (!allKnown.has(fn)) {
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

  // 1.5 Check $schema field
  const CATALOG_SCHEMA_URL = 'https://freesail.dev/schemas/catalog-schema-v1.json';
  if (schema['$schema'] !== CATALOG_SCHEMA_URL) {
    console.error(`   ❌ $schema must be "${CATALOG_SCHEMA_URL}" but found: ${JSON.stringify(schema['$schema'])}`);
    isOk = false;
  }

  // 1.6 Strict JSON Schema validation against catalog-schema.json
  try {
    const schemaPath = path.join(__dirname, 'catalog', 'catalog-schema.json');
    if (fs.existsSync(schemaPath)) {
      const metaSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      // Remove $schema to prevent Ajv from trying to fetch or look up external URI
      delete metaSchema.$schema;
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(metaSchema);
      const valid = validate(schema);
      if (!valid) {
        console.error(`   ❌ Catalog JSON fails schema validation (${config.jsonFile}):`);
         for (const err of validate.errors || []) {
            const field = err.instancePath ? err.instancePath.replace(/^\//, '') : 'root';
            console.error(`      - ${field}: ${err.message}`);
         }
        isOk = false;
      } else {
        console.log(`   ✅ Passed strict schema validation.`);
      }
    } else {
      console.warn(`   ⚠  Could not find catalog-schema.json for strict validation at ${schemaPath}`);
    }
  } catch (err) {
    console.error(`   ⚠  Error during strict schema validation setup:`, err);
  }

  // 2.5 $ref resolution check
  try {
    if (!validateRefs(schema)) {
      isOk = false;
    }
  } catch (err) {
    console.warn(`   ⚠  Error during $ref check:`, err);
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
      // If commonComponents is spread into the map, resolve its actual exports
      // from CommonComponents.tsx (not the JSON schema — the JSON can be edited
      // without updating the implementation, so we trust the source file).
      if (/commonComponents/.test(componentSource)) {
        for (const probe of [
          path.join(config.srcPath, 'CommonComponents.tsx'),
          path.join(config.srcPath, 'common', 'CommonComponents.tsx'),
          path.join(config.srcPath, '..', 'common', 'CommonComponents.tsx'),
        ]) {
          if (fs.existsSync(probe)) {
            const commonSource = fs.readFileSync(probe, 'utf-8');
            const commonExports = extractExports(commonSource);
            for (const name of commonExports) {
              allKnown.add(name);
            }
            // Also scan the commonComponents map object for key names
            for (const m of commonSource.matchAll(/['"]?(\w+)['"]?\s*:/g)) {
              if (m[1] && /^[A-Z]/.test(m[1])) allKnown.add(m[1]);
            }
            break;
          }
        }
      }
      const missing = jsonComponents.filter((c) => !allKnown.has(c));
      if (missing.length > 0) {
        console.error(`   ❌ Unimplemented components: ${missing.join(', ')}`);
        isOk = false;
      }
    }
  }

  // 3. Check functions: JSON-declared functions have exports (excluding common functions)
  const rawFunctions = schema['functions'];
  const jsonFunctions: string[] = Array.isArray(rawFunctions)
    ? (rawFunctions as Array<{ name: string }>).map((f) => f.name)
    : rawFunctions && typeof rawFunctions === 'object'
      ? Object.keys(rawFunctions)
      : [];

  const functionsPath = path.join(config.srcPath, 'functions.ts');

  if (jsonFunctions.length > 0) {
    if (!fs.existsSync(functionsPath)) {
      console.error(`   ❌ Missing functions.ts`);
      isOk = false;
    } else {
      const fnSource = fs.readFileSync(functionsPath, 'utf-8');
      const exported = extractExports(fnSource);
      // Also scan the function map object literal for key names
      const mapKeys = new Set<string>();
      for (const m of fnSource.matchAll(/['"]?(\w+)['"]?\s*:/g)) {
        if (m[1] && /^[a-z]/.test(m[1])) mapKeys.add(m[1]);
      }
      const allKnown = new Set([...exported, ...mapKeys]);
      // If commonFunctions is spread into the map, resolve its actual exports
      // from CommonFunctions.ts (not the JSON schema).
      if (/commonFunctions/.test(fnSource)) {
        for (const probe of [
          path.join(config.srcPath, 'CommonFunctions.ts'),
          path.join(config.srcPath, 'common', 'CommonFunctions.ts'),
          path.join(config.srcPath, '..', 'common', 'CommonFunctions.ts'),
        ]) {
          if (fs.existsSync(probe)) {
            const commonSource = fs.readFileSync(probe, 'utf-8');
            const commonExports = extractExports(commonSource);
            for (const name of commonExports) {
              allKnown.add(name);
            }
            for (const m of commonSource.matchAll(/['"]?(\w+)['"]?\s*:/g)) {
              if (m[1] && /^[a-z]/.test(m[1])) allKnown.add(m[1]);
            }
            break;
          }
        }
      }
      const missing = jsonFunctions.filter((f) => !allKnown.has(f));
      if (missing.length > 0) {
        console.error(`   ❌ Unimplemented functions: ${missing.join(', ')}`);
        isOk = false;
      }
    }
  }

  // 4. Mandatory functions check (always runs, independent of JSON declarations)
  isOk = checkMandatoryFunctions(config.srcPath, isOk);

  // 5. Warn if mandatory functions are missing from the catalog JSON
  for (const fn of MANDATORY_FUNCTIONS) {
    if (!jsonFunctions.includes(fn)) {
      console.warn(`   ⚠  Mandatory function "${fn}" is missing from the catalog.`);
      console.warn(`      This function is required for efficient functioning of Freesail components. Do not remove.`);
    }
  }

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
    // Check if decomposed source files exist (user needs to run prepare first)
    const srcPath = path.join(CWD, 'src');
    const hasCommonDir =
      fs.existsSync(path.join(srcPath, 'common')) ||
      fs.existsSync(path.join(CWD, 'common'));
    const hasComponentFiles = fs.existsSync(srcPath) &&
      fs.readdirSync(srcPath).some(f => f === 'components.json');

    if (hasCommonDir || hasComponentFiles) {
      console.error(
        '❌ No resolved catalog JSON found, but decomposed source files detected.\n' +
          '   Run `freesail prepare catalog` first to generate the catalog JSON.'
      );
    } else {
      console.error(
        '❌ No catalogs found. Run this command from a catalog package directory\n' +
          '   (folder must be named {prefix}_catalog or contain src/{prefix}_catalog.json).'
      );
    }
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
