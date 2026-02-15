/**
 * @fileoverview Surface State Manager
 *
 * Manages the state of UI surfaces including component trees,
 * data models, and theme settings.
 */

import type {
  SurfaceId,
  CatalogId,
  ComponentId,
  A2UIComponent,
  JsonPointer,
  SurfaceTheme,
  ClientErrorCode,
} from './protocol.js';

/**
 * Represents a managed UI surface.
 */
export interface Surface {
  /** Surface identifier */
  id: SurfaceId;
  /** Catalog this surface is bound to */
  catalogId: CatalogId;
  /** Component tree (flat map by component ID) */
  components: Map<ComponentId, A2UIComponent>;
  /** Root component ID */
  rootId: ComponentId | null;
  /** Data model */
  dataModel: Record<string, unknown>;
  /** Theme configuration */
  theme: SurfaceTheme | null;
  /** Whether to send data model with actions */
  sendDataModel: boolean;
  /** Surface creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Configuration for creating a surface.
 */
export interface CreateSurfaceOptions {
  surfaceId: SurfaceId;
  catalogId: CatalogId;
  theme?: SurfaceTheme;
  sendDataModel?: boolean;
}

/**
 * Error info for client-to-server error reporting.
 */
export interface SurfaceError {
  code: ClientErrorCode;
  message: string;
  surfaceId: SurfaceId;
  path?: string;
  componentId?: ComponentId;
}

/**
 * Events emitted by the SurfaceManager.
 */
export interface SurfaceManagerEvents {
  surfaceCreated: (surface: Surface) => void;
  surfaceDeleted: (surfaceId: SurfaceId) => void;
  componentsUpdated: (surfaceId: SurfaceId, components: A2UIComponent[]) => void;
  dataModelUpdated: (surfaceId: SurfaceId, path: JsonPointer, value: unknown) => void;
  error: (error: SurfaceError) => void;
}

type EventCallback<K extends keyof SurfaceManagerEvents> = SurfaceManagerEvents[K];

/**
 * Manages multiple UI surfaces and their state.
 */
export class SurfaceManager {
  private surfaces: Map<SurfaceId, Surface> = new Map();
  private listeners: Map<
    keyof SurfaceManagerEvents,
    Set<EventCallback<keyof SurfaceManagerEvents>>
  > = new Map();

  /**
   * Create a new surface.
   */
  createSurface(options: CreateSurfaceOptions): Surface {
    const { surfaceId, catalogId, theme, sendDataModel } = options;

    if (this.surfaces.has(surfaceId)) {
      // Surface already exists, update if different
      const existing = this.surfaces.get(surfaceId)!;
      if (existing.catalogId !== catalogId) {
        existing.catalogId = catalogId;
        existing.updatedAt = Date.now();
      }
      if (theme) {
        existing.theme = theme;
      }
      if (sendDataModel !== undefined) {
        existing.sendDataModel = sendDataModel;
      }
      return existing;
    }

    const surface: Surface = {
      id: surfaceId,
      catalogId,
      components: new Map(),
      rootId: null,
      dataModel: {},
      theme: theme ?? null,
      sendDataModel: sendDataModel ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.surfaces.set(surfaceId, surface);
    this.emit('surfaceCreated', surface);

    return surface;
  }

  /**
   * Delete a surface and clean up resources.
   */
  deleteSurface(surfaceId: SurfaceId): boolean {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      this.emitSurfaceNotFoundError(surfaceId, 'deleteSurface');
      return false;
    }

    this.surfaces.delete(surfaceId);
    this.emit('surfaceDeleted', surfaceId);

    return true;
  }

  /**
   * Get a surface by ID.
   */
  getSurface(surfaceId: SurfaceId): Surface | undefined {
    return this.surfaces.get(surfaceId);
  }

  /**
   * Get all surfaces.
   */
  getAllSurfaces(): Surface[] {
    return Array.from(this.surfaces.values());
  }

  /**
   * Update components in a surface.
   */
  updateComponents(surfaceId: SurfaceId, components: A2UIComponent[]): boolean {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      this.emitSurfaceNotFoundError(surfaceId, 'updateComponents');
      return false;
    }

