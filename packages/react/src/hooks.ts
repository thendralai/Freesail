/**
 * @fileoverview Freesail React Hooks
 *
 * Custom hooks for interacting with Freesail surfaces and data.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SurfaceId, Surface, JsonPointer, ComponentId } from '@freesail/core';
import { useFreesailContext } from './context.js';

/**
 * Hook to access and subscribe to a specific surface.
 */
export function useSurface(surfaceId: SurfaceId): Surface | undefined {
  const { surfaceManager, getSurface } = useFreesailContext();
  const [surface, setSurface] = useState<Surface | undefined>(() =>
    getSurface(surfaceId)
  );

  useEffect(() => {
    // Initial state
    setSurface(getSurface(surfaceId));

    // Subscribe to surface changes
    const unsubCreate = surfaceManager.on('surfaceCreated', (created) => {
      if (created.id === surfaceId) {
        setSurface(created);
      }
    });

    const unsubDelete = surfaceManager.on('surfaceDeleted', (deletedId) => {
      if (deletedId === surfaceId) {
        setSurface(undefined);
      }
    });

    const unsubComponents = surfaceManager.on('componentsUpdated', (updatedId) => {
      if (updatedId === surfaceId) {
        setSurface({ ...getSurface(surfaceId)! });
      }
    });

    const unsubData = surfaceManager.on('dataModelUpdated', (updatedId) => {
      if (updatedId === surfaceId) {
        setSurface({ ...getSurface(surfaceId)! });
      }
    });

    return () => {
      unsubCreate();
      unsubDelete();
      unsubComponents();
      unsubData();
    };
  }, [surfaceId, surfaceManager, getSurface]);

  return surface;
}

/**
 * Hook to access data from a surface's data model.
 */
export function useSurfaceData<T = unknown>(
  surfaceId: SurfaceId,
  path?: JsonPointer
): T | undefined {
  const { surfaceManager, getSurface } = useFreesailContext();
  const [data, setData] = useState<T | undefined>(() => {
    const surface = getSurface(surfaceId);
    if (!surface) return undefined;
    return getDataAtPath(surface.dataModel, path) as T;
  });

  useEffect(() => {
    const surface = getSurface(surfaceId);
    if (surface) {
      setData(getDataAtPath(surface.dataModel, path) as T);
    }

    const unsub = surfaceManager.on('dataModelUpdated', (updatedId, updatedPath) => {
      if (updatedId === surfaceId) {
        // Check if the update affects our path
        if (!path || updatedPath.startsWith(path) || path.startsWith(updatedPath)) {
          const currentSurface = getSurface(surfaceId);
          if (currentSurface) {
            setData(getDataAtPath(currentSurface.dataModel, path) as T);
          }
        }
      }
    });

    return unsub;
  }, [surfaceId, path, surfaceManager, getSurface]);

  return data;
}

/**
 * Hook to send user actions (v0.9 format).
 */
export function useAction(surfaceId: SurfaceId) {
  const { sendAction } = useFreesailContext();

  const dispatch = useCallback(
    async (
      name: string,
      sourceComponentId: ComponentId,
      context: Record<string, unknown> = {}
    ) => {
      await sendAction(surfaceId, name, sourceComponentId, context);
    },
    [surfaceId, sendAction]
  );

  return dispatch;
}

/**
 * Hook to get connection status.
 */
export function useConnectionStatus(): {
  isConnected: boolean;
} {
  const { isConnected } = useFreesailContext();
  return useMemo(() => ({ isConnected }), [isConnected]);
}

/**
 * Hook to get all surfaces.
 */
export function useSurfaces(): Surface[] {
  const { surfaceManager } = useFreesailContext();
  const [surfaces, setSurfaces] = useState<Surface[]>(() =>
    surfaceManager.getAllSurfaces()
  );

  useEffect(() => {
    setSurfaces(surfaceManager.getAllSurfaces());

    const unsubCreate = surfaceManager.on('surfaceCreated', () => {
      setSurfaces(surfaceManager.getAllSurfaces());
    });

    const unsubDelete = surfaceManager.on('surfaceDeleted', () => {
      setSurfaces(surfaceManager.getAllSurfaces());
    });

    return () => {
      unsubCreate();
      unsubDelete();
    };
  }, [surfaceManager]);

  return surfaces;
}

// =============================================================================
// Helpers
// =============================================================================

function getDataAtPath(
  data: Record<string, unknown>,
  path?: JsonPointer
): unknown {
  if (!path || path === '/') {
    return data;
  }

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
