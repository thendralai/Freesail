/**
 * @fileoverview Test Catalog
 */

import type { CatalogDefinition } from '@freesail/react';
import { testCatalogComponents } from './components.js';
import { testCatalogFunctions } from './functions.js';
import catalogSchema from './test_catalog.json';

export const TestCatalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: testCatalogComponents,
  functions: testCatalogFunctions,
};
