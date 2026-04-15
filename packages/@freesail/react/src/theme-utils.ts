import type { CSSProperties } from 'react';

export type FreesailThemeMode = 'light' | 'dark';

export interface FreesailThemeTokens {
  // Semantic Backgrounds
  bg: string;
  bgRaised: string;
  bgMuted: string;
  bgOverlay: string;
  // Text
  textMain: string;
  textMuted: string;
  // Brand
  primary: string;
  primaryHover: string;
  primaryText: string;
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
}

export const defaultLightTokens: FreesailThemeTokens = {
  bg: '#f8fafc',
  bgRaised: '#ffffff',
  bgMuted: '#f1f5f9',
  bgOverlay: 'rgba(0, 0, 0, 0.5)',
  textMain: '#0f172a',
  textMuted: '#64748b',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryText: '#ffffff',
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
  typeCaption: 'clamp(10px, 1cqi, 12px)',
  typeLabel: 'clamp(11px, 1.2cqi, 13px)',
  typeBody: 'clamp(13px, 1.5cqi, 15px)',
  typeH5: 'clamp(13px, 1.5cqi, 15px)',
  typeH4: 'clamp(15px, 2cqi, 18px)',
  typeH3: 'clamp(17px, 2.5cqi, 22px)',
  typeH2: 'clamp(20px, 3cqi, 28px)',
  typeH1: 'clamp(24px, 4cqi, 36px)',
  iconSm: 'clamp(14px, 1.5cqi, 16px)',
  iconMd: 'clamp(18px, 2cqi, 20px)',
  iconLg: 'clamp(20px, 2.5cqi, 24px)',
  iconXl: 'clamp(28px, 3.5cqi, 32px)',
};

export const defaultDarkTokens: FreesailThemeTokens = {
  bg: '#020617',
  bgRaised: '#0f172a',
  bgMuted: '#1e293b',
  bgOverlay: 'rgba(0, 0, 0, 0.7)',
  textMain: '#f8fafc',
  textMuted: '#94a3b8',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryText: '#ffffff',
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
  typeCaption: 'clamp(10px, 1cqi, 12px)',
  typeLabel: 'clamp(11px, 1.2cqi, 13px)',
  typeBody: 'clamp(13px, 1.5cqi, 15px)',
  typeH5: 'clamp(13px, 1.5cqi, 15px)',
  typeH4: 'clamp(15px, 2cqi, 18px)',
  typeH3: 'clamp(17px, 2.5cqi, 22px)',
  typeH2: 'clamp(20px, 3cqi, 28px)',
  typeH1: 'clamp(24px, 4cqi, 36px)',
  iconSm: 'clamp(14px, 1.5cqi, 16px)',
  iconMd: 'clamp(18px, 2cqi, 20px)',
  iconLg: 'clamp(20px, 2.5cqi, 24px)',
  iconXl: 'clamp(28px, 3.5cqi, 32px)',
};

/**
 * The subset of colour tokens an Agent can set on the root surface.
 * Note: Spacing, Typography, and Radii are restricted to the host app.
 */
export interface FreesailSurfaceTheme {
  primary?: string;
  primaryHover?: string;
  primaryText?: string;
  bg?: string;
  bgRaised?: string;
  bgMuted?: string;
  textMain?: string;
  textMuted?: string;
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
    '--freesail-text-main': tokens.textMain,
    '--freesail-text-muted': tokens.textMuted,
    '--freesail-primary': tokens.primary,
    '--freesail-primary-hover': tokens.primaryHover,
    '--freesail-primary-text': tokens.primaryText,
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
    colorScheme: mode,
  } as CSSProperties;
}

export function surfaceThemeToCssVars(theme: FreesailSurfaceTheme): CSSProperties {
  const vars: Record<string, string> = {};
  if (theme.primary)      vars['--freesail-primary']       = theme.primary;
  if (theme.primaryHover) vars['--freesail-primary-hover'] = theme.primaryHover;
  if (theme.primaryText)  vars['--freesail-primary-text']  = theme.primaryText;
  if (theme.bg)           vars['--freesail-bg']            = theme.bg;
  if (theme.bgRaised)     vars['--freesail-bg-raised']     = theme.bgRaised;
  if (theme.bgMuted)      vars['--freesail-bg-muted']      = theme.bgMuted;
  if (theme.textMain)     vars['--freesail-text-main']     = theme.textMain;
  if (theme.textMuted)    vars['--freesail-text-muted']    = theme.textMuted;
  if (theme.border)       vars['--freesail-border']        = theme.border;
  return vars as CSSProperties;
}
