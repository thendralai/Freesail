/**
 * @fileoverview FreesailSurface Component
 *
 * The main container component that renders a single A2UI surface.
 * Users drop this into their app to display agent-driven UI.
 */

import React, { useMemo, useCallback, type ReactNode } from 'react';
import { FREESAIL_LOGO_DATA_URI } from './logo.js';
import {
  isChildListTemplate,
  isFunctionCall,
} from '@freesail/core';
import type {
  SurfaceId,
  CatalogId,
  A2UIComponent,
  ComponentId,
  ChildList,
  FunctionCall,
} from '@freesail/core';
import { useSurface, useAction } from './hooks.js';
import { registry, type FreesailComponentProps } from './registry.js';
import { useFreesailContext } from './context.js';
import { getDataAtPath } from './utils.js';
import type { FunctionImplementation } from './types.js';
import {
  type FreesailSurfaceTheme,
  surfaceThemeToCssVars,
  type FreesailThemeProp,
  resolveTokens,
  tokensToCssVars,
  type FreesailThemeMode
} from './theme-utils.js';

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
  /** Optional theme override for this specific surface */
  theme?: FreesailThemeProp;
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
  empty = <DefaultLoading />,
  theme
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
      onDataChange,
      undefined,
      undefined,
      undefined
    );
  }, [surface, dispatch, onDataChange]);

  // Evaluate developer explicit theme injection
  const developerThemeCssVars = useMemo(() => {
    if (!theme) return {};
    const tokens = resolveTokens(theme);
    if (!tokens) return {};
    const mode = typeof theme === 'string'
      ? (theme as FreesailThemeMode)
      : 'light';
    return tokensToCssVars(tokens, mode);
  }, [theme]);

  // Loading state - surface doesn't exist yet
  if (!surface) {
    return <div className={className} style={{ flex: 1, minHeight: 0, ...developerThemeCssVars }}>{loading}</div>;
  }

  // Empty state - surface exists but no components
  if (surface.components.size === 0 || !surface.rootId) {
    return <div className={className} style={{ flex: 1, minHeight: 0, ...developerThemeCssVars }}>{empty}</div>;
  }

  // Check if catalog is registered
  if (!registry.hasCatalog(surface.catalogId)) {
    console.error(`[Freesail] Catalog not registered: ${surface.catalogId}`);
    return <div className={className} style={{ flex: 1, minHeight: 0, ...developerThemeCssVars }}>{error}</div>;
  }

  const rootComponent = surface.components.get('root' as ComponentId);
  const agentSurfaceTheme = rootComponent?.['theme'] as FreesailSurfaceTheme | undefined;
  const agentCssVars = agentSurfaceTheme ? surfaceThemeToCssVars(agentSurfaceTheme) : {};

  const surfaceStyle: React.CSSProperties = {
    flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
    containerType: 'inline-size',
    containerName: 'freesail-surface',
    ...developerThemeCssVars,
    ...agentCssVars
  };

  return <div className={className} data-freesail-surface={surfaceId} style={surfaceStyle}>{renderedTree}</div>;
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
  keyOverride?: string,
  scopeBasePath?: string
): ReactNode {
  const componentDef = components.get(componentId);
  if (!componentDef) {
    // Component may arrive in a subsequent update_components batch — render nothing for now
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
      scopeData,
      undefined,
      scopeBasePath
    );
  }
  // 2. Handle multiple standard children (Column, Row, List, etc.)
  else if (componentDef.children) {
    const childList = componentDef.children as ChildList;

    if (Array.isArray(childList)) {
      // Static array of child IDs
      children = childList.map((childId) =>
        renderComponent(childId, components, catalogId, dataModel, dispatch, onDataChange, scopeData, undefined, scopeBasePath)
      );
    } else if (typeof childList === 'object' && 'componentId' in childList) {
      // Template for dynamic children
      const template = childList;
      // Resolve relative paths against the current scope's base path so nested
      // templates (e.g. skills inside a developer iteration) work correctly.
      const resolvedTemplatePath = !template.path.startsWith('/') && scopeBasePath
        ? `${scopeBasePath}/${template.path}`
        : template.path;
      const listData = getDataAtPath(dataModel, resolvedTemplatePath);

      if (Array.isArray(listData)) {
        children = listData.map((itemData, index) => {
          // Build the absolute path for this item in the data model
          const itemBasePath = `${resolvedTemplatePath}/${index}`;
          return renderComponent(
            template.componentId,
            components,
            catalogId,
            dataModel,
            dispatch,
            onDataChange,
            itemData, // Pass item data as scope
            `${template.componentId}_${(itemData as any)?.id ?? index}`, // Unique key per item
            itemBasePath // Absolute path for two-way binding
          );
        });
      }
    }
  }

  // Resolve data bindings in component properties
  const resolvedProps = resolveDataBindings(componentDef, dataModel, catalogId, scopeData, scopeBasePath);

  // Visibility check: if `visible` resolves to exactly false, skip rendering.
  // Data-model override (from show/hide) takes precedence over component prop.
  const visibilityOverride = getDataAtPath(dataModel, `/__componentState/${componentId}/visible`);
  const effectiveVisible = visibilityOverride != null ? visibilityOverride : resolvedProps['visible'];
  if (effectiveVisible === false || effectiveVisible === 'false') {
    return null;
  }

  // Build props
  const props: FreesailComponentProps = {
    component: { ...componentDef, ...resolvedProps },
    children,
    dataModel,
    scopeData,
    onAction: (name, context) => {
      // Resolve data bindings in action context at dispatch time.
      const resolvedContext = resolveActionContext(context, dataModel, catalogId, scopeData);
      return dispatch(name, componentDef.id, resolvedContext);
    },
    onDataChange,
    onFunctionCall: (call) => {
       const result = evaluateFunction(call, dataModel, catalogId, scopeData);
       // Handle side-effect returns (e.g. show/hide writes to data model)
       if (result && typeof result === 'object' && '__sideEffect' in (result as Record<string, unknown>)) {
         const sideEffect = result as { __sideEffect: string; path: string; value: unknown };
         if (sideEffect.__sideEffect === 'dataModelUpdate') {
           onDataChange(sideEffect.path, sideEffect.value);
         }
       }
    },
  };

  try {
    const rendered = <Component key={keyOverride ?? componentId} {...props} />;

    // --- AUTOMATIC DOM TAGGING (WRAPPER APPROACH) ---
    // Use a wrapper div with display:contents so that data attributes
    // stay on a real DOM element instead of leaking as props into
    // functional components.
    const taggedRendered = (
      <div data-freesail-component={componentDef.component} data-freesail-id={componentId} style={{ display: 'contents' }}>
        {rendered}
      </div>
    );
    // --------------------------------------------------

    // Apply layout properties (weight, width, height) using a wrapper div.
    // Uses a data attribute so parent layouts (e.g. GridLayout) can override
    // with display:contents if needed.
    const weight = componentDef['weight'] as number | undefined;
    const width = resolvedProps['width'] as string | undefined;
    const height = resolvedProps['height'] as string | undefined;
    const flexBasis = resolvedProps['flexBasis'] as string | undefined;

    if (weight != null || width != null || height != null || flexBasis != null) {
      const wrapperStyle: React.CSSProperties = {
        flex: weight != null ? `${weight} 1 ${flexBasis ?? 'auto'}` : (flexBasis ? `0 1 ${flexBasis}` : '0 0 auto'),
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignSelf: weight != null ? 'stretch' : undefined,
        width,
        height,
      };

      return (
        <div
          key={keyOverride ?? componentId}
          data-freesail-weight={weight != null ? true : undefined}
          style={wrapperStyle}
        >
          {taggedRendered}
        </div>
      );
    }
    return taggedRendered;
  } catch (err) {
    console.error(`[Freesail] Component render error (${componentDef.component}):`, err);
    return <UnknownComponent component={componentDef} />;
  }
}

