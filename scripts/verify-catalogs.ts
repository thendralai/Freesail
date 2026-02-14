
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

// Dynamically discover catalogs
function discoverCatalogs(): CatalogConfig[] {
    const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });

    const catalogs: CatalogConfig[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Convention: catalog packages match '<prefix>_catalog_<version>'
        // e.g. 'standard_catalog_v1', 'weather_catalog_v1'
        const match = entry.name.match(/^(.+)_catalog_(v\d+)$/);

        if (match) {
            const packageName = entry.name;
            const prefix = match[1];
            const version = match[2];

            // Expected export names
            const idExportName = `${prefix.toUpperCase()}_CATALOG_ID`;
            const componentsExportName = `${prefix}CatalogComponents`;

            // JSON file convention: <prefix>_catalog_<version>.json
            const jsonFileName = `${prefix}_catalog_${version}.json`;
            const jsonFile = path.join('src', jsonFileName);

            // Verify JSON file exists before adding to config
            const fullJsonPath = path.join(PACKAGES_DIR, packageName, jsonFile);
            if (!fs.existsSync(fullJsonPath)) {
                console.warn(`⚠️  Skipping ${packageName}: Could not find JSON file at ${jsonFile}`);
                continue;
            }

            catalogs.push({
                name: packageName,
                packagePath: packageName,
                jsonFile,
                entryFile: 'src/index.ts',
                idExportName,
                componentsExportName
            });
        }
    }

    return catalogs;
}

async function verifyCatalog(config: CatalogConfig) {
    console.log(`Verifying ${config.name}...`);
    const packageRoot = path.join(PACKAGES_DIR, config.packagePath);

    // 1. Read JSON Schema
    const jsonPath = path.join(packageRoot, config.jsonFile);
    try {
        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        var schema = JSON.parse(jsonContent);
    } catch (e) {
        console.error(`❌ Failed to check ${config.name}: Could not read JSON schema at ${jsonPath}`);
        process.exitCode = 1;
        return;
    }

    // Get ID from JSON (v0.9 uses $id or catalogId)
    const jsonId = schema.id || schema.$id || schema.catalogId;
    const jsonComponents = Object.keys(schema.components || {});

    // 2. Import TypeScript source (using dynamic import)
    // We need to import from the absolute path of the source file
    const entryPath = path.join(packageRoot, config.entryFile);

    try {
        const module = await import(entryPath);

        // 3. Verify ID
        const exportedId = module[config.idExportName];
        if (exportedId !== jsonId) {
            console.error(`❌ ID Mismatch in ${config.name}:`);
            console.error(`   JSON ID: ${jsonId}`);
            console.error(`   Code Export (${config.idExportName}): ${exportedId}`);
            process.exitCode = 1;
        } else {
            console.log(`   ✅ ID matches: ${exportedId}`);
        }

        // 4. Verify Components
        const exportedComponents = module[config.componentsExportName];
        if (!exportedComponents) {
            console.error(`❌ Could not find exported components map: ${config.componentsExportName}`);
            process.exitCode = 1;
            return;
        }

        const implementedComponents = Object.keys(exportedComponents);
        const missingImplementation = jsonComponents.filter(c => !implementedComponents.includes(c));
        const extraImplementation = implementedComponents.filter(c => !jsonComponents.includes(c));

        if (missingImplementation.length > 0) {
            console.error(`❌ Missing implementations for components defined in JSON:`);
            missingImplementation.forEach(c => console.error(`   - ${c}`));
            process.exitCode = 1;
        } else {
            console.log(`   ✅ All ${jsonComponents.length} JSON components are implemented.`);
        }

        if (extraImplementation.length > 0) {
            console.warn(`   ⚠️  Components implemented but not in JSON (might be intentional internal components):`);
            extraImplementation.forEach(c => console.warn(`      - ${c}`));
        }

    } catch (error) {
        console.error(`❌ Failed to import or verify ${config.name}:`, error);
        process.exitCode = 1;
    }
    console.log('---');
}

async function main() {
    console.log('Starting Dynamic Catalog Verification...\n');
    const catalogs = discoverCatalogs();

    if (catalogs.length === 0) {
        console.warn('⚠️  No catalogs found matching convention "<prefix>_catalog_<version>".');
    } else {
        console.log(`Found ${catalogs.length} catalogs: ${catalogs.map(c => c.name).join(', ')}\n`);
    }

    for (const config of catalogs) {
        await verifyCatalog(config);
    }
}

main().catch(console.error);
