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
 * A typed side effect returned by catalog functions.
 *
 * - `dataModelUpdate`: writes a value to the local data model (e.g. show/hide).
 *   Optionally also dispatches an upstream action to the agent.
 * - `actionDispatch`: dispatches an upstream action to the agent with no local state change.
 *   Any catalog function can return this to notify the agent of something that happened.
 */
export type FreesailSideEffect =
  | {
      readonly _effect: 'dataModelUpdate';
      path: string;
      value: unknown;
      action?: { name: string; context: Record<string, unknown> };
    }
  | {
      readonly _effect: 'actionDispatch';
      name: string;
      context: Record<string, unknown>;
    };

export function isFreesailSideEffect(v: unknown): v is FreesailSideEffect {
  const effect = (v as Record<string, unknown>)?.['_effect'];
  return effect === 'dataModelUpdate' || effect === 'actionDispatch';
}

/**
 * Returns a FreesailSideEffect that dispatches an upstream action to the agent.
 * Use this in any catalog function that needs to notify the agent of a client-side event.
 */
export function dispatchAction(name: string, context: Record<string, unknown> = {}): FreesailSideEffect {
  return { _effect: 'actionDispatch', name, context };
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
