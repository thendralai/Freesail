/**
 * @fileoverview Freesail React Context
 *
 * Provides React context for Freesail state management.
 */

import { createContext, useContext } from 'react';
import type {
  SurfaceManager,
  A2UITransport,
  Surface,
  SurfaceId,
  ComponentId,
  A2UIClientDataModel,
} from '@freesail/core';

/**
 * Freesail context value.
 */
export interface FreesailContextValue {
  /** Surface manager instance */
  surfaceManager: SurfaceManager;
  /** Transport instance (may be null if not connected) */
  transport: A2UITransport | null;
  /** Send an action (v0.9 format) */
  sendAction: (
    surfaceId: SurfaceId,
    name: string,
    sourceComponentId: ComponentId,
    context: Record<string, unknown>
  ) => Promise<void>;
  /** Get a surface by ID */
  getSurface: (surfaceId: SurfaceId) => Surface | undefined;
  /** Connection state */
  isConnected: boolean;
}

/**
 * React context for Freesail.
 */
export const FreesailContext = createContext<FreesailContextValue | null>(null);

/**
 * Hook to access the Freesail context.
 * Throws if used outside of a FreesailProvider.
 */
export function useFreesailContext(): FreesailContextValue {
  const context = useContext(FreesailContext);
  if (!context) {
    throw new Error('useFreesailContext must be used within a FreesailProvider');
  }
  return context;
}
