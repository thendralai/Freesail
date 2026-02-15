
import type { FunctionImplementation } from '@freesail/react';

// =============================================================================
// Validation Functions
// =============================================================================

export const required: FunctionImplementation = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

export const regex: FunctionImplementation = (value: unknown, pattern: string) => {
  if (typeof value !== 'string') return false;
  try {
    const re = new RegExp(pattern);
    return re.test(value);
  } catch {
    return false;
  }
};

export const length: FunctionImplementation = (value: unknown, constraints: { min?: number; max?: number }) => {
  if (typeof value !== 'string' && !Array.isArray(value)) return false;
  const len = value.length;
  if (constraints.min !== undefined && len < constraints.min) return false;
  if (constraints.max !== undefined && len > constraints.max) return false;
  return true;
};

export const numeric: FunctionImplementation = (value: unknown, constraints: { min?: number; max?: number }) => {
  const num = Number(value);
  if (isNaN(num)) return false;
  if (constraints.min !== undefined && num < constraints.min) return false;
  if (constraints.max !== undefined && num > constraints.max) return false;
  return true;
};

export const email: FunctionImplementation = (value: unknown) => {
  if (typeof value !== 'string') return false;
  // Simple email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// =============================================================================
// Formatting Functions
// =============================================================================

export const formatString: FunctionImplementation = (format: string, ...args: unknown[]) => {
  // Simple variable replacement: "Hello ${0}!" -> "Hello World!"
  // But the schema description says: "The value string can contain interpolated expressions in the `${expression}` format."
  // However, the `formatString` definition in the schema takes a format string and then variable arguments.
  // The SDK/Evaluator should have already resolved the arguments.
  // So if the usage is `formatString("Hello ${name}", name)`, the evaluator resolves `name` and passes it.
  // BUT: The description suggests the format string *itself* contains the placeholders.
  // A common pattern for `formatString` with variable params is substitution.
  // Let's assume the evaluator passes `format` as first arg, and then resolved values for any other bindings.
  
  // Actually, looking at the schema:
  // "parameters": { "items": [ { "description": "The format string.", "type": "string" } ], "additionalItems": { "$ref": "DynamicValue" } }
  // So it takes a format string and N arguments.
  // We need to implement a replacement logic. Since we don't know the *names* of the extra args, 
  // we probably just support positional replacement like `{0}`, `{1}` OR the schema implies something else.
  
  // "The value string can contain interpolated expressions in the `${expression}` format."
  // This description seems to describe CLIENT-SIDE interpolation where the client has access to the data model.
  // But `formatString` is a function *called* by the client.
  
  // If the prompt is `${path/to/data}`, the *evaluator* resolves that before calling this function if it's passed as an arg.
  // But here `formatString` receives the *format string template* itself.
  
  // Let's strictly follow standard substitution:
  // If args are provided, we replace placeholders.
  // If the format string uses `${...}` syntax, it might be expecting us to allow injection.
  // Given we don't have access to the data model *inside* this function (only values),
  // we can only do positional replacement if extra args are passed.
  
  // However, for `${expression}` inside the string, that usually implies the string *is* the expression.
  // But safely, let's implement a simple substitution if args are present.
  
  if (args.length > 0) {
    return format.replace(/\{(\d+)\}/g, (match, index) => {
      const idx = parseInt(index, 10);
      return args[idx] !== undefined ? String(args[idx]) : match;
    });
  }
  
  // If no args, just return the string (expressions might have been pre-interpolated if the *string itself* was a dynamic value, 
  // but here it's a function argument).
  return format;
};

export const formatNumber: FunctionImplementation = (
  value: unknown,
  fractionDigits: number = 0,
  useGrouping: boolean = true
) => {
  const num = Number(value);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping,
  }).format(num);
};

export const formatCurrency: FunctionImplementation = (value: unknown, currency: string) => {
  const num = Number(value);
  if (isNaN(num)) return '';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(num);
  } catch {
    return `${currency} ${num}`;
  }
};

export const formatDate: FunctionImplementation = (value: unknown, pattern: string) => {
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return '';
  
  // Minimal implementation of pattern formatting
  // Full implementation would require a library like date-fns, but we should avoid adding deps if possible.
  // Supported tokens: yy, yyyy, M, MM, MMM, MMMM, d, dd, E, EEEE, h, hh, H, HH, mm, ss, a
  
  const d = date;
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const day = d.getDate();
  const dayOfWeek = d.getDay();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthsLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  return pattern
    .replace(/yyyy/g, year.toString())
    .replace(/yy/g, year.toString().slice(-2))
    .replace(/MMMM/g, monthsLong[month] || '')
    .replace(/MMM/g, monthsShort[month] || '')
    .replace(/MM/g, pad(month + 1))
    .replace(/M/g, (month + 1).toString())
    .replace(/dd/g, pad(day))
    .replace(/d/g, day.toString())
    .replace(/EEEE/g, daysLong[dayOfWeek] || '')
    .replace(/E/g, daysShort[dayOfWeek] || '')
    .replace(/HH/g, pad(hours))
    .replace(/H/g, hours.toString())
    .replace(/hh/g, pad(hours % 12 || 12))
    .replace(/h/g, (hours % 12 || 12).toString())
    .replace(/mm/g, pad(minutes))
    .replace(/ss/g, pad(seconds))
    .replace(/a/g, hours < 12 ? 'AM' : 'PM');
};

// =============================================================================
// Utility Functions
// =============================================================================

export const pluralize: FunctionImplementation = (
  count: unknown,
  forms: { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string }
) => {
  const n = Number(count);
  if (isNaN(n)) return forms.other;
  
  // Simple English pluralization rule for now
  // Real CLDR support is complex, but this covers 90% of cases
  if (n === 0 && forms.zero) return forms.zero;
  if (n === 1 && forms.one) return forms.one;
  return forms.other;
};

// =============================================================================
// Logical Functions
// =============================================================================

export const not: FunctionImplementation = (value: unknown) => !value;

export const and: FunctionImplementation = (...args: unknown[]) => {
  return args.every((arg) => !!arg);
};

export const or: FunctionImplementation = (...args: unknown[]) => {
  return args.some((arg) => !!arg);
};

export const isEmpty: FunctionImplementation = (value: unknown) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
};

// =============================================================================
// Comparison Functions
// =============================================================================

export const eq: FunctionImplementation = (a: unknown, b: unknown) => a === b;
export const neq: FunctionImplementation = (a: unknown, b: unknown) => a !== b;
export const gt: FunctionImplementation = (a: unknown, b: unknown) => Number(a) > Number(b);
export const gte: FunctionImplementation = (a: unknown, b: unknown) => Number(a) >= Number(b);
export const lt: FunctionImplementation = (a: unknown, b: unknown) => Number(a) < Number(b);
export const lte: FunctionImplementation = (a: unknown, b: unknown) => Number(a) <= Number(b);

export const openUrl: FunctionImplementation = (url: unknown) => {
  if (typeof url === 'string') {
    window.open(url, '_blank');
  }
};

export const standardCatalogFunctions: Record<string, FunctionImplementation> = {
  required,
  regex,
  length,
  numeric,
  email,
  formatString,
  formatNumber,
  formatCurrency,
  formatDate,
  pluralize,
  openUrl,
  not,
  and,
  or,
  isEmpty,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
};
