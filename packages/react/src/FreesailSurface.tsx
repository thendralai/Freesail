/**
 * @fileoverview FreesailSurface Component
 *
 * The main container component that renders a single A2UI surface.
 * Users drop this into their app to display agent-driven UI.
 */

import React, { useMemo, useCallback, type ReactNode } from 'react';
import type {
  SurfaceId,
  A2UIComponent,
  ComponentId,
  ChildList,
  isChildListTemplate,
} from '@freesail/core';
import { useSurface, useAction } from './hooks.js';
import { registry, type FreesailComponentProps } from './registry.js';
import { useFreesailContext } from './context.js';

/**
 * Props for FreesailSurface.
 */
export interface FreesailSurfaceProps {
  /** The surface ID to render */
  surfaceId: SurfaceId;
  /** Optional className for the container */
  className?: string;
  /** Loading state component */
  loading?: ReactNode;
  /** Error state component */
  error?: ReactNode;
  /** Empty state component (when surface exists but has no components) */
  empty?: ReactNode;
}

/**
 * Dispatch function type for actions.
 */
type ActionDispatch = (
  name: string,
  sourceComponentId: ComponentId,
  context: Record<string, unknown>
) => Promise<void>;

/**
 * Callback for two-way binding: components write values to the local data model.
 */
type DataChangeDispatch = (path: string, value: unknown) => void;

/**
 * Renders a single A2UI surface.
 *
 * This component subscribes to surface updates and automatically
 * re-renders when the component tree or data model changes.
 */
export function FreesailSurface({
  surfaceId,
  className,
  loading = <DefaultLoading />,
  error = <DefaultError />,
  empty = null,
}: FreesailSurfaceProps) {
  const surface = useSurface(surfaceId);
  const dispatch = useAction(surfaceId);
  const { surfaceManager } = useFreesailContext();

  // Two-way binding: input components write to the local data model.
  // This is local only — no network request. The updated data model
  // reaches the server via resolved data bindings in action context
  // or via the sendDataModel metadata mechanism.
  const onDataChange: DataChangeDispatch = useCallback(
    (path: string, value: unknown) => {
      console.log(`[Freesail] onDataChange: surface=${surfaceId} path=${path} value=`, value);
      surfaceManager.updateDataModel(surfaceId, path, value);
    },
    [surfaceManager, surfaceId]
  );

  // Build the component tree
  const renderedTree = useMemo(() => {
    if (!surface) return null;
    if (surface.components.size === 0) return null;
    if (!surface.rootId) return null;

    return renderComponent(
      surface.rootId,
      surface.components,
      surface.catalogId,
      surface.dataModel,
      dispatch,
      onDataChange
    );
  }, [surface, dispatch, onDataChange]);

  // Loading state - surface doesn't exist yet
  if (!surface) {
    return <div className={className} style={{ flex: 1, minHeight: 0 }}>{loading}</div>;
  }

  // Empty state - surface exists but no components
  if (surface.components.size === 0 || !surface.rootId) {
    return <div className={className} style={{ flex: 1, minHeight: 0 }}>{empty}</div>;
  }

  // Check if catalog is registered
  if (!registry.hasCatalog(surface.catalogId)) {
    console.error(`[Freesail] Catalog not registered: ${surface.catalogId}`);
    return <div className={className} style={{ flex: 1, minHeight: 0 }}>{error}</div>;
  }

  return <div className={className} data-freesail-surface={surfaceId} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{renderedTree}</div>;
}

// =============================================================================
// Component Renderer
// =============================================================================

function renderComponent(
  componentId: ComponentId,
  components: Map<ComponentId, A2UIComponent>,
  catalogId: string,
  dataModel: Record<string, unknown>,
  dispatch: ActionDispatch,
  onDataChange: DataChangeDispatch,
  scopeData?: unknown,
  keyOverride?: string
): ReactNode {
  const componentDef = components.get(componentId);
  if (!componentDef) {
    console.warn(`[Freesail] Component not found: ${componentId}`);
    return null;
  }

  // Get the React component from registry
  const Component = registry.getComponent(catalogId, componentDef.component);
  if (!Component) {
    return <UnknownComponent component={componentDef} />;
  }

  // Render children recursively
  let children: ReactNode = null;

  // 1. Handle single child (for Card, etc.)
  if (componentDef.child) {
    children = renderComponent(
      componentDef.child,
      components,
      catalogId,
      dataModel,
      dispatch,
      onDataChange,
      scopeData
    );
  }
  // 2. Handle multiple standard children (Column, Row, List, etc.)
  else if (componentDef.children) {
    const childList = componentDef.children as ChildList;

    if (Array.isArray(childList)) {
      // Static array of child IDs
      children = childList.map((childId) =>
        renderComponent(childId, components, catalogId, dataModel, dispatch, onDataChange, scopeData)
      );
    } else if (typeof childList === 'object' && 'componentId' in childList) {
      // Template for dynamic children
      const template = childList;
      const listData = getDataAtPath(dataModel, template.path);

      if (Array.isArray(listData)) {
        children = listData.map((itemData, index) =>
          renderComponent(
            template.componentId,
            components,
            catalogId,
            dataModel,
            dispatch,
            onDataChange,
            itemData, // Pass item data as scope
            `${template.componentId}_${(itemData as any)?.id ?? index}` // Unique key per item
          )
        );
      }
    }
  }
  // 3. Handle named slots for specific components (Tabs, Modal)
  else if (componentDef.component === 'Tabs' && Array.isArray((componentDef as any).tabs)) {
    // Render each tab's child component
    children = (componentDef as any).tabs.map((tab: any, index: number) =>
      renderComponent(
        tab.child as ComponentId,
        components,
        catalogId,
        dataModel,
        dispatch,
        onDataChange,
        scopeData,
        `${componentId}_tab_${index}`
      )
    );
  } else if (componentDef.component === 'Modal') {
    // Render trigger and content slots
    const triggerId = (componentDef as any).trigger as ComponentId | undefined;
    const contentId = (componentDef as any).content as ComponentId | undefined;

    const trigger = triggerId
      ? renderComponent(triggerId, components, catalogId, dataModel, dispatch, onDataChange, scopeData, `${componentId}_trigger`)
      : null;
    const content = contentId
      ? renderComponent(contentId, components, catalogId, dataModel, dispatch, onDataChange, scopeData, `${componentId}_content`)
      : null;

    children = [trigger, content];
  }

  // Resolve data bindings in component properties
  const resolvedProps = resolveDataBindings(componentDef, dataModel, scopeData);

  // Build props
  const props: FreesailComponentProps = {
    component: { ...componentDef, ...resolvedProps },
    children,
    dataModel,
    scopeData,
    onAction: (name, context) => {
      // Resolve data bindings in action context at dispatch time.
      const resolvedContext = resolveActionContext(context, dataModel, scopeData);
      return dispatch(name, componentDef.id, resolvedContext);
    },
    onDataChange,
  };

  return <Component key={keyOverride ?? componentId} {...props} />;
}

