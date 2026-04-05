import { describe, it, expect, beforeEach } from 'vitest';
import { A2UIParser, parseMessage, serializeMessage } from './parser.js';
import { A2UI_VERSION } from './protocol.js';

const ver = A2UI_VERSION;

const createSurfaceJson = JSON.stringify({
  version: ver,
  createSurface: { surfaceId: 'main', catalogId: 'cat1' },
});

const updateComponentsJson = JSON.stringify({
  version: ver,
  updateComponents: {
    surfaceId: 'main',
    components: [{ id: 'root', component: 'Column', children: [] }],
  },
});

// ---------------------------------------------------------------------------
// parseMessage / serializeMessage
// ---------------------------------------------------------------------------

describe('parseMessage', () => {
  it('parses a createSurface message', () => {
    const msg = parseMessage(createSurfaceJson);
    expect('createSurface' in msg).toBe(true);
  });

  it('parses an updateComponents message', () => {
    const msg = parseMessage(updateComponentsJson);
    expect('updateComponents' in msg).toBe(true);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMessage('not json')).toThrow();
  });
});

describe('serializeMessage', () => {
  it('round-trips a createSurface message', () => {
    const original = { version: ver, createSurface: { surfaceId: 's1', catalogId: 'cat1' } } as const;
    const json = serializeMessage(original);
    const parsed = parseMessage(json);
    expect(parsed).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// A2UIParser — streaming
// ---------------------------------------------------------------------------

describe('A2UIParser', () => {
  let parser: A2UIParser;

  beforeEach(() => {
    parser = new A2UIParser();
  });

  it('parses a complete message in one chunk', () => {
    const result = parser.parse(createSurfaceJson);
    expect(result.messages).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect('createSurface' in result.messages[0]!).toBe(true);
  });

  it('parses two messages in one chunk', () => {
    const result = parser.parse(createSurfaceJson + updateComponentsJson);
    expect(result.messages).toHaveLength(2);
  });

  it('buffers an incomplete message and completes on second chunk', () => {
    const half = Math.floor(createSurfaceJson.length / 2);
    const r1 = parser.parse(createSurfaceJson.slice(0, half));
    expect(r1.messages).toHaveLength(0);
    expect(r1.remainder.length).toBeGreaterThan(0);

    const r2 = parser.parse(createSurfaceJson.slice(half));
    expect(r2.messages).toHaveLength(1);
    expect(r2.remainder).toBe('');
  });

  it('collects errors for invalid JSON without throwing', () => {
    const result = parser.parse('{"version":"v0.9", bad json}');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.messages).toHaveLength(0);
  });

  it('throws on invalid JSON when throwOnError is true', () => {
    const strictParser = new A2UIParser({ throwOnError: true });
    expect(() => strictParser.parse('{"bad": json}')).toThrow();
  });

  it('handles noise before valid JSON', () => {
    const result = parser.parse('data: ' + createSurfaceJson);
    expect(result.messages).toHaveLength(1);
  });

  it('reset clears the buffer', () => {
    const half = Math.floor(createSurfaceJson.length / 2);
    parser.parse(createSurfaceJson.slice(0, half));
    expect(parser.getBuffer().length).toBeGreaterThan(0);
    parser.reset();
    expect(parser.getBuffer()).toBe('');
  });

  it('reports an error when buffer size is exceeded', () => {
    const smallParser = new A2UIParser({ maxBufferSize: 10 });
    const result = smallParser.parse(createSurfaceJson);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/exceeded/i);
  });
});