    for (const component of components) {
      surface.components.set(component.id, component);

      // Track root component
      if (component.id === 'root') {
        surface.rootId = component.id;
      } else if (surface.rootId === null) {
        // Fallback to first component if no 'root' found yet
        surface.rootId = component.id;
      }
    }

    surface.updatedAt = Date.now();
    this.emit('componentsUpdated', surfaceId, components);

    return true;
  }

  /**
   * Update the data model for a surface.
   * In v0.9, we use simple path + value semantics (upsert).
   */
  updateDataModel(
    surfaceId: SurfaceId,
    path: JsonPointer = '/',
    value?: unknown
  ): boolean {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) {
      this.emitSurfaceNotFoundError(surfaceId, 'updateDataModel');
      return false;
    }

    if (path === '/' || path === '') {
      // Root update
      if (value === undefined) {
        surface.dataModel = {};
      } else {
        surface.dataModel = (value as Record<string, unknown>) ?? {};
      }
    } else {
      // Nested update using JSON pointer
      if (value === undefined) {
        // Remove the key at path
        this.removeAtJsonPointer(surface.dataModel, path);
      } else {
        // Set the value at path
        this.setAtJsonPointer(surface.dataModel, path, value);
      }
    }

    surface.updatedAt = Date.now();
    this.emit('dataModelUpdated', surfaceId, path, value);

    return true;
  }

  /**
   * Get the data model for a surface (for sendDataModel feature).
   */
  getDataModel(surfaceId: SurfaceId): Record<string, unknown> | undefined {
    const surface = this.surfaces.get(surfaceId);
    return surface?.dataModel;
  }

  /**
   * Get data models for ALL surfaces that have sendDataModel enabled.
   * Returns a map of surfaceId → dataModel.
   */
  getAllSendableDataModels(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [id, surface] of this.surfaces) {
      if (surface.sendDataModel) {
        result[id as string] = surface.dataModel;
      }
    }
    return result;
  }

  /**
   * Check if a surface has sendDataModel enabled.
   */
  shouldSendDataModel(surfaceId: SurfaceId): boolean {
    const surface = this.surfaces.get(surfaceId);
    return surface?.sendDataModel ?? false;
  }

  /**
   * Report a component render error.
   * Called when the client fails to render a component.
   */
  reportComponentRenderError(
    surfaceId: SurfaceId,
    componentId: ComponentId,
    errorMessage: string
  ): void {
    this.emit('error', {
      code: 'COMPONENT_RENDER_FAILED',
      message: errorMessage,
      surfaceId,
      componentId,
    });
  }

  /**
   * Subscribe to events.
   */
  on<K extends keyof SurfaceManagerEvents>(
    event: K,
    callback: SurfaceManagerEvents[K]
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<keyof SurfaceManagerEvents>);

    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<keyof SurfaceManagerEvents>);
    };
  }

  /**
   * Clean up all surfaces and resources.
   */
  dispose(): void {
    this.surfaces.clear();
    this.listeners.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private emit<K extends keyof SurfaceManagerEvents>(
    event: K,
    ...args: Parameters<SurfaceManagerEvents[K]>
  ): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          (callback as (...args: Parameters<SurfaceManagerEvents[K]>) => void)(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  private emitSurfaceNotFoundError(surfaceId: SurfaceId, operation: string): void {
    this.emit('error', {
      code: 'SURFACE_NOT_FOUND',
      message: `Surface '${surfaceId}' not found during ${operation}`,
      surfaceId,
    });
  }

  private setAtJsonPointer(
    obj: Record<string, unknown>,
    pointer: JsonPointer,
    value: unknown
  ): void {
    const parts = pointer.split('/').filter((p) => p !== '');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  private removeAtJsonPointer(
    obj: Record<string, unknown>,
    pointer: JsonPointer
  ): void {
    const parts = pointer.split('/').filter((p) => p !== '');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current)) {
        return; // Path doesn't exist
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      delete current[lastPart];
    }
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string,
    result: Record<string, unknown>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = `${prefix}/${key}`;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenObject(value as Record<string, unknown>, path, result);
      } else {
        result[path] = value;
      }
    }
  }
}

/**
 * Create a new surface manager.
 */
export function createSurfaceManager(): SurfaceManager {
  return new SurfaceManager();
}
