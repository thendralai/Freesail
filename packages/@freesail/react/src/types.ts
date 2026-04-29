/**
 * @fileoverview Freesail React - Type Definitions
 *
 * Public interfaces for custom catalog integration.
 */

import type { ComponentType } from 'react';
import type { FreesailComponentProps } from './registry.js';
import { componentStatePath, STRUCTURAL_COMPONENT_PROPS } from '@freesail/core';

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

// =============================================================================
// Side Effects
// =============================================================================

/**
 * A typed side effect returned by catalog functions (e.g. show/hide).
 * The renderer detects this via isFreesailSideEffect and applies the update.
 */
export type FreesailSideEffect = {
  readonly _effect: 'dataModelUpdate';
  path: string;
  value: unknown;
};

export function isFreesailSideEffect(v: unknown): v is FreesailSideEffect {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)['_effect'] === 'dataModelUpdate'
  );
}

/**
 * Returns a FreesailSideEffect that sets a runtime state override for a component.
 * Throws if a structural property (id, component, child, children, action) is targeted,
 * since those are protocol-owned and cannot be overridden at runtime.
 */
export function setComponentState(
  componentId: string,
  property: string,
  value: unknown
): FreesailSideEffect {
  if (STRUCTURAL_COMPONENT_PROPS.has(property)) {
    throw new Error(
      `[Freesail] setComponentState: '${property}' is a structural property and cannot be overridden at runtime.`
    );
  }
  return { _effect: 'dataModelUpdate', path: componentStatePath(componentId, property), value };
}
