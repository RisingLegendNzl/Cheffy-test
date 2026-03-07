// web/src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const BASE_STORAGE_KEY = 'cheffy-theme';
const ATTRIBUTE = 'data-theme';

const ThemeContext = createContext(undefined);

// Track the current userId so the storage key can be scoped per user.
let _currentUserId = null;

/**
 * Returns the localStorage key scoped to the current user.
 * Falls back to the base key when no user is known yet.
 */
const getStorageKey = (uid) => {
  if (uid) return `${BASE_STORAGE_KEY}:${uid}`;
  return BASE_STORAGE_KEY;
};

/**
 * Reads the persisted theme from localStorage.
 * Falls back to 'dark' (the app's current default).
 */
const getInitialTheme = (uid) => {
  try {
    // Try user-scoped key first
    if (uid) {
      const userStored = localStorage.getItem(getStorageKey(uid));
      if (userStored === 'light' || userStored === 'dark') return userStored;
    }
    // Fall back to the global (legacy) key for first-time migration
    const stored = localStorage.getItem(BASE_STORAGE_KEY);
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
applyThemeAttribute(getInitialTheme(null));

export const ThemeProvider = ({ children, userId }) => {
  const [theme, setThemeState] = useState(() => getInitialTheme(userId));

  // When the userId changes (login/logout/switch), re-read that user's theme
  useEffect(() => {
    _currentUserId = userId || null;
    const userTheme = getInitialTheme(userId);
    setThemeState(userTheme);
    applyThemeAttribute(userTheme);
  }, [userId]);

  // Sync attribute + localStorage whenever theme changes
  useEffect(() => {
    applyThemeAttribute(theme);
    try {
      // Always write to the user-scoped key
      localStorage.setItem(getStorageKey(_currentUserId), theme);
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
