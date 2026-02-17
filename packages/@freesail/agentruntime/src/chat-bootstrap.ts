import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export const DEFAULT_CHAT_CATALOG_ID = 'https://freesail.dev/catalogs/chat_catalog_v1.json';

/**
 * Bootstraps a standard chat surface for the given session.
 * 
 * 1. Claims the session.
 * 2. Creates the `__chat` surface using the provided catalog.
 * 3. Sends the standard chat component tree.
 * 4. Initializes the data model.
 */
export async function bootstrapChatSurface(
  mcpClient: Client,
  sessionId: string,
  agentId: string,
  catalogId: string = DEFAULT_CHAT_CATALOG_ID
): Promise<void> {
  // Claim this session so the gateway knows who owns it
  await mcpClient.callTool({
    name: 'claim_session',
    arguments: { sessionId, agentId },
  });

  // Create the __chat surface bound to the chat catalog
  await mcpClient.callTool({
    name: 'create_surface',
    arguments: {
      surfaceId: '__chat',
      catalogId,
      sessionId,
      sendDataModel: true,
    },
  });

  // Send the component tree (flat adjacency list)
  await mcpClient.callTool({
    name: 'update_components',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      components: [
        {
          id: 'root',
          component: 'ChatContainer',
          title: 'Chat with AI Agent',
          height: '100%',
          children: ['message_list', 'typing', 'chat_input'],
        },
        {
          id: 'message_list',
          component: 'ChatMessageList',
          children: { componentId: 'msg_template', path: '/messages' },
        },
        {
          id: 'msg_template',
          component: 'ChatMessage',
          // Properties flow from scopeData (each message object in /messages)
          // Explicitly bind them to satisfy strict schema validation
          role: { path: 'role' },
          content: { path: 'content' },
          timestamp: { path: 'timestamp' },
        },
        {
          id: 'typing',
          component: 'ChatTypingIndicator',
          visible: { path: '/isTyping' },
          text: 'Thinking...',
        },
        {
          id: 'chat_input',
          component: 'ChatInput',
          placeholder: 'Type a message...',
        },
      ],
    },
  });

  // Set initial data model
  await mcpClient.callTool({
    name: 'update_data_model',
    arguments: {
      surfaceId: '__chat',
      sessionId,
      path: '/',
      value: { messages: [], isTyping: false },
    },
  });
}
