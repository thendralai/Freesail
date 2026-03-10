/**
 * @fileoverview Common Functions
 *
 * The shared function set that all Freesail catalogs should include.
 * These functions implement the A2UI protocol capabilities described in
 * the system prompt and are available by default in every catalog.
 *
 * `formatString` is MANDATORY — the system prompt relies on it and
 * `freesail validate catalog` will error if it is absent from a catalog's
 * runtime function map.
 *
 * Usage in a custom catalog's index.ts:
 * ```ts
 * import { commonFunctions } from '@freesail/catalogs/common';
 *
 * export const MyCatalog: CatalogDefinition = {
 *   ...
 *   functions: {
 *     ...commonFunctions,       // includes formatString and all other common functions
 *     ...myCatalogFunctions,    // custom overrides go after
 *   },
 * };
 * ```
 */

export { standardCatalogFunctions as commonFunctions } from '../standard_catalog/functions.js';
