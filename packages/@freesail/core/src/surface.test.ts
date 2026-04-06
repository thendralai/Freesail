import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SurfaceManager, createSurfaceManager } from './surface.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManager() {
  return createSurfaceManager();
}

function textComponent(id: string, children?: string[]) {
  return { id, component: 'Text', text: 'hello', ...(children ? { children } : {}) };
}

// ---------------------------------------------------------------------------
// createSurface
// ---------------------------------------------------------------------------

describe('SurfaceManager.createSurface', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('creates a surface and returns it', () => {
    const surface = manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(surface.id).toBe('s1');
    expect(surface.catalogId).toBe('cat1');
    expect(surface.components.size).toBe(0);
    expect(surface.rootId).toBeNull();
  });

  it('emits surfaceCreated event', () => {
    const handler = vi.fn();
    manager.on('surfaceCreated', handler);
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns existing surface if called again with same ID', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    const second = manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(manager.getAllSurfaces()).toHaveLength(1);
    expect(second.id).toBe('s1');
  });

  it('updates catalogId when called again with different catalog', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat2' });
    expect(manager.getSurface('s1')!.catalogId).toBe('cat2');
  });

  it('sets sendDataModel flag', () => {
    const surface = manager.createSurface({ surfaceId: 's1', catalogId: 'cat1', sendDataModel: true });
    expect(surface.sendDataModel).toBe(true);
    expect(manager.shouldSendDataModel('s1')).toBe(true);
  });

  it('sendDataModel defaults to false', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(manager.shouldSendDataModel('s1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteSurface
// ---------------------------------------------------------------------------

describe('SurfaceManager.deleteSurface', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('deletes an existing surface', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    const result = manager.deleteSurface('s1');
    expect(result).toBe(true);
    expect(manager.getSurface('s1')).toBeUndefined();
  });

  it('emits surfaceDeleted event', () => {
    const handler = vi.fn();
    manager.on('surfaceDeleted', handler);
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.deleteSurface('s1');
    expect(handler).toHaveBeenCalledWith('s1');
  });

  it('returns false and emits error when surface not found', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);
    const result = manager.deleteSurface('nonexistent');
    expect(result).toBe(false);
    expect(errorHandler).toHaveBeenCalledOnce();
    expect(errorHandler.mock.calls[0]![0].code).toBe('SURFACE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// clearSurfaces
// ---------------------------------------------------------------------------

describe('SurfaceManager.clearSurfaces', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('removes all non-client-managed surfaces', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.createSurface({ surfaceId: 's2', catalogId: 'cat1' });
    manager.clearSurfaces();
    expect(manager.getAllSurfaces()).toHaveLength(0);
  });

  it('preserves client-managed surfaces (__ prefix)', () => {
    manager.createSurface({ surfaceId: '__sidebar', catalogId: 'cat1' });
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.clearSurfaces();
    expect(manager.getSurface('__sidebar')).toBeDefined();
    expect(manager.getSurface('s1')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateComponents
// ---------------------------------------------------------------------------

describe('SurfaceManager.updateComponents', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('stores components in the surface', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [textComponent('root')]);
    const surface = manager.getSurface('s1')!;
    expect(surface.components.size).toBe(1);
    expect(surface.components.get('root')!.component).toBe('Text');
  });

  it('sets rootId to component with id "root"', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [textComponent('root')]);
    expect(manager.getSurface('s1')!.rootId).toBe('root');
  });

  it('leaves rootId null when no component has id "root"', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [textComponent('col1'), textComponent('text1')]);
    expect(manager.getSurface('s1')!.rootId).toBeNull();
  });

  it('emits componentsUpdated event', () => {
    const handler = vi.fn();
    manager.on('componentsUpdated', handler);
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [textComponent('root')]);
    expect(handler).toHaveBeenCalledWith('s1', expect.any(Array));
  });

  it('returns false and emits error for unknown surface', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);
    const result = manager.updateComponents('nonexistent', [textComponent('root')]);
    expect(result).toBe(false);
    expect(errorHandler.mock.calls[0]![0].code).toBe('SURFACE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// updateDataModel
// ---------------------------------------------------------------------------

describe('SurfaceManager.updateDataModel', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('sets a top-level value', () => {
    manager.updateDataModel('s1', '/name', 'Alice');
    expect(manager.getDataModel('s1')).toEqual({ name: 'Alice' });
  });

  it('sets a nested value', () => {
    manager.updateDataModel('s1', '/user/age', 30);
    expect(manager.getDataModel('s1')).toEqual({ user: { age: 30 } });
  });

  it('replaces the root when path is "/"', () => {
    manager.updateDataModel('s1', '/', { a: 1 });
    expect(manager.getDataModel('s1')).toEqual({ a: 1 });
  });

  it('removes a key when value is undefined', () => {
    manager.updateDataModel('s1', '/name', 'Alice');
    manager.updateDataModel('s1', '/name', undefined);
    expect(manager.getDataModel('s1')).toEqual({});
  });

  it('clears root when path is "/" and value is undefined', () => {
    manager.updateDataModel('s1', '/', { a: 1 });
    manager.updateDataModel('s1', '/', undefined);
    expect(manager.getDataModel('s1')).toEqual({});
  });

  it('preserves __ prefixed keys on root replacement', () => {
    const surface = manager.getSurface('s1')!;
    surface.dataModel['__componentState'] = { modal: { visible: true } };
    manager.updateDataModel('s1', '/', { user: 'Alice' });
    expect(manager.getDataModel('s1')).toMatchObject({
      user: 'Alice',
      __componentState: { modal: { visible: true } },
    });
  });

  it('preserves __ prefixed keys when root is cleared with undefined', () => {
    const surface = manager.getSurface('s1')!;
    surface.dataModel['__componentState'] = { modal: { visible: false } };
    manager.updateDataModel('s1', '/', undefined);
    const dm = manager.getDataModel('s1');
    expect(dm).toMatchObject({ __componentState: { modal: { visible: false } } });
    expect(dm).not.toHaveProperty('user');
  });

  it('emits dataModelUpdated event', () => {
    const handler = vi.fn();
    manager.on('dataModelUpdated', handler);
    manager.updateDataModel('s1', '/x', 42);
    expect(handler).toHaveBeenCalledWith('s1', '/x', 42);
  });

  it('emits error when path traverses a non-object', () => {
    const errorHandler = vi.fn();
    manager.on('error', errorHandler);
    manager.updateDataModel('s1', '/name', 'Alice');
    manager.updateDataModel('s1', '/name/nested', 'fail'); // 'Alice' is not an object
    expect(errorHandler).toHaveBeenCalledOnce();
    expect(errorHandler.mock.calls[0]![0].code).toBe('DATA_MODEL_UPDATE_FAILED');
  });

  it('returns false for unknown surface', () => {
    const result = manager.updateDataModel('nonexistent', '/x', 1);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getOrphanComponents
// ---------------------------------------------------------------------------

describe('SurfaceManager.getOrphanComponents', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('returns empty array when all components are reachable', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [
      { id: 'root', component: 'Column', children: ['text1'] },
      textComponent('text1'),
    ]);
    expect(manager.getOrphanComponents('s1')).toHaveLength(0);
  });

  it('detects unreachable components', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    manager.updateComponents('s1', [
      { id: 'root', component: 'Column', children: ['text1'] },
      textComponent('text1'),
      textComponent('orphan'), // not in children of root
    ]);
    expect(manager.getOrphanComponents('s1')).toEqual(['orphan']);
  });

  it('returns empty for surface with no components', () => {
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(manager.getOrphanComponents('s1')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// event subscription / unsubscribe
// ---------------------------------------------------------------------------

describe('SurfaceManager event subscription', () => {
  let manager: SurfaceManager;

  beforeEach(() => {
    manager = makeManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  it('unsubscribe stops receiving events', () => {
    const handler = vi.fn();
    const unsub = manager.on('surfaceCreated', handler);
    unsub();
    manager.createSurface({ surfaceId: 's1', catalogId: 'cat1' });
    expect(handler).not.toHaveBeenCalled();
  });
});
