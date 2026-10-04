import { useState, useEffect } from 'react';
import { Bell, BellOff, X, ArrowRight, Volume2 } from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { useNotificationPermission } from '@/lib/notifications';

interface NotificationBannerProps {
  context?: 'focus' | 'reminders' | 'general';
  className?: string;
}

const DISMISS_KEY = 'cadence_dismiss_notif_banner_time';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function NotificationBanner({ context = 'focus', className = '' }: NotificationBannerProps) {
  const {
    permission,
    isGranted,
    isDenied,
    isDefault,
    isSupported,
    requestPermission,
  } = useNotificationPermission();

  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissedTime = localStorage.getItem(DISMISS_KEY);
    if (dismissedTime) {
      const elapsed = Date.now() - parseInt(dismissedTime, 10);
      if (elapsed < DISMISS_DURATION_MS) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
  }, []);

  const handleDismiss = () => {
    soundFX.playClick();
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  const handleEnable = async () => {
    soundFX.playTactileClick();
    const result = await requestPermission();
    if (result === 'granted') {
      soundFX.playCompletion();
    }
  };

  // Don't show if unsupported, already granted, or dismissed by user
  if (!isSupported || isGranted || dismissed) {
    return null;
  }

  if (isDefault) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-card border border-border-control shadow-sm ${className}`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
            <Bell size={18} />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-foreground">
              {context === 'focus'
                ? 'Focus Timer Alerts are Muted'
                : 'Device Notifications are Disabled'}
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">
              {context === 'focus'
                ? 'Enable notifications so Cadence can sound the bell when your round finishes.'
                : 'Enable alerts to get timely pings for time-blocked tasks and daily rituals.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleEnable}
            data-testid="button-banner-enable-notifications"
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-sm hover:brightness-110 active:scale-98 transition-all"
          >
            <Volume2 size={13} />
            <span>Enable Alerts</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss notification reminder"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (isDenied) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-start justify-between gap-3 p-3.5 rounded-xl bg-muted border border-border-control ${className}`}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground">
            <BellOff size={16} />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-foreground">
              Notifications Blocked in Browser Settings
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">
              Timer bells and lock-screen reminders are silenced. To allow them, tap the lock or site settings icon in your browser address bar.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss banner"
          className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-foreground transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return null;
}
