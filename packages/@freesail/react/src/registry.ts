/**
 * @fileoverview Component Registry
 *
 * Maps component names from the catalog to React components.
 * This enables the renderer to dynamically instantiate components
 * based on A2UI messages.
 */

import type { ComponentType, ReactNode } from 'react';
import type { A2UIComponent, CatalogId, FunctionCall } from '@freesail/core';
import type { FunctionImplementation } from './types.js';

/**
 * Typed container for framework-injected metadata passed alongside component props.
 * Access via the `meta` field on FreesailComponentProps — never access `__`-prefixed
 * keys on `component` directly.
 */
export class ComponentMeta {
  constructor(
    private readonly _bindings: Record<string, { path: string }>,
    private readonly _dataUpdatedAt: Record<string, number>,
    private readonly _componentState: Record<string, unknown>
  ) {}

  /** Binding path for a data-bound prop. Returns undefined if the prop is not data-bound. */
  getBinding(propName: string): { path: string } | undefined {
    return this._bindings[propName];
  }

  /** Last-write timestamp for a data-bound prop. Returns 0 if no timestamp exists. */
  getUpdatedTime(propName: string): number {
    return this._dataUpdatedAt[propName] ?? 0;
  }

  /** Runtime state override set via setComponentState (e.g. visible, enabled). */
  getComponentState(property: string): unknown {
    return this._componentState[property];
  }
}

/**
 * Props passed to all Freesail components.
 */
export interface FreesailComponentProps {
  /** The component definition from the A2UI message (with resolved data bindings, no __ keys) */
  component: A2UIComponent;
  /** Framework-injected metadata: data bindings, update timestamps, component state overrides */
  meta: ComponentMeta;
  /** Rendered children (for container components) */
  children?: ReactNode;
  /** Full data model for the surface (server → client, kept in sync by two-way binding) */
  dataModel?: Record<string, unknown>;
  /** Scope data when inside a template iteration */
  scopeData?: unknown;
  /** Callback to dispatch user actions (client → server) */
  onAction?: (name: string, context: Record<string, unknown>) => void;
  /**
   * Write a value to the local data model at the given JSON Pointer path.
   * This is the "Write" half of A2UI two-way binding — input components
   * call this on every user interaction (keystroke, toggle, etc.).
   * The update is LOCAL only; it does NOT send a message to the server.
   * The updated data model reaches the server when an action is dispatched
   * (either via resolved data bindings in the action context, or via
   * the sendDataModel metadata mechanism).
   */
  onDataChange?: (path: string, value: unknown) => void;
  /**
   * Execute a function call definition.
   * This is for LocalAction handling (client-side logic).
   */
  onFunctionCall?: (call: FunctionCall) => void;
}

/**
 * A React component that can render an A2UX component.
 */
export type FreesailComponent = ComponentType<FreesailComponentProps>;

/**
 * Component map within a catalog.
 */
export type ComponentMap = Map<string, FreesailComponent>;

/**
 * Registry of all catalogs and their components.
 */
class ComponentRegistry {
  private catalogs: Map<CatalogId, ComponentMap> = new Map();
  private functions: Map<CatalogId, Record<string, FunctionImplementation>> = new Map();
  /** Positional parameter names per function, extracted from the catalog schema. */
  private paramNames: Map<CatalogId, Record<string, string[]>> = new Map();
  private fallbackComponent: FreesailComponent | null = null;

  /**
   * Register a catalog with its components, functions, and optional schema.
   * When a schema is provided, parameter names are extracted from
   * `functions.*.args.properties` keys so `evaluateFunction` can
   * reorder named-key argument objects from the LLM.
   */
  registerCatalog(
    catalogId: CatalogId,
    components: Record<string, FreesailComponent>,
    functions?: Record<string, FunctionImplementation>,
    schema?: Record<string, unknown>
  ): void {
    const map: ComponentMap = new Map(Object.entries(components));
    this.catalogs.set(catalogId, map);
    if (functions) {
      this.functions.set(catalogId, functions);
    }
    if (schema) {
      this.extractParamNames(catalogId, schema);
    }
  }

