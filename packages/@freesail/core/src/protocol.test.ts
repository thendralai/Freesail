import { describe, it, expect } from 'vitest';
import {
  A2UI_VERSION,
  isDataBinding,
  isFunctionCall,
  isChildListTemplate,
  isCreateSurfaceMessage,
  isUpdateComponentsMessage,
  isUpdateDataModelMessage,
  isDeleteSurfaceMessage,
  isGetDataModelMessage,
  isActionMessage,
  isErrorMessage,
  isDownstreamMessage,
  isUpstreamMessage,
  type A2UIMessage,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ver = A2UI_VERSION;

function createSurface(surfaceId = 'main'): A2UIMessage {
  return { version: ver, createSurface: { surfaceId, catalogId: 'cat1' } };
}
function updateComponents(surfaceId = 'main'): A2UIMessage {
  return { version: ver, updateComponents: { surfaceId, components: [] } };
}
function updateDataModel(surfaceId = 'main'): A2UIMessage {
  return { version: ver, updateDataModel: { surfaceId, path: '/name', value: 'Alice' } };
}
function deleteSurface(surfaceId = 'main'): A2UIMessage {
  return { version: ver, deleteSurface: { surfaceId } };
}
function getDataModel(surfaceId = 'main'): A2UIMessage {
  return { version: ver, getDataModel: { surfaceId } };
}
function action(): A2UIMessage {
  return {
    version: ver,
    action: { name: 'click', surfaceId: 'main', sourceComponentId: 'btn', timestamp: new Date().toISOString(), context: {} },
  };
}
function error(): A2UIMessage {
  return { version: ver, error: { code: 'VALIDATION_FAILED', message: 'bad', surfaceId: 'main' } };
}

// ---------------------------------------------------------------------------
// isDataBinding
// ---------------------------------------------------------------------------

describe('isDataBinding', () => {
  it('returns true for object with path', () => {
    expect(isDataBinding({ path: '/name' })).toBe(true);
  });
  it('returns false for null', () => {
    expect(isDataBinding(null)).toBe(false);
  });
  it('returns false for string', () => {
    expect(isDataBinding('hello')).toBe(false);
  });
  it('returns false for object without path', () => {
    expect(isDataBinding({ call: 'foo' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isFunctionCall
// ---------------------------------------------------------------------------

describe('isFunctionCall', () => {
  it('returns true for object with call', () => {
    expect(isFunctionCall({ call: 'formatString', args: {} })).toBe(true);
  });
  it('returns false for null', () => {
    expect(isFunctionCall(null)).toBe(false);
  });
  it('returns false for object without call', () => {
    expect(isFunctionCall({ path: '/x' })).toBe(false);
  });
  it('returns false for a string', () => {
    expect(isFunctionCall('formatString')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isChildListTemplate
// ---------------------------------------------------------------------------

describe('isChildListTemplate', () => {
  it('returns true for template object', () => {
    expect(isChildListTemplate({ componentId: 'row', path: '/items' })).toBe(true);
  });
  it('returns false for static array', () => {
    expect(isChildListTemplate(['a', 'b'])).toBe(false);
  });
  it('returns false for empty array', () => {
    expect(isChildListTemplate([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message type guards — positive cases
// ---------------------------------------------------------------------------

describe('message type guards — positive', () => {
  it('isCreateSurfaceMessage', () => expect(isCreateSurfaceMessage(createSurface())).toBe(true));
  it('isUpdateComponentsMessage', () => expect(isUpdateComponentsMessage(updateComponents())).toBe(true));
  it('isUpdateDataModelMessage', () => expect(isUpdateDataModelMessage(updateDataModel())).toBe(true));
  it('isDeleteSurfaceMessage', () => expect(isDeleteSurfaceMessage(deleteSurface())).toBe(true));
  it('isGetDataModelMessage', () => expect(isGetDataModelMessage(getDataModel())).toBe(true));
  it('isActionMessage', () => expect(isActionMessage(action())).toBe(true));
  it('isErrorMessage', () => expect(isErrorMessage(error())).toBe(true));
});

// ---------------------------------------------------------------------------
// Message type guards — negative (wrong message type)
// ---------------------------------------------------------------------------

describe('message type guards — negative', () => {
  it('isCreateSurfaceMessage rejects updateComponents', () =>
    expect(isCreateSurfaceMessage(updateComponents())).toBe(false));
  it('isUpdateComponentsMessage rejects createSurface', () =>
    expect(isUpdateComponentsMessage(createSurface())).toBe(false));
  it('isActionMessage rejects deleteSurface', () =>
    expect(isActionMessage(deleteSurface())).toBe(false));
  it('isErrorMessage rejects action', () =>
    expect(isErrorMessage(action())).toBe(false));
});

// ---------------------------------------------------------------------------
// isDownstreamMessage / isUpstreamMessage
// ---------------------------------------------------------------------------

describe('isDownstreamMessage', () => {
  it('accepts createSurface', () => expect(isDownstreamMessage(createSurface())).toBe(true));
  it('accepts updateComponents', () => expect(isDownstreamMessage(updateComponents())).toBe(true));
  it('accepts updateDataModel', () => expect(isDownstreamMessage(updateDataModel())).toBe(true));
  it('accepts deleteSurface', () => expect(isDownstreamMessage(deleteSurface())).toBe(true));
  it('accepts getDataModel', () => expect(isDownstreamMessage(getDataModel())).toBe(true));
  it('rejects action', () => expect(isDownstreamMessage(action())).toBe(false));
  it('rejects error', () => expect(isDownstreamMessage(error())).toBe(false));
});

describe('isUpstreamMessage', () => {
  it('accepts action', () => expect(isUpstreamMessage(action())).toBe(true));
  it('accepts error', () => expect(isUpstreamMessage(error())).toBe(true));
  it('rejects createSurface', () => expect(isUpstreamMessage(createSurface())).toBe(false));
  it('rejects updateComponents', () => expect(isUpstreamMessage(updateComponents())).toBe(false));
});
