import { describe, it, expect } from 'vitest';
import { validateAgentSurfaceAccess, validateComponentIds, validateDataModelPath } from './surface-access.js';

// ---------------------------------------------------------------------------
// Agent-created surfaces
// ---------------------------------------------------------------------------

describe('validateAgentSurfaceAccess — agent-created surfaces', () => {
  it('allows a simple alphanumeric ID for create_surface', () => {
    expect(validateAgentSurfaceAccess('main', 'create_surface')).toBeNull();
  });

  it('allows underscores after the first character', () => {
    expect(validateAgentSurfaceAccess('my_surface', 'create_surface')).toBeNull();
  });

  it('allows alphanumeric with numbers', () => {
    expect(validateAgentSurfaceAccess('surface1', 'update_components')).toBeNull();
  });

  it('rejects ID starting with underscore (not double-underscore)', () => {
    expect(validateAgentSurfaceAccess('_bad', 'create_surface')).not.toBeNull();
  });

  it('rejects ID starting with a hyphen', () => {
    expect(validateAgentSurfaceAccess('-bad', 'create_surface')).not.toBeNull();
  });

  it('rejects ID with spaces', () => {
    expect(validateAgentSurfaceAccess('my surface', 'create_surface')).not.toBeNull();
  });

  it('rejects empty ID', () => {
    expect(validateAgentSurfaceAccess('', 'create_surface')).not.toBeNull();
  });

  it('allows all operations on a valid agent surface', () => {
    for (const op of ['create_surface', 'update_components', 'update_data_model', 'delete_surface']) {
      expect(validateAgentSurfaceAccess('main', op)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Client-managed surfaces (__ prefix)
// ---------------------------------------------------------------------------

describe('validateAgentSurfaceAccess — client-managed surfaces', () => {
  it('allows update_data_model on a valid client-managed surface', () => {
    expect(validateAgentSurfaceAccess('__sidebar', 'update_data_model')).toBeNull();
  });

  it('rejects create_surface on client-managed surface', () => {
    expect(validateAgentSurfaceAccess('__sidebar', 'create_surface')).not.toBeNull();
  });

  it('rejects delete_surface on client-managed surface', () => {
    expect(validateAgentSurfaceAccess('__sidebar', 'delete_surface')).not.toBeNull();
  });

  it('rejects client-managed ID with special characters', () => {
    expect(validateAgentSurfaceAccess('__side-bar', 'update_data_model')).not.toBeNull();
  });

  it('rejects client-managed ID with spaces', () => {
    expect(validateAgentSurfaceAccess('__side bar', 'update_data_model')).not.toBeNull();
  });

  it('rejects __ alone (no alphanumeric suffix)', () => {
    expect(validateAgentSurfaceAccess('__', 'update_data_model')).not.toBeNull();
  });

  it('allows update_components on a client-managed surface', () => {
    expect(validateAgentSurfaceAccess('__sidebar', 'update_components')).toBeNull();
  });

  it('allows all non-create/delete operations on a client-managed surface', () => {
    for (const op of ['update_components', 'update_data_model']) {
      expect(validateAgentSurfaceAccess('__sidebar', op)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// validateDataModelPath
// ---------------------------------------------------------------------------

describe('validateDataModelPath', () => {
  it('allows a valid sub-path', () => {
    expect(validateDataModelPath('/projects')).toBeNull();
  });

  it('allows a nested sub-path', () => {
    expect(validateDataModelPath('/user/name')).toBeNull();
  });

  it('allows root path "/" (replaces entire data model)', () => {
    expect(validateDataModelPath('/')).toBeNull();
  });

  it('allows empty string (treated as root replacement)', () => {
    expect(validateDataModelPath('')).toBeNull();
  });

  it('allows undefined path (treated as root replacement)', () => {
    expect(validateDataModelPath(undefined)).toBeNull();
  });

  it('rejects paths starting with __', () => {
    expect(validateDataModelPath('/__componentState')).not.toBeNull();
  });

  it('rejects paths starting with __  with nested segment', () => {
    expect(validateDataModelPath('/__componentState/modal/visible')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateComponentIds
// ---------------------------------------------------------------------------

describe('validateComponentIds', () => {
  it('allows normal component IDs', () => {
    expect(validateComponentIds([{ id: 'header' }, { id: 'body' }])).toBeNull();
  });

  it('allows components without an id', () => {
    expect(validateComponentIds([{}])).toBeNull();
  });

  it('rejects a single component with a __ prefix', () => {
    expect(validateComponentIds([{ id: '__internal' }])).not.toBeNull();
  });

  it('rejects when one of many components has a __ prefix', () => {
    const error = validateComponentIds([{ id: 'header' }, { id: '__reserved' }, { id: 'footer' }]);
    expect(error).not.toBeNull();
    expect(error).toContain('__reserved');
  });

  it('lists all offending IDs in the error', () => {
    const error = validateComponentIds([{ id: '__a' }, { id: '__b' }]);
    expect(error).toContain('__a');
    expect(error).toContain('__b');
  });
});