/**
 * Resolve data bindings in component properties.
 */
function resolveDataBindings(
  component: A2UIComponent,
  dataModel: Record<string, unknown>,
  scopeData?: unknown
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(component)) {
    if (key === 'id' || key === 'component' || key === 'children' || key === 'child') {
      continue;
    }

    // Robustness: Handle double-encoded bindings
    let effectiveValue = value;
    if (typeof value === 'string' && value.trim().startsWith('{') && value.includes('"path"')) {
      try {
        const parsed = JSON.parse(value);
        if (isDataBindingObject(parsed)) {
          effectiveValue = parsed;
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (isDataBindingObject(effectiveValue)) {
      // Preserve the raw binding so components can find the path for two-way binding
      resolved[`__raw${key.charAt(0).toUpperCase()}${key.slice(1)}`] = effectiveValue;
      // Resolve data binding
      resolved[key] = resolveSingleBinding(effectiveValue, dataModel, scopeData);

    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve bindings inside objects and arrays
      if (Array.isArray(value)) {
        resolved[key] = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            if (isDataBindingObject(item)) {
              return resolveSingleBinding(item, dataModel, scopeData);
            }
            return resolveDataBindings(item as any, dataModel, scopeData);
          }
          return item;
        });
      } else {
        resolved[key] = resolveDataBindings(value as any, dataModel, scopeData);
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * Helper to resolve a single binding object, following chains.
 */
function resolveSingleBinding(
  binding: { path: string },
  dataModel: Record<string, unknown>,
  scopeData?: unknown
): unknown {
  const path = binding.path;
  let resolvedValue: unknown;

  if (path.startsWith('/')) {
    resolvedValue = getDataAtPath(dataModel, path);
  } else if (scopeData !== undefined) {
    resolvedValue = getDataAtPath(scopeData as Record<string, unknown>, '/' + path);
  } else {
    resolvedValue = getDataAtPath(dataModel, '/' + path);
  }

  // Chained bindings (max depth 5)
  let depth = 0;
  while (isDataBindingObject(resolvedValue) && depth < 5) {
    const chainedPath = resolvedValue.path;
    resolvedValue = chainedPath.startsWith('/')
      ? getDataAtPath(dataModel, chainedPath)
      : getDataAtPath(dataModel, '/' + chainedPath);
    depth++;
  }

  return resolvedValue;
}

function isDataBindingObject(value: unknown): value is { path: string } {
  if (typeof value !== 'object' || value === null || !('path' in value)) return false;
  if (typeof (value as Record<string, unknown>)['path'] !== 'string') return false;
  if ('componentId' in value) return false; // ChildListTemplate
  if ('event' in value) return false;       // ServerAction
  if ('call' in value) return false;        // FunctionCall
  return true;
}

/**
 * Resolve data bindings in an action's context object.
 */
function resolveActionContext(
  context: Record<string, unknown>,
  dataModel: Record<string, unknown>,
  scopeData?: unknown
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (isDataBindingObject(value)) {
      const path = value.path;
      if (path.startsWith('/')) {
        resolved[key] = getDataAtPath(dataModel, path);
      } else if (scopeData !== undefined) {
        resolved[key] = getDataAtPath(scopeData as Record<string, unknown>, '/' + path);
      } else {
        // Relative path but no scope — normalize to absolute
        resolved[key] = getDataAtPath(dataModel, '/' + path);
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

function getDataAtPath(data: unknown, path: string): unknown {
  if (data === null || data === undefined) return undefined;

  const parts = path.split('/').filter((p) => p !== '');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// =============================================================================
// Default UI States
// =============================================================================

function DefaultLoading() {
  return (
    <div style={{ padding: '16px', color: '#666' }}>
      Loading surface...
    </div>
  );
}

function DefaultError() {
  return (
    <div style={{ padding: '16px', color: '#c00' }}>
      Error: Unable to render surface
    </div>
  );
}

function UnknownComponent({ component }: { component: A2UIComponent }) {
  return (
    <div
      style={{
        padding: '8px',
        border: '1px dashed #f00',
        background: '#fee',
        margin: '4px',
      }}
    >
      <strong>Unknown Component:</strong> {component.component}
      <pre style={{ fontSize: '10px' }}>
        {JSON.stringify(component, null, 2)}
      </pre>
    </div>
  );
}
