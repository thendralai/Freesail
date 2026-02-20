/**
 * @fileoverview Freesail React - Public API
 */

// Provider
export { FreesailProvider, type FreesailProviderProps } from './FreesailProvider.js';

// Surface Component
export { FreesailSurface, type FreesailSurfaceProps } from './FreesailSurface.js';

// Context
export { FreesailContext, useFreesailContext, type FreesailContextValue } from './context.js';

// Hooks
export {
  useSurface,
  useSurfaceData,
  useAction,
  useConnectionStatus,
  useSurfaces,
} from './hooks.js';

// Registry
export {
  registry,
  withCatalog,
  registerCatalog,
  type FreesailComponent,
  type FreesailComponentProps,
} from './registry.js';

// Types
export { type CatalogDefinition, type FunctionImplementation } from './types.js';

// Re-export core types for convenience
export type {
  SurfaceId,
  ComponentId,
  CatalogId,
  A2UIComponent,
  Surface,
} from '@freesail/core';

// Theme
export * from './theme.js';
