/**
 * Traverse a nested object/array by JSON pointer or relative path.
 * Returns undefined if the path doesn't exist or data is nullish.
 */
export function getDataAtPath(data: unknown, path?: string): unknown {
  if (data === null || data === undefined) return undefined;
  if (!path || path === '/') return data;

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
