/**
 * @fileoverview Catalog Converter
 *
 * Converts catalog.json component definitions into MCP Tool schemas.
 * This enables the Agent to see available UI components as callable tools.
 */

/**
 * Resolve a JSON $ref string to a schema object from the catalog's own $defs.
 * The catalog JSON (produced by `freesail prepare catalog`) is the source of truth
 * for all type definitions — no fallback constants are needed.
 *
 * Handles both:
 *   - "#/$defs/Foo"                    → internal ref, looks up in catalogDefs
 *   - "path/to/file.json#/$defs/Foo"   → external ref, extracts "Foo" and looks up in catalogDefs
 *
 * @returns the resolved schema object, or null if it cannot be resolved.
 */
function resolveRef(
  ref: string,
  catalogDefs?: Record<string, unknown>
): Record<string, unknown> | null {
  if (!catalogDefs) return null;

  const hash = ref.indexOf('#');
  if (hash === -1) return null;

  const fragment = ref.slice(hash + 1); // e.g. "/$defs/Checkable"
  const parts = fragment.split('/').filter(Boolean); // ["$defs", "Checkable"]

  if (parts.length < 2 || parts[0] !== '$defs') return null;
  const defName = parts[1];
  if (!defName) return null;

  const resolved = catalogDefs[defName];
  return resolved ? (resolved as Record<string, unknown>) : null;
}

import { z } from 'zod';
import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';

/**
 * Extracts the description from a component, searching through allOf entries if not at top level.
 */
function extractDescription(component: CatalogComponent): string | undefined {
  if (component.description) return component.description;
  if (component.allOf) {
    for (const sub of component.allOf) {
      const s = sub as CatalogComponent;
      if (s.description) return s.description;
    }
  }
  return undefined;
}

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
  oneOf?: CatalogProperty[];
  anyOf?: CatalogProperty[];
  allOf?: CatalogProperty[];
  properties?: Record<string, CatalogProperty>;
  additionalProperties?: boolean;
  const?: unknown;
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
  catalogId: string;
  title: string;
  description?: string;
  $defs?: Record<string, unknown>;
  components: Record<string, CatalogComponent>;
  functions?: Record<string, {
    type?: string;
    description?: string;
    properties?: {
      call?: { const: string };
      args?: Record<string, unknown>;
      returnType?: { const: string };
    };
    required?: string[];
  }>;
  /** Freesail SDK version the client catalog was built against. Used for future compatibility checks. */
  freesailSdkVersion?: string;
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
  const catalogDefs = (catalog.$defs ?? {}) as Record<string, unknown>;
  return Object.entries(catalog.components).map(([name, component]) => ({
    name: `render_${name.toLowerCase()}`,
    description: extractDescription(component) ?? `Render a ${name} component`,
    inputSchema: componentToSchema(name, component, catalogDefs),
  }));
}

/**
 * Converts a component definition to a JSON Schema.
 */
