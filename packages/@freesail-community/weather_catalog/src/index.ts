/**
 * @fileoverview @freesail/weather-catalog
 *
 * A weather-specific UI component catalog for Freesail, providing
 * rich weather display components like current conditions cards,
 * multi-day forecasts, wind indicators, UV index, and more.
 *
 * Built as a standalone package using the Freesail SDK — the same
 * way any external developer would create a custom catalog.
 *
 * @example
 * ```tsx
 * import { FreesailProvider } from '@freesail/react';
 * import { StandardCatalog } from '@freesail/standard-catalog';
 * import { WeatherCatalog } from '@freesail/weather-catalog';
 *
 * <FreesailProvider
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[StandardCatalog, WeatherCatalog]}
 * >
 *   <App />
 * </FreesailProvider>
 * ```
 */

import type { CatalogDefinition } from '@freesail/react';
import { weatherCatalogComponents } from './components.js';
import catalogSchema from './weather_catalog.json';

// Re-export all individual components for advanced usage
export * from './components.js';
export { weatherCatalogComponents } from './components.js';

export const WEATHER_CATALOG_ID = catalogSchema.catalogId;

/**
 * The weather catalog as a CatalogDefinition.
 *
 * Pass this to FreesailProvider's `catalogDefinitions` prop:
 *
 * ```tsx
 * <FreesailProvider
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[WeatherCatalog]}
 * >
 * ```
 */
export const WeatherCatalog: CatalogDefinition = {
  namespace: WEATHER_CATALOG_ID,
  schema: catalogSchema,
  components: weatherCatalogComponents,
};
