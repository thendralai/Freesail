/**
 * @fileoverview Test Catalog Components
 *
 * Extends the common component set with catalog-specific components.
 */

import React, { useState, useEffect, type CSSProperties } from 'react';
import type { FreesailComponentProps } from '@freesail/react';
import type { FunctionCall } from '@freesail/core';
import { commonComponents } from './common/CommonComponents.js';
import {
  getSemanticColor,
  getSemanticBackground,
  mapJustify,
  toInputFormat,
  validateChecks,
} from './common/common-utils.js';
import { commonFunctions } from './common/CommonFunctions.js';

// Add custom components here, for example:
//
// export function MyWidget({ component, children }: FreesailComponentProps) {
//   const style: CSSProperties = {
//     color: getSemanticColor(component['color'] as string),
//   };
//   return <div style={style}>{children}</div>;
// }

export const testCatalogComponents: Record<string, React.ComponentType<FreesailComponentProps>> = {
  ...commonComponents,
  // MyWidget,
};