  /**
   * Extract positional parameter names from a catalog schema's function definitions.
   */
  private extractParamNames(catalogId: CatalogId, schema: Record<string, unknown>): void {
    const funcs = schema['functions'] as Record<string, Record<string, unknown>> | undefined;
    if (!funcs) return;
    const names: Record<string, string[]> = {};
    for (const [funcName, funcDef] of Object.entries(funcs)) {
      const propsField = funcDef['properties'] as Record<string, unknown> | undefined;
      const argsDef = propsField?.['args'] as Record<string, unknown> | undefined;
      if (argsDef) {
        const props = argsDef['properties'] as Record<string, unknown> | undefined;
        if (props && Object.keys(props).length > 0) {
          names[funcName] = Object.keys(props);
        }
      }
    }
    if (Object.keys(names).length > 0) {
      this.paramNames.set(catalogId, names);
    }
  }

  /**
   * Register a single component in a catalog.
   */
  registerComponent(
    catalogId: CatalogId,
    componentName: string,
    component: FreesailComponent
  ): void {
    if (!this.catalogs.has(catalogId)) {
      this.catalogs.set(catalogId, new Map());
    }
    this.catalogs.get(catalogId)!.set(componentName, component);
  }

  /**
   * Get a component from a catalog.
   */
  getComponent(catalogId: CatalogId, componentName: string): FreesailComponent | null {
    const catalog = this.catalogs.get(catalogId);
    if (!catalog) {
      console.warn(`Catalog not found: ${catalogId}`);
      return this.fallbackComponent;
    }

    const component = catalog.get(componentName);
    if (!component) {
      console.warn(`Component not found: ${componentName} in catalog ${catalogId}`);
      return this.fallbackComponent;
    }

    return component;
  }

  /**
   * Get a function from a catalog.
   */
  getFunction(catalogId: CatalogId, functionName: string): FunctionImplementation | null {
    const catalogFunctions = this.functions.get(catalogId);
    if (!catalogFunctions) {
      return null;
    }
    // Direct lookup first
    if (catalogFunctions[functionName] != null) {
      return catalogFunctions[functionName];
    }
    // Fallback: try snake_case -> camelCase conversion (e.g. open_url -> openUrl)
    if (functionName.includes('_')) {
      const camelName = functionName.replace(/_([a-z])/g, (_match, p1) => p1.toUpperCase());
      return catalogFunctions[camelName] ?? null;
    }
    return null;
  }

  /**
   * Get the declared positional parameter names for a function.
   * Returns undefined if no schema was registered or the function has no named params.
   */
  getParamNames(catalogId: CatalogId, functionName: string): string[] | undefined {
    return this.paramNames.get(catalogId)?.[functionName];
  }

  /**
   * Check if a catalog is registered.
   */
  hasCatalog(catalogId: CatalogId): boolean {
    return this.catalogs.has(catalogId);
  }

  /**
   * Get all registered catalog IDs.
   */
  getCatalogIds(): CatalogId[] {
    return Array.from(this.catalogs.keys());
  }

  /**
   * Set a fallback component for unknown components.
   */
  setFallbackComponent(component: FreesailComponent): void {
    this.fallbackComponent = component;
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.catalogs.clear();
    this.functions.clear();
    this.paramNames.clear();
    this.fallbackComponent = null;
  }
}

/**
 * Global component registry instance.
 */
export const registry = new ComponentRegistry();

/**
 * Higher-order function to create a component with catalog binding.
 * This ensures the component is registered when imported.
 */
export function withCatalog<P extends FreesailComponentProps>(
  catalogId: CatalogId,
  componentName: string,
  Component: ComponentType<P>
): ComponentType<P> {
  registry.registerComponent(catalogId, componentName, Component as FreesailComponent);
  return Component;
}

/**
 * Register multiple components for a catalog at once.
 */
export function registerCatalog(
  catalogId: CatalogId,
  components: Record<string, FreesailComponent>,
  functions?: Record<string, FunctionImplementation>,
  schema?: Record<string, unknown>
): void {
  registry.registerCatalog(catalogId, components, functions, schema);
}
