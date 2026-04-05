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

    if (operation !== 'update_data_model') {
      return `Agents are only permitted to send 'updateDataModel' messages to client-managed surfaces ('${surfaceId}'). Operation '${operation}' is forbidden.`;
    }
  } else {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_]*$/.test(surfaceId)) {
      return `Invalid agent-created surface ID '${surfaceId}'. It must start with an alphanumeric character and contain only alphanumeric characters or underscores.`;
    }
  }

  return null;
}
