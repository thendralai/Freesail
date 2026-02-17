/**
 * Format a generic UI action as a natural language message for the LLM.
 */
export function formatAction(
  sessionId: string,
  action: {
    name?: string;
    surfaceId?: string;
    sourceComponentId?: string;
    context?: Record<string, unknown>;
  },
  clientDataModel?: Record<string, unknown>
): string {
  const { name, surfaceId, sourceComponentId, context } = action;
  
  const contextStr =
    context && Object.keys(context).length > 0
      ? `\nAction data: ${JSON.stringify(context, null, 2)}`
      : '';

  const dataModelStr =
    clientDataModel && Object.keys(clientDataModel).length > 0
      ? `\nClient data model (all current form/input values): ${JSON.stringify(clientDataModel, null, 2)}`
      : '';

  return `[Session Context] This action is from session "${sessionId}". Use sessionId: "${sessionId}" for ALL tool calls in your response.\n\n[UI Action] The user clicked "${name}" on component "${sourceComponentId}" in surface "${surfaceId}".${contextStr}${dataModelStr}\n\nPlease respond to this action appropriately. If form data is provided, process it. You may update the UI using your tools.`;
}
