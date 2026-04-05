/**
 * @fileoverview Surface access validation for MCP operations.
 *
 * Rules:
 * 1. Agent-created surfaces must start with an alphanumeric character and
 *    contain only alphanumeric characters or underscores.
 * 2. Client-managed surfaces start with '__' and must be alphanumeric after
 *    the prefix. Agents cannot create or delete them.
 * 3. Agents can only send 'updateDataModel' messages to client-managed surfaces.
 */

/**
 * Validates whether an agent has permission to perform an operation on a surface,
 * and whether the surface ID conforms to naming rules.
 *
 * @param surfaceId The ID of the surface.
 * @param operation The operation being attempted ('create_surface', 'update_components', 'update_data_model', 'delete_surface').
 * @returns An error string if access is denied, null if permitted.
 */
export function validateAgentSurfaceAccess(surfaceId: string, operation: string): string | null {
  const isClientManaged = surfaceId.startsWith('__');

  if (isClientManaged) {
    if (!/^__[a-zA-Z0-9]+$/.test(surfaceId)) {
      return `Invalid client-managed surface ID '${surfaceId}'. It must start with '__' and contain only alphanumeric characters.`;
    }

    if (operation === 'create_surface' || operation === 'delete_surface') {
      return `Agents are not permitted to create or delete client-managed surfaces ('${surfaceId}').`;
    }
  } else {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_]*$/.test(surfaceId)) {
      return `Invalid agent-created surface ID '${surfaceId}'. It must start with an alphanumeric character and contain only alphanumeric characters or underscores.`;
    }
  }

  return null;
}

/**
 * Validates that no component ID in the list starts with '__' (reserved for client use).
 *
 * @returns An error string if any reserved ID is found, null if all IDs are valid.
 */
export function validateComponentIds(components: { id?: string }[]): string | null {
  const reserved = components.filter(c => c.id?.startsWith('__'));
  if (reserved.length > 0) {
    const ids = reserved.map(c => c.id).join(', ');
    return `Component IDs starting with '__' are reserved for client use: ${ids}`;
  }
  return null;
}

/**
 * Validates a JSON pointer path for an agent `update_data_model` call.
 *
 * Rules:
 * 1. Path must be provided and non-empty.
 * 2. Root path '/' is forbidden — it would replace the entire data model
 *    and destroy client-side state (e.g. /__componentState).
 * 3. Paths starting with '__' are reserved for client-side internal state.
 *
 * @returns An error string if the path is invalid, null if permitted.
 */
export function validateDataModelPath(path: string | undefined): string | null {
  if (!path || path === '') {
    return `A specific sub-path is required (e.g. '/projects'). Omitting the path or passing an empty string is not allowed.`;
  }
  if (path === '/') {
    return `Writing to the root path '/' is not allowed. Use specific sub-paths instead (e.g. '/projects', '/user/name'). Writing to '/' would replace the entire data model and destroy client-side state.`;
  }
  if (path.replace(/^\/+/, '').startsWith('__')) {
    return `Data model paths starting with '__' are reserved for client-side use. Agents cannot write to '${path}'.`;
  }
  return null;
}
