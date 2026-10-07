import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { APP_VERSION_INFO } from '@/lib/version-info';
import { soundFX } from '@/lib/sound-fx';

interface UpdatePromptDialogProps {
  isOpen: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdatePromptDialog({ isOpen, onUpdate, onDismiss }: UpdatePromptDialogProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={() => {
          soundFX.playClick();
          onDismiss();
        }}
        aria-hidden="true"
      />

      {/* Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Application Update Available"
        className="relative z-10 w-full max-w-md rounded-lg border border-border-control bg-card p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-base"
      >
        {/* Close Button (X) */}
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            onDismiss();
          }}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
          aria-label="Close update prompt"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary-text border border-primary/25 shadow-sm">
            <ArrowUpCircle size={22} className="text-primary-text" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-callout font-bold text-foreground">Update Available</h2>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-caption font-semibold text-primary-text">
                v{APP_VERSION_INFO.version}
              </span>
            </div>
            <p className="text-caption text-muted-foreground">
              A newer version of Cadence is ready to install.
            </p>
          </div>
        </div>

        {/* Highlights List */}
        <div className="mt-5 space-y-2.5 rounded-xl border border-border-control bg-card/[0.04] p-3.5">
          <div className="flex items-center gap-1.5 text-caption font-semibold text-foreground uppercase tracking-wider">
            <Sparkles size={13} className="text-primary-text" />
            <span>What's New in this Version</span>
          </div>

          <ul className="space-y-2 text-caption text-muted-foreground mt-2">
            {APP_VERSION_INFO.highlights.map((highlight, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                <div>
                  <span className="font-semibold text-foreground">{highlight.title}: </span>
                  <span>{highlight.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onDismiss();
            }}
            className="order-2 sm:order-1 inline-flex min-h-component-dimension-overlay-action-min-h items-center justify-center rounded-xl border border-border-control bg-transparent px-4 text-caption font-semibold text-muted-foreground hover:bg-card/[0.06] hover:text-foreground transition-colors tap-target-expand"
          >
            Remind Me Later
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onUpdate();
            }}
            className="order-1 sm:order-2 inline-flex min-h-component-dimension-overlay-action-min-h items-center justify-center gap-2 rounded-xl bg-primary px-5 text-caption font-bold text-primary-foreground shadow-lg hover:brightness-110 active:scale-98 transition-all tap-target-expand"
          >
            <span>Update Now</span>
          </button>
        </div>

        {/* Guidance Text */}
        <p className="mt-3.5 text-center text-caption text-muted-foreground/80 leading-normal">
          You can check for updates and apply them anytime later in{' '}
          <span className="font-medium text-foreground">Settings → Mobile App & System Updates</span>.
        </p>
      </div>
    </div>,
    document.body,
  );
}
