/**
 * @fileoverview A2UI Protocol Type Definitions (v0.9)
 *
 * This module defines the TypeScript types for the A2UI (Agent-to-User Interface)
 * protocol, which enables bi-directional communication between AI Agents and
 * frontend applications.
 *
 * @see docs/a2ui_protocol.md
 * @version 0.9
 */

// =============================================================================
// Core Types
// =============================================================================

/** Protocol version constant */
export const A2UI_VERSION = 'v0.9' as const;

/** Unique identifier for a UI surface */
export type SurfaceId = string;

/** Unique identifier for a component within a surface */
export type ComponentId = string;

/** Unique identifier for a catalog */
export type CatalogId = string;

/** JSON Pointer path (RFC 6901) */
export type JsonPointer = string;

// =============================================================================
// Dynamic Value Types (Data Binding)
// =============================================================================

/**
 * A path-based data binding to a value in the data model.
 */
export interface DataBinding {
  path: string;
}

/**
 * A function call for computed values.
 */
export interface FunctionCall {
  call: string;
  args: Record<string, DynamicValue>;
  message?: string;
  returnType?: 'string' | 'number' | 'boolean' | 'array';
}

/**
 * Dynamic value that can be a literal, data binding, or function call.
 */
export type DynamicValue =
  | string
  | number
  | boolean
  | unknown[]
  | DataBinding
  | FunctionCall;

/**
 * A dynamic string value.
 */
export type DynamicString = string | DataBinding | (FunctionCall & { returnType?: 'string' });

/**
 * A dynamic number value.
 */
export type DynamicNumber = number | DataBinding | (FunctionCall & { returnType?: 'number' });

/**
 * A dynamic boolean value.
 */
export type DynamicBoolean = boolean | DataBinding | (FunctionCall & { returnType?: 'boolean' });

/**
 * A dynamic string list value.
 */
export type DynamicStringList = string[] | DataBinding | (FunctionCall & { returnType?: 'array' });

/**
 * Check if a value is a DataBinding.
 */
export function isDataBinding(value: unknown): value is DataBinding {
  return typeof value === 'object' && value !== null && 'path' in value;
}

/**
 * Check if a value is a FunctionCall.
 */
export function isFunctionCall(value: unknown): value is FunctionCall {
  return typeof value === 'object' && value !== null && 'call' in value;
}

// =============================================================================
// Child List Types
// =============================================================================

/**
 * Template for generating children from a data model list.
 */
export interface ChildListTemplate {
  componentId: ComponentId;
  path: string;
}

/**
 * ChildList can be a static array of IDs or a template for dynamic children.
 */
export type ChildList = ComponentId[] | ChildListTemplate;

/**
 * Check if a ChildList is a template.
 */
export function isChildListTemplate(children: ChildList): children is ChildListTemplate {
  return typeof children === 'object' && !Array.isArray(children) && 'componentId' in children;
}

// =============================================================================
// Accessibility
// =============================================================================

/**
 * Accessibility attributes for assistive technologies.
 */
export interface AccessibilityAttributes {
  label?: DynamicString;
  description?: DynamicString;
}

// =============================================================================
// Action Types
// =============================================================================

/**
 * Server action that sends an event to the server.
 */
export interface ServerAction {
  event: {
    name: string;
    context?: Record<string, DynamicValue>;
  };
}

/**
 * Local action that executes a client-side function.
 */
export interface LocalAction {
  functionCall: FunctionCall;
}

/**
 * Action definition for interactive components.
 */
export type ComponentAction = ServerAction | LocalAction;

/**
 * Validation check for input components.
 */
export interface ValidationCheck {
  call: string;
  args: Record<string, DynamicValue>;
  message: string;
}

// =============================================================================
// Component Types
// =============================================================================

/**
 * Base interface for all UI components in the A2UI protocol.
 * Components use an adjacency list pattern where relationships
 * are defined by ID references.
 */
export interface A2UIComponent {
  /** Unique identifier for this component within the surface */
  id: ComponentId;
  /** The component type from the catalog (e.g., "Text", "Column", "Button") */
  component: string;
  /** Single child component ID (for single-child containers like Card) */
  child?: ComponentId;
  /** Multiple child component IDs or template (for multi-child containers) */
  children?: ChildList;
  /** Accessibility attributes */
  accessibility?: AccessibilityAttributes;
  /** Additional component-specific properties */
  [key: string]: unknown;
}

// =============================================================================
// Server -> Client Messages (Downstream via SSE)
// =============================================================================

/**
 * Base message interface with version field.
 */
interface A2UIMessageBase {
  /** Protocol version - always "v0.9" */
  version: typeof A2UI_VERSION;
}

/**
 * Theme configuration for a surface.
 */
export interface SurfaceTheme {
  primaryColor?: string;
  [key: string]: unknown;
}

/**
 * Initializes a UI container and loads a specific Catalog.
 * This should be sent first to prepare the client for rendering.
 */
