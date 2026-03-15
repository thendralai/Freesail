/**
 * @fileoverview Common Catalog Exports
 *
 * Shared components, functions, and helpers that all Freesail catalogs include.
 *
 * When a developer runs `npx freesail new catalog`, the source files
 * (CommonComponents.tsx, CommonFunctions.ts, common_types.json) are copied
 * into the new catalog's src/ folder. The developer then owns them and can
 * modify or extend freely.
 *
 * `formatString` is MANDATORY — the system prompt relies on it and
 * `freesail validate catalog` will error if it is absent from a catalog's
 * runtime function map.
 */

export { commonComponents } from './CommonComponents.js';
export {
  getSemanticColor,
  getSemanticBackground,
  mapJustify,
  toInputFormat,
  validateChecks,
} from './common-utils.js';

export { commonFunctions } from './CommonFunctions.js';
