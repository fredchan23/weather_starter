import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeName =
  | 'apple'
  | 'arctic'
  | 'golden'
  | 'terminal'
  | 'paper'
  | 'neon'
  | 'calm'
  | 'midnight'
  | 'monsoon'
  | 'botanical';

export interface ThemeOption {
  name: ThemeName;
  label: string;
  swatch: string; // CSS colour string shown in the selector
}

export const THEMES: ThemeOption[] = [
  { name: 'apple', label: 'Apple', swatch: '#5a7591' },
  { name: 'arctic', label: 'Arctic Glass', swatch: '#b3d9f7' },
  { name: 'golden', label: 'Golden Hour', swatch: '#f7c59f' },
  { name: 'terminal', label: 'Terminal', swatch: '#003b00' },
  { name: 'paper', label: 'Paper Atlas', swatch: '#8b6914' },
  { name: 'neon', label: 'Neon Tropics', swatch: '#ff00aa' },
  { name: 'calm', label: 'Calm Overcast', swatch: '#3aafa9' },
  { name: 'midnight', label: 'Midnight', swatch: '#1B2838' },
  { name: 'monsoon', label: 'Monsoon Season', swatch: '#a8b2c1' },
  { name: 'botanical', label: 'Botanical Garden', swatch: '#52b788' },
];

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'weather-theme';

function readSaved(): ThemeName {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && THEMES.some((t) => t.name === v)) return v as ThemeName;
  } catch {
    // ignore
  }
  return 'apple';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readSaved);

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
