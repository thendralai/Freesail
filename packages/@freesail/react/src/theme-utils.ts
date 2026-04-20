import type { CSSProperties } from 'react';

export type FreesailThemeMode = 'light' | 'dark';

export interface FreesailThemeTokens {
  // Semantic Backgrounds
  bg: string;
  bgRaised: string;
  bgMuted: string;
  bgOverlay: string;
  // Text
  textForeground: string;
  textSecondary: string;
  // Brand
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  // Semantic Status
  error: string;
  success: string;
  warning: string;
  info: string;
  // Structure
  border: string;
  // Radii
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  // Shadows
  shadowSm: string;
  shadowMd: string;
  // Fluid Spacing (Container-relative via cqi)
  spaceXs: string;
  spaceSm: string;
  spaceMd: string;
  spaceLg: string;
  spaceXl: string;
  // Fluid Typography
  typeCaption: string;
  typeLabel: string;
  typeBody: string;
  typeH5: string;
  typeH4: string;
  typeH3: string;
  typeH2: string;
  typeH1: string;
  // Fluid Icons
  iconSm: string;
  iconMd: string;
  iconLg: string;
  iconXl: string;
  icon2xl: string;
  icon3xl: string;
  icon4xl: string;
}

export const defaultLightTokens: FreesailThemeTokens = {
  bg: '#f8fafc',
  bgRaised: '#ffffff',
  bgMuted: '#f1f5f9',
  bgOverlay: 'rgba(0, 0, 0, 0.5)',
  textForeground: '#0f172a',
  textSecondary: '#64748b',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryForeground: '#ffffff',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
  border: '#cbd5e1',
  radiusSm: '0.25rem',
  radiusMd: '0.5rem',
  radiusLg: '0.75rem',
  shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  spaceXs: 'clamp(2px, 0.5cqi, 4px)',
  spaceSm: 'clamp(4px, 1cqi, 8px)',
  spaceMd: 'clamp(8px, 2cqi, 16px)',
  spaceLg: 'clamp(16px, 3cqi, 24px)',
  spaceXl: 'clamp(24px, 4cqi, 40px)',
  typeCaption: 'clamp(12px, 1cqi, 13px)',
  typeLabel: 'clamp(13px, 1.2cqi, 14px)',
  typeBody: 'clamp(16px, 1.5cqi, 17px)',
  typeH5: 'clamp(16px, 1.5cqi, 17px)',
  typeH4: 'clamp(18px, 2cqi, 20px)',
  typeH3: 'clamp(20px, 2.5cqi, 24px)',
  typeH2: 'clamp(24px, 3cqi, 30px)',
  typeH1: 'clamp(28px, 4cqi, 38px)',
  iconSm: 'clamp(14px, 1.5cqi, 16px)',
  iconMd: 'clamp(18px, 2cqi, 20px)',
  iconLg: 'clamp(20px, 2.5cqi, 24px)',
  iconXl: 'clamp(28px, 3.5cqi, 32px)',
  icon2xl: 'clamp(36px, 5cqi, 48px)',
  icon3xl: 'clamp(52px, 7cqi, 64px)',
  icon4xl: 'clamp(72px, 10cqi, 96px)',
};

export const defaultDarkTokens: FreesailThemeTokens = {
  bg: '#121212',
  bgRaised: '#0f172a',
  bgMuted: '#1e293b',
  bgOverlay: 'rgba(0, 0, 0, 0.7)',
  textForeground: '#f8fafc',
  textSecondary: '#94a3b8',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryForeground: '#ffffff',
  error: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
  info: '#60a5fa',
  border: '#334155',
  radiusSm: '0.25rem',
  radiusMd: '0.5rem',
  radiusLg: '0.75rem',
  shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  spaceXs: 'clamp(2px, 0.5cqi, 4px)',
  spaceSm: 'clamp(4px, 1cqi, 8px)',
  spaceMd: 'clamp(8px, 2cqi, 16px)',
  spaceLg: 'clamp(16px, 3cqi, 24px)',
  spaceXl: 'clamp(24px, 4cqi, 40px)',
  typeCaption: 'clamp(12px, 1cqi, 13px)',
  typeLabel: 'clamp(13px, 1.2cqi, 14px)',
  typeBody: 'clamp(16px, 1.5cqi, 17px)',
  typeH5: 'clamp(16px, 1.5cqi, 17px)',
  typeH4: 'clamp(18px, 2cqi, 20px)',
  typeH3: 'clamp(20px, 2.5cqi, 24px)',
  typeH2: 'clamp(24px, 3cqi, 30px)',
  typeH1: 'clamp(28px, 4cqi, 38px)',
  iconSm: 'clamp(14px, 1.5cqi, 16px)',
  iconMd: 'clamp(18px, 2cqi, 20px)',
  iconLg: 'clamp(20px, 2.5cqi, 24px)',
  iconXl: 'clamp(28px, 3.5cqi, 32px)',
  icon2xl: 'clamp(36px, 5cqi, 48px)',
  icon3xl: 'clamp(52px, 7cqi, 64px)',
  icon4xl: 'clamp(72px, 10cqi, 96px)',
};

