/**
 * @fileoverview FreesailProvider Component
 *
 * The root provider component that manages Freesail connections
 * and state for the React application.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  createSurfaceManager,
  createTransport,
  isCreateSurfaceMessage,
  isUpdateComponentsMessage,
  isUpdateDataModelMessage,
  isDeleteSurfaceMessage,
  isGetDataModelMessage,
  type SurfaceManager,
  type SurfaceError,
  type SerializedSurface,
  type A2UITransport,
  type TransportOptions,
  type SurfaceId,
  type ComponentId,
  type CatalogId,
  type DownstreamMessage,
  type A2UIClientCapabilities,
  type A2UIComponent,
  type JsonPointer,
} from '@freesail/core';
import { FreesailContext, type FreesailContextValue } from './context.js';
import { registerCatalog, type FreesailComponent } from './registry.js';
import type { CatalogDefinition } from './types.js';
import { resolveTokens, tokensToCssVars, type FreesailThemeProp, type FreesailThemeMode } from './theme-utils.js';
import { ThemeContext, type FreesailTheme } from './theme.js';

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Returned by a surface operation interceptor.
 * allowed: whether to proceed with the operation.
 * message: if allowed and non-empty, FreesailProvider sends a
 *          'client_side_validation_message' action upstream.
 *          If not allowed, appended to the operation-specific error.
 */
export type SurfaceInterceptorResult = { allowed: boolean; message: string };

/**
 * Props for FreesailProvider.
 */
export interface FreesailProviderProps {
  /** Child components */
  children: ReactNode;
  /** Theme to apply to Freesail surfaces. Defaults to light mode if undefined. */
  theme?: FreesailThemeProp;
  /**
   * Base gateway URL. SSE and POST endpoints are derived automatically.
   *
   * Omit (or leave as default '') when the app and gateway share the same origin —
   * i.e. the gateway is reverse-proxied onto the same domain (nginx in production,
   * Vite proxy in dev). Requests will use relative paths and no CORS is needed.
   *
   * Set explicitly when the gateway is on a different origin:
   *   gateway="https://gateway.example.com"
   */
  gateway?: string;
  /**
   * Optional name to scope this provider's session within the same gateway.
   * Only needed when two providers on the same page connect to the same gateway
   * (e.g. two independent same-origin shells embedded in a portal).
   *
   * Defaults to a key derived from the current pathname, which is correct for
   * the typical case of one provider per page or one provider in the app shell.
   *
   * Analogous to <input name="..."> — a stable, developer-assigned identity.
   */
  name?: string;
  /**
   * Array of catalogs to register.
   * Each definition bundles a namespace, schema, and component map.
   * Components are auto-registered on mount.
   */
  catalogs?: CatalogDefinition[];
  /** Additional transport options */
  transportOptions?: Partial<Omit<TransportOptions, 'gateway' | 'capabilities' | 'name'>>;
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /**
   * Extra capability key/values merged into the standard catalog list
   * advertised to the agent on every upstream message.
   * e.g. { MaxAgentSurfaceCount: 5 }
   */
  additionalCapabilities?: Record<string, unknown>;
  /** Called before honouring an agent createSurface. Return allowed: false to block. */
  onBeforeCreateSurface?: (
    surfaceId: SurfaceId,
    catalogId: CatalogId,
    sendDataModel: boolean | undefined,
    surfaceManager: SurfaceManager
  ) => SurfaceInterceptorResult | Promise<SurfaceInterceptorResult>;
  /** Called before honouring an agent updateComponents. Return allowed: false to block. */
  onBeforeUpdateComponents?: (
    surfaceId: SurfaceId,
    components: A2UIComponent[],
    surfaceManager: SurfaceManager
  ) => SurfaceInterceptorResult | Promise<SurfaceInterceptorResult>;
  /** Called before honouring an agent updateDataModel. Return allowed: false to block. */
  onBeforeUpdateDataModel?: (
    surfaceId: SurfaceId,
    path: JsonPointer | undefined,
    value: unknown,
    surfaceManager: SurfaceManager
  ) => SurfaceInterceptorResult | Promise<SurfaceInterceptorResult>;
  /** Called before honouring an agent deleteSurface. Return allowed: false to block. */
  onBeforeDeleteSurface?: (
    surfaceId: SurfaceId,
    surfaceManager: SurfaceManager
  ) => SurfaceInterceptorResult | Promise<SurfaceInterceptorResult>;
}

