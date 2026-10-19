import { useEffect } from 'react';

/**
 * Single source of truth for the digit→route navigation shortcuts. The hook
 * binds these keys and AppShell's sidebar kbd badges read this same map, so a
 * hint can never drift from its binding again.
 */
export const NAV_SHORTCUT_KEYS: Record<string, string> = {
  '0': '/dashboard',
  '1': '/today',
  '2': '/inbox',
  '3': '/focus',
  '4': '/calendar',
  '5': '/review',
  '6': '/memory',
};

interface ShortcutOptions {
  onQuickCapture?: () => void;
  onCommandPalette?: () => void;
  onToggleSidebar?: () => void;
  onEscape?: () => void;
  onNavigate?: (path: string) => void;
}

export function useKeyboardShortcuts({
  onQuickCapture,
  onCommandPalette,
  onToggleSidebar,
  onEscape,
  onNavigate,
}: ShortcutOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Command+K / Ctrl+K for Command Palette (works anywhere)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onCommandPalette?.();
        return;
      }

      // Sidebar toggle: Cmd+\ or Ctrl+\ or Cmd+B
      if ((event.metaKey || event.ctrlKey) && (event.key === '\\' || event.key.toLowerCase() === 'b')) {
        event.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Escape key (e.g. to close modals, mobile sheets)
      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }

      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Ignore single-key shortcuts when user is focused in an input field
      if (isInput) return;

      // Number navigation: supports both direct '0'..'6' and 'Cmd+0'..'6'
      if (event.key in NAV_SHORTCUT_KEYS && !event.altKey && onNavigate) {
        const dest = NAV_SHORTCUT_KEYS[event.key];
        if (dest) {
          event.preventDefault();
          onNavigate(dest);
          return;
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // 'N' for Quick Capture
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onQuickCapture?.();
        return;
      }

      // '[' for Sidebar Toggle
      if (event.key === '[') {
        event.preventDefault();
        onToggleSidebar?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onQuickCapture, onCommandPalette, onToggleSidebar, onEscape, onNavigate]);
}

