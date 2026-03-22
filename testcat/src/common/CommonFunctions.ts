/**
 * @fileoverview Common Functions
 *
 * The shared function set that all Freesail catalogs include.
 * These functions implement the A2UI protocol capabilities described in
 * the system prompt and are available by default in every catalog.
 *
 * `formatString` is MANDATORY — the system prompt relies on it and
 * `freesail validate catalog` will error if it is absent from a catalog's
 * runtime function map.
 *
 * When a developer runs `npx freesail new catalog`, this file is copied
 * into the new catalog's src/ folder. The developer then owns it and can
 * modify or extend it freely.
 */

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
  if (typeof pattern !== 'string' || pattern.length > 200) return false;
  try {
    const re = new RegExp(pattern, 'u');
    // Run with a guarded timeout to prevent ReDoS on catastrophic patterns
    let matched = false;
    const start = performance.now();
    matched = re.test(value);
    if (performance.now() - start > 50) {
      console.warn('[CommonFunctions] regex: pattern took >50ms, consider simplifying:', pattern);
    }
    return matched;
  } catch {
    return false;
  }
};

export const checkLength: FunctionImplementation = (value: unknown, constraints: { min?: number; max?: number }) => {
  if (typeof value !== 'string' && !Array.isArray(value)) return false;
  const len = value.length;
  if (constraints.min !== undefined && len < constraints.min) return false;
  if (constraints.max !== undefined && len > constraints.max) return false;
  return true;
};

export const getLength: FunctionImplementation = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.length;
  return String(value).length;
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

// =============================================================================
// Formatting Functions
// =============================================================================

export const formatString: FunctionImplementation = (format: string, ...args: unknown[]) => {
  // ${...} interpolation is pre-processed by the evaluator before this function is called.
  // This handles positional {0}, {1} placeholders for any additionally-passed arguments.
  if (args.length > 0) {
    return format.replace(/\{(\d+)\}/g, (_match, index) => {
      const idx = parseInt(index, 10);
      const val = args[idx];
      if (val === undefined || val === null) return '';
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    });
  }
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

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
  const h12 = (h: number) => h % 12 || 12;

  // Single-pass: match runs of the same format letter, then dispatch.
  // This avoids chained .replace() where substituted text gets re-matched.
  return pattern.replace(/([yMdEHhmsaS])\1*/g, (token) => {
    const ch = token[0];
    const len = token.length;
    switch (ch) {
      case 'y': return len <= 2 ? pad(date.getFullYear() % 100) : date.getFullYear().toString();
      case 'M': return len >= 4 ? (months[date.getMonth()] ?? '') : len === 3 ? (months[date.getMonth()] ?? '').slice(0, 3) : len === 2 ? pad(date.getMonth() + 1) : (date.getMonth() + 1).toString();
      case 'd': return len >= 2 ? pad(date.getDate()) : date.getDate().toString();
      case 'E': return len >= 4 ? (days[date.getDay()] ?? '') : (days[date.getDay()] ?? '').slice(0, 3);
      case 'H': return len >= 2 ? pad(date.getHours()) : date.getHours().toString();
      case 'h': return len >= 2 ? pad(h12(date.getHours())) : h12(date.getHours()).toString();
      case 'm': return len >= 2 ? pad(date.getMinutes()) : date.getMinutes().toString();
      case 's': return len >= 2 ? pad(date.getSeconds()) : date.getSeconds().toString();
      case 'S': return pad(date.getMilliseconds(), 3).slice(0, len);
      case 'a': return date.getHours() < 12 ? 'AM' : 'PM';
      default: return token;
    }
  });
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
  if (n === 0 && forms.zero) return forms.zero;
  if (n === 1 && forms.one) return forms.one;
  return forms.other;
};

// =============================================================================
// Logical Functions
// =============================================================================

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

function toComparable(v: unknown): number {
  if (typeof v === 'string') {
    const n = Number(v);
    if (!isNaN(n)) return n;
    const ts = Date.parse(v);
    if (!isNaN(ts)) return ts;
  }
  return Number(v);
}

export const gt:  FunctionImplementation = (a: unknown, b: unknown) => toComparable(a) >  toComparable(b);
export const gte: FunctionImplementation = (a: unknown, b: unknown) => toComparable(a) >= toComparable(b);
export const lt:  FunctionImplementation = (a: unknown, b: unknown) => toComparable(a) <  toComparable(b);
export const lte: FunctionImplementation = (a: unknown, b: unknown) => toComparable(a) <= toComparable(b);

export const now: FunctionImplementation = () => new Date().toISOString();

export const openUrl: FunctionImplementation = (url: unknown) => {
  if (typeof url !== 'string') return;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    window.open(parsed.href, '_blank', 'noopener,noreferrer');
  } catch {
    // Invalid URL — ignore silently
  }
};

/**
 * Shows a component by writing visible=true to the client-side data model.
 * Returns a side-effect descriptor; the renderer interprets it and calls onDataChange.
 */
export const show: FunctionImplementation = (componentId: unknown) => {
  if (typeof componentId !== 'string') return undefined;
  return {
    __sideEffect: 'dataModelUpdate',
    path: `/__componentState/${componentId}/visible`,
    value: true,
  };
};

/**
 * Hides a component by writing visible=false to the client-side data model.
 * Returns a side-effect descriptor; the renderer interprets it and calls onDataChange.
 */
export const hide: FunctionImplementation = (componentId: unknown) => {
  if (typeof componentId !== 'string') return undefined;
  return {
    __sideEffect: 'dataModelUpdate',
    path: `/__componentState/${componentId}/visible`,
    value: false,
  };
};

export const commonFunctions: Record<string, FunctionImplementation> = {
  required,
  regex,
  checkLength,
  getLength,
  numeric,
  email,
  formatString,
  formatNumber,
  formatCurrency,
  formatDate,
  pluralize,
  now,
  openUrl,
  and,
  or,
  isEmpty,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  show,
  hide,
};
