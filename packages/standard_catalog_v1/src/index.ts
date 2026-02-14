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
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[StandardCatalog]}
 * >
 *   <App />
 * </FreesailProvider>
 * ```
 */

import type { CatalogDefinition } from '@freesail/react';
import { standardCatalogComponents } from './components.js';
import catalogSchema from './standard_catalog_v1.json';

// Re-export all individual components for advanced usage
export * from './components.js';
export { standardCatalogComponents } from './components.js';

export const STANDARD_CATALOG_ID = catalogSchema.catalogId;

/**
 * The standard catalog as a CatalogDefinition.
 *
 * Pass this to FreesailProvider's `catalogDefinitions` prop:
 *
 * ```tsx
 * <FreesailProvider
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[StandardCatalog]}
 * >
 * ```
 */
export const StandardCatalog: CatalogDefinition = {
  namespace: STANDARD_CATALOG_ID,
  schema: catalogSchema,
  components: standardCatalogComponents,
};