function componentToSchema(
  _name: string,
  component: CatalogComponent,
  catalogDefs?: Record<string, unknown>
): MCPTool['inputSchema'] {
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

        properties[propName] = propertyToSchema(prop, catalogDefs);
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
        const subDef = sub as CatalogComponent & { $ref?: string };
        if (subDef.$ref) {
          // Resolve external/internal $ref before recursing
          const resolved = resolveRef(subDef.$ref, catalogDefs);
          if (resolved) extractProperties(resolved as CatalogComponent);
        } else {
          extractProperties(subDef);
        }
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
 *
 * Fully schema-driven: unrecognized $refs are resolved from `defs` (the catalog's $defs)
 * recursively. No type names are hardcoded. The depth cap prevents infinite recursion.
 */
function propertyToSchema(prop: CatalogProperty, defs?: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (prop.$ref) {
    const refBaseName = (prop.$ref.split('/').pop() || '') as string;
    if (defs && refBaseName in defs && depth < 4) {
      const resolved = propertyToSchema(defs[refBaseName] as CatalogProperty, defs, depth + 1);
      return prop.description ? { ...resolved, description: prop.description } : resolved;
    }
    // Unresolved $ref — accept any value
    return prop.description ? { description: prop.description } : {};
  }

  // Handle oneOf / anyOf — both become anyOf in validation schemas.
  // Using anyOf (at-least-one) instead of oneOf (exactly-one) avoids false failures:
  // when some branches resolve to {} at the depth cap, they match any value, which
  // causes oneOf uniqueness checks to fail even for valid inputs.
  //
  // If the schema also has type/properties/required at the same level (e.g. FunctionCall),
  // those base constraints must not be discarded. Combine them with the variant part via allOf.
  if (prop.oneOf || prop.anyOf) {
    const branches = (prop.oneOf ?? prop.anyOf)!;
    const variantPart: Record<string, unknown> = {
      anyOf: branches.map(p => propertyToSchema(p, defs, depth + 1)),
    };
    const rawProp = prop as Record<string, unknown>;
    const hasBaseConstraints = prop.type || prop.properties || Array.isArray(rawProp['required']);
    if (hasBaseConstraints) {
      const basePart: Record<string, unknown> = {};
      if (prop.type) basePart['type'] = prop.type;
      if (prop.properties) {
        const innerProps: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(prop.properties)) {
          innerProps[k] = propertyToSchema(v, defs, depth + 1);
        }
        basePart['properties'] = innerProps;
      }
      if (Array.isArray(rawProp['required'])) basePart['required'] = rawProp['required'];
      if (prop.additionalProperties !== undefined) {
        const raw = rawProp['additionalProperties'];
        basePart['additionalProperties'] = typeof raw === 'boolean'
          ? raw
          : propertyToSchema(raw as CatalogProperty, defs, depth + 1);
      }
      return {
        allOf: [basePart, variantPart],
        ...(prop.description ? { description: prop.description } : {}),
      };
    }
    return {
      ...variantPart,
      ...(prop.description ? { description: prop.description } : {}),
    };
  }
  if (prop.allOf) {
    return {
      allOf: prop.allOf.map(p => propertyToSchema(p, defs, depth + 1)),
      ...(prop.description ? { description: prop.description } : {}),
    };
  }

  if (!prop.type) {
    // No type info — accept any value
    return prop.description ? { description: prop.description } : {};
  }

  const schema: Record<string, unknown> = { type: prop.type };

  if (prop.description) schema['description'] = prop.description;

  // NOTE: enum is intentionally NOT copied into the Ajv validation schema.
  // Enums are soft hints for the LLM (shown in the prompt via generateCatalogPrompt)
  // but not hard constraints — e.g. Material Symbols supports thousands of icon
  // names beyond the curated catalog list.

  if (prop.default !== undefined) schema['default'] = prop.default;
  if (prop.const !== undefined) schema['const'] = prop.const;

  if (prop.type === 'array' && prop.items) {
    schema['items'] = propertyToSchema(prop.items, defs, depth + 1);
  }

  // Preserve inner object structure for strict validation of known properties
  if (prop.type === 'object') {
    if (prop.properties) {
      const innerProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(prop.properties)) {
        innerProps[k] = propertyToSchema(v, defs, depth + 1);
      }
      schema['properties'] = innerProps;
    }
    const rawProp = prop as Record<string, unknown>;
    if (Array.isArray(rawProp['required'])) schema['required'] = rawProp['required'];
    if (prop.additionalProperties !== undefined) {
      const raw = (prop as Record<string, unknown>)['additionalProperties'];
      schema['additionalProperties'] = typeof raw === 'boolean'
        ? raw
        : propertyToSchema(raw as CatalogProperty, defs, depth + 1);
    }
  }

  return schema;
}

/**
 * Generates the system prompt injection for the catalog.
 */
const catalogPromptCache = new WeakMap<Catalog, string>();

// ---------------------------------------------------------------------------
// Shallow type formatter + referenced-def helpers (for component detail output)
// ---------------------------------------------------------------------------

/**
 * Formats a property type stopping at $ref boundaries — returns the def name instead of
 * expanding it. Used for the property list in component details; the Types section then
 * expands each referenced def once.
 */
function formatPropertyTypeShallow(prop: CatalogProperty, defs?: Record<string, unknown>): string {
  if (prop.const !== undefined) return JSON.stringify(prop.const);

  if (prop.$ref) return prop.$ref.split('/').pop() || 'unknown';

  if (prop.enum && prop.enum.length > 0) {
    const enumStr = prop.type || 'string';
    return prop.description ? `${enumStr} ("${prop.description}")` : enumStr;
  }

  if (prop.type === 'array') {
    if (prop.items) return `array[${formatPropertyTypeShallow(prop.items, defs)}]`;
    return 'array';
  }

  if (prop.type === 'object' && prop.properties) {
    const parts = Object.entries(prop.properties).map(([k, v]) => {
      const isReq = Array.isArray((prop as any).required) ? (prop as any).required.includes(k) : false;
      return `${k}${isReq ? '' : '?'}: ${formatPropertyTypeShallow(v, defs)}`;
    });
    const objStr = `{${parts.join(', ')}}`;
    return prop.description ? `${objStr} ("${prop.description}")` : objStr;
  }

  if (prop.oneOf || prop.anyOf) {
    const branches = (prop.oneOf ?? prop.anyOf)!;
    const types = branches.map(b => formatPropertyTypeShallow(b, defs));
    const unionStr = types.filter(t => t !== 'any').join(' | ') || 'any';
    return prop.description ? `${unionStr} ("${prop.description}")` : unionStr;
  }

  if (prop.allOf) {
    const primary = prop.allOf.find(b => b.$ref || b.type);
    if (!primary) return 'any';
    const baseName = (primary as CatalogProperty).$ref
      ? ((primary as CatalogProperty).$ref!.split('/').pop() || 'unknown')
      : formatPropertyTypeShallow(primary as CatalogProperty, defs);

    const annotations: string[] = [];
    for (const branch of prop.allOf) {
      if (branch === primary) continue;
      const bProps = (branch as CatalogProperty).properties;
      if (bProps) {
        for (const [k, v] of Object.entries(bProps)) {
          if ((v as CatalogProperty).const !== undefined) {
            annotations.push(`${k}: ${JSON.stringify((v as CatalogProperty).const)}`);
          }
        }
      }
    }
    return annotations.length > 0 ? `${baseName} (${annotations.join(', ')})` : baseName;
  }

  const typeStr = prop.type || 'any';
  return prop.description ? `${typeStr} ("${prop.description}")` : typeStr;
}

