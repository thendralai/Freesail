/**
 * @fileoverview Weather Catalog
 */

import type { CatalogDefinition } from '@freesail/react';
import { weatherCatalogComponents } from './components/components.js';
import { weatherCatalogFunctions } from './functions/functions.js';
import catalogSchema from './weather-catalog.json';

export const WeatherCatalog: CatalogDefinition = {
  namespace: catalogSchema.catalogId,
  schema: catalogSchema,
  components: weatherCatalogComponents,
  functions: weatherCatalogFunctions,
};