/**
 * The subset of colour tokens an Agent can set on the root surface.
 * Note: Spacing, Typography, and Radii are restricted to the host app.
 */
export interface FreesailSurfaceTheme {
  primary?: string;
  primaryHover?: string;
  primaryForeground?: string;
  bg?: string;
  bgRaised?: string;
  bgMuted?: string;
  textForeground?: string;
  textSecondary?: string;
  border?: string;
}

export type FreesailThemeProp = FreesailThemeMode | Partial<FreesailThemeTokens> | undefined;

export function resolveTokens(theme: FreesailThemeProp): FreesailThemeTokens | null {
  if (!theme) return null;
  if (theme === 'light') return defaultLightTokens;
  if (theme === 'dark') return defaultDarkTokens;
  return { ...defaultLightTokens, ...theme };
}

export function tokensToCssVars(tokens: FreesailThemeTokens, mode: FreesailThemeMode = 'light'): CSSProperties {
  return {
    '--freesail-bg': tokens.bg,
    '--freesail-bg-raised': tokens.bgRaised,
    '--freesail-bg-muted': tokens.bgMuted,
    '--freesail-bg-overlay': tokens.bgOverlay,
    '--freesail-text-foreground': tokens.textForeground,
    '--freesail-text-secondary': tokens.textSecondary,
    '--freesail-primary': tokens.primary,
    '--freesail-primary-hover': tokens.primaryHover,
    '--freesail-primary-foreground': tokens.primaryForeground,
    '--freesail-error': tokens.error,
    '--freesail-success': tokens.success,
    '--freesail-warning': tokens.warning,
    '--freesail-info': tokens.info,
    '--freesail-border': tokens.border,
    '--freesail-radius-sm': tokens.radiusSm,
    '--freesail-radius-md': tokens.radiusMd,
    '--freesail-radius-lg': tokens.radiusLg,
    '--freesail-shadow-sm': tokens.shadowSm,
    '--freesail-shadow-md': tokens.shadowMd,
    '--freesail-space-xs': tokens.spaceXs,
    '--freesail-space-sm': tokens.spaceSm,
    '--freesail-space-md': tokens.spaceMd,
    '--freesail-space-lg': tokens.spaceLg,
    '--freesail-space-xl': tokens.spaceXl,
    '--freesail-type-caption': tokens.typeCaption,
    '--freesail-type-label': tokens.typeLabel,
    '--freesail-type-body': tokens.typeBody,
    '--freesail-type-h5': tokens.typeH5,
    '--freesail-type-h4': tokens.typeH4,
    '--freesail-type-h3': tokens.typeH3,
    '--freesail-type-h2': tokens.typeH2,
    '--freesail-type-h1': tokens.typeH1,
    '--freesail-icon-sm': tokens.iconSm,
    '--freesail-icon-md': tokens.iconMd,
    '--freesail-icon-lg': tokens.iconLg,
    '--freesail-icon-xl': tokens.iconXl,
    '--freesail-icon-2xl': tokens.icon2xl,
    '--freesail-icon-3xl': tokens.icon3xl,
    '--freesail-icon-4xl': tokens.icon4xl,
    colorScheme: mode,
  } as CSSProperties;
}

export function surfaceThemeToCssVars(theme: FreesailSurfaceTheme): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme.primary)      vars['--freesail-primary']       = theme.primary;
  if (theme.primaryHover) vars['--freesail-primary-hover'] = theme.primaryHover;
  if (theme.primaryForeground)  vars['--freesail-primary-foreground']  = theme.primaryForeground;
  if (theme.bg)           vars['--freesail-bg']            = theme.bg;
  if (theme.bgRaised)     vars['--freesail-bg-raised']     = theme.bgRaised;
  if (theme.bgMuted)      vars['--freesail-bg-muted']      = theme.bgMuted;
  if (theme.textForeground)     vars['--freesail-text-foreground']     = theme.textForeground;
  if (theme.textSecondary)    vars['--freesail-text-secondary']    = theme.textSecondary;
  if (theme.border)       vars['--freesail-border']        = theme.border;
  return vars as CSSProperties;
}
