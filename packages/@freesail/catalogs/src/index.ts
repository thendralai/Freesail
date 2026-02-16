/**
 * @fileoverview @freesail/catalogs
 *
 * Unified package exporting all first-party Freesail catalogs.
 *
 * Import everything:
 * ```ts
 * import { StandardCatalog, ChatCatalog } from '@freesail/catalogs';
 * ```
 *
 * Or use subpath imports for tree-shaking:
 * ```ts
 * import { StandardCatalog } from '@freesail/catalogs/standard';
 * import { ChatCatalog }     from '@freesail/catalogs/chat';
  * ```
 */

export * from './standard_catalog/index.js';
export * from './chat_catalog/index.js';

