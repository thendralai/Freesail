/**
 * @fileoverview Freesail React - Type Definitions
 *
 * Public interfaces for custom catalog integration.
 */

import type { ComponentType } from 'react';
import type { FreesailComponentProps } from './registry.js';

/**
 * Definition of a custom catalog that can be registered with Freesail.
 *
 * Developers create a CatalogDefinition to bundle their JSON schema
 * and React component implementations together, then pass them to
 * FreesailProvider for registration.
 *
 * @example
 * ```ts
 * import catalog from './catalog.json';
 * import MyCustomCard from './components/MyCustomCard';
 *
 * export const MyOwnCatalog: CatalogDefinition = {
 *   namespace: 'myown',
 *   schema: catalog,
 *   components: {
 *     'MyCustomCard': MyCustomCard,
 *   },
 * };
 * ```
 */
export interface CatalogDefinition {
  /** Unique namespace for the catalog (e.g., 'myown' or a full URI) */
  namespace: string;
  /** The JSON schema object (catalog.json content) describing available components */
  schema: any;
  /** Map of component names to React components implementing FreesailComponentProps */
  components: Record<string, ComponentType<FreesailComponentProps>>;
  /** Map of function names to their implementations */
  functions?: Record<string, FunctionImplementation>;
}

/**
 * A function implementation that can be called from the data model.
 */
export type FunctionImplementation = (...args: any[]) => any;
