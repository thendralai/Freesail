import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CWD = process.cwd();

interface CatalogConfig {
    name: string;
    packagePath: string;
    jsonFile: string;
    entryFile: string;
    idExportName: string;
    componentsExportName: string;
    functionsExportName: string;
}

function getCatalogConfig(dir: string, nameOverride?: string): CatalogConfig | null {
    const folderName = nameOverride || path.basename(dir);
    const match = folderName.match(/^(.+)_catalog(?:_(v\d+))?$/);
    if (!match) return null;

    const prefix = match[1];
    const version = match[2] || '';

    const idExportName = `${prefix.toUpperCase()}_CATALOG_ID`;
    const componentsExportName = `${prefix}CatalogComponents`;
    const functionsExportName = `${prefix}CatalogFunctions`;

    // Probe for the JSON file
    let jsonFileName = `${prefix}_catalog${version ? '_' + version : ''}.json`;
    if (!fs.existsSync(path.join(dir, jsonFileName))) {
        const fallback = version ? `${prefix}_catalog.json` : `${prefix}_catalog_v1.json`;
        if (fs.existsSync(path.join(dir, fallback))) {
            jsonFileName = fallback;
        }
    }

    if (!fs.existsSync(path.join(dir, jsonFileName))) return null;
    if (!fs.existsSync(path.join(dir, 'index.ts'))) return null;

    return {
        name: folderName,
        packagePath: dir,
        jsonFile: jsonFileName,
        entryFile: 'index.ts',
        idExportName,
        componentsExportName,
        functionsExportName
    };
}

/**
 * Recursively discovers catalogs in tiered folders.
 */
function discoverCatalogs(): CatalogConfig[] {
    // 1. If the current directory is a catalog, verify ONLY it.
    const currentConfig = getCatalogConfig(CWD);
    if (currentConfig) return [currentConfig];

    const srcPath = path.join(CWD, 'src');
    if (fs.existsSync(srcPath)) {
        // 2. Check if the 'src' folder itself contains a catalog (e.g. package is named something_catalog)
        const srcConfig = getCatalogConfig(srcPath, path.basename(CWD));
        if (srcConfig) return [srcConfig];

        // 3. Scan subdirectories of 'src' for multiple catalogs (e.g. monorepo packages)
        const catalogs: CatalogConfig[] = [];
        const entries = fs.readdirSync(srcPath, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const config = getCatalogConfig(path.join(srcPath, entry.name));
            if (config) catalogs.push(config);
        }
        return catalogs;
    }

    return [];
}

async function verifyCatalog(config: CatalogConfig): Promise<boolean> {
    console.log(`🔍 Verifying: ${config.name}`);
    let isOk = true;

    // 1. Read and Parse JSON Schema
    const jsonPath = path.join(config.packagePath, config.jsonFile);
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
        console.error(`   ❌ File Error: Could not read JSON at ${config.jsonFile}`);
        return false;
    }

    const jsonId = schema.id || schema.$id || schema.catalogId;
    const jsonComponents = Object.keys(schema.components || {});
    // Functions are typically an array in the catalog schema
    const jsonFunctions = Array.isArray(schema.functions) 
        ? schema.functions.map((f: any) => f.name) 
        : Object.keys(schema.functions || {});

    // 2. Dynamic Import of TypeScript Source
    const entryPath = path.join(config.packagePath, config.entryFile);
    try {
        const module = await import(`file://${entryPath}`);

        // 3. Verify ID
        const exportedId = module[config.idExportName];
        if (exportedId !== jsonId) {
            console.error(`   ❌ ID Mismatch: JSON(${jsonId}) vs Code(${exportedId})`);
            isOk = false;
        }

        // 4. Verify Component Implementations
        const exportedComponents = module[config.componentsExportName];
        if (!exportedComponents) {
            console.error(`   ❌ Missing Export: ${config.componentsExportName} not found in index.ts`);
            isOk = false;
        } else {
            const implementedKeys = Object.keys(exportedComponents);
            const missing = jsonComponents.filter(c => !implementedKeys.includes(c));

            if (missing.length > 0) {
                console.error(`   ❌ Unimplemented components: ${missing.join(', ')}`);
                isOk = false;
            }
        }

        // 5. Verify Function Implementations
        if (jsonFunctions.length > 0) {
            // Check for direct export or presence in the main Catalog object
            const catalogObjectName = config.name.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
            const catalogObject = module[catalogObjectName];
            
            let exportedFunctions = module[config.functionsExportName];
            if (!exportedFunctions && catalogObject) {
                exportedFunctions = catalogObject.functions;
            }

            if (!exportedFunctions) {
                console.error(`   ❌ Missing Implementation: ${config.functionsExportName} not provided.`);
                isOk = false;
            } else {
                const implementedFuncs = Object.keys(exportedFunctions);
                const missingFuncs = jsonFunctions.filter((f: string) => !implementedFuncs.includes(f));

                if (missingFuncs.length > 0) {
                    console.error(`   ❌ Unimplemented functions: ${missingFuncs.join(', ')}`);
                    isOk = false;
                }
            }
        }

        if (isOk) {
            console.log(`   ✅ Validated ${jsonComponents.length} components and ${jsonFunctions.length} functions.`);
        }

    } catch (error) {
        console.error(`   ❌ Verification Failed: ${config.name}`, error);
        return false;
    }

    return isOk;
}

async function main() {
    console.log('--- Freesail Catalog Integrity Check ---');
    const catalogs = discoverCatalogs();

    if (catalogs.length === 0) {
        console.error('❌ Error: No catalogs found in current context (CWD or hardcoded paths).');
        process.exit(1);
    }

    let allPassed = true;
    for (const config of catalogs) {
        const result = await verifyCatalog(config);
        if (!result) allPassed = false;
    }

    if (!allPassed) {
        console.error('\n💥 Build Stopped: Catalog integrity violations found.');
        process.exit(1);
    }

    console.log('\n✨ Success: All catalogs are implementation-complete.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});