export interface CreateSurfaceMessage extends A2UIMessageBase {
  createSurface: {
    /** Unique identifier for this UI surface */
    surfaceId: SurfaceId;
    /** The catalog defining allowed components for this surface */
    catalogId: CatalogId;
    /** Optional theme parameters */
    theme?: SurfaceTheme;
    /** If true, client sends full data model with every action */
    sendDataModel?: boolean;
  };
}

/**
 * Streams the structural definition of UI components to add or update.
 * Components are provided as a flat list with relationships defined by ID references.
 */
export interface UpdateComponentsMessage extends A2UIMessageBase {
  updateComponents: {
    /** The surface to update */
    surfaceId: SurfaceId;
    /** Array of component definitions */
    components: A2UIComponent[];
  };
}

/**
 * Updates the data model that populates UI components.
 * Allows changing content without resending the component structure.
 */
export interface UpdateDataModelMessage extends A2UIMessageBase {
  updateDataModel: {
    /** The surface this update applies to */
    surfaceId: SurfaceId;
    /** JSON Pointer to the location in the data model (defaults to "/") */
    path?: JsonPointer;
    /** The data value. If omitted, the key at path is removed. */
    value?: unknown;
  };
}

/**
 * Instructs the client to remove a surface and all associated data.
 */
export interface DeleteSurfaceMessage extends A2UIMessageBase {
  deleteSurface: {
    /** The surface to delete */
    surfaceId: SurfaceId;
  };
}

// =============================================================================
// Client -> Server Messages (Upstream via HTTP POST)
// =============================================================================

/**
 * Reports a user action/interaction to the server.
 * This is the primary way the agent learns about user intent.
 */
export interface ActionMessage extends A2UIMessageBase {
  action: {
    /** The name of the action, from the component's action.event.name property */
    name: string;
    /** The surface where the action originated */
    surfaceId: SurfaceId;
    /** The component that triggered the action */
    sourceComponentId: ComponentId;
    /** ISO 8601 timestamp of when the event occurred */
    timestamp: string;
    /** Contextual data resolved from the action definition */
    context: Record<string, unknown>;
  };
}

/**
 * Error codes for client-to-server error messages.
 */
export type ClientErrorCode =
  | 'VALIDATION_FAILED'
  | 'SURFACE_NOT_FOUND'
  | 'COMPONENT_RENDER_FAILED'
  | string;

/**
 * Reports a client-side error to the server.
 */
export interface ErrorMessage extends A2UIMessageBase {
  error: {
    /** Error code */
    code: ClientErrorCode;
    /** Error message */
    message: string;
    /** The surface where the error occurred */
    surfaceId: SurfaceId;
    /** JSON pointer to the field that failed (for VALIDATION_FAILED) */
    path?: string;
  };
}

// =============================================================================
// Metadata Types
// =============================================================================

/**
 * Client capabilities sent with every upstream message.
 */
export interface A2UIClientCapabilities {
  /** List of supported catalog IDs */
  catalogs: CatalogId[];
  /** Optional custom capabilities */
  [key: string]: unknown;
}

/**
 * Client data model sent when sendDataModel is enabled.
 */
export interface A2UIClientDataModel {
  /** Surface ID */
  surfaceId: SurfaceId;
  /** Current data model state */
  dataModel: Record<string, unknown>;
}

// =============================================================================
// Union Types
// =============================================================================

/**
 * All possible server-to-client (downstream) messages.
 */
export type DownstreamMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage;

/**
 * All possible client-to-server (upstream) messages.
 */
export type UpstreamMessage = ActionMessage | ErrorMessage;

/**
 * Any A2UI protocol message.
 */
export type A2UIMessage = DownstreamMessage | UpstreamMessage;

// =============================================================================
// Type Guards
// =============================================================================

export function isCreateSurfaceMessage(msg: A2UIMessage): msg is CreateSurfaceMessage {
  return 'createSurface' in msg;
}

export function isUpdateComponentsMessage(msg: A2UIMessage): msg is UpdateComponentsMessage {
  return 'updateComponents' in msg;
}

export function isUpdateDataModelMessage(msg: A2UIMessage): msg is UpdateDataModelMessage {
  return 'updateDataModel' in msg;
}

export function isDeleteSurfaceMessage(msg: A2UIMessage): msg is DeleteSurfaceMessage {
  return 'deleteSurface' in msg;
}

export function isActionMessage(msg: A2UIMessage): msg is ActionMessage {
  return 'action' in msg;
}

export function isErrorMessage(msg: A2UIMessage): msg is ErrorMessage {
  return 'error' in msg;
}

export function isDownstreamMessage(msg: A2UIMessage): msg is DownstreamMessage {
  return (
    isCreateSurfaceMessage(msg) ||
    isUpdateComponentsMessage(msg) ||
    isUpdateDataModelMessage(msg) ||
    isDeleteSurfaceMessage(msg)
  );
}

export function isUpstreamMessage(msg: A2UIMessage): msg is UpstreamMessage {
  return isActionMessage(msg) || isErrorMessage(msg);
}
