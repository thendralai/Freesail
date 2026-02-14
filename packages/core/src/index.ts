/**
 * @fileoverview Freesail Core - Public API
 *
 * This module exports the public API for @freesail/core.
 */

// Protocol version
export { A2UI_VERSION } from './protocol.js';

// Protocol types
export type {
  SurfaceId,
  ComponentId,
  CatalogId,
  JsonPointer,
  DataBinding,
  FunctionCall,
  DynamicValue,
  DynamicString,
  DynamicNumber,
  DynamicBoolean,
  DynamicStringList,
  ChildListTemplate,
  ChildList,
  AccessibilityAttributes,
  ServerAction,
  LocalAction,
  ComponentAction,
  ValidationCheck,
  A2UIComponent,
  SurfaceTheme,
  CreateSurfaceMessage,
  UpdateComponentsMessage,
  UpdateDataModelMessage,
  DeleteSurfaceMessage,
  ActionMessage,
  ErrorMessage,
  ClientErrorCode,
  A2UIClientCapabilities,
  A2UIClientDataModel,
  DownstreamMessage,
  UpstreamMessage,
  A2UIMessage,
} from './protocol.js';

// Protocol type guards and helpers
export {
  isDataBinding,
  isFunctionCall,
  isChildListTemplate,
  isCreateSurfaceMessage,
  isUpdateComponentsMessage,
  isUpdateDataModelMessage,
  isDeleteSurfaceMessage,
  isActionMessage,
  isErrorMessage,
  isDownstreamMessage,
  isUpstreamMessage,
} from './protocol.js';

// Parser
export type { ParseResult, ParseError, ParserOptions } from './parser.js';
export { A2UIParser, parseMessage, serializeMessage } from './parser.js';

// Transport
export type {
  ConnectionState,
  TransportOptions,
  TransportEvents,
} from './transport.js';
export { A2UITransport, createTransport } from './transport.js';

// Surface Manager
export type {
  Surface,
  CreateSurfaceOptions,
  SurfaceManagerEvents,
  SurfaceError,
} from './surface.js';
export { SurfaceManager, createSurfaceManager } from './surface.js';
