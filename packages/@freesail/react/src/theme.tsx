import React, { createContext, useContext, useEffect, useMemo } from 'react';

export type A2UIThemeMode = 'light' | 'dark';

export interface A2UIThemeTokens {
  bgRoot: string;
  bgSurface: string;
  bgMuted: string;
  textMain: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  border: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  shadowSm: string;
  shadowMd: string;
}

export interface A2UITheme {
  mode: A2UIThemeMode;
  tokens: A2UIThemeTokens;
}

export const defaultLightTheme: A2UIThemeTokens = {
  bgRoot: '#f8fafc',
  bgSurface: '#ffffff',
  bgMuted: '#f1f5f9',
  textMain: '#0f172a',
  textMuted: '#64748b',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primaryText: '#ffffff',
  border: '#cbd5e1',
  radiusSm: '0.25rem',
  radiusMd: '0.5rem',
  radiusLg: '0.75rem',
  shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
};

export const defaultDarkTheme: A2UIThemeTokens = {
  bgRoot: '#020617',
  bgSurface: '#0f172a',
  bgMuted: '#1e293b',
  textMain: '#f8fafc',
  textMuted: '#94a3b8',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  primaryText: '#ffffff',
  border: '#334155',
  radiusSm: '0.25rem',
  radiusMd: '0.5rem',
  radiusLg: '0.75rem',
  shadowSm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
};

const ThemeContext = createContext<A2UITheme>({
  mode: 'light',
  tokens: defaultLightTheme,
});

export const useA2UITheme = () => useContext(ThemeContext);

export interface ThemeProviderProps {
  theme?: A2UIThemeMode | Partial<A2UIThemeTokens>;
  children: React.ReactNode;
}

export function A2UIThemeProvider({ theme = 'light', children }: ThemeProviderProps) {
  const currentTheme = useMemo<A2UITheme>(() => {
    if (theme === 'dark') {
      return { mode: 'dark', tokens: defaultDarkTheme };
    }
    if (theme === 'light') {
      return { mode: 'light', tokens: defaultLightTheme };
    }
    // Custom partial theme
    return {
      mode: 'light', // Custom themes default to light baseline unless specified otherwise
      tokens: { ...defaultLightTheme, ...theme },
    };
  }, [theme]);

  // Inject CSS variables into the body or a wrapper
  const styleString = `
    :root {
      --freesail-bg-root: ${currentTheme.tokens.bgRoot};
      --freesail-bg-surface: ${currentTheme.tokens.bgSurface};
      --freesail-bg-muted: ${currentTheme.tokens.bgMuted};
      --freesail-text-main: ${currentTheme.tokens.textMain};
      --freesail-text-muted: ${currentTheme.tokens.textMuted};
      --freesail-primary: ${currentTheme.tokens.primary};
      --freesail-primary-hover: ${currentTheme.tokens.primaryHover};
      --freesail-primary-text: ${currentTheme.tokens.primaryText};
      --freesail-border: ${currentTheme.tokens.border};
      --freesail-radius-sm: ${currentTheme.tokens.radiusSm};
      --freesail-radius-md: ${currentTheme.tokens.radiusMd};
      --freesail-radius-lg: ${currentTheme.tokens.radiusLg};
      --freesail-shadow-sm: ${currentTheme.tokens.shadowSm};
      --freesail-shadow-md: ${currentTheme.tokens.shadowMd};
    }
  `.trim();

  return (
    <ThemeContext.Provider value={currentTheme}>
      <style>{styleString}</style>
      {children}
    </ThemeContext.Provider>
  );
}