/** Tracks derived sessionStorage keys of currently mounted providers to detect duplicates. */
const mountedProviderKeys = new Set<string>();

/**
 * Root provider component for Freesail.
 *
 * Manages the transport connection and surface state,
 * making them available to all child components.
 */
export function FreesailProvider({
  children,
  theme,
  gateway = '',
  name,
  catalogs = [],
  transportOptions,
  onConnectionChange,
  onError,
  additionalCapabilities,
  onBeforeCreateSurface,
  onBeforeUpdateComponents,
  onBeforeUpdateDataModel,
  onBeforeDeleteSurface,
}: FreesailProviderProps) {
  const [surfaceManager] = useState<SurfaceManager>(() => createSurfaceManager());
  const [transport, setTransport] = useState<A2UITransport | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Track surfaces deleted by agent messages so we don't echo them back
  const agentDeletedRef = useRef<Set<string>>(new Set());
  // Refs for callbacks so the transport effect always uses current values
  // without needing to be recreated when callbacks change
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onErrorRef = useRef(onError);
  const catalogsRef = useRef(catalogs);
  const interceptorsRef = useRef({ onBeforeCreateSurface, onBeforeUpdateComponents, onBeforeUpdateDataModel, onBeforeDeleteSurface });
  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
    onErrorRef.current = onError;
    catalogsRef.current = catalogs;
    interceptorsRef.current = { onBeforeCreateSurface, onBeforeUpdateComponents, onBeforeUpdateDataModel, onBeforeDeleteSurface };
  });

  // Register custom catalog definitions
  useEffect(() => {
    for (const def of catalogs) {
      registerCatalog(
        def.namespace as CatalogId,
        def.components as Record<string, FreesailComponent>,
        def.functions,
        def.schema as Record<string, unknown> | undefined
      );
    }
  }, [catalogs]);

  const mergedCatalogs = useMemo(() => {
    return catalogs.map((d) => d.namespace as CatalogId);
  }, [catalogs]);

  // Build capabilities from catalogs and any additional custom capabilities
  const capabilities: A2UIClientCapabilities | undefined = useMemo(() => {
    const hasExtra = additionalCapabilities && Object.keys(additionalCapabilities).length > 0;
    if (mergedCatalogs.length === 0 && !hasExtra) return undefined;
    return { catalogs: mergedCatalogs, ...additionalCapabilities };
  }, [mergedCatalogs, additionalCapabilities]);

  // Propagate runtime capability changes to the transport.
  // Skips the initial render — the transport creation effect already captures the initial value.
  const isFirstCapabilitiesRender = useRef(true);
  useEffect(() => {
    if (isFirstCapabilitiesRender.current) { isFirstCapabilitiesRender.current = false; return; }
    transport?.updateCapabilities(capabilities);
  }, [capabilities, transport]);

  // Initialize transport
  useEffect(() => {
    // Warn if two providers on the same page share the same derived sessionStorage key —
    // this likely means they will compete for the same session.
    // Import deriveStorageKey logic inline via the transport's own key derivation:
    // We reconstruct the key the same way transport.ts does to detect the collision.
    const hostname = gateway
      ? (() => { try { return new URL(gateway, window.location.href).hostname; } catch { return window.location.hostname; } })()
      : window.location.hostname;
    const hostSlug = hostname.replace(/[^a-zA-Z0-9]/g, '_');
    const scope = name
      ? name
      : (window.location.pathname.replace(/\/$/, '').replace(/\//g, '_') || '_');
    const providerKey = `freesail_session_${hostSlug}_${scope}`;

    if (mountedProviderKeys.has(providerKey)) {
      console.warn(
        `[FreesailProvider] Two providers share the same session key "${providerKey}". ` +
        `Use the 'name' prop to distinguish them.`
      );
    }
    mountedProviderKeys.add(providerKey);

    const newTransport = createTransport({
      gateway,
      name,
      capabilities,
      ...transportOptions,
    });

    // Handle incoming messages
    newTransport.on('message', (message: DownstreamMessage) => {
      if (isGetDataModelMessage(message)) {
        const { surfaceId } = message.getDataModel;
        const dataModel = surfaceManager.getDataModel(surfaceId);
        newTransport.sendAction(
          surfaceId,
          '__get_data_model_response',
          '__system' as ComponentId,
          { current_data_model: dataModel ?? {} }
        );
        return;
      }
      void handleMessage(message, surfaceManager, agentDeletedRef.current, newTransport, interceptorsRef.current);
    });

    // Notify agent when a surface is deleted client-side (e.g. disconnect cleanup)
    const unsubSurfaceDeleted = surfaceManager.on('surfaceDeleted', (surfaceId: SurfaceId) => {
      if (agentDeletedRef.current.delete(surfaceId as string)) {
        // Agent-initiated delete — don't echo back
        return;
      }
      // Client-initiated delete — notify the agent
      newTransport.sendAction(
        surfaceId,
        'surface_deleted',
        '__system' as ComponentId,
        { surfaceId, reason: 'client' }
      );
    });

    // When a surface has no components after the orphan timeout,
    // send a reminder action so the agent can decide to delete it.
    const unsubOrphan = surfaceManager.on('surfaceOrphan', (surfaceId: SurfaceId) => {
      newTransport.sendAction(
        surfaceId,
        'surface_cleanup_reminder',
        '__system' as ComponentId,
        { surfaceId, message: `Surface ${String(surfaceId)} has no components. You may have forgotten to call update_components, or a previous attempt to update components may have failed. Use the surface or delete it if it is no longer needed.` }
      );
    });

    // When orphan components are detected, remind the agent to wire them up
    const unsubOrphanComponents = surfaceManager.on('orphanComponents', (surfaceId: SurfaceId, componentIds: ComponentId[]) => {
      newTransport.sendAction(
        surfaceId,
        'orphan_components_reminder',
        '__system' as ComponentId,
        {
          surfaceId,
          componentIds,
          message: `These components in surface '${String(surfaceId)}' are not reachable from root and won't render: ${componentIds.join(', ')}. Did you forget to wire them to a parent component? Please update the parent to include them, or ignore if this was intentional.`,
        }
      );
    });

    // Handle connection state changes
    newTransport.on('stateChange', (state: string) => {
      const connected = state === 'connected';
      setIsConnected(connected);

      if (state === 'disconnected') {
        // Clear all surfaces when connection is lost
        surfaceManager.clearSurfaces();
      }

      onConnectionChangeRef.current?.(connected);
    });

    // Persist surface state to sessionStorage on every significant change so it
    // survives page refresh. Debounced to avoid flooding on rapid dataModel updates.
    const saveSurfaceState = debounce(() => {
      const sid = newTransport.sessionId;
      if (!sid) return;
      try {
        sessionStorage.setItem(
          `freesail_surfaces_${sid}`,
          JSON.stringify(surfaceManager.snapshot())
        );
      } catch {
        // sessionStorage unavailable (SSR, quota exceeded) — fail silently
      }
    }, 300);

    const unsubSaveCreated   = surfaceManager.on('surfaceCreated',    saveSurfaceState);
    const unsubSaveUpdated   = surfaceManager.on('componentsUpdated', saveSurfaceState);
    const unsubSaveDataModel = surfaceManager.on('dataModelUpdated',  saveSurfaceState);
    const unsubSaveDeleted   = surfaceManager.on('surfaceDeleted',    saveSurfaceState);

    // When session starts, restore surface state from sessionStorage (covers page refresh
    // within the gateway's reconnect grace period), then register catalog schemas.
    // Note: restore() overwrites surfaces that were pre-created by client bootstrapping
    // code (e.g. ChatBootstrapper) so that saved state wins over empty initial defaults.
    newTransport.on('sessionStart', (sessionId: string) => {
      try {
        const saved = sessionStorage.getItem(`freesail_surfaces_${sessionId}`);
        if (saved) {
          const snapshots = JSON.parse(saved) as SerializedSurface[];
          surfaceManager.restore(snapshots);
        }
      } catch {
        // Corrupt storage or SSR — start fresh
      }

      const defs = catalogsRef.current;
      if (defs.length > 0) {
        const schemas = defs
          .map((def) => def.schema)
          .filter((s) => s && Object.keys(s).length > 0);

        if (schemas.length > 0) {
          newTransport.registerCatalogs(schemas).then((ok: boolean) => {
            if (ok) {
              console.log('[Freesail] Catalogs registered with gateway');
            }
          });
        }
      }
    });

    // Forward surface manager errors upstream so the agent can react to them
    const unsubError = surfaceManager.on('error', (error: SurfaceError) => {
      newTransport.sendError(error.surfaceId, error.code, error.message, error.path);
    });

    // Handle errors
    newTransport.on('error', (error: Error) => {
      console.error('[Freesail] Transport error:', error);
      onErrorRef.current?.(error);
    });

    setTransport(newTransport);

    newTransport.connect();

    // Cleanup
    return () => {
      mountedProviderKeys.delete(providerKey);
      unsubSurfaceDeleted();
      unsubOrphan();
      unsubOrphanComponents();
      unsubError();
      unsubSaveCreated();
      unsubSaveUpdated();
      unsubSaveDataModel();
      unsubSaveDeleted();
      newTransport.disconnect();
      surfaceManager.dispose();
    };
  }, [gateway]); // Only recreate if gateway URL changes

  // Send action callback (v0.9 format)
  const sendAction = useCallback(
    async (
      surfaceId: SurfaceId,
      name: string,
      sourceComponentId: ComponentId,
      context: Record<string, unknown>
    ) => {
      if (!transport) {
        console.warn('[Freesail] Cannot send action: transport not initialized');
        return;
      }

      // Send only the data model of the surface that triggered the action.
      let dataModel: { surfaceId: SurfaceId; dataModel: Record<string, unknown> } | undefined;
      if (surfaceManager.shouldSendDataModel(surfaceId)) {
        const model = surfaceManager.getDataModel(surfaceId);
        if (model && Object.keys(model).length > 0) {
          // Filter out __-prefixed paths (client-only internal state)
          const filtered: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(model)) {
            if (!key.startsWith('__')) {
              filtered[key] = value;
            }
          }
          if (Object.keys(filtered).length > 0) {
            dataModel = { surfaceId, dataModel: filtered };
          }
        }
      }

      await transport.sendAction(surfaceId, name, sourceComponentId, context, dataModel);
    },
    [transport, surfaceManager]
  );

  // Get surface callback
  const getSurface = useCallback(
    (surfaceId: SurfaceId) => surfaceManager.getSurface(surfaceId),
    [surfaceManager]
  );

  // Context value
  const contextValue: FreesailContextValue = useMemo(
    () => ({
      surfaceManager,
      transport,
      sendAction,
      getSurface,
      isConnected,
    }),
    [surfaceManager, transport, sendAction, getSurface, isConnected]
  );

  const resolvedTheme = useMemo(() => resolveTokens(theme) || resolveTokens('light'), [theme]);
  const currentTheme = useMemo<FreesailTheme>(() => {
    return { mode: (theme === 'dark' ? 'dark' : 'light') as FreesailThemeMode, tokens: resolvedTheme! };
  }, [resolvedTheme, theme]);
  const cssVars = useMemo(() => tokensToCssVars(resolvedTheme!, currentTheme.mode), [resolvedTheme, currentTheme.mode]);

  return (
    <ThemeContext.Provider value={currentTheme}>
      <FreesailContext.Provider value={contextValue}>
        <div style={{ display: 'contents', ...cssVars }}>
          {children}
        </div>
      </FreesailContext.Provider>
    </ThemeContext.Provider>
  );
}

