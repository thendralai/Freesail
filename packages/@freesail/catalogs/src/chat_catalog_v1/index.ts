/**
 * @fileoverview @freesail/chat-catalog
 *
 * Chat UI catalog for Freesail. Renders a complete chat interface
 * as an A2UI surface — all chat communication flows through the
 * A2UI protocol rather than a separate HTTP channel.
 *
 * @example
 * ```tsx
 * import { FreesailProvider, FreesailSurface } from '@freesail/react';
 * import { ChatCatalog } from '@freesail/chat-catalog';
 *
 * <FreesailProvider
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[ChatCatalog]}
 * >
 *   <FreesailSurface surfaceId="__chat" />
 * </FreesailProvider>
 * ```
 */

import type { CatalogDefinition } from '@freesail/react';
import { chatCatalogComponents } from './components.js';
import catalogSchema from './chat_catalog_v1.json';

// Re-export all individual components for advanced usage
export * from './components.js';
export { chatCatalogComponents } from './components.js';

export const CHAT_CATALOG_ID = catalogSchema.catalogId;

/**
 * The chat catalog as a CatalogDefinition.
 *
 * Pass this to FreesailProvider's `catalogDefinitions` prop:
 *
 * ```tsx
 * <FreesailProvider
 *   sseUrl="/api/sse"
 *   postUrl="/api/message"
 *   catalogDefinitions={[ChatCatalog]}
 * >
 *   <FreesailSurface surfaceId="__chat" />
 * </FreesailProvider>
 * ```
 */
export const ChatCatalog: CatalogDefinition = {
  namespace: CHAT_CATALOG_ID,
  schema: catalogSchema,
  components: chatCatalogComponents,
};
