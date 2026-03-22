/**
 * @fileoverview test Catalog Functions
 *
 * Re-exports all common functions. Add catalog-specific functions below.
 */

import type { FunctionImplementation } from '@freesail/react';
import { commonFunctions } from './common/CommonFunctions.js';

// Add custom functions here, for example:
//
// const myCustomFn: FunctionImplementation = (value: unknown) => {
//   return String(value).toUpperCase();
// };

export const testCatalogFunctions: Record<string, FunctionImplementation> = {
  ...commonFunctions,
  // myCustomFn,
};
