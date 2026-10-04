import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/react';
import {
  Sparkles,
  Target,
  Bell,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Volume2,
  Clock,
  Send,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { useNotificationPermission } from '@/lib/notifications';

export const TOUR_STORAGE_PREFIX = 'cadence_tour_completed_';
export const OPEN_TOUR_EVENT = 'cadence:open-tour';

export function openFirstRunTour() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT));
  }
}

export function FirstRunTourModal() {
  const { user, isLoaded } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const {
    permission,
    isGranted,
    isDenied,
    requestPermission,
  } = useNotificationPermission();

  const userId = user?.id || 'guest';
  const storageKey = `${TOUR_STORAGE_PREFIX}${userId}`;

  // Check if user has seen the tour on mount
  useEffect(() => {
    if (!isLoaded) return;

    const isE2E =
      typeof window !== 'undefined' &&
      ((window as unknown as { __CADENCE_E2E__?: boolean }).__CADENCE_E2E__ ||
        window.sessionStorage?.getItem('__CADENCE_E2E__') === 'true' ||
        window.localStorage?.getItem('cadence_test_auth') === 'true');

    const hasCompleted = isE2E || localStorage.getItem(storageKey);
    if (!hasCompleted) {
      // Auto-trigger on first sign up / login
      setIsOpen(true);
    }

    const handleOpenEvent = () => {
      setStep(1);
      setIsOpen(true);
    };

    window.addEventListener(OPEN_TOUR_EVENT, handleOpenEvent);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, handleOpenEvent);
  }, [isLoaded, storageKey]);

  const handleClose = useCallback(() => {
    soundFX.playClick();
    localStorage.setItem(storageKey, 'true');
    setIsOpen(false);
  }, [storageKey]);

  const handleNext = () => {
    soundFX.playTactileClick();
    if (step < 4) {
      setStep((prev) => (prev + 1) as 1 | 2 | 3 | 4);
    } else {
      soundFX.playCelebration();
      handleClose();
    }
  };

  const handleBack = () => {
    soundFX.playTactileClick();
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleEnableNotifications = async () => {
    const res = await requestPermission();
    if (res === 'granted') {
      soundFX.playCompletion();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl animate-enter"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border-control bg-card p-6 sm:p-8 shadow-2xl shadow-black/80 space-y-6">
        {/* Top Header & Dismiss Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step === s
                    ? 'w-7 bg-primary'
                    : step > s
                    ? 'w-3 bg-success'
                    : 'w-3 bg-muted'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Skip tour"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step 1: Welcome & Philosophy */}
        {step === 1 && (
          <div className="space-y-4 animate-enter">
            <div className="size-12 rounded-2xl bg-primary/15 text-primary-text grid place-items-center">
              <Sparkles size={24} />
            </div>

            <h2 id="tour-modal-title" className="text-2xl font-black tracking-tight text-foreground">
              Make room for the day.
            </h2>

            <p className="text-sm leading-6 text-muted-foreground">
              Welcome to Cadence. This is your personal task & time OS designed to replace the paper planner
              without the administrative clutter. Fast capture, focus momentum, and honest rituals.
            </p>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted border border-border-control">
                <Target size={18} className="text-primary-text mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Single-Task Flow</p>
                  <p className="text-caption text-muted-foreground">Work on one Next Up task at a time with zero distraction.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted border border-border-control">
                <Flame size={18} className="text-status-success-text mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-foreground">Activity Rings</p>
                  <p className="text-caption text-muted-foreground">Fill task completions & focus rounds each day to preserve your streak.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Essential Speed & Gestures */}
        {step === 2 && (
          <div className="space-y-4 animate-enter">
            <div className="size-12 rounded-2xl bg-accent/15 text-accent grid place-items-center">
              <Clock size={24} />
            </div>

            <h2 id="tour-modal-title" className="text-2xl font-black tracking-tight text-foreground">
              Built for speed.
            </h2>

            <p className="text-sm leading-6 text-muted-foreground">
              Cadence gives you fast capture anywhere on your mobile device or desktop.
            </p>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-xl bg-muted border border-border-control flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Quick Capture</p>
                  <p className="text-caption text-muted-foreground">Tap + in the dock or press <code className="font-mono text-foreground font-bold">N</code>.</p>
                </div>
                <span className="font-mono text-xs px-2 py-1 rounded bg-card border border-border-control font-bold">N</span>
              </div>

              <div className="p-3.5 rounded-xl bg-muted border border-border-control flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Command Palette</p>
                  <p className="text-caption text-muted-foreground">Jump between views, search tasks, or trigger rituals.</p>
                </div>
                <span className="font-mono text-xs px-2 py-1 rounded bg-card border border-border-control font-bold">⌘K</span>
              </div>

              <div className="p-3.5 rounded-xl bg-muted border border-border-control flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Natural Dates</p>
                  <p className="text-caption text-muted-foreground">Type "tomorrow 3pm" or "in 2h" for automatic parsing.</p>
                </div>
                <Sparkles size={16} className="text-primary-text" />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Enterprise Notification Pre-Prompt */}
        {step === 3 && (
          <div className="space-y-4 animate-enter">
            <div className="size-12 rounded-2xl bg-primary/15 text-primary-text grid place-items-center">
              <Bell size={24} />
            </div>

            <h2 id="tour-modal-title" className="text-2xl font-black tracking-tight text-foreground">
              Enable Device Alerts
            </h2>

            <p className="text-sm leading-6 text-muted-foreground">
              Cadence relies on discreet device alerts to keep you on rhythm without cluttering your notifications shade.
            </p>

            <div className="space-y-2.5 p-4 rounded-xl bg-muted border border-border-control">
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 size={16} className="text-status-success-text shrink-0" />
                <span>Completion bell when your Focus Timer finishes</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 size={16} className="text-status-success-text shrink-0" />
                <span>Discreet reminders for scheduled and time-blocked tasks</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-foreground font-medium">
                <CheckCircle2 size={16} className="text-status-success-text shrink-0" />
                <span>Proposals before overdue tasks slip your rhythm</span>
              </div>
            </div>

            {/* Permission State Box */}
            <div className="pt-2">
              {isGranted ? (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-success/15 border border-success/30 text-status-success-text">
                  <CheckCircle2 size={18} />
                  <span className="text-xs font-bold">Notifications are active on this device!</span>
                </div>
              ) : isDenied ? (
                <div className="p-3.5 rounded-xl bg-muted border border-border-control text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Notifications are blocked in browser settings.</p>
                  <p>You can enable them anytime from your browser's site settings or lock icon.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  data-testid="button-tour-enable-notifications"
                  className="w-full flex items-center justify-center gap-2 min-h-[46px] rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg hover:brightness-110 active:scale-98 transition-all"
                >
                  <Bell size={16} />
                  <span>Turn On Notifications</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Ready to Flow */}
        {step === 4 && (
          <div className="space-y-4 animate-enter">
            <div className="size-12 rounded-2xl bg-success/15 text-status-success-text grid place-items-center">
              <CheckCircle2 size={24} />
            </div>

            <h2 id="tour-modal-title" className="text-2xl font-black tracking-tight text-foreground">
              You are ready.
            </h2>

            <p className="text-sm leading-6 text-muted-foreground">
              Your personal cadence is primed. Your device is ready for quick mobile capture, focused work intervals, and clean reviews.
            </p>

            <div className="p-4 rounded-xl bg-muted border border-border-control space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <Send size={14} className="text-primary-text" />
                <span>Looking for Telegram bot integration?</span>
              </div>
              <p className="text-caption text-muted-foreground leading-relaxed">
                If you also want two-way chat commands (<code className="font-mono text-foreground font-semibold">done</code>, <code className="font-mono text-foreground font-semibold">snooze 1h</code>) inside Telegram, you can pair a bot anytime in <strong className="text-foreground">Settings → Messaging</strong>. It is completely optional!
              </p>
            </div>

            <div className="flex items-center gap-2 text-caption text-muted-foreground pt-1">
              <ShieldCheck size={14} className="text-status-success-text" />
              <span>Multi-user secure · Row-level isolation · Private by design</span>
            </div>
          </div>
        )}

        {/* Modal Navigation Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border-control">
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex min-h-[40px] items-center px-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip Tour
            </button>
          )}

          <button
            type="button"
            onClick={handleNext}
            data-testid="button-tour-next"
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-md hover:brightness-110 active:scale-98 transition-all"
          >
            <span>{step === 4 ? 'Enter Cadence' : step === 3 && isGranted ? 'Continue' : step === 3 ? 'Maybe Later' : 'Next'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
