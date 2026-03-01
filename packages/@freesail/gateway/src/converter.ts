/**
 * @fileoverview Catalog Converter
 *
 * Converts catalog.json component definitions into MCP Tool schemas.
 * This enables the Agent to see available UI components as callable tools.
 */

import { z } from 'zod';

/**
 * Schema for a component property in the catalog.
 */
export interface CatalogProperty {
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
  items?: CatalogProperty;
  $ref?: string;
}

/**
 * Schema for a component definition in the catalog.
 */
export interface CatalogComponent {
  description?: string;
  properties?: Record<string, CatalogProperty>;
  children?: boolean; // Kept for backward compatibility, but v0.9 uses ChildList type
  allOf?: unknown[]; // v0.9 uses allOf for inheritance
  unevaluatedProperties?: boolean;
}

/**
 * Full catalog schema.
 */
export interface Catalog {
  id: string; 
  catalogId: string; 
  title: string;
  description?: string;
  $defs?: Record<string, unknown>;
  components: Record<string, CatalogComponent>;
  functions?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    returnType?: string;
  }>;
}

/**
 * MCP Tool definition.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Converts a catalog to MCP tool schemas.
 */
export function catalogToMCPTools(catalog: Catalog): MCPTool[] {
  return Object.entries(catalog.components).map(([name, component]) => ({
    name: `render_${name.toLowerCase()}`,
    description: component.description ?? `Render a ${name} component`,
    inputSchema: componentToSchema(name, component),
  }));
}

/**
 * Converts a component definition to a JSON Schema.
 */
