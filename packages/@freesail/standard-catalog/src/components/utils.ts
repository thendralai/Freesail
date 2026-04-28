/**
 * @fileoverview Theme & Validation Utilities
 *
 * Non-component helpers shared across Freesail catalogs.
 * Exported publicly via the `@freesail/standard-catalog/utils` subpath.
 */

import type { CSSProperties } from 'react';

export function getSemanticColor(color: string | undefined): string | undefined {
  if (!color) return undefined;

  const semanticMap: Record<string, string> = {
    textForeground: 'var(--freesail-text-foreground, #0f172a)',
    textSecondary: 'var(--freesail-text-secondary, #64748b)',
    primary: 'var(--freesail-primary, #2563eb)',
    primaryHover: 'var(--freesail-primary-hover, #1d4ed8)',
    primaryForeground: 'var(--freesail-primary-foreground, #ffffff)',
    error: 'var(--freesail-error, #ef4444)',
    success: 'var(--freesail-success, #22c55e)',
    warning: 'var(--freesail-warning, #f59e0b)',
    info: 'var(--freesail-info, #3b82f6)',
  };

  return semanticMap[color] || color;
}

export function getSemanticBackground(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const semanticMap: Record<string, string> = {
    bg: 'var(--freesail-bg, #f8fafc)',
    bgRaised: 'var(--freesail-bg-raised, #ffffff)',
    bgMuted: 'var(--freesail-bg-muted, #f1f5f9)',
    bgOverlay: 'var(--freesail-bg-overlay, rgba(0,0,0,0.5))',
    primary: 'var(--freesail-primary, #2563eb)',
    error: 'var(--freesail-error, #ef4444)',
    success: 'var(--freesail-success, #22c55e)',
    warning: 'var(--freesail-warning, #f59e0b)',
    info: 'var(--freesail-info, #3b82f6)',
  };

  return semanticMap[value] || value;
}

const THEME_TOKEN_TO_CSS_VAR: Record<string, string> = {
  bg:                  '--freesail-bg',
  bgRaised:            '--freesail-bg-raised',
  bgMuted:             '--freesail-bg-muted',
  textForeground:      '--freesail-text-foreground',
  textSecondary:       '--freesail-text-secondary',
  primary:             '--freesail-primary',
  primaryHover:        '--freesail-primary-hover',
  primaryForeground:   '--freesail-primary-foreground',
  border:              '--freesail-border',
};

export function applyComponentTheme(
  theme: Record<string, string> | undefined,
): CSSProperties {
  if (!theme || typeof theme !== 'object') return {};
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = THEME_TOKEN_TO_CSS_VAR[key];
    if (cssVar && typeof value === 'string') {
      vars[cssVar] = value;
    }
  }
  return vars as CSSProperties;
}

export function getContrastTextColor(
  rawBackground: string | undefined,
  fallback: string = '#ffffff',
): string {
  if (!rawBackground) return fallback;

  const semanticBgTokens = ['bg', 'bgRaised', 'bgMuted'];
  if (semanticBgTokens.includes(rawBackground)) {
    return 'var(--freesail-text-foreground, #0f172a)';
  }

  const bg = rawBackground.trim();
  if (bg.startsWith('#')) {
    let hex = bg.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? '#0f172a' : '#ffffff';
    }
  }

  return fallback;
}

export function mapJustify(justify: string | undefined): CSSProperties['justifyContent'] {
  switch (justify) {
    case 'start': return 'flex-start';
    case 'end': return 'flex-end';
    case 'center': return 'center';
    case 'spaceBetween': return 'space-between';
    case 'spaceAround': return 'space-around';
    default: return 'flex-start';
  }
}

/**
 * Converts any ISO 8601 string (including UTC "Z" timestamps returned by now())
 * into the exact format required by a given HTML input type.
 */
export function toInputFormat(value: string, inputType: string): string {
  if (!value) return value;
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;

  const pad = (n: number) => String(n).padStart(2, '0');
  const y  = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d  = pad(date.getDate());
  const h  = pad(date.getHours());
  const mi = pad(date.getMinutes());

  if (inputType === 'date')           return `${y}-${mo}-${d}`;
  if (inputType === 'time')           return `${h}:${mi}`;
  if (inputType === 'datetime-local') return `${y}-${mo}-${d}T${h}:${mi}`;
  return value;
}

export function validateChecks(checks: any[]): string | null {
  if (!Array.isArray(checks)) return null;
  for (const check of checks) {
    if (check.condition === false) {
      return (check.message as string) || 'Validation failed';
    }
  }
  return null;
}
