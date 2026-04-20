import { createContext, useContext } from 'react';
import type { FreesailThemeMode, FreesailThemeTokens } from './theme-utils.js';
import { defaultLightTokens } from './theme-utils.js';

// Re-export theme utility types so they are part of the public API
export type { FreesailThemeTokens, FreesailThemeMode, FreesailThemeProp } from './theme-utils.js';
export { defaultLightTokens, defaultDarkTokens } from './theme-utils.js';

export interface FreesailTheme {
  mode: FreesailThemeMode;
  tokens: FreesailThemeTokens;
}

export const ThemeContext = createContext<FreesailTheme>({
  mode: 'light',
  tokens: defaultLightTokens,
});

export const useFreesailTheme = () => useContext(ThemeContext);
