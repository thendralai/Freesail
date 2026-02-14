/**
 * @fileoverview Component Registry
 *
 * Maps component names from the catalog to React components.
 * This enables the renderer to dynamically instantiate components
 * based on A2UI messages.
 */

import type { ComponentType, ReactNode } from 'react';
import type { A2UIComponent, CatalogId } from '@freesail/core';

/**
 * Props passed to all Freesail components.
 */
export interface FreesailComponentProps {
  /** The component definition from the A2UI message (with resolved data bindings) */
  component: A2UIComponent;
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
  private fallbackComponent: FreesailComponent | null = null;

  /**
   * Register a catalog with its components.
   */
  registerCatalog(catalogId: CatalogId, components: Record<string, FreesailComponent>): void {
    const map: ComponentMap = new Map(Object.entries(components));
    this.catalogs.set(catalogId, map);
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
  components: Record<string, FreesailComponent>
): void {
  registry.registerCatalog(catalogId, components);
}