/**
 * Resolve data bindings in component properties.
 */
function resolveDataBindings(
  component: A2UIComponent,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData?: unknown,
  scopeBasePath?: string,
  _depth = 0
): Record<string, unknown> {
  if (_depth > 10) return {};
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

    if (key === 'action') {
      // Don't eagerly resolve action objects — event context bindings must be
      // resolved at dispatch time (via resolveActionContext) so they reflect the
      // data model at the moment of user interaction, not at render time.
      // Recursing here also pollutes the context with __raw* keys.
      resolved[key] = effectiveValue;
    } else if (isFunctionCall(effectiveValue)) {
      resolved[key] = evaluateFunction(effectiveValue, dataModel, catalogId, scopeData);
    } else if (isDataBindingObject(effectiveValue)) {
      // Preserve the raw binding so components can find the path for two-way binding.
      // If inside a scoped template, convert relative paths to absolute paths
      // so onDataChange writes to the correct location in the data model.
      const rawBinding = { ...effectiveValue };
      if (scopeBasePath && !rawBinding.path.startsWith('/')) {
        rawBinding.path = `${scopeBasePath}/${rawBinding.path}`;
      }
      resolved[`__raw${key.charAt(0).toUpperCase()}${key.slice(1)}`] = rawBinding;
      // Resolve data binding
      resolved[key] = resolveSingleBinding(effectiveValue, dataModel, scopeData);

    } else if (typeof value === 'object' && value !== null) {
      // Prevent recursion into LocalAction definitions (which contain FunctionCalls that should NOT be evaluated yet)
      if ('functionCall' in value && isFunctionCall((value as any).functionCall)) {
          resolved[key] = value;
          continue;
      }

      // Recursively resolve bindings inside objects and arrays
      if (Array.isArray(value)) {
        resolved[key] = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            // Check for LocalAction in array items too
            if ('functionCall' in item && isFunctionCall((item as any).functionCall)) {
                return item;
            }
            if (isFunctionCall(item)) {
              return evaluateFunction(item, dataModel, catalogId, scopeData);
            }
            if (isDataBindingObject(item)) {
              return resolveSingleBinding(item, dataModel, scopeData);
            }
            return resolveDataBindings(item as any, dataModel, catalogId, scopeData, scopeBasePath, _depth + 1);
          }
          return item;
        });
      } else {
        resolved[key] = resolveDataBindings(value as any, dataModel, catalogId, scopeData, scopeBasePath, _depth + 1);
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

  // "." or "" means "the current scoped item" — used when iterating scalar arrays
  if (path === '.' || path === '') {
    return scopeData !== undefined ? scopeData : getDataAtPath(dataModel, '/');
  }

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
 * Evaluate a function call.
 */
function evaluateFunction(
  call: FunctionCall,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData?: unknown
): unknown {
  const functionName = call.call;
  const funcImpl = registry.getFunction(catalogId, functionName);

  if (!funcImpl) {
    console.warn(`[Freesail] Function not found: ${functionName} in catalog ${catalogId}`);
    return undefined;
  }

  // Resolve arguments
  let rawArgs: unknown[] = [];
  if (Array.isArray(call.args)) {
    rawArgs = call.args;
  } else if (call.args && typeof call.args === 'object') {
    const entries = Object.entries(call.args);

    // Check if the registry declares paramNames for this function
    // and the keys are named (not numeric).
    // If so, reorder entries to match the declared parameter order.
    const paramNames = registry.getParamNames(catalogId as CatalogId, functionName);
    const hasNonNumericKeys = entries.some(([key]) => isNaN(parseInt(key.replace(/^'|'$/g, ''), 10)));

    if (paramNames && hasNonNumericKeys) {
      // Build a lookup from the entries
      const argMap = new Map(entries);
      // Reorder: first pull args matching declared param names in order,
      // then append any extra keys not in paramNames
      const ordered: unknown[] = [];
      const used = new Set<string>();
      for (const name of paramNames) {
        if (argMap.has(name)) {
          ordered.push(argMap.get(name));
          used.add(name);
        }
      }
      // Append remaining keys not in paramNames (preserves insertion order)
      for (const [key, value] of entries) {
        if (!used.has(key)) {
          ordered.push(value);
        }
      }
      rawArgs = ordered;
    } else {
      // Numeric keys or no paramNames — sort numerically as before
      entries.sort(([keyA], [keyB]) => {
        // Remove surrounding quotes if present to cleanly parse as number
        const numA = parseInt(keyA.replace(/^'|'$/g, ''), 10);
        const numB = parseInt(keyB.replace(/^'|'$/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        return 0; // fallback to stable sort for non-numeric keys
      });
      rawArgs = entries.map(([, value]) => value);
    }

    // Robustness: agents sometimes wrap multiple positional args in a single-key
    // object as an array, e.g. { "value": [arg0, arg1] } instead of [arg0, arg1].
    // When there is exactly one entry and its value is an array, spread it so that
    // multi-arg functions like lte(a, b) receive two arguments, not one array.
    if (rawArgs.length === 1 && Array.isArray(rawArgs[0])) {
      rawArgs = rawArgs[0] as unknown[];
    }
  }

  const args = rawArgs.map(arg => {
    if (isFunctionCall(arg)) {
      return evaluateFunction(arg, dataModel, catalogId, scopeData);
    }
    if (isDataBindingObject(arg)) {
      return resolveSingleBinding(arg, dataModel, scopeData);
    }
    // Handle nested arrays/objects in args
    if (typeof arg === 'object' && arg !== null) {
        if (Array.isArray(arg)) {
             return arg.map(item => {
                 if (isFunctionCall(item)) return evaluateFunction(item, dataModel, catalogId, scopeData);
                 if (isDataBindingObject(item)) return resolveSingleBinding(item, dataModel, scopeData);
                 return item;
             });
        }
    }
    return arg;
  });

  // formatString: pre-process the format string for ${...} template interpolation
  let callArgs = args;
  if (functionName === 'formatString' && callArgs.length > 0 && typeof callArgs[0] === 'string') {
    callArgs = [
      interpolateTemplate(
        callArgs[0] as string,
        dataModel,
        catalogId,
        scopeData,
        (nestedCall) => evaluateFunction(nestedCall, dataModel, catalogId, scopeData)
      ),
      ...callArgs.slice(1),
    ];
  }

  try {
    return funcImpl(...callArgs);
  } catch (error) {
    console.error(`[Freesail] Error evaluating function ${functionName}:`, error);
    return undefined;
  }
}

/**
 * Resolve data bindings in an action's context object.
 */
function resolveActionContext(
  context: Record<string, unknown>,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData?: unknown
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    if (isFunctionCall(value)) {
      resolved[key] = evaluateFunction(value, dataModel, catalogId, scopeData);
    } else if (isDataBindingObject(value)) {
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

// =============================================================================
// Template Interpolation (for formatString ${...} syntax)
// =============================================================================

/**
 * Finds the position of the closing brace that matches the opening brace at openPos,
 * respecting nested braces and quoted strings.
 */
function findMatchingBrace(str: string, openPos: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = openPos; i < str.length; i++) {
    const ch = str[i];
    const escaped = i > 0 && str[i - 1] === '\\';
    if (ch === "'" && !inDoubleQuote && !escaped) inSingleQuote = !inSingleQuote;
    if (ch === '"' && !inSingleQuote && !escaped) inDoubleQuote = !inDoubleQuote;
    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return i; }
    }
  }
  return -1;
}

/** Converts a value to a display string for interpolation output. */
function interpolatedValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Splits a comma-separated args string into individual tokens,
 * respecting nested ${...} and quoted strings.
 */
function splitInterpolationArgs(argsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    const escaped = i > 0 && argsStr[i - 1] === '\\';
    if (ch === "'" && !inDoubleQuote && !escaped) inSingleQuote = !inSingleQuote;
    else if (ch === '"' && !inSingleQuote && !escaped) inDoubleQuote = !inDoubleQuote;
    else if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parses a single argument token from an interpolation expression.
 * Supports: 'string', "string", number, boolean, ${nested}, bare path.
 */
function parseInterpolationValue(
  token: string,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData: unknown,
  evalFn: (call: FunctionCall) => unknown
): unknown {
  token = token.trim();
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"')))
    return token.slice(1, -1);
  if (token.startsWith('${') && token.endsWith('}'))
    return evaluateInterpolationExpr(token.slice(2, -1), dataModel, catalogId, scopeData, evalFn);
  if (token === 'true') return true;
  if (token === 'false') return false;
  const num = Number(token);
  if (!isNaN(num) && token !== '') return num;
  if (token.startsWith('/')) return getDataAtPath(dataModel, token);
  if (scopeData !== undefined) return getDataAtPath(scopeData as Record<string, unknown>, '/' + token);
  return getDataAtPath(dataModel, '/' + token);
}

/**
 * Evaluates the expression inside ${...}: either a data path or a function call.
 */
function evaluateInterpolationExpr(
  expr: string,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData: unknown,
  evalFn: (call: FunctionCall) => unknown
): unknown {
  expr = expr.trim();
  // Function call: word(...)
  if (/^\w[\w.]*\(.*\)$/s.test(expr)) {
    const parenOpen = expr.indexOf('(');
    const funcName = expr.slice(0, parenOpen).trim();
    const argsStr = expr.slice(parenOpen + 1, -1).trim();
    const args: Record<string, unknown> = {};
    if (argsStr) {
      splitInterpolationArgs(argsStr).forEach((part, index) => {
        const colonIdx = part.indexOf(':');
        if (colonIdx > 0) {
          const potentialKey = part.slice(0, colonIdx).trim();
          if (/^[a-zA-Z_]\w*$/.test(potentialKey)) {
            args[potentialKey] = parseInterpolationValue(
              part.slice(colonIdx + 1).trim(), dataModel, catalogId, scopeData, evalFn
            );
            return;
          }
        }
        args[String(index)] = parseInterpolationValue(part, dataModel, catalogId, scopeData, evalFn);
      });
    }
    return evalFn({ call: funcName, args } as unknown as FunctionCall);
  }
  // Data path
  if (expr.startsWith('/')) return getDataAtPath(dataModel, expr);
  if (scopeData !== undefined) return getDataAtPath(scopeData as Record<string, unknown>, '/' + expr);
  return getDataAtPath(dataModel, '/' + expr);
}

/**
 * Processes ${...} template expressions in a formatString format string.
 * Supports: ${/absolute/path}, ${relative/field}, ${funcName(args)},
 * nested expressions (${upper(${/name})}), and escaped literals (\${).
 */
function interpolateTemplate(
  template: string,
  dataModel: Record<string, unknown>,
  catalogId: string,
  scopeData: unknown,
  evalFn: (call: FunctionCall) => unknown
): string {
  let result = '';
  let i = 0;
  while (i < template.length) {
    // Escaped: \${ → literal ${
    if (template[i] === '\\' && template[i + 1] === '$' && template[i + 2] === '{') {
      result += '${';
      i += 3;
      continue;
    }
    // Expression: ${...}
    if (template[i] === '$' && template[i + 1] === '{') {
      const closeBrace = findMatchingBrace(template, i + 1);
      if (closeBrace === -1) { result += template[i++]; continue; }
      const expr = template.slice(i + 2, closeBrace);
      result += interpolatedValueToString(
        evaluateInterpolationExpr(expr, dataModel, catalogId, scopeData, evalFn)
      );
      i = closeBrace + 1;
      continue;
    }
    result += template[i++];
  }
  return result;
}

// =============================================================================
// Default UI States
// =============================================================================

function DefaultLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 16px',
      gap: '16px',
    }}>
      <style>{`
        @keyframes freesail-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes freesail-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {FREESAIL_LOGO_DATA_URI ? (
        <img
          src={FREESAIL_LOGO_DATA_URI}
          alt="Loading"
          style={{
            width: '48px',
            height: '48px',
            animation: 'freesail-pulse 1.5s ease-in-out infinite',
          }}
        />
      ) : (
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid var(--freesail-border, #e2e8f0)',
          borderTopColor: 'var(--freesail-primary, #2563eb)',
          borderRadius: '50%',
          animation: 'freesail-spin 0.8s linear infinite',
        }} />
      )}
      <span style={{
        fontSize: '13px',
        color: 'var(--freesail-text-secondary, #64748b)',
        letterSpacing: '0.05em',
      }}>Preparing…</span>
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
