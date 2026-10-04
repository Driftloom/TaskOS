import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Clock,
  Globe,
  Sliders,
  Send,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Bell,
  Check,
  Moon,
  Sun,
  Flame,
  Loader2,
} from 'lucide-react';
import {
  useGetNotificationSettings,
  useGetRescheduleSettings,
  useUpdateNotificationSettings,
  useUpdateRescheduleSettings,
  useSendTelegramTestMessage,
  useGetIntegrationsStatus,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { useNotificationPermission } from '@/lib/notifications';
import { timezone as detectTimezone } from '@/lib/date-utils';

/** "HH:MM" -> hour int, for the 0-23 quiet/work columns. */
function hourOf(hhmm: string): number {
  const h = parseInt(hhmm.split(':')[0] ?? '', 10);
  return Number.isNaN(h) ? 0 : Math.min(23, Math.max(0, h));
}

function pad(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: existingNotifications } = useGetNotificationSettings();
  const { data: existingReschedule } = useGetRescheduleSettings();
  const { data: integrations } = useGetIntegrationsStatus();
  const updateNotifications = useUpdateNotificationSettings();
  const updateReschedule = useUpdateRescheduleSettings();
  const sendTestMessage = useSendTelegramTestMessage();
  const {
    isGranted: nativeNotifGranted,
    isDenied: nativeNotifDenied,
    requestPermission: requestNativePermission,
    sendTestNotification: sendNativeTest,
  } = useNotificationPermission();

  // Step 1: Timezone & Rhythm (defaults to 24h flexible per locked decision)
  const [timezone, setTimezone] = useState(() => detectTimezone() || 'Asia/Kolkata');
  const [is24Hours, setIs24Hours] = useState(true);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('00:00');
  const [quietEnd, setQuietEnd] = useState('07:00');

  // Step 2: Automation Mode
  const [automationMode, setAutomationMode] = useState<'auto' | 'ask' | 'off'>('auto');
  const [rescheduleCap, setRescheduleCap] = useState(5);

  // Step 3: Notification Channels & Telegram
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramVerified, setTelegramVerified] = useState(false);

  // Prefill from the server. Without this, re-running the wizard overwrote a
  // real configuration with the wizard's hardcoded defaults.
  useEffect(() => {
    if (!existingNotifications) return;
    setTimezone(existingNotifications.timezone);
    setIs24Hours(existingNotifications.flexible24h);
    setWorkStart(pad(existingNotifications.workStart));
    setWorkEnd(pad(existingNotifications.workEnd));
    setTelegramChatId(existingNotifications.telegramChatId ?? '');
    setQuietHoursEnabled(
      existingNotifications.quietStart !== existingNotifications.quietEnd,
    );
    setQuietStart(pad(existingNotifications.quietStart));
    setQuietEnd(pad(existingNotifications.quietEnd));
  }, [existingNotifications]);

  useEffect(() => {
    if (!existingReschedule) return;
    setAutomationMode(existingReschedule.defaultMode);
    setRescheduleCap(existingReschedule.maxMoves);
  }, [existingReschedule]);

  const handleNext = () => {
    soundFX.playTactileClick();
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
  };

  const handleBack = () => {
    soundFX.playTactileClick();
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    soundFX.playCelebration();

    const chatId = telegramChatId.trim();

    // 1. Persist to the real backend. allSettled is deliberate (one failure
    //    must not discard the other), but a failure is now surfaced instead
    //    of being swallowed behind a success toast.
    const [notifResult, rescheduleResult] = await Promise.allSettled([
      updateNotifications.mutateAsync({
        data: {
          timezone,
          telegramChatId: chatId ? chatId : null,
          quietStart: quietHoursEnabled ? hourOf(quietStart) : 0,
          quietEnd: quietHoursEnabled ? hourOf(quietEnd) : 0,
          remindersEnabled: Boolean(chatId) || integrations?.healthchecks.configured === true,
          flexible24h: is24Hours,
          workStart: hourOf(workStart),
          workEnd: hourOf(workEnd),
        },
      }),
      updateReschedule.mutateAsync({
        data: {
          defaultMode: automationMode,
          maxMoves: rescheduleCap,
        },
      }),
    ]);

    const failures = [notifResult, rescheduleResult].filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      setIsSubmitting(false);
      toast.error('Setup did not fully save', {
        description:
          failures.length === 2
            ? 'Neither notification nor reschedule settings could be written. Check your connection and retry.'
            : 'One settings group failed to save. Retry to finish setup.',
      });
      return;
    }

    toast.success('Cadence setup complete!', {
      description: 'Your rhythm and scheduling engine are primed.',
    });

    setLocation('/today');
  };

  const handleVerifyTelegram = () => {
    const chatId = telegramChatId.trim();
    if (!chatId) {
      toast.error('Please enter your numeric Telegram Chat ID');
      return;
    }
    soundFX.playTactileClick();

    if (!integrations?.telegram.configured) {
      toast.error('No Telegram bot is connected yet', {
        description:
          'Connect a bot in Settings → Messaging first. A chat id alone cannot receive messages.',
      });
      return;
    }

    // Save the id, then actually send through the bot. Verification is the
    // server confirming delivery, not a local flag flip.
    updateNotifications.mutate(
      { data: { telegramChatId: chatId } },
      {
        onSuccess: () => {
          sendTestMessage.mutate(undefined, {
            onSuccess: () => {
              soundFX.playCompletion();
              setTelegramVerified(true);
              toast.success('Telegram verified', {
                description: `The bot delivered a test message to chat ${chatId}.`,
              });
            },
            onError: (err) =>
              toast.error('Verification failed', {
                description:
                  err && typeof err === 'object' && 'message' in err
                    ? String((err as { message: unknown }).message)
                    : 'The bot could not deliver to that chat id.',
              }),
          });
        },
        onError: () => toast.error('Could not save the chat id'),
      },
    );
  };

  return (
    <div className="min-h-[85dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-card border border-border-control rounded-2xl p-6 sm:p-10 shadow-2xl space-y-8 animate-enter">
        {/* Progress Stepper */}
        <div className="flex items-center justify-between border-b border-border-control pb-6">
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-accent">
              Step {step} of 3
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-1">
              {step === 1 && 'Rhythm & Timezone'}
              {step === 2 && 'Smart Reschedule Dial'}
              {step === 3 && 'Channels & Telegram'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`size-3 rounded-full transition-all ${
                  step === s
                    ? 'bg-accent scale-125'
                    : step > s
                    ? 'bg-success'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1 Content */}
        {step === 1 && (
          <div className="space-y-6 animate-enter">
            <div>
              <label
                htmlFor="onboarding-timezone"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2"
              >
                <Globe className="size-4 text-accent" />
                Primary Timezone (IANA)
              </label>
              <select
                id="onboarding-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-muted border border-border-control text-foreground text-sm focus:outline-none focus:border-accent"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30) [Default]</option>
                <option value="America/New_York">America/New_York (EDT, UTC-4:00)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PDT, UTC-7:00)</option>
                <option value="Europe/London">Europe/London (BST, UTC+1:00)</option>
                <option value="Europe/Berlin">Europe/Berlin (CEST, UTC+2:00)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9:00)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8:00)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                All daily rolls, focus streaks, and reminder dispatches evaluate against this zone.
              </p>
            </div>

            {/* 24-Hour Rhythm Toggle */}
            <div className="p-4 rounded-2xl bg-muted border border-border-control space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Flame className="size-5 text-primary-text" />
                  <div>
                    {/* The heading text IS the checkbox's label: a real
                        <label for>, not an aria-label. Rendered as a sibling
                        without it, the control had no accessible name at all
                        (axe `label`, critical) and could not be reached with
                        getByLabel. */}
                    <h4 className="text-sm font-bold text-foreground">
                      <label htmlFor="onboarding-flexible-24h">
                        24-Hour Flexible Rhythm
                      </label>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      No artificial working hour cutoffs. Schedule blocks anytime day or night.
                    </p>
                  </div>
                </div>
                <input
                  id="onboarding-flexible-24h"
                  type="checkbox"
                  checked={is24Hours}
                  onChange={(e) => setIs24Hours(e.target.checked)}
                  className="size-5 accent-primary rounded cursor-pointer"
                />
              </div>

              {!is24Hours && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-control">
                  <div>
                    <label
                      htmlFor="onboarding-work-start"
                      className="text-xs text-muted-foreground"
                    >
                      Work Starts
                    </label>
                    <input
                      id="onboarding-work-start"
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-card border border-border-control text-foreground text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="onboarding-work-end"
                      className="text-xs text-muted-foreground"
                    >
                      Work Ends
                    </label>
                    <input
                      id="onboarding-work-end"
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-card border border-border-control text-foreground text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quiet Hours */}
            <div className="p-4 rounded-2xl bg-muted border border-border-control space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Moon className="size-5 text-ai-text" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      <label htmlFor="onboarding-quiet-hours">
                        Quiet Hours Suppression
                      </label>
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Suppress non-urgent reminders during sleep or downtime.
                    </p>
                  </div>
                </div>
                <input
                  id="onboarding-quiet-hours"
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                  className="size-5 accent-ai rounded cursor-pointer"
                />
              </div>

              {quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-control">
                  <div>
                    <label
                      htmlFor="onboarding-quiet-start"
                      className="text-xs text-muted-foreground"
                    >
                      Quiet Starts
                    </label>
                    <input
                      id="onboarding-quiet-start"
                      type="time"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-card border border-border-control text-foreground text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="onboarding-quiet-end"
                      className="text-xs text-muted-foreground"
                    >
                      Quiet Ends
                    </label>
                    <input
                      id="onboarding-quiet-end"
                      type="time"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-card border border-border-control text-foreground text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 Content */}
        {step === 2 && (
          <div className="space-y-6 animate-enter">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sliders className="size-4 text-accent" />
                Automation Dial (Default for new tasks)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                {[
                  {
                    id: 'auto',
                    title: 'Auto (Recommended)',
                    desc: 'Moves on 1st miss, auto-downgrades to Ask on 2nd miss.',
                    badge: 'Hybrid Mode',
                  },
                  {
                    id: 'ask',
                    title: 'Ask First',
                    desc: 'Generates proposal, awaits your explicit one-click confirmation.',
                    badge: 'Conservative',
                  },
                  {
                    id: 'off',
                    title: 'Manual Only',
                    desc: 'Flags overdue tasks. Never moves slots automatically.',
                    badge: 'Strict',
                  },
                ].map((dial) => (
                  <div
                    key={dial.id}
                    onClick={() => {
                      soundFX.playTactileClick();
                      setAutomationMode(dial.id as 'auto' | 'ask' | 'off');
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      automationMode === dial.id
                        ? 'bg-accent/10 border-accent shadow-md'
                        : 'bg-muted border-border-control hover:border-border-strong'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-card/[0.08] text-foreground">
                        {dial.badge}
                      </span>
                      <h4 className="text-sm font-bold text-foreground mt-2">{dial.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{dial.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-muted border border-border-control flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-foreground">Auto-Move Safety Cap</h4>
                <p className="text-xs text-muted-foreground">
                  Stops auto-rescheduling after N moves and flags for human attention.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    soundFX.playTactileClick();
                    setRescheduleCap(Math.max(1, rescheduleCap - 1));
                  }}
                  className="size-8 rounded-lg bg-card text-foreground font-bold hover:bg-muted"
                >
                  -
                </button>
                <span className="font-mono text-sm font-extrabold w-8 text-center text-accent">
                  {rescheduleCap}
                </span>
                <button
                  onClick={() => {
                    soundFX.playTactileClick();
                    setRescheduleCap(Math.min(10, rescheduleCap + 1));
                  }}
                  className="size-8 rounded-lg bg-card text-foreground font-bold hover:bg-muted"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 Content */}
        {step === 3 && (
          <div className="space-y-6 animate-enter">
            {/* Native Device Notifications (Primary Channel) */}
            <div className="p-5 rounded-2xl bg-muted border border-accent/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-xl bg-accent/20 text-accent">
                    <Bell className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Device Notifications (Primary Channel)</h4>
                    <p className="text-xs text-muted-foreground">
                      Focus timer completion bells, scheduled task alerts, and reschedule proposals.
                    </p>
                  </div>
                </div>

                {nativeNotifGranted && (
                  <span className="text-xs font-mono font-bold text-status-success-text bg-success/15 px-2.5 py-1 rounded-lg border border-success/30 whitespace-nowrap">
                    Active ✓
                  </span>
                )}
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {nativeNotifGranted
                    ? 'Your browser and device are configured to receive native alerts.'
                    : nativeNotifDenied
                    ? 'Notifications are blocked in your browser settings. You can permit them via the address bar lock icon.'
                    : 'Discreet alerts that respect your focus. No spam or marketing pings.'}
                </p>

                {nativeNotifGranted ? (
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playTactileClick();
                      sendNativeTest();
                      toast.success('Test notification triggered!');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-card border border-border-control hover:bg-muted text-foreground font-semibold text-xs transition-all active:scale-95"
                  >
                    Send Test Alert
                  </button>
                ) : !nativeNotifDenied ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await requestNativePermission();
                      if (res === 'granted') {
                        toast.success('Device notifications enabled!');
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    Enable Device Alerts
                  </button>
                ) : null}
              </div>
            </div>

            {/* Telegram Two-Way Assistant (Optional Companion Channel) */}
            <div className="p-5 rounded-2xl bg-muted border border-border-control space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-xl bg-card text-muted-foreground">
                    <Send className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Telegram Two-Way Assistant (Optional)</h4>
                    <p className="text-xs text-muted-foreground">
                      Reply `done` or `snooze 1h` directly inside Telegram. Skip if you use mobile app alerts only.
                    </p>
                  </div>
                </div>
                <span className="text-caption font-mono uppercase text-muted-foreground px-2 py-0.5 rounded bg-card border border-border-control">
                  Optional
                </span>
              </div>

              <div className="space-y-2 pt-2">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Open Telegram and message your bot (or <code className="text-foreground">@userinfobot</code>) to get your Chat ID.</li>
                  <li>Paste your numeric Chat ID below (or leave blank to skip):</li>
                </ol>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 192847192 (optional)"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-card border border-border-control text-foreground text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleVerifyTelegram}
                    className="px-4 py-2.5 rounded-xl bg-card border border-border-control hover:bg-muted text-foreground font-bold text-xs shrink-0 active:scale-95 transition-all"
                  >
                    {telegramVerified ? 'Verified ✓' : 'Verify'}
                  </button>
                </div>
              </div>
            </div>

            {/* Web Push: not implemented, so it is labelled as such rather than
                offered as a toggle that silently does nothing. */}
            <div className="p-4 rounded-2xl bg-muted border border-border-control flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bell className="size-5 text-muted-foreground" />
                <div>
                  <h4 className="text-sm font-bold text-foreground">Web Push</h4>
                  <p className="text-xs text-muted-foreground">
                    Not available in this build. Telegram is the delivery channel.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-muted-foreground bg-card/[0.04] px-2.5 py-1 rounded-lg border border-border-control whitespace-nowrap">
                UNAVAILABLE
              </span>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-border-control pt-6">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted hover:bg-muted text-muted-foreground hover:text-foreground font-semibold text-xs active:scale-95 transition-all"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            /* The primary CTA is `bg-primary` (orange), not `bg-accent` (blue).
               AGENTS.md §5 assigns orange to primary CTAs and reserves blue for
               scheduled blocks and secondary links, and it is also the only
               filled option that can carry a label: axe measured `text-foreground`
               on `bg-accent` at 3.41:1 dark and 3.56:1 light, while
               `text-primary-foreground` on `bg-primary` measures 10.22:1 and
               8.70:1. `text-accent-foreground` (white) would not have worked
               either — 3.75:1 on the dark fill. */
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-xs shadow-md active:scale-95 transition-all"
            >
              Next Step
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-7 py-3 rounded-xl bg-success hover:bg-success/90 disabled:opacity-50 text-primary-foreground font-black text-sm shadow-xl active:scale-95 transition-all"
            >
              {isSubmitting ? (
                <>
                  <span>Priming Engine...</span>
                  <Loader2 className="size-4 animate-spin" />
                </>
              ) : (
                <>
                  <span>Complete Setup & Enter Cadence</span>
                  <CheckCircle2 className="size-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default OnboardingPage;
