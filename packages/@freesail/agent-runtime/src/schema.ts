import { z } from 'zod';

/**
 * Convert a JSON Schema property to a Zod type.
 */
function propertyToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop['type'] as string | undefined;

  switch (type) {
    case 'string': {
      const enumValues = prop['enum'] as string[] | undefined;
      if (enumValues && enumValues.length > 0) {
        return z.enum(enumValues as [string, ...string[]]);
      }
      return z.string();
    }
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array': {
      const items = prop['items'] as Record<string, unknown> | undefined;
      return z.array(items ? propertyToZod(items) : z.unknown());
    }
    case 'object': {
      const properties = prop['properties'] as Record<string, Record<string, unknown>> | undefined;
      if (properties) {
        return jsonSchemaToZod(prop);
      }
      return z.record(z.unknown());
    }
    default:
      return z.unknown();
  }
}

/**
 * Convert a JSON Schema object to a Zod object schema.
 * Handles nested objects, arrays, optionals, and descriptions.
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject<z.ZodRawShape> {
  const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  const required = schema['required'] as string[] | undefined;

  if (!properties) return z.object({}).passthrough();

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny = propertyToZod(prop);

    const description = prop['description'] as string | undefined;
    if (description) {
      field = field.describe(description);
    }

    if (!required?.includes(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape).passthrough();
}
