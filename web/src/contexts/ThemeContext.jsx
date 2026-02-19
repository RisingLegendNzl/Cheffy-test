// web/src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'cheffy-theme';
const ATTRIBUTE = 'data-theme';

const ThemeContext = createContext(undefined);

/**
 * Reads the persisted theme from localStorage.
 * Falls back to 'dark' (the app's current default).
 */
const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (SSR, private mode edge-cases)
  }
  return 'dark';
};

/**
 * Applies the data-theme attribute to <html> so every CSS rule
 * scoped under [data-theme="dark"] or [data-theme="light"] activates.
 */
const applyThemeAttribute = (theme) => {
  document.documentElement.setAttribute(ATTRIBUTE, theme);
};

// Set the attribute immediately (before first paint) to avoid flash
applyThemeAttribute(getInitialTheme());

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Sync attribute + localStorage whenever theme changes
  useEffect(() => {
    applyThemeAttribute(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Silently ignore storage errors
    }
  }, [theme]);

  const setTheme = useCallback((newTheme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setThemeState(newTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const isDark = theme === 'dark';

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, isDark }),
    [theme, setTheme, toggleTheme, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to consume theme state from any component.
 * Returns { theme, setTheme, toggleTheme, isDark }.
 */
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
};

export default ThemeContext;