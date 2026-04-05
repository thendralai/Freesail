import { describe, it, expect } from 'vitest';
import { validateAgentSurfaceAccess } from './surface-access.js';

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

  it('rejects update_components on client-managed surface', () => {
    expect(validateAgentSurfaceAccess('__sidebar', 'update_components')).not.toBeNull();
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

  it('rejects component IDs starting with __ in update_components', () => {
    // This is tested at the MCP layer — but surface ID validation itself
    // allows __foo for update_data_model only.
    expect(validateAgentSurfaceAccess('__foo', 'update_data_model')).toBeNull();
    expect(validateAgentSurfaceAccess('__foo', 'update_components')).not.toBeNull();
  });
});
