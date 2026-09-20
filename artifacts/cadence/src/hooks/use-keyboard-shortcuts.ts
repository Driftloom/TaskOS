import { useEffect } from 'react';

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

      // Number navigation: supports both direct '1'..'6' and 'Cmd+1'..'6'
      if (['1', '2', '3', '4', '5', '6'].includes(event.key) && !event.altKey && onNavigate) {
        const routes: Record<string, string> = {
          '1': '/today',
          '2': '/inbox',
          '3': '/focus',
          '4': '/calendar',
          '5': '/review',
          '6': '/memory',
        };
        const dest = routes[event.key];
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

