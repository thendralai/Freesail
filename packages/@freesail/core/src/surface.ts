/**
 * @fileoverview Surface State Manager
 *
 * Manages the state of UI surfaces including component trees,
 * data models, and theme settings.
 */

import {
  isChildListTemplate,
  type SurfaceId,
  type CatalogId,
  type ComponentId,
  type A2UIComponent,
  type JsonPointer,
  type ClientErrorCode,
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
  /** Fired when a surface has not received updateComponents within the orphan timeout */
  surfaceOrphan: (surfaceId: SurfaceId) => void;
  /** Fired when components exist in the surface but aren't reachable from the root */
  orphanComponents: (surfaceId: SurfaceId, componentIds: ComponentId[]) => void;
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
  /** Timers for auto-deleting surfaces that never receive updateComponents */
  private orphanTimers: Map<SurfaceId, ReturnType<typeof setTimeout>> = new Map();
  /** Periodic timers for detecting orphan (unreachable) components */
  private orphanComponentTimers: Map<SurfaceId, ReturnType<typeof setInterval>> = new Map();
  /** Last known orphan component IDs per surface — used to detect newly orphaned components */
  private lastOrphanSets: Map<SurfaceId, Set<ComponentId>> = new Map();
  /** How long (ms) to wait for updateComponents before deleting a new surface (default: 60s) */
  private readonly orphanSurfaceTimeout = 60_000;
  /** How often (ms) to check for orphan components (default: 30s) */
  private readonly orphanComponentCheckInterval = 30_000;

  /**
   * Create a new surface.
   */
  createSurface(options: CreateSurfaceOptions): Surface {
    const { surfaceId, catalogId, sendDataModel } = options;

    if (this.surfaces.has(surfaceId)) {
      // Surface already exists, update if different
      const existing = this.surfaces.get(surfaceId)!;
      if (existing.catalogId !== catalogId) {
        existing.catalogId = catalogId;
        existing.updatedAt = Date.now();
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
      sendDataModel: sendDataModel ?? false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.surfaces.set(surfaceId, surface);
    this.emit('surfaceCreated', surface);

    // Start orphan timer — if updateComponents isn't called within the
    // timeout, emit a surfaceOrphan event so the client can remind the
    // agent to clean up. Client-managed surfaces (__) are exempt.
    if (!surfaceId.startsWith('__') && this.orphanSurfaceTimeout > 0) {
      const existingOrphanTimer = this.orphanTimers.get(surfaceId);
      if (existingOrphanTimer) clearTimeout(existingOrphanTimer);
      const timer = setTimeout(() => {
        this.orphanTimers.delete(surfaceId);
        const s = this.surfaces.get(surfaceId);
        if (s && s.components.size === 0) {
          console.warn(`[Freesail] Surface '${String(surfaceId)}' has no components after ${this.orphanSurfaceTimeout}ms — notifying agent`);
          this.emit('surfaceOrphan', surfaceId);
        }
      }, this.orphanSurfaceTimeout);
      this.orphanTimers.set(surfaceId, timer);
    }

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

    // Cancel any pending orphan timer
    const orphanTimer = this.orphanTimers.get(surfaceId);
    if (orphanTimer) {
      clearTimeout(orphanTimer);
      this.orphanTimers.delete(surfaceId);
    }

    // Cancel any pending orphan-component timer
    const orphanComponentTimer = this.orphanComponentTimers.get(surfaceId);
    if (orphanComponentTimer) {
      clearInterval(orphanComponentTimer);
      this.orphanComponentTimers.delete(surfaceId);
    }
    this.lastOrphanSets.delete(surfaceId);

    this.surfaces.delete(surfaceId);
    this.emit('surfaceDeleted', surfaceId);

    return true;
  }

  /**
   * Clear all active surfaces except those that start with __ (which are client managed)
   */
  clearSurfaces(): void {
    const surfaceIdsToClear = Array.from(this.surfaces.keys()).filter(id => !id.startsWith('__'));
    
    for (const id of surfaceIdsToClear) {
      this.surfaces.delete(id);
      this.emit('surfaceDeleted', id);
    }
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

      // When the agent explicitly sets `visible`, clear any client-side
      // override written by show/hide so the agent's intent takes effect.
      if ('visible' in component) {
        const overridePath = `/__componentState/${component.id}/visible`;
        this.removeAtJsonPointer(surface.dataModel, overridePath);
      }

      // Track root component
      if (component.id === 'root') {
        surface.rootId = component.id;
      }
    }

    surface.updatedAt = Date.now();
    this.emit('componentsUpdated', surfaceId, components);

    // Surface received components — cancel orphan timer
    const orphanTimer = this.orphanTimers.get(surfaceId);
    if (orphanTimer) {
      clearTimeout(orphanTimer);
      this.orphanTimers.delete(surfaceId);
    }

    // Start periodic orphan-component check if not already running
    if (!this.orphanComponentTimers.has(surfaceId)) {
      const timer = setInterval(() => {
        const currentOrphans = new Set(this.getOrphanComponents(surfaceId));
        const lastOrphans = this.lastOrphanSets.get(surfaceId) ?? new Set<ComponentId>();

        // Only emit for components that newly became orphans since the last check
        const newOrphans = [...currentOrphans].filter(id => !lastOrphans.has(id)) as ComponentId[];
        this.lastOrphanSets.set(surfaceId, currentOrphans);

        if (newOrphans.length > 0) {
          this.emit('orphanComponents', surfaceId, newOrphans);
        }
      }, this.orphanComponentCheckInterval);
      this.orphanComponentTimers.set(surfaceId, timer);
    }

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
        const ok = this.setAtJsonPointer(surface.dataModel, path, value);
        if (!ok) {
          this.emit('error', {
            code: 'DATA_MODEL_UPDATE_FAILED',
            message: `Cannot set value at path '${path}': an intermediate segment is not an object. Ensure parent paths are initialised as objects before setting nested values.`,
            surfaceId,
            path,
          });
          return false;
        }
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
    for (const timer of this.orphanTimers.values()) clearTimeout(timer);
    this.orphanTimers.clear();
    for (const timer of this.orphanComponentTimers.values()) clearInterval(timer);
    this.orphanComponentTimers.clear();
    this.lastOrphanSets.clear();
  }

  /**
   * Find component IDs that exist in the surface but are not reachable
   * from the root component via child/children references.
   */
  getOrphanComponents(surfaceId: SurfaceId): ComponentId[] {
    const surface = this.surfaces.get(surfaceId);
    if (!surface || !surface.rootId || surface.components.size === 0) return [];

    const reachable = new Set<ComponentId>();
    const queue: ComponentId[] = [surface.rootId];

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);

      const comp = surface.components.get(id);
      if (!comp) continue;

      if (comp.child) {
        queue.push(comp.child);
      }
      if (comp.children) {
        if (Array.isArray(comp.children)) {
          for (const childId of comp.children) {
            queue.push(childId);
          }
        } else if (isChildListTemplate(comp.children)) {
          queue.push(comp.children.componentId);
        }
      }
    }

    const orphans: ComponentId[] = [];
    for (const id of surface.components.keys()) {
      if (!reachable.has(id)) {
        orphans.push(id);
      }
    }
    return orphans;
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
  ): boolean {
    const parts = pointer.split('/').filter((p) => p !== '');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!(part in current)) {
        current[part] = {};
      }
      if (typeof current[part] !== 'object' || current[part] === null) {
        return false;
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
    return true;
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

}

/**
 * Create a new surface manager.
 */
export function createSurfaceManager(): SurfaceManager {
  return new SurfaceManager();
}