/**
 * Transitively collects all $def names referenced in a schema (via $ref, oneOf, allOf, etc.).
 * Cycle-safe via the visited set.
 */
function collectReferencedDefNames(
  schema: CatalogProperty,
  defs: Record<string, unknown>,
  visited = new Set<string>()
): Set<string> {
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() || '';
    if (name && !visited.has(name) && name in defs) {
      visited.add(name);
      collectReferencedDefNames(defs[name] as CatalogProperty, defs, visited);
    }
    return visited;
  }
  const branches = schema.oneOf ?? schema.anyOf;
  if (branches) branches.forEach(b => collectReferencedDefNames(b, defs, visited));
  if (schema.allOf) schema.allOf.forEach(b => collectReferencedDefNames(b as CatalogProperty, defs, visited));
  if (schema.type === 'array' && schema.items) collectReferencedDefNames(schema.items, defs, visited);
  if (schema.type === 'object' && schema.properties) {
    Object.values(schema.properties).forEach(p => collectReferencedDefNames(p, defs, visited));
  }
  return visited;
}

/**
 * Renders a single type entry for the Types section.
 * Uses shallow formatting so nested $refs appear as names, not expanded.
 */
function renderTypeEntry(name: string, schema: CatalogProperty, defs: Record<string, unknown>): string {
  const desc = (schema as any).description as string | undefined;
  const typeStr = formatPropertyTypeShallow(schema, defs);
  const descPart = desc ? ` ("${desc}")` : '';
  return `  ${name}${descPart}: ${typeStr}\n`;
}

// ---------------------------------------------------------------------------
// Types Reference rendering
// ---------------------------------------------------------------------------

/**
 * Returns a compact JSON placeholder string derived entirely from the schema structure.
 * Resolves #/$defs/<Name> refs from the provided defs dict — no type-name hardcoding.
 */
function schemaPlaceholder(
  schema: Record<string, unknown>,
  defs: Record<string, unknown>,
  depth = 0
): string {
  if (depth > 2) return '"..."';

  // $ref: resolve #/$defs/<Name> from defs; treat external refs as opaque
  const ref = schema['$ref'] as string | undefined;
  if (ref) {
    const hash = ref.indexOf('#');
    if (hash !== -1) {
      const fragment = ref.slice(hash + 1); // e.g. "/$defs/DataBinding"
      const parts = fragment.split('/').filter(Boolean);
      if (parts[0] === '$defs' && parts[1] && parts[1] in defs) {
        return schemaPlaceholder(defs[parts[1]] as Record<string, unknown>, defs, depth + 1);
      }
    }
    return '"..."';
  }

  const type = schema['type'] as string | undefined;

  // object: derive from required + properties
  if (type === 'object') {
    const props = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    const required = (schema['required'] as string[] | undefined) ?? [];
    if (props && required.length > 0) {
      const sub = required.slice(0, 2).map(k =>
        `"${k}":${schemaPlaceholder((props[k] ?? {}) as Record<string, unknown>, defs, depth + 1)}`
      );
      return `{${sub.join(',')}}`;
    }
    return '{...}';
  }

  if (type === 'string') return '"..."';
  if (type === 'number') return '42';
  if (type === 'boolean') return 'true';

  if (type === 'array') {
    const items = schema['items'] as Record<string, unknown> | undefined;
    if (items) return `[${schemaPlaceholder(items, defs, depth + 1)}]`;
    return '[...]';
  }

  // oneOf / anyOf: return the first branch that yields a non-trivial placeholder
  const polyBranches = (schema['oneOf'] ?? schema['anyOf']) as Record<string, unknown>[] | undefined;
  if (polyBranches) {
    for (const branch of polyBranches) {
      const p = schemaPlaceholder(branch as Record<string, unknown>, defs, depth + 1);
      if (p !== '"..."') return p;
    }
    return '"..."';
  }

  // allOf: merge primary example with any extra const-constrained properties
  const allOf = schema['allOf'] as Record<string, unknown>[] | undefined;
  if (allOf) return exampleFromAllOf(allOf, defs, depth);

  return '"..."';
}

/**
 * Handles allOf schemas by deriving an example from the primary branch and
 * merging in any additional const-constrained properties from sibling branches.
 * This covers the Dynamic-type pattern:
 *   {allOf: [{$ref:"#/$defs/FunctionCall"}, {properties:{returnType:{const:"string"}}}]}
 * without naming types explicitly.
 */
