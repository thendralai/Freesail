/**
 * @fileoverview @freesail/catalogs
 *
 * Unified package exporting all first-party Freesail catalogs.
 *
 * Import everything:
 * ```ts
 * import { StandardCatalog, ChatCatalog, WeatherCatalog } from '@freesail/catalogs';
 * ```
 *
 * Or use subpath imports for tree-shaking:
 * ```ts
 * import { StandardCatalog } from '@freesail/catalogs/standard';
 * import { ChatCatalog }     from '@freesail/catalogs/chat';
 * import { WeatherCatalog }  from '@freesail/catalogs/weather';
 * ```
 */

export * from './standard_catalog_v1/index.js';
export * from './chat_catalog_v1/index.js';
export * from './weather_catalog_v1/index.js';
