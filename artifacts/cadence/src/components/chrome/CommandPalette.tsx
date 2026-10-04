import { useEffect, useRef, useState } from 'react';
import { Command } from 'cmdk';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Focus,
  Inbox,
  LayoutGrid,
  Plus,
  Settings,
  Target,
  Volume2,
  VolumeX,
  Brain,
  Sun,
  Moon,
  Compass,
  User,
  PanelLeft,
  Folder,
  Sparkles,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { useModalFocus } from '@/components/shared/useModalFocus';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNewTask: () => void;
  onNavigate: (path: string) => void;
  onOpenMorningRitual?: () => void;
  onOpenEveningRitual?: () => void;
  onToggleSidebar?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectNewTask,
  onNavigate,
  onOpenMorningRitual,
  onOpenEveningRitual,
  onToggleSidebar,
}: CommandPaletteProps) {
  const [soundEnabled, setSoundEnabled] = useState(soundFX.isEnabled());

  /* This overlay is hand-rolled, so it did not hold focus, did not close on
     Escape, and did not give focus back: Ctrl+K opened it and a keyboard user was
     then stranded in a `role="dialog" aria-modal="true"` element with no keyboard
     way out (SC 2.1.1 / 2.4.3). `useModalFocus` supplies all three. The palette's
     own `<Command autoFocus>` still wins the initial focus, because the hook
     leaves an already-focused descendant alone. */
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, open, { onEscape: () => onOpenChange(false) });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-3 sm:px-4 bg-background/85 backdrop-blur-md overflow-y-auto animate-enter"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-xl rounded-2xl border border-border-control/10 bg-card shadow-2xl overflow-hidden glass-chrome text-foreground focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette" className="flex flex-col">
          <div className="flex items-center border-b border-border/80 px-4">
            <Command.Input
              placeholder="Type a command or jump to page..."
              autoFocus
              className="w-full bg-transparent py-3.5 text-sm font-medium placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            />
            <kbd className="ml-auto rounded-md bg-card/10 px-2 py-0.5 text-xs font-mono text-muted-foreground">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 scrollbar-none space-y-1">
            <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Quick Actions" className="px-2 py-1 text-xs uppercase font-mono text-muted-foreground">
              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onSelectNewTask();
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20 hover:text-primary-text data-[selected=true]:bg-primary/20 data-[selected=true]:text-primary-text"
              >
                <Plus size={16} />
                <span>Quick Capture New Task</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">N</kbd>
              </Command.Item>

              {onOpenMorningRitual && (
                <Command.Item
                  onSelect={() => {
                    soundFX.playClick();
                    onOpenChange(false);
                    onOpenMorningRitual();
                  }}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20 hover:text-primary-text data-[selected=true]:bg-primary/20 data-[selected=true]:text-primary-text"
                >
                  <Sun size={16} className="text-primary-text" />
                  <span>Plan My Day (Morning Ritual)</span>
                </Command.Item>
              )}

              {onOpenEveningRitual && (
                <Command.Item
                  onSelect={() => {
                    soundFX.playClick();
                    onOpenChange(false);
                    onOpenEveningRitual();
                  }}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-ai/20 hover:text-ai-text data-[selected=true]:bg-ai/20"
                >
                  <Moon size={16} className="text-ai-text" />
                  <span>Close My Day (Evening Ritual)</span>
                </Command.Item>
              )}

              {onToggleSidebar && (
                <Command.Item
                  onSelect={() => {
                    soundFX.playClick();
                    onOpenChange(false);
                    onToggleSidebar();
                  }}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
                >
                  <PanelLeft size={16} />
                  <span>Toggle Sidebar</span>
                  <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘\</kbd>
                </Command.Item>
              )}

              <Command.Item
                onSelect={() => {
                  const next = !soundEnabled;
                  soundFX.setEnabled(next);
                  setSoundEnabled(next);
                  if (next) soundFX.playCompletion();
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                <span>{soundEnabled ? 'Mute Interface Sounds' : 'Enable Interface Sounds'}</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigation" className="px-2 py-1 text-xs uppercase font-mono text-muted-foreground">
              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/today');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Target size={16} />
                <span>Go to Today</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘1</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/inbox');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Inbox size={16} />
                <span>Go to Inbox</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘2</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/focus');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Focus size={16} />
                <span>Go to Focus Timer</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘3</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/calendar');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <CalendarDays size={16} />
                <span>Go to Calendar</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘4</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/review');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <CheckCircle2 size={16} />
                <span>Go to Review & Ledger</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘5</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/projects');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Folder size={16} />
                <span>Go to Projects</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/agent');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-ai/20 hover:text-ai-text data-[selected=true]:bg-ai/20"
              >
                <Sparkles size={16} className="text-ai-text" />
                <span>Go to Assistant (Agent)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/memory');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-ai/20 hover:text-ai-text data-[selected=true]:bg-ai/20"
              >
                <Brain size={16} className="text-ai-text" />
                <span>Go to Memory & Insights</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘6</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/onboarding');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Compass size={16} />
                <span>Re-run Onboarding Setup</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/settings');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-card/10 data-[selected=true]:bg-card/10"
              >
                <Settings size={16} />
                <span>Settings & Preferences</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘,</kbd>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  soundFX.playClick();
                  onOpenChange(false);
                  onNavigate('/profile');
                }}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-xs font-semibold text-foreground transition-colors hover:bg-primary/20 hover:text-primary-text data-[selected=true]:bg-primary/20"
              >
                <User size={16} />
                <span>Profile & Account</span>
                <kbd className="ml-auto font-mono text-xs text-muted-foreground">⌘P</kbd>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