function componentToSchema(name: string, component: CatalogComponent): MCPTool['inputSchema'] {
  const properties: Record<string, unknown> = {
    id: {
      type: 'string',
      description: 'Unique identifier for this component instance',
    },
  };

  const required: string[] = ['id'];

  // Helper to extract properties from a component definition or its sub-schemas
  const extractProperties = (def: CatalogComponent) => {
    if (def.properties) {
      for (const [propName, prop] of Object.entries(def.properties)) {
        // Skip 'component' property as it is fixed
        if (propName === 'component') continue;

        properties[propName] = propertyToSchema(prop);
        if (prop.required) {
          if (!required.includes(propName)) required.push(propName);
        }
      }
    }

    // Handle standard JSON Schema 'required' array
    if (Array.isArray((def as any).required)) {
      const reqArray = (def as any).required as string[];
      reqArray.forEach(fieldName => {
        if (fieldName !== 'component' && !required.includes(fieldName)) {
          required.push(fieldName);
        }
      });
    }

    if (def.allOf) {
      for (const sub of def.allOf) {
        // Recursive extraction for allOf schemas
        // We cast sub to CatalogComponent to recurse, assuming it follows the structure
        extractProperties(sub as CatalogComponent);
      }
    }
  };

  extractProperties(component);

  // Handle children support explicitly
  const supportsChildren =
    component.children === true ||
    (properties['children'] !== undefined);

  if (supportsChildren) {
    // If not already defined by extractProperties (e.g. from allOf), define it
    if (!properties['children']) {
      properties['children'] = {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of child components',
      };
    }
    // Note: children might be required by the component logic, but we make it optional in tool schema 
    // to allow empty containers unless strictly required.
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * Converts a property definition to JSON Schema.
 */
function propertyToSchema(prop: CatalogProperty): Record<string, unknown> {
  // If it's a ref to DynamicString/Number etc, treat as the base type
  // Common binding schema
  const bindingSchema = {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  };

  if (prop.$ref) {
    const ref = prop.$ref;
    if (ref.includes('DynamicString')) {
      return {
        anyOf: [{ type: 'string' }, bindingSchema],
        description: prop.description,
      };
    }
    if (ref.includes('DynamicNumber')) {
      return {
        anyOf: [{ type: 'number' }, bindingSchema],
        description: prop.description,
      };
    }
    if (ref.includes('DynamicBoolean')) {
      return {
        anyOf: [{ type: 'boolean' }, bindingSchema],
        description: prop.description,
      };
    }
    if (ref.includes('ChildList')) {
      return {
        anyOf: [
          { type: 'array', items: { type: 'string' } },
          {
            type: 'object',
            properties: { componentId: { type: 'string' }, path: { type: 'string' } },
            required: ['componentId', 'path'],
          },
        ],
        description: prop.description,
      };
    }
  }

  const schema: Record<string, unknown> = {
    type: (prop.type || 'string') as 'string' | 'number' | 'boolean' | 'object' | 'array', // Default to string if type is missing
  };

  if (prop.description) {
    schema['description'] = prop.description;
  }

  if (prop.enum) {
    schema['enum'] = prop.enum;
  }

  if (prop.default !== undefined) {
    schema['default'] = prop.default;
  }

  if (prop.type === 'array' && prop.items) {
    schema['items'] = propertyToSchema(prop.items);
  }

  return schema;
}

/**
 * Generates the system prompt injection for the catalog.
 */
export function generateCatalogPrompt(catalog: Catalog): string {
  const name = catalog.title;
  const id = catalog.catalogId;

  const lines: string[] = [
    `## UI Catalog: ${name}`,
    `**Catalog ID (use this as catalogId in create_surface):** \`${id}\``,
    '',
    catalog.description ?? 'Available UI components for rendering interfaces.',
    '',
    '### Available Components:',
    '',
  ];

  for (const [componentName, component] of Object.entries(catalog.components)) {
    lines.push(`**${componentName}**`);
    if (component.description) {
      lines.push(`  ${component.description}`);
    }
    // Helper to collect all properties including from allOf
    const allProps: Record<string, CatalogProperty> = {};
    const collectProps = (def: CatalogComponent) => {
      if (def.properties) {
        Object.assign(allProps, def.properties);
      }
      if (def.allOf) {
        def.allOf.forEach(sub => collectProps(sub as CatalogComponent));
      }
    };
    collectProps(component);

    // Collect all required fields
    const requiredFields = new Set<string>();
    const collectRequired = (def: CatalogComponent) => {
      // Individual property required flag
      if (def.properties) {
        for (const [key, prop] of Object.entries(def.properties)) {
          if (prop.required) requiredFields.add(key);
        }
      }
      // Top-level required array
      if (Array.isArray((def as any).required)) {
        ((def as any).required as string[]).forEach(k => requiredFields.add(k));
      }
      // Recurse
      if (def.allOf) {
        def.allOf.forEach(sub => collectRequired(sub as CatalogComponent));
      }
    }
    collectRequired(component);


    if (Object.keys(allProps).length > 0) {
      lines.push('  Properties:');

      const reqProps: string[] = [];
      const optProps: string[] = [];

      for (const [propName, prop] of Object.entries(allProps)) {
        if (propName === 'component') continue;

        // Handle $ref types for display
        let typeStr: string | undefined = prop.type as string | undefined;
        if (!typeStr && prop.$ref) {
          const ref = prop.$ref;
          const baseType = ref.split('/').pop() || 'unknown';

          if (baseType.startsWith('Dynamic')) {
            typeStr = `${baseType.replace('Dynamic', '').toLowerCase()} | Binding`;
          } else if (baseType === 'ChildList') {
            typeStr = 'string[] | ChildTemplate';
          } else {
            typeStr = baseType;
          }
        } else if (typeStr === 'array' && prop.items) {
          let itemTypeStr: string | undefined = prop.items.type as string | undefined;
          if (!itemTypeStr && prop.items.$ref) {
            const ref = prop.items.$ref;
            const baseType = ref.split('/').pop() || 'unknown';
            if (baseType.startsWith('Dynamic')) {
              itemTypeStr = `${baseType.replace('Dynamic', '').toLowerCase()} | Binding`;
            } else if (baseType === 'ChildList') {
              itemTypeStr = 'string[] | ChildTemplate';
            } else {
              itemTypeStr = baseType;
            }
          }
          typeStr = `array[${itemTypeStr || 'unknown'}]`;
        }

        const desc = prop.description ? ` - ${prop.description}` : '';
        const line = `    - ${propName}: ${typeStr}${desc}`;

        if (requiredFields.has(propName)) {
          reqProps.push(line);
        } else {
          optProps.push(line);
        }
      }

      if (reqProps.length > 0) {
        lines.push('    [REQUIRED]');
        lines.push(...reqProps);
      }
      if (optProps.length > 0) {
        lines.push('    [OPTIONAL]');
        lines.push(...optProps);
      }
    }

    // Check for children support
    const supportsChildren =
      component.children === true ||
      (allProps['children'] !== undefined);

    if (supportsChildren) {
      lines.push('  Supports children: yes');
    }
    lines.push('');
  }

  // Include Available Functions
  if (catalog.functions && catalog.functions.length > 0) {
    lines.push('### Available Functions:', '');
    for (const func of catalog.functions) {
      lines.push(`**${func.name}**`);
      if (func.description) {
        lines.push(`  ${func.description}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Validates a component instance against the catalog using JSON schema validation.
 */
export function validateComponent(
  catalog: Catalog,
  componentType: string,
  props: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Case-insensitive lookup
  const entry = Object.entries(catalog.components).find(
    ([name]) => name.toLowerCase() === componentType.toLowerCase()
  );

  if (!entry) {
    return {
      valid: false,
      errors: [`Unknown component type: ${componentType}`],
    };
  }

  const [, componentDef] = entry;

  // Build a complete schema for this component by merging allOf schemas
  const mergedSchema: any = {
    type: 'object',
    properties: {},
    required: [],
  };

  // Recursively collect properties and required fields from allOf
  const collectFromDef = (def: any) => {
    if (def.properties) {
      Object.assign(mergedSchema.properties, def.properties);
    }
    if (def.required && Array.isArray(def.required)) {
      mergedSchema.required.push(...def.required);
    }
    if (def.allOf && Array.isArray(def.allOf)) {
      def.allOf.forEach((subDef: any) => collectFromDef(subDef));
    }
  };

  collectFromDef(componentDef);

  // Debug logging
  if (componentType.toLowerCase() === 'choicepicker') {
    console.error('[Validation Debug] ChoicePicker validation:', {
      componentType,
      propsKeys: Object.keys(props),
      options: props['options'],
      optionsType: typeof props['options'],
      isArray: Array.isArray(props['options']),
      mergedSchemaOptions: mergedSchema.properties.options,
    });
  }

  // Preprocess props to handle data bindings
  // Data bindings ({path: "..."}) should skip validation since they're resolved client-side
  const propsToValidate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    // Skip 'component' field
    if (key === 'component' || key === 'id') {
      propsToValidate[key] = value;
      continue;
    }

    // Check if value is a data binding object
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'path' in value &&
      typeof (value as any).path === 'string'
    ) {
      // Skip validation for data bindings - they're resolved at runtime
      continue;
    }

    // For arrays, check if any element is a data binding
    if (Array.isArray(value)) {
      const hasBinding = value.some(
        item =>
          item &&
          typeof item === 'object' &&
          'path' in item &&
          typeof (item as any).path === 'string'
      );
      if (hasBinding) {
        // Skip validation if array contains data bindings
        continue;
      }
    }

    propsToValidate[key] = value;
  }

  // Check required properties first (shallow check before deep validation)
  const requiredFields = new Set<string>(mergedSchema.required || []);
  for (const fieldName of requiredFields) {
    if (fieldName === 'component') continue;
    if (!(fieldName in props)) {
      errors.push(`Missing required property: ${fieldName}`);
    }
  }

  // If missing required fields, return early
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Deep validation of property types and structures
  // We'll do a manual check here instead of using Ajv to avoid the complexity of
  // resolving $refs at runtime. Focus on common validation issues like array item types.
  for (const [propName, propValue] of Object.entries(propsToValidate)) {
    if (propName === 'component' || propName === 'id') continue;

    const propSchema = mergedSchema.properties[propName];
    if (!propSchema) continue; // Unknown property, allow it (catalogs may have unevaluatedProperties)

    // Validate array items if schema specifies items structure
    if (propSchema.type === 'array' && propSchema.items && Array.isArray(propValue)) {
      const itemSchema = propSchema.items;

      // Check if items should be primitive types
      if (itemSchema.type === 'string' || itemSchema.type === 'number' || itemSchema.type === 'boolean') {
        for (let i = 0; i < propValue.length; i++) {
          const item = propValue[i];
          if (typeof item !== itemSchema.type) {
            errors.push(
              `Property '${propName}[${i}]' must be of type ${itemSchema.type}. Got ${typeof item}.`
            );
          }
        }
      }

      // Check if items should be objects with specific properties
      if (itemSchema.type === 'object' && itemSchema.properties) {
        for (let i = 0; i < propValue.length; i++) {
          const item = propValue[i];

          // Check if item is an object
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            errors.push(
              `Property '${propName}[${i}]' must be an object with properties: ${Object.keys(itemSchema.properties).join(', ')}. Got ${typeof item === 'string' ? `string "${item}"` : typeof item}.`
            );
            continue;
          }

          // Check required properties on the item
          const itemRequired = itemSchema.required || [];
          for (const reqField of itemRequired) {
            if (!(reqField in item)) {
              errors.push(
                `Property '${propName}[${i}]' is missing required field: ${reqField}`
              );
            }
          }
        }
      }
    }

    // Validate oneOf schemas (for options that can be array OR DataBinding)
    if (propSchema.oneOf && Array.isArray(propSchema.oneOf)) {
      // Check if value matches at least one of the oneOf schemas
      let matchedSchema = false;

      for (const subSchema of propSchema.oneOf) {
        // Check for DataBinding pattern
        if (subSchema.$ref && subSchema.$ref.includes('DataBinding')) {
          if (
            typeof propValue === 'object' &&
            propValue !== null &&
            'path' in propValue
          ) {
            matchedSchema = true;
            break;
          }
        }

        // Check for array type
        if (subSchema.type === 'array') {
          if (Array.isArray(propValue)) {
            // Validate array items if specified
            if (subSchema.items) {
              const itemSchema = subSchema.items;
              if (itemSchema.type === 'object' && itemSchema.properties) {
                // Check if all items are objects with required fields
                let allItemsValid = true;
                for (let i = 0; i < propValue.length; i++) {
                  const item = propValue[i];
                  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
                    errors.push(
                      `Property '${propName}[${i}]' must be an object with properties: ${Object.keys(itemSchema.properties).join(', ')}. Got ${typeof item === 'string' ? `string "${item}"` : typeof item}.`
                    );
                    allItemsValid = false;
                  }
                }
                if (allItemsValid) {
                  matchedSchema = true;
                  break;
                }
              } else {
                matchedSchema = true;
                break;
              }
            } else {
              matchedSchema = true;
              break;
            }
          }
        }
      }

      if (!matchedSchema && propSchema.oneOf.length > 0 && errors.length === 0) {
        errors.push(
          `Property '${propName}' does not match any allowed schema. Expected one of: ${propSchema.oneOf.map((s: any) => s.type || (s.$ref ? 'DataBinding' : 'unknown')).join(' | ')}.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Zod schemas for runtime validation

const catalogPropertySchema: z.ZodType<CatalogProperty> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']).optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    enum: z.array(z.string()).optional(),
    default: z.unknown().optional(),
    items: catalogPropertySchema.optional(),
    $ref: z.string().optional(),
  }).passthrough()
);

const catalogComponentSchema = z.object({
  description: z.string().optional(),
  properties: z.record(catalogPropertySchema).optional(),
  children: z.boolean().optional(),
  allOf: z.array(z.unknown()).optional(),
  unevaluatedProperties: z.boolean().optional(),
}).passthrough();

const catalogFunctionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  returnType: z.string().optional(),
}).passthrough();

export const catalogSchema = z.object({
  id: z.string().optional(),
  catalogId: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  $defs: z.record(z.unknown()).optional(),
  components: z.record(catalogComponentSchema),
  functions: z.array(catalogFunctionSchema).optional(),
}).passthrough();

/**
 * Parse and validate a catalog JSON.
 */
export function parseCatalog(json: unknown): Catalog {
  // Use safeParse to avoid throwing errors on partial mismatches during migration
  const result = catalogSchema.safeParse(json);

  if (!result.success) {
    console.warn("Catalog validation warning:", result.error);
    const cat = json as Catalog;
    // Polyfill id from catalogId or $id if missing
    if (!cat.id) {
      cat.id = cat.catalogId || (cat as any).$id || 'unknown';
    }
    return cat;
  }

  const cat = result.data as Catalog;
  // Ensure id is present
  if (!cat.id) {
    cat.id = cat.catalogId || (cat as any).$id || 'unknown';
  }
  return cat;
}
