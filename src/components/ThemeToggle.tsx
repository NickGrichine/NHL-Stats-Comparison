import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'nhl-comparison-theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Private browsing and blocked site data both throw here; fall through.
  }
  return 'light';
}

/**
 * Read-only mirror of the current theme for components that need to react to
 * it (e.g. recolouring a chart series so it stays visible against a dark
 * background) but don't own the toggle itself. Derives from the DOM attribute
 * ThemeToggle writes, rather than duplicating its state, so there is one
 * source of truth regardless of which component's effect runs first.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Remembering the choice is a convenience, never a requirement.
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
