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
  type ReactNode,
} from 'react';
import {
  createSurfaceManager,
  createTransport,
  isCreateSurfaceMessage,
  isUpdateComponentsMessage,
  isUpdateDataModelMessage,
  isDeleteSurfaceMessage,
  type SurfaceManager,
  type A2UITransport,
  type TransportOptions,
  type SurfaceId,
  type ComponentId,
  type CatalogId,
  type DownstreamMessage,
  type A2UIClientCapabilities,
} from '@freesail/core';
import { FreesailContext, type FreesailContextValue } from './context.js';
import { registerCatalog, type FreesailComponent } from './registry.js';
import type { CatalogDefinition } from './types.js';

/**
 * Props for FreesailProvider.
 */
export interface FreesailProviderProps {
  /** Child components */
  children: ReactNode;
  /** SSE endpoint URL */
  sseUrl: string;
  /** HTTP POST endpoint URL */
  postUrl: string;
  /** List of supported catalog IDs */
  catalogs?: CatalogId[];
  /**
   * Array of custom catalog definitions to register.
   * Each definition bundles a namespace, schema, and component map.
   * Components are auto-registered on mount.
   */
  catalogDefinitions?: CatalogDefinition[];
  /** Additional transport options */
  transportOptions?: Partial<Omit<TransportOptions, 'sseUrl' | 'postUrl' | 'capabilities'>>;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Root provider component for Freesail.
 *
 * Manages the transport connection and surface state,
 * making them available to all child components.
 */
export function FreesailProvider({
  children,
  sseUrl,
  postUrl,
  catalogs = [],
  catalogDefinitions = [],
  transportOptions,
  autoConnect = true,
  onConnectionChange,
  onError,
}: FreesailProviderProps) {
  const [surfaceManager] = useState<SurfaceManager>(() => createSurfaceManager());
  const [transport, setTransport] = useState<A2UITransport | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Register custom catalog definitions
  useEffect(() => {
    for (const def of catalogDefinitions) {
      registerCatalog(
        def.namespace as CatalogId,
        def.components as Record<string, FreesailComponent>,
        def.functions
      );
    }
  }, [catalogDefinitions]);

  // Merge explicit catalog IDs with catalog definition namespaces
  const mergedCatalogs = useMemo(() => {
    const definitionIds = catalogDefinitions.map((d) => d.namespace as CatalogId);
    const combined = [...catalogs, ...definitionIds];
    return Array.from(new Set(combined));
  }, [catalogs, catalogDefinitions]);

  // Build capabilities from catalogs
  const capabilities: A2UIClientCapabilities | undefined = useMemo(() => {
    if (mergedCatalogs.length === 0) return undefined;
    return { catalogs: mergedCatalogs };
  }, [mergedCatalogs]);

  // Initialize transport
  useEffect(() => {
    const newTransport = createTransport({
      sseUrl,
      postUrl,
      capabilities,
      ...transportOptions,
    });

    // Handle incoming messages
    newTransport.on('message', (message: DownstreamMessage) => {
      handleMessage(message, surfaceManager);
    });

    // Handle connection state changes
    newTransport.on('stateChange', (state) => {
      const connected = state === 'connected';
      setIsConnected(connected);
      onConnectionChange?.(connected);
    });

    // When session starts, register catalog schemas with the gateway
    newTransport.on('sessionStart', (_sessionId) => {
      if (catalogDefinitions.length > 0) {
        const schemas = catalogDefinitions
          .map((def) => def.schema)
          .filter((s) => s && Object.keys(s).length > 0);

        if (schemas.length > 0) {
          newTransport.registerCatalogs(schemas).then((ok) => {
            if (ok) {
              console.log('[Freesail] Catalogs registered with gateway');
            }
          });
        }
      }
    });

    // Handle errors
    newTransport.on('error', (error) => {
      console.error('[Freesail] Transport error:', error);
      onError?.(error);
    });

    setTransport(newTransport);

    // Auto-connect if enabled
    if (autoConnect) {
      newTransport.connect();
    }

    // Cleanup
    return () => {
      newTransport.disconnect();
      surfaceManager.dispose();
    };
  }, [sseUrl, postUrl]); // Only recreate if URLs change

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

      // Always send all surface data models that have sendDataModel enabled.
      // This ensures the agent can see all form/input state across all surfaces,
      // not just the one that triggered this action.
      const allDataModels = surfaceManager.getAllSendableDataModels();
      const dataModel = Object.keys(allDataModels).length > 0
        ? { surfaceId, dataModel: allDataModels }
        : undefined;

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

  return (
    <FreesailContext.Provider value={contextValue}>
      {children}
    </FreesailContext.Provider>
  );
}

// =============================================================================
// Message Handler
// =============================================================================

function handleMessage(message: DownstreamMessage, manager: SurfaceManager): void {
  if (isCreateSurfaceMessage(message)) {
    const { surfaceId, catalogId, theme, sendDataModel } = message.createSurface;
    manager.createSurface({ surfaceId, catalogId, theme, sendDataModel });
  } else if (isUpdateComponentsMessage(message)) {
    const { surfaceId, components } = message.updateComponents;
    manager.updateComponents(surfaceId, components);
  } else if (isUpdateDataModelMessage(message)) {
    const { surfaceId, path, value } = message.updateDataModel;
    manager.updateDataModel(surfaceId, path, value);
  } else if (isDeleteSurfaceMessage(message)) {
    const { surfaceId } = message.deleteSurface;
    manager.deleteSurface(surfaceId);
  }
}
