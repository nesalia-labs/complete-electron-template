/**
 * Theme initialization — synchronously applies the persisted theme to
 * `<html>` before React mounts, so there is no flash of wrong theme.
 *
 * Flow:
 * 1. The inline script in `index.html` reads `localStorage['theme']` and
 *    applies the `dark` class to `<html>` synchronously. This is the
 *    zero-flash path.
 * 2. Once React mounts, the `_app` layout reads the theme from the settings
 *    store and re-applies it (handles the case where localStorage was
 *    empty on first boot, i.e. defaults to 'system').
 * 3. A `matchMedia` listener updates the class when the OS theme changes
 *    and the user's preference is 'system'.
 *
 * The localStorage key holds the RAW preference (`'light' | 'dark' | 'system'`).
 * Resolution to a concrete light/dark happens at read time.
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null
  const value = localStorage.getItem(STORAGE_KEY)
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return null
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, theme)
}

/**
 * Resolve a theme preference to a concrete light/dark value.
 * - 'light' / 'dark' → as-is
 * - 'system' / null / undefined → follow the OS preference
 */
export function resolveTheme(theme: Theme | null | undefined): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply the resolved theme to the document by toggling the `dark` class.
 * Safe to call before React mounts (no React refs involved).
 */
export function applyTheme(theme: Theme | null | undefined): void {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(theme)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

/**
 * Initialise the theme from localStorage and apply it to the document.
 * Called by the inline script in `index.html` (BEFORE React mounts) and
 * by the `_app` layout effect (AFTER React mounts, in case localStorage
 * was empty at boot time).
 */
export function initThemeFromStorage(): void {
  applyTheme(getStoredTheme())
}
