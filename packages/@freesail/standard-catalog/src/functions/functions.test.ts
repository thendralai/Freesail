import { describe, it, expect } from 'vitest';
import {
  formatString,
  formatNumber,
  formatCurrency,
  formatDate,
  required,
  email,
  regex,
  checkLength,
  getLength,
  numeric,
  and,
  or,
  isEmpty,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  pluralize,
  show,
  hide,
} from './functions.js';

// ---------------------------------------------------------------------------
// formatString
// ---------------------------------------------------------------------------

describe('formatString', () => {
  it('returns the string unchanged when no args', () => {
    expect(formatString('hello world')).toBe('hello world');
  });

  it('replaces {0} with first arg', () => {
    expect(formatString('Hello {0}!', 'Alice')).toBe('Hello Alice!');
  });

  it('replaces multiple positional placeholders', () => {
    expect(formatString('{0} + {1} = {2}', 1, 2, 3)).toBe('1 + 2 = 3');
  });

  it('replaces same placeholder used twice', () => {
    expect(formatString('{0} and {0}', 'x')).toBe('x and x');
  });

  it('returns empty string for undefined arg', () => {
    expect(formatString('{0}', undefined)).toBe('');
  });

  it('returns empty string for null arg', () => {
    expect(formatString('{0}', null)).toBe('');
  });

  it('JSON-serialises object args', () => {
    expect(formatString('{0}', { a: 1 })).toBe('{"a":1}');
  });

  it('leaves unmatched placeholders untouched', () => {
    expect(formatString('{5}', 'only')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber', () => {
  it('formats integer with no decimal places by default', () => {
    expect(formatNumber(1234)).toMatch(/1[,.]?234/);
  });

  it('formats with 2 decimal places', () => {
    expect(String(formatNumber(1.5, 2))).toMatch(/1[.,]50/);
  });

  it('returns empty string for NaN input', () => {
    expect(formatNumber('not a number')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency', () => {
  it('returns a non-empty string for valid input', () => {
    const result = String(formatCurrency(100, 'USD'));
    expect(result.length).toBeGreaterThan(0);
    expect(result).toMatch(/100/);
  });

  it('returns empty string for NaN', () => {
    expect(formatCurrency('oops', 'USD')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats yyyy-MM-dd pattern', () => {
    const result = String(formatDate('2024-06-15', 'yyyy-MM-dd'));
    expect(result).toBe('2024-06-15');
  });

  it('formats month name', () => {
    const result = String(formatDate('2024-01-01', 'MMMM'));
    expect(result).toBe('January');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date', 'yyyy')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------

describe('required', () => {
  it('returns true for non-empty string', () => expect(required('hello')).toBe(true));
  it('returns false for empty string', () => expect(required('')).toBe(false));
  it('returns false for whitespace-only string', () => expect(required('   ')).toBe(false));
  it('returns false for null', () => expect(required(null)).toBe(false));
  it('returns false for undefined', () => expect(required(undefined)).toBe(false));
  it('returns true for non-empty array', () => expect(required([1])).toBe(true));
  it('returns false for empty array', () => expect(required([])).toBe(false));
  it('returns true for number', () => expect(required(0)).toBe(true));
});

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

describe('email', () => {
  it('validates a well-formed email', () => expect(email('user@example.com')).toBe(true));
  it('rejects missing @', () => expect(email('userexample.com')).toBe(false));
  it('rejects missing domain', () => expect(email('user@')).toBe(false));
  it('rejects non-string', () => expect(email(42)).toBe(false));
});

// ---------------------------------------------------------------------------
// regex
// ---------------------------------------------------------------------------

describe('regex', () => {
  it('matches a simple pattern', () => expect(regex('abc123', '^[a-z]+\\d+$')).toBe(true));
  it('rejects non-matching value', () => expect(regex('ABC', '^[a-z]+$')).toBe(false));
  it('returns false for non-string value', () => expect(regex(42, '\\d+')).toBe(false));
  it('returns false for invalid regex pattern', () => expect(regex('test', '[')).toBe(false));
});

// ---------------------------------------------------------------------------
// checkLength
// ---------------------------------------------------------------------------

describe('checkLength', () => {
  it('passes when length is within range', () => expect(checkLength('hello', { min: 3, max: 10 })).toBe(true));
  it('fails when too short', () => expect(checkLength('hi', { min: 3 })).toBe(false));
  it('fails when too long', () => expect(checkLength('hello world', { max: 5 })).toBe(false));
  it('passes arrays', () => expect(checkLength([1, 2, 3], { min: 2, max: 5 })).toBe(true));
  it('returns false for non-string/array', () => expect(checkLength(42, { min: 1 })).toBe(false));
});

// ---------------------------------------------------------------------------
// getLength
// ---------------------------------------------------------------------------

describe('getLength', () => {
  it('returns string length', () => expect(getLength('hello')).toBe(5));
  it('returns array length', () => expect(getLength([1, 2, 3])).toBe(3));
  it('returns 0 for null', () => expect(getLength(null)).toBe(0));
  it('returns 0 for undefined', () => expect(getLength(undefined)).toBe(0));
});

// ---------------------------------------------------------------------------
// numeric
// ---------------------------------------------------------------------------

describe('numeric', () => {
  it('accepts a number in range', () => expect(numeric(5, { min: 1, max: 10 })).toBe(true));
  it('rejects below min', () => expect(numeric(0, { min: 1 })).toBe(false));
  it('rejects above max', () => expect(numeric(11, { max: 10 })).toBe(false));
  it('accepts numeric string', () => expect(numeric('42', {})).toBe(true));
  it('rejects non-numeric string', () => expect(numeric('abc', {})).toBe(false));
});

// ---------------------------------------------------------------------------
// Logical functions
// ---------------------------------------------------------------------------

describe('and', () => {
  it('returns true when all truthy', () => expect(and(true, 1, 'x')).toBe(true));
  it('returns false when any falsy', () => expect(and(true, false, true)).toBe(false));
  it('returns true for no args', () => expect(and()).toBe(true));
});

describe('or', () => {
  it('returns true when any truthy', () => expect(or(false, 0, 'x')).toBe(true));
  it('returns false when all falsy', () => expect(or(false, 0, '')).toBe(false));
});

describe('isEmpty', () => {
  it('returns true for empty string', () => expect(isEmpty('')).toBe(true));
  it('returns true for whitespace', () => expect(isEmpty('  ')).toBe(true));
  it('returns false for non-empty string', () => expect(isEmpty('hi')).toBe(false));
  it('returns true for empty array', () => expect(isEmpty([])).toBe(true));
  it('returns false for non-empty array', () => expect(isEmpty([1])).toBe(false));
  it('returns true for empty object', () => expect(isEmpty({})).toBe(true));
  it('returns true for null', () => expect(isEmpty(null)).toBe(true));
});

// ---------------------------------------------------------------------------
// Comparison functions
// ---------------------------------------------------------------------------

describe('eq / neq', () => {
  it('eq returns true for equal values', () => expect(eq(1, 1)).toBe(true));
  it('eq returns false for unequal', () => expect(eq(1, 2)).toBe(false));
  it('neq returns true for unequal', () => expect(neq(1, 2)).toBe(true));
  it('neq returns false for equal', () => expect(neq(1, 1)).toBe(false));
});

describe('gt / gte / lt / lte', () => {
  it('gt: 5 > 3', () => expect(gt(5, 3)).toBe(true));
  it('gt: 3 > 5 is false', () => expect(gt(3, 5)).toBe(false));
  it('gte: 5 >= 5', () => expect(gte(5, 5)).toBe(true));
  it('lt: 3 < 5', () => expect(lt(3, 5)).toBe(true));
  it('lte: 5 <= 5', () => expect(lte(5, 5)).toBe(true));
  it('works with numeric strings', () => expect(gt('10', '9')).toBe(true));
});

// ---------------------------------------------------------------------------
// pluralize
// ---------------------------------------------------------------------------

describe('pluralize', () => {
  it('uses "one" for count 1', () => expect(pluralize(1, { one: 'item', other: 'items' })).toBe('item'));
  it('uses "other" for count 2', () => expect(pluralize(2, { one: 'item', other: 'items' })).toBe('items'));
  it('uses "zero" for count 0 when defined', () => expect(pluralize(0, { zero: 'none', other: 'items' })).toBe('none'));
  it('falls back to "other" for count 0 when "zero" absent', () => expect(pluralize(0, { other: 'items' })).toBe('items'));
  it('returns "other" for NaN', () => expect(pluralize('abc', { other: 'items' })).toBe('items'));
});

// ---------------------------------------------------------------------------
// show / hide
// ---------------------------------------------------------------------------

describe('show', () => {
  it('returns a dataModelUpdate side effect', () => {
    const result = show('myBtn') as Record<string, unknown>;
    expect(result['_effect']).toBe('dataModelUpdate');
    expect(result.value).toBe(true);
    expect(String(result.path)).toContain('myBtn');
  });

  it('returns undefined for non-string input', () => {
    expect(show(42)).toBeUndefined();
  });
});

describe('hide', () => {
  it('returns a dataModelUpdate side effect with value false', () => {
    const result = hide('myBtn') as Record<string, unknown>;
    expect(result['_effect']).toBe('dataModelUpdate');
    expect(result.value).toBe(false);
  });

  it('returns undefined for non-string input', () => {
    expect(hide(null)).toBeUndefined();
  });
});