function exampleFromAllOf(
  allOf: Record<string, unknown>[],
  defs: Record<string, unknown>,
  depth: number
): string {
  // Find the primary branch (has $ref or type) and get its base example
  const primary = allOf.find(b => b['$ref'] || b['type']);
  const baseExample = primary
    ? schemaPlaceholder(primary as Record<string, unknown>, defs, depth + 1)
    : '"..."';

  // Collect const-constrained keys from all other branches' properties
  const extraPairs: string[] = [];
  for (const branch of allOf) {
    if (branch === primary) continue;
    const bProps = branch['properties'] as Record<string, Record<string, unknown>> | undefined;
    if (!bProps) continue;
    for (const [key, propDef] of Object.entries(bProps)) {
      const constVal = propDef['const'];
      if (constVal !== undefined) {
        extraPairs.push(`"${key}":${JSON.stringify(constVal)}`);
      }
    }
  }

  // Merge extras into the base object example if possible
  if (extraPairs.length > 0 && baseExample.startsWith('{') && baseExample !== '{...}') {
    const inner = baseExample.slice(1, -1); // strip outer braces
    return `{${inner},${extraPairs.join(',')}}`;
  }

  return baseExample;
}


export function generateCatalogPrompt(catalog: Catalog): string {
  const cached = catalogPromptCache.get(catalog);
  if (cached) return cached;

  const lines: string[] = [
    `## UI Catalog: ${catalog.title}`,
    `**Catalog ID (use this as catalogId in create_surface):** \`${catalog.catalogId}\``,
    '',
    catalog.description ?? 'Available UI components for rendering interfaces.',
    '',
  ];

  // 1. Available Functions — establish callable functions before components reference them
  const funcEntries = catalog.functions ? Object.entries(catalog.functions) : [];
  if (funcEntries.length > 0) {
    lines.push('### Available Functions:', '');
    lines.push('Use the `args` object to pass named arguments to functions. Use the argument names documented below as keys.');
    lines.push('');
    for (const [funcName, func] of funcEntries) {
      const argsDef = func.properties?.['args'] as Record<string, unknown> | undefined;
      let sig = '';
      const argsProps = argsDef?.['properties'] as Record<string, unknown> | undefined;
      const argsRequired = argsDef?.['required'] as string[] | undefined;
      if (argsProps && Object.keys(argsProps).length > 0) {
        const requiredSet = new Set(argsRequired ?? []);
        const paramParts = Object.entries(argsProps).map(([argName, argSchema]) => {
          const schema = argSchema as Record<string, unknown>;
          const desc = schema['description'] as string | undefined;
          const ref = schema['$ref'] as string | undefined;
          let typeName = 'any';
          if (ref) {
            const base = ref.split('/').pop() || 'any';
            typeName = base.startsWith('Dynamic') ? base.replace('Dynamic', '').toLowerCase() : base;
          } else if (schema['type']) {
            typeName = schema['type'] as string;
          }
          const optional = !requiredSet.has(argName);
          return `${argName}: ${typeName}${optional ? '?' : ''}${desc ? ` /* ${desc} */` : ''}`;
        });
        sig = `(${paramParts.join(', ')})`;
      } else {
        sig = '()';
      }
      const returnType = func.properties?.['returnType']?.const;
      const ret = returnType ? ` → ${returnType}` : '';
      lines.push(`**${funcName}**${sig}${ret}`);
      if (func.description) lines.push(`  ${func.description}`);
      lines.push('');
    }
  }

  // 3. Available Components
  lines.push('### Available Components:');
  lines.push('');

  const allReferencedNames = new Set<string>();

  for (const [componentName, component] of Object.entries(catalog.components)) {
    lines.push(`**${componentName}**`);
    const componentDesc = extractDescription(component);
    if (componentDesc) {
      lines.push(`  ${componentDesc}`);
    }
    // Helper to collect all properties including from allOf + $ref resolution
    const allProps: Record<string, CatalogProperty> = {};
    const collectProps = (def: CatalogComponent, depth = 0) => {
      if (depth > 5) return; // guard against circular refs
      if (def.properties) {
        Object.assign(allProps, def.properties);
      }
      if (def.allOf) {
        def.allOf.forEach(sub => {
          const subDef = sub as CatalogComponent & { $ref?: string };
          if (subDef.$ref) {
            const resolved = resolveRef(subDef.$ref, catalog.$defs as Record<string, unknown>);
            if (resolved) collectProps(resolved as CatalogComponent, depth + 1);
          } else {
            collectProps(subDef, depth + 1);
          }
        });
      }
      // Also handle a bare $ref at the top level of a sub-schema
      if ((def as any).$ref && !def.properties && !def.allOf) {
        const resolved = resolveRef((def as any).$ref, catalog.$defs as Record<string, unknown>);
        if (resolved) collectProps(resolved as CatalogComponent, depth + 1);
      }
    };
    collectProps(component);

    // Collect all required fields (also follows $refs)
    const requiredFields = new Set<string>();
    const collectRequired = (def: CatalogComponent, depth = 0) => {
      if (depth > 5) return;
      // Individual property required flag
      if (def.properties) {
        for (const [key, prop] of Object.entries(def.properties)) {
          if (prop.required) requiredFields.add(key);
        }
      }
      // Top-level required array
      if (Array.isArray((def as any).required)) {
        ((def as any).required as string[]).forEach((k: string) => requiredFields.add(k));
      }
      // Recurse
      if (def.allOf) {
        def.allOf.forEach(sub => {
          const subDef = sub as CatalogComponent & { $ref?: string };
          if (subDef.$ref) {
            const resolved = resolveRef(subDef.$ref, catalog.$defs as Record<string, unknown>);
            if (resolved) collectRequired(resolved as CatalogComponent, depth + 1);
          } else {
            collectRequired(subDef, depth + 1);
          }
        });
      }
    };
    collectRequired(component);


    if (Object.keys(allProps).length > 0) {
      lines.push('  Properties:');

      const reqProps: string[] = [];
      const optProps: string[] = [];
      const catalogDefs = (catalog.$defs as Record<string, unknown>) ?? {};

      for (const [propName, prop] of Object.entries(allProps)) {
        if (propName === 'component') continue;

        const typeStr = formatPropertyTypeShallow(prop, catalogDefs);
        collectReferencedDefNames(prop, catalogDefs, allReferencedNames);

        // Extract enum values — check top-level first, then drill into oneOf/anyOf branches
        let enumValues = prop.enum;
        if ((!enumValues || enumValues.length === 0) && (prop.oneOf || prop.anyOf)) {
          for (const branch of (prop.oneOf ?? prop.anyOf)!) {
            if (branch.enum && branch.enum.length > 0) {
              enumValues = branch.enum;
              break;
            }
          }
        }

        const enumSuffix = enumValues && enumValues.length > 0 ? ` (values: ${enumValues.join(', ')})` : '';
        const defaultSuffix = prop.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : '';
        const desc = prop.description ? ` — ${prop.description}` : '';
        const line = `    - ${propName}: ${typeStr}${enumSuffix}${defaultSuffix}${desc}`;

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

  // Single shared Types section for all components
  const catalogDefs = (catalog.$defs as Record<string, unknown>) ?? {};
  if (allReferencedNames.size > 0) {
    lines.push('### Types:');
    for (const name of allReferencedNames) {
      if (name in catalogDefs) {
        lines.push(renderTypeEntry(name, catalogDefs[name] as CatalogProperty, catalogDefs));
      }
    }
    lines.push('');
  }

  const result = lines.join('\n');
  catalogPromptCache.set(catalog, result);
  return result;
}

// ---------------------------------------------------------------------------
// Catalog index (slim) + per-item detail generators
// ---------------------------------------------------------------------------

/**
 * Generates a slim catalog index: component/function names, one-line descriptions,
 * and a hint to call get_component_details / get_function_details for full details.
 */
export function generateCatalogIndex(catalog: Catalog): string {
  const lines: string[] = [
    `## UI Catalog: ${catalog.title}`,
    `**Catalog ID (use this as catalogId in create_surface):** \`${catalog.catalogId}\``,
    '',
    catalog.description ?? 'Available UI components for rendering interfaces.',
    '',
  ];

  lines.push('### Components');
  lines.push('Call `get_component_details` with component names before using any component.');
  lines.push('');
  for (const [name, component] of Object.entries(catalog.components)) {
    const desc = extractDescription(component);
    const firstSentence = desc ? ` — ${desc.split('.')[0]}` : '';
    lines.push(`- **${name}**${firstSentence}`);
  }
  lines.push('');

  const funcEntries = catalog.functions ? Object.entries(catalog.functions) : [];
  if (funcEntries.length > 0) {
    lines.push('### Functions');
    lines.push('Call `get_function_details` with function names before using any function.');
    lines.push('');
    for (const [name, func] of funcEntries) {
      const desc = func.description ? ` — ${func.description.split('.')[0]}` : '';
      lines.push(`- **${name}**${desc}`);
    }
    lines.push('');
  }

  const defs = (catalog.$defs as Record<string, unknown>) ?? {};
  if (Object.keys(defs).length > 0) {
    lines.push('### Types');
    lines.push('Shared types used in component and function properties.');
    lines.push('');
    for (const [name, schema] of Object.entries(defs)) {
      lines.push(renderTypeEntry(name, schema as CatalogProperty, defs));
    }
  }

  return lines.join('\n');
}

// Detail caches — pre-warmed at catalog registration time, keyed by "catalogId:name"
const componentDetailCache = new Map<string, string>();
const componentRefsCache = new Map<string, Set<string>>();
const functionDetailCache = new Map<string, string>();

/**
 * Generates and returns the full detail block for a set of component names,
 * with a single shared Types section at the end covering all referenced $defs.
 * Results are served from the detail cache (pre-warmed at catalog registration).
 */
export function generateComponentDetails(catalog: Catalog, componentNames: string[]): string {
  const lines: string[] = [];
  const unknown: string[] = [];

  for (const name of componentNames) {
    const key = `${catalog.catalogId}:${name}`;
    const cached = componentDetailCache.get(key);
    const cachedRefs = componentRefsCache.get(key);
    if (cached && cachedRefs) {
      lines.push(cached);
    } else {
      const entry = Object.entries(catalog.components).find(([n]) => n === name);
      if (!entry) {
        unknown.push(name);
        continue;
      }
      const refs = new Set<string>();
      const detail = renderComponentDetail(catalog, entry[0], entry[1], refs);
      componentDetailCache.set(key, detail);
      componentRefsCache.set(key, refs);
      lines.push(detail);
    }
  }

  if (unknown.length > 0) {
    const available = Object.keys(catalog.components).join(', ');
    lines.push(`Unknown component(s): ${unknown.join(', ')}. Available: ${available}`);
  }

  return lines.join('\n');
}

/**
 * Generates and returns the full detail block for a set of function names.
 * Results are served from the detail cache (pre-warmed at catalog registration).
 */
export function generateFunctionDetails(catalog: Catalog, functionNames: string[]): string {
  if (!catalog.functions) {
    return 'This catalog has no functions.';
  }

  const lines: string[] = [];
  const unknown: string[] = [];

  for (const name of functionNames) {
    const key = `${catalog.catalogId}:fn:${name}`;
    const cached = functionDetailCache.get(key);
    if (cached) {
      lines.push(cached);
    } else {
      const func = catalog.functions[name];
      if (!func) {
        unknown.push(name);
        continue;
      }
      const detail = renderFunctionDetail(name, func);
      functionDetailCache.set(key, detail);
      lines.push(detail);
    }
  }

  if (unknown.length > 0) {
    const available = Object.keys(catalog.functions).join(', ');
    lines.push(`Unknown function(s): ${unknown.join(', ')}. Available: ${available}`);
  }

  return lines.join('\n');
}

/**
 * Pre-warms the component and function detail caches for a catalog.
 * Call this when a catalog is registered so all detail lookups are instant.
 */
export function prewarmCatalogDetailCache(catalog: Catalog): void {
  for (const [name, component] of Object.entries(catalog.components)) {
    const key = `${catalog.catalogId}:${name}`;
    if (!componentDetailCache.has(key)) {
      const refs = new Set<string>();
      componentDetailCache.set(key, renderComponentDetail(catalog, name, component, refs));
      componentRefsCache.set(key, refs);
    }
  }
  if (catalog.functions) {
    for (const [name, func] of Object.entries(catalog.functions)) {
      const key = `${catalog.catalogId}:fn:${name}`;
      if (!functionDetailCache.has(key)) {
        functionDetailCache.set(key, renderFunctionDetail(name, func));
      }
    }
  }
}

/** Renders the full detail block for a single component (extracted from generateCatalogPrompt logic).
 *  If `referencedNames` is provided, referenced $def names are collected into it (caller appends shared Types section). */
function renderComponentDetail(catalog: Catalog, componentName: string, component: CatalogComponent, referencedNames?: Set<string>): string {
  const lines: string[] = [];
  lines.push(`**${componentName}**`);
  const componentDesc = extractDescription(component);
  if (componentDesc) lines.push(`  ${componentDesc}`);

  const allProps: Record<string, CatalogProperty> = {};
  const collectProps = (def: CatalogComponent, depth = 0) => {
    if (depth > 5) return;
    if (def.properties) Object.assign(allProps, def.properties);
    if (def.allOf) {
      def.allOf.forEach(sub => {
        const subDef = sub as CatalogComponent & { $ref?: string };
        if (subDef.$ref) {
          const resolved = resolveRef(subDef.$ref, catalog.$defs as Record<string, unknown>);
          if (resolved) collectProps(resolved as CatalogComponent, depth + 1);
        } else {
          collectProps(subDef, depth + 1);
        }
      });
    }
    if ((def as any).$ref && !def.properties && !def.allOf) {
      const resolved = resolveRef((def as any).$ref, catalog.$defs as Record<string, unknown>);
      if (resolved) collectProps(resolved as CatalogComponent, depth + 1);
    }
  };
  collectProps(component);

  const requiredFields = new Set<string>();
  const collectRequired = (def: CatalogComponent, depth = 0) => {
    if (depth > 5) return;
    if (def.properties) {
      for (const [key, prop] of Object.entries(def.properties)) {
        if (prop.required) requiredFields.add(key);
      }
    }
    if (Array.isArray((def as any).required)) {
      ((def as any).required as string[]).forEach((k: string) => requiredFields.add(k));
    }
    if (def.allOf) {
      def.allOf.forEach(sub => {
        const subDef = sub as CatalogComponent & { $ref?: string };
        if (subDef.$ref) {
          const resolved = resolveRef(subDef.$ref, catalog.$defs as Record<string, unknown>);
          if (resolved) collectRequired(resolved as CatalogComponent, depth + 1);
        } else {
          collectRequired(subDef, depth + 1);
        }
      });
    }
  };
  collectRequired(component);

  if (Object.keys(allProps).length > 0) {
    lines.push('  Properties:');
    const reqProps: string[] = [];
    const optProps: string[] = [];

    const defs = (catalog.$defs as Record<string, unknown>) ?? {};

    for (const [propName, prop] of Object.entries(allProps)) {
      if (propName === 'component') continue;
      const typeStr = formatPropertyTypeShallow(prop, defs);
      if (referencedNames) collectReferencedDefNames(prop, defs, referencedNames);
      let enumValues = prop.enum;
      if ((!enumValues || enumValues.length === 0) && (prop.oneOf || prop.anyOf)) {
        for (const branch of (prop.oneOf ?? prop.anyOf)!) {
          if (branch.enum && branch.enum.length > 0) { enumValues = branch.enum; break; }
        }
      }
      const enumSuffix = enumValues && enumValues.length > 0 ? ` (values: ${enumValues.join(', ')})` : '';
      const defaultSuffix = prop.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : '';
      const desc = prop.description ? ` — ${prop.description}` : '';
      const line = `    - ${propName}: ${typeStr}${enumSuffix}${defaultSuffix}${desc}`;
      if (requiredFields.has(propName)) reqProps.push(line);
      else optProps.push(line);
    }

    if (reqProps.length > 0) { lines.push('    [REQUIRED]'); lines.push(...reqProps); }
    if (optProps.length > 0) { lines.push('    [OPTIONAL]'); lines.push(...optProps); }
  }

  const supportsChildren = component.children === true || allProps['children'] !== undefined;
  if (supportsChildren) lines.push('  Supports children: yes');
  lines.push('');

  return lines.join('\n');
}

/** Renders the full detail block for a single function (extracted from generateCatalogPrompt logic). */
function renderFunctionDetail(funcName: string, func: Catalog['functions'] extends Record<string, infer V> | undefined ? V : never): string {
  const lines: string[] = [];
  const argsDef = func.properties?.['args'] as Record<string, unknown> | undefined;
  const argsProps = argsDef?.['properties'] as Record<string, unknown> | undefined;
  const argsRequired = argsDef?.['required'] as string[] | undefined;

  let sig = '';
  if (argsProps && Object.keys(argsProps).length > 0) {
    const requiredSet = new Set(argsRequired ?? []);
    const paramParts = Object.entries(argsProps).map(([argName, argSchema]) => {
      const schema = argSchema as Record<string, unknown>;
      const desc = schema['description'] as string | undefined;
      const ref = schema['$ref'] as string | undefined;
      let typeName = 'any';
      if (ref) {
        const base = ref.split('/').pop() || 'any';
        typeName = base.startsWith('Dynamic') ? base.replace('Dynamic', '').toLowerCase() : base;
      } else if (schema['type']) {
        typeName = schema['type'] as string;
      }
      const optional = !requiredSet.has(argName);
      return `${argName}: ${typeName}${optional ? '?' : ''}${desc ? ` /* ${desc} */` : ''}`;
    });
    sig = `(${paramParts.join(', ')})`;
  } else {
    sig = '()';
  }

  const returnType = func.properties?.['returnType']?.const;
  const ret = returnType ? ` → ${returnType}` : '';
  lines.push(`**${funcName}**${sig}${ret}`);
  if (func.description) lines.push(`  ${func.description}`);
  lines.push('');

  return lines.join('\n');
}

// Ajv singleton — compiled validators are cached per component type per catalog
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));

// Cache: "catalogId:componentType" → compiled validator
const componentValidators = new Map<string, ValidateFunction>();
// Cache: "catalogId:func:funcName" → compiled validator
const functionValidators = new Map<string, ValidateFunction>();
// Tracks which catalog IDs have been registered as AJV schemas
const registeredCatalogs = new Set<string>();

function ensureCatalogRegistered(catalog: Catalog): string {
  const uri = catalog.catalogId;
  if (!registeredCatalogs.has(uri)) {
    // Strip $schema — AJV would treat it as an external meta-schema URI and throw
    // when it can't resolve it. It plays no role in instance validation.
    const { $schema: _, ...catalogDoc } = catalog as unknown as Record<string, unknown>;
    ajv.addSchema(catalogDoc, uri);
    registeredCatalogs.add(uri);
  }
  return uri;
}

function getFunctionValidator(catalog: Catalog, funcName: string): ValidateFunction | null {
  const key = `${catalog.catalogId}:func:${funcName}`;
  const cached = functionValidators.get(key);
  if (cached) return cached;

  if (!catalog.functions?.[funcName]) return null;

  try {
    const uri = ensureCatalogRegistered(catalog);
    // $ref lets AJV resolve nested $defs (e.g. DynamicValue) within the registered catalog
    const validator = ajv.compile({ $ref: `${uri}#/functions/${funcName}` });
    functionValidators.set(key, validator);
    return validator;
  } catch (error) {
    console.error(`[converter] Failed to compile function validator for ${funcName}:`, error);
    return null;
  }
}

function getComponentValidator(catalog: Catalog, componentType: string): ValidateFunction | null {
  const key = `${catalog.catalogId}:${componentType.toLowerCase()}`;
  const cached = componentValidators.get(key);
  if (cached) return cached;

  const entry = Object.entries(catalog.components).find(
    ([name]) => name.toLowerCase() === componentType.toLowerCase()
  );
  if (!entry) return null;

  const [name] = entry;

  try {
    const uri = ensureCatalogRegistered(catalog);
    const validator = ajv.compile({ $ref: `${uri}#/components/${name}` });
    componentValidators.set(key, validator);
    return validator;
  } catch (error) {
    console.error(`[converter] Failed to compile validator for ${componentType}:`, error);
    return null;
  }
}

function getAtPath(data: unknown, instancePath: string): unknown {
  if (!instancePath) return data;
  let cur: unknown = data;
  for (const seg of instancePath.split('/').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function isFunctionCall(value: unknown): value is { call: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'call' in value &&
    typeof (value as Record<string, unknown>)['call'] === 'string'
  );
}

function simplifyAjvErrors(
  rawErrors: ErrorObject[],
  data: Record<string, unknown>,
  catalog: Catalog,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (msg: string) => { if (!seen.has(msg)) { seen.add(msg); result.push(msg); } };

  // First pass: find all instancePaths where a oneOf/anyOf error occurs on a FunctionCall value.
  // All errors at these paths (and sub-paths) will be replaced with targeted per-function errors.
  // We don't use schemaPath filtering because AJV collapses $ref chains in schemaPath, making
  // it impossible to reliably detect branch sub-errors that way.
  const functionCallPaths = new Map<string, string>(); // instancePath → funcName
  for (const err of rawErrors) {
    if (err.keyword === 'oneOf' || err.keyword === 'anyOf') {
      const value = getAtPath(data, err.instancePath);
      if (isFunctionCall(value)) {
        functionCallPaths.set(err.instancePath, value.call);
      }
    }
  }

  // Second pass: emit focused errors for each FunctionCall path.
  const emitted = new Set<string>();
  for (const [instancePath, funcName] of functionCallPaths) {
    if (emitted.has(instancePath)) continue;
    emitted.add(instancePath);

    const value = getAtPath(data, instancePath);
    const funcValidator = getFunctionValidator(catalog, funcName);
    if (!funcValidator) {
      const path = instancePath.replace(/^\//, '').replace(/\//g, '.') || 'value';
      add(`${path}: unknown function '${funcName}'`);
      continue;
    }
    funcValidator(value);
    const prefix = instancePath.replace(/^\//, '').replace(/\//g, '.');
    for (const fe of funcValidator.errors ?? []) {
      let path: string;
      if (fe.instancePath) {
        const sub = fe.instancePath.replace(/^\//, '').replace(/\//g, '.');
        path = prefix ? `${prefix}.${sub}` : sub;
      } else if (fe.keyword === 'required') {
        const missing = (fe.params as Record<string, unknown>)['missingProperty'] as string;
        path = prefix ? `${prefix}.${missing}` : missing;
      } else {
        path = prefix || 'value';
      }
      add(`${path}: ${fe.message}`);
    }
  }

  // Third pass: emit all errors NOT at or under a FunctionCall path.
  for (const err of rawErrors) {
    const covered = [...functionCallPaths.keys()].some(
      fcPath => err.instancePath === fcPath || err.instancePath.startsWith(fcPath + '/'),
    );
    if (covered) continue;

    const field = err.instancePath
      ? err.instancePath.replace(/^\//, '').replace(/\//g, '.')
      : err.keyword === 'required'
        ? (err.params as Record<string, unknown>)['missingProperty'] as string ?? 'field'
        : 'field';
    add(`${field}: ${err.message}`);
  }

  return result;
}

/**
 * Validates a component instance against the catalog using ajv.
 * The compiled schema comes from componentToSchema(), which is the same schema
 * projected to the agent as an MCP tool — so the two are always in sync.
 */
export function validateComponent(
  catalog: Catalog,
  componentType: string,
  props: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  if (!Object.entries(catalog.components).find(
    ([name]) => name.toLowerCase() === componentType.toLowerCase()
  )) {
    return { valid: false, errors: [`Unknown component type: ${componentType}`] };
  }

  const validator = getComponentValidator(catalog, componentType);
  if (!validator) {
    return { valid: false, errors: [`Could not build validator for component: ${componentType}`] };
  }

  const errors: string[] = [];

  const valid = validator(props);
  if (!valid) {
    errors.push(...simplifyAjvErrors(validator.errors ?? [], props, catalog));
  }

  return { valid: errors.length === 0, errors };
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
  type: z.string().optional(),
  description: z.string().optional(),
  properties: z.object({
    call: z.object({ const: z.string() }).optional(),
    args: z.record(z.unknown()).optional(),
    returnType: z.object({ const: z.string() }).optional(),
  }).passthrough().optional(),
  required: z.array(z.string()).optional(),
  unevaluatedProperties: z.boolean().optional(),
}).passthrough();

export const catalogSchema = z.object({
  id: z.string().optional(),
  catalogId: z.string(),
  title: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  $defs: z.record(z.unknown()).optional(),
  components: z.record(catalogComponentSchema),
  functions: z.record(catalogFunctionSchema).optional(),
  freesailSdkVersion: z.string().optional(),
}).passthrough();

/**
 * Parse and validate a catalog JSON.
 */
export function parseCatalog(json: unknown): Catalog {
  // Normalise legacy field names before validation so older catalogs still work
  const input = (typeof json === 'object' && json !== null)
    ? { ...(json as Record<string, unknown>) }
    : json;
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (!obj['catalogId'] && obj['$id']) obj['catalogId'] = obj['$id'];
    if (!obj['title'] && obj['name']) obj['title'] = obj['name'];
  }

  const result = catalogSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
    throw new Error(`Invalid catalog: ${issues}`);
  }

  return result.data as Catalog;
}