// =============================================================================
// Message Handler
// =============================================================================

async function handleMessage(
  message: DownstreamMessage,
  manager: SurfaceManager,
  agentDeleted: Set<string>,
  transport: A2UITransport,
  interceptors: {
    onBeforeCreateSurface?: FreesailProviderProps['onBeforeCreateSurface'];
    onBeforeUpdateComponents?: FreesailProviderProps['onBeforeUpdateComponents'];
    onBeforeUpdateDataModel?: FreesailProviderProps['onBeforeUpdateDataModel'];
    onBeforeDeleteSurface?: FreesailProviderProps['onBeforeDeleteSurface'];
  }
): Promise<void> {
  if (isCreateSurfaceMessage(message)) {
    const { surfaceId, catalogId, sendDataModel } = message.createSurface;
    if (interceptors.onBeforeCreateSurface) {
      const { allowed, message: msg } = await interceptors.onBeforeCreateSurface(surfaceId, catalogId, sendDataModel, manager);
      if (!allowed) {
        transport.sendError(surfaceId, 'CLIENT_SIDE_VALIDATION_FAILURE', `Create surface operation failed: ${msg}`);
        return;
      }
      if (msg) {
        transport.sendAction(surfaceId, 'client_side_validation_message', '__system' as ComponentId, { message: msg });
      }
    }
    manager.createSurface({ surfaceId, catalogId, sendDataModel });
  } else if (isUpdateComponentsMessage(message)) {
    const { surfaceId, components } = message.updateComponents;
    if (interceptors.onBeforeUpdateComponents) {
      const { allowed, message: msg } = await interceptors.onBeforeUpdateComponents(surfaceId, components, manager);
      if (!allowed) {
        const ids = components.map((c: A2UIComponent) => c.id).join(', ');
        transport.sendError(surfaceId, 'CLIENT_SIDE_VALIDATION_FAILURE', `Update components operation failed for components [${ids}]: ${msg}`);
        return;
      }
      if (msg) {
        transport.sendAction(surfaceId, 'client_side_validation_message', '__system' as ComponentId, { message: msg });
      }
    }
    manager.updateComponents(surfaceId, components);
  } else if (isUpdateDataModelMessage(message)) {
    const { surfaceId, path, value } = message.updateDataModel;
    if (interceptors.onBeforeUpdateDataModel) {
      const { allowed, message: msg } = await interceptors.onBeforeUpdateDataModel(surfaceId, path, value, manager);
      if (!allowed) {
        const pathDisplay = path ?? '/';
        transport.sendError(surfaceId, 'CLIENT_SIDE_VALIDATION_FAILURE', `Update data model operation failed at paths [${pathDisplay}]: ${msg}`);
        return;
      }
      if (msg) {
        transport.sendAction(surfaceId, 'client_side_validation_message', '__system' as ComponentId, { message: msg });
      }
    }
    manager.updateDataModel(surfaceId, path, value);
  } else if (isDeleteSurfaceMessage(message)) {
    const { surfaceId } = message.deleteSurface;
    if (interceptors.onBeforeDeleteSurface) {
      const { allowed, message: msg } = await interceptors.onBeforeDeleteSurface(surfaceId, manager);
      if (!allowed) {
        transport.sendError(surfaceId, 'CLIENT_SIDE_VALIDATION_FAILURE', `Delete surface operation failed: ${msg}`);
        return;
      }
      if (msg) {
        transport.sendAction(surfaceId, 'client_side_validation_message', '__system' as ComponentId, { message: msg });
      }
    }
    agentDeleted.add(surfaceId as string);
    manager.deleteSurface(surfaceId);
  }
}
