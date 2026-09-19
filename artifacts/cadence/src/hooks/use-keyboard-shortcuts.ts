import { useEffect } from 'react';

interface ShortcutOptions {
  onQuickCapture?: () => void;
  onCommandPalette?: () => void;
  onNavigate?: (path: string) => void;
}

export function useKeyboardShortcuts({
  onQuickCapture,
  onCommandPalette,
  onNavigate,
}: ShortcutOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      // Command+K / Ctrl+K for Command Palette (works anywhere)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onCommandPalette?.();
        return;
      }

      // Ignore single-key shortcuts when user is focused in an input field
      if (isInput) return;

      // 'N' for Quick Capture
      if (event.key.toLowerCase() === 'n' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        onQuickCapture?.();
        return;
      }

      // Navigation shortcuts: G then T, or Cmd+1..5
      if ((event.metaKey || event.ctrlKey) && onNavigate) {
        if (event.key === '1') {
          event.preventDefault();
          onNavigate('/today');
        } else if (event.key === '2') {
          event.preventDefault();
          onNavigate('/inbox');
        } else if (event.key === '3') {
          event.preventDefault();
          onNavigate('/focus');
        } else if (event.key === '4') {
          event.preventDefault();
          onNavigate('/calendar');
        } else if (event.key === '5') {
          event.preventDefault();
          onNavigate('/review');
        } else if (event.key === '6' || event.key === ',') {
          event.preventDefault();
          onNavigate('/settings');
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onQuickCapture, onCommandPalette, onNavigate]);
}
