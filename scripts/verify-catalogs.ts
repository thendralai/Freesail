import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, '../packages');

interface CatalogConfig {
    name: string;
    packagePath: string;
    jsonFile: string;
    entryFile: string;
    idExportName: string;
    componentsExportName: string;
}

/**
 * Recursively discovers catalogs in tiered folders (e.g., @freesail/catalogs/src/*)
 */
function discoverCatalogs(): CatalogConfig[] {
    const catalogs: CatalogConfig[] = [];

    // List of directories to scan for catalogs
    const scanDirs = [
        path.join(PACKAGES_DIR, '@freesail/catalogs/src'),
    ];

    for (const scanDir of scanDirs) {
        if (!fs.existsSync(scanDir)) continue;

        const entries = fs.readdirSync(scanDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            // Pattern: <prefix>_catalog_<version> (e.g., weather_catalog_v1)
            const match = entry.name.match(/^(.+)_catalog_(v\d+)$/);

            if (match) {
                const packageName = entry.name;
                const prefix = match[1];
                const version = match[2];

                const idExportName = `${prefix.toUpperCase()}_CATALOG_ID`;
                const componentsExportName = `${prefix}CatalogComponents`;
                const jsonFileName = `${prefix}_catalog_${version}.json`;

                const fullJsonPath = path.join(scanDir, packageName, jsonFileName);
                if (!fs.existsSync(fullJsonPath)) {
                    console.warn(`⚠️  Skipping ${packageName}: Missing JSON at ${jsonFileName}`);
                    continue;
                }

                catalogs.push({
                    name: packageName,
                    packagePath: path.join(scanDir, packageName), // Absolute path for verification
                    jsonFile: jsonFileName,
                    entryFile: 'index.ts',
                    idExportName,
                    componentsExportName
                });
            }
        }
    }

    return catalogs;
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
        console.error(`❌ File Error: Could not read JSON at ${jsonPath}`);
        return false;
    }

    const jsonId = schema.id || schema.$id || schema.catalogId;
    const jsonComponents = Object.keys(schema.components || {});

    // 2. Dynamic Import of TypeScript Source
    const entryPath = path.join(config.packagePath, config.entryFile);
    try {
        // Using file:// URL for cross-platform dynamic import compatibility
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
            return false;
        }

        const implementedKeys = Object.keys(exportedComponents);
        const missing = jsonComponents.filter(c => !implementedKeys.includes(c));

        if (missing.length > 0) {
            console.error(`   ❌ Unimplemented components: ${missing.join(', ')}`);
            isOk = false;
        }

        if (isOk) console.log(`   ✅ Validated ${jsonComponents.length} components.`);

    } catch (error) {
        console.error(`   ❌ Import Failed: ${entryPath}`, error);
        return false;
    }

    return isOk;
}

async function main() {
    console.log('--- Freesail Catalog Integrity Check ---');
    const catalogs = discoverCatalogs();

    if (catalogs.length === 0) {
        console.error('❌ Error: No catalogs found matching the naming convention.');
        process.exit(1); // Fail build if nothing is verified
    }

    let allPassed = true;
    for (const config of catalogs) {
        const result = await verifyCatalog(config);
        if (!result) allPassed = false;
    }

    if (!allPassed) {
        console.error('\n💥 Build Stopped: Catalog integrity violations found.');
        process.exit(1); // Non-zero exit code kills the 'npm run build' chain
    }

    console.log('\n✨ Success: All catalogs are implementation-complete.');
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});