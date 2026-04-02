/**
 * @fileoverview @freesail/standard-catalog
 *
 * The standard UI component catalog for Freesail, built as a standalone
 * package using the Freesail SDK — the same way any external developer
 * would create a custom catalog.
 *
 * @example
 * ```tsx
 * import { FreesailProvider } from '@freesail/react';
 * import { StandardCatalog } from '@freesail/standard-catalog';
 *
 * <FreesailProvider
 *   gateway="/gateway"
 *   catalogs={[StandardCatalog]}
 * >
 *   <App />
 * </FreesailProvider>
 * ```
 */

import type { CatalogDefinition } from '@freesail/react';
import { standardCatalogComponents } from './components/components.js';
import { standardCatalogFunctions } from './functions/functions.js';
import catalogSchema from './standard-catalog.json';

export const StandardCatalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: standardCatalogComponents,
  functions: standardCatalogFunctions,
};
