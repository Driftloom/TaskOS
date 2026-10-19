import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  Download,
  ShieldCheck,
  Target,
  Volume2,
  VolumeX,
  Brain,
  Compass,
  Flame,
  ArrowRight,
  Sparkles,
  Power,
  Smartphone,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Eye,
  Clock,
  Layers,
  Send,
  Cpu,
  Database,
} from 'lucide-react';
import { useReducedMotionControl } from '@/hooks/useReducedMotion';
import { useDensity, isCompactAllowed } from '@/components/chrome/DensityProvider';
import { useAutomationToggle } from '@/components/chrome/AutomationPausedBanner';
import { openFirstRunTour } from '@/components/tour/FirstRunTourModal';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFocusSettingsQueryKey,
  getGetNotificationSettingsQueryKey,
  useGetFocusSettings,
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  useListTasks,
  useUpdateFocusSettings,
} from '@workspace/api-client-react';
import { timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { SectionHeading } from '@/components/shared/StateViews';
import { SettingsRow, TimeRangeControl, useAutosave } from '@/components/settings/SettingsPrimitives';
import { TimezoneSelect } from '@/components/settings/TimezoneSelect';
import { useIsStandalone } from '@/lib/use-standalone';
import { APP_VERSION_INFO } from '@/lib/version-info';
import { getActivityHistory } from '@/lib/activity-history';

/* The messaging/gateway panel is split out of this route chunk.
 *
 * MessagingIntegrationsView is 856 lines / 38.9 kB of source against this
 * file's lines, and it pulls 18 lucide icons plus the Telegram,
 * pairing and healthcheck mutations. Measured after the split, it is its own
 * chunk for optimal caching granularity.
 */
const MessagingIntegrationsView = lazy(() =>
  import('./MessagingIntegrationsView').then((m) => ({ default: m.MessagingIntegrationsView })),
);

// Same split rationale as MessagingIntegrationsView: keep the credential UI
// (react-query mutations, reveal toggles, per-provider drafts) out of this
// file's bundle.
const AgentSettingsView = lazy(() =>
  import('./AgentSettingsView').then((m) => ({ default: m.AgentSettingsView })),
);

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: focusSettings } = useGetFocusSettings();
  const updateFocus = useUpdateFocusSettings();

  const { data: notifSettings } = useGetNotificationSettings();
  const updateNotif = useUpdateNotificationSettings();

  const { flags: automationFlags, setFlag: setAutomationFlag } = useAutomationToggle();
  const remindersFlag = automationFlags.data?.flags?.find((f) => f.key === 'reminders')?.enabled ?? true;
  const rescheduleFlag = automationFlags.data?.flags?.find((f) => f.key === 'reschedule')?.enabled ?? true;

  const [soundEnabled, setSoundEnabled] = useState(soundFX.isEnabled());
  const motionControl = useReducedMotionControl();
  const { density, setDensity } = useDensity();
  const compactAllowed = isCompactAllowed();
  const [dailyTarget, setDailyTarget] = useState(focusSettings?.dailyTarget ?? 4);
  const [focusSaved, setFocusSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState<'rhythm' | 'focus' | 'integrations' | 'automation' | 'system'>('rhythm');

  const { data: allTasks } = useListTasks({ scope: 'all' });

  useEffect(() => {
    if (focusSettings?.dailyTarget) {
      setDailyTarget(focusSettings.dailyTarget);
    }
  }, [focusSettings?.dailyTarget]);

  const saveNotif = (patch: Parameters<typeof updateNotif.mutate>[0]['data']) =>
    updateNotif.mutateAsync({ data: patch });

  const invalidatesNotif = () => {
    queryClient.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
  };

  const committedWorkHours = useMemo(
    () =>
      notifSettings ? { start: notifSettings.workStart, end: notifSettings.workEnd } : undefined,
    [notifSettings],
  );
  const committedQuietHours = useMemo(
    () =>
      notifSettings ? { start: notifSettings.quietStart, end: notifSettings.quietEnd } : undefined,
    [notifSettings],
  );
  const committed24h = notifSettings?.flexible24h ?? true;
  const committedTz = notifSettings?.timezone ?? timezone();

  const workHours = useAutosave<{ start: number; end: number }>({
    committed: committedWorkHours,
    save: async (value) => {
      await saveNotif({ workStart: value.start, workEnd: value.end });
      invalidatesNotif();
    },
  });

  const quietHours = useAutosave<{ start: number; end: number }>({
    committed: committedQuietHours,
    save: async (value) => {
      await saveNotif({ quietStart: value.start, quietEnd: value.end });
      invalidatesNotif();
    },
  });

  const flexible24h = useAutosave<boolean>({
    committed: committed24h,
    save: async (value) => {
      await saveNotif({ flexible24h: value });
      invalidatesNotif();
      toast(value ? '24-hour flexible rhythm enabled' : 'Custom work hours active');
    },
  });

  const tz = useAutosave<string>({
    committed: committedTz,
    save: async (value) => {
      await saveNotif({ timezone: value });
      invalidatesNotif();
    },
    onSaved: () => toast.success('Timezone saved'),
    onError: () => toast.error('Could not save the timezone'),
  });

  const handleSaveFocus = () => {
    soundFX.playClick();
    updateFocus.mutate(
      { data: { dailyTarget } },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          queryClient.invalidateQueries({ queryKey: getGetFocusSettingsQueryKey() });
          setFocusSaved(true);
          toast.success('Daily focus target updated');
        },
        onError: () => toast.error('Could not save the focus target'),
      },
    );
  };

  useEffect(() => {
    if (!focusSaved) return;
    const timer = setTimeout(() => setFocusSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [focusSaved]);

  const isStandalone = useIsStandalone();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const handleCheckUpdates = async () => {
    if (!('serviceWorker' in navigator)) {
      toast('Updates are managed automatically by your browser.');
      return;
    }
    setCheckingUpdate(true);
    soundFX.playClick();
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        toast('Service worker is initializing. Please try again in a few moments.');
        return;
      }
      await reg.update();
      if (reg.waiting) {
        toast.success('New update found! It will activate shortly.');
      } else {
        toast.success(`You are on the latest version (v${APP_VERSION_INFO.version}).`);
      }
    } catch {
      toast.error('Unable to check for updates right now.');
    } finally {
      setTimeout(() => setCheckingUpdate(false), 600);
    }
  };

  const toggleSound = () => {
    const next = soundFX.toggle();
    setSoundEnabled(next);
    toast(next ? 'Sound effects enabled' : 'Sound effects muted');
  };

  const handleExportData = () => {
    try {
      setExporting(true);
      soundFX.playClick();
      const exportObject = {
        exportedAt: new Date().toISOString(),
        timezone: notifSettings?.timezone ?? timezone(),
        flexible24h: notifSettings?.flexible24h ?? true,
        workStart: notifSettings?.workStart ?? 0,
        workEnd: notifSettings?.workEnd ?? 0,
        quietStart: notifSettings?.quietStart ?? 0,
        quietEnd: notifSettings?.quietEnd ?? 0,
        focusTarget: dailyTarget,
        tasks: allTasks ?? [],
        activities: getActivityHistory(),
      };

      const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObject, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      soundFX.playCompletion();
      toast.success('Data exported successfully');
    } catch {
      toast.error('Could not export data');
    } finally {
      setExporting(false);
    }
  };

  const scrollToSection = (id: 'rhythm' | 'focus' | 'integrations' | 'automation' | 'system') => {
    soundFX.playClick();
    setActiveSection(id);
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="animate-enter w-full space-y-8 pb-16">
      {/* 1. Page Header */}
      <div>
        <SectionHeading
          eyebrow="Preferences — your rules"
          title="Settings & Boundaries"
          detail="Set your schedule constraints, 24-hour rhythm, sound feedback, and connected channels."
        />

        {/* Quick Access Utility Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
          <Link
            href="/memory"
            onClick={() => soundFX.playClick()}
            className="p-3 sm:p-3.5 rounded-xl bg-card border border-ai/20 hover:border-ai/50 transition-all flex flex-col justify-between group shadow-xs automation-card"
          >
            <div className="flex items-center justify-between">
              <div className="grid size-7 place-items-center rounded-lg bg-ai/15 text-ai-text">
                <Brain className="size-4" />
              </div>
              <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-ai-text group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="mt-2">
              <h2 className="text-callout font-bold text-foreground truncate">What Cadence Knows</h2>
              <p className="text-caption text-muted-foreground truncate">Memory facts & scheduling rules</p>
            </div>
          </Link>

          <Link
            href="/onboarding"
            onClick={() => soundFX.playClick()}
            className="p-3 sm:p-3.5 rounded-xl bg-card border border-accent/20 hover:border-accent/50 transition-all flex flex-col justify-between group shadow-xs automation-card"
          >
            <div className="flex items-center justify-between">
              <div className="grid size-7 place-items-center rounded-lg bg-accent/15 text-accent">
                <Compass className="size-4" />
              </div>
              <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="mt-2">
              <h2 className="text-callout font-bold text-foreground truncate">Setup Wizard</h2>
              <p className="text-caption text-muted-foreground truncate">Re-run 3-step setup</p>
            </div>
          </Link>

          <Link
            href="/download"
            onClick={() => soundFX.playClick()}
            data-testid="link-settings-download-apk"
            className="p-3 sm:p-3.5 rounded-xl bg-card border border-primary/20 hover:border-primary/50 transition-all flex flex-col justify-between group shadow-xs automation-card"
          >
            <div className="flex items-center justify-between">
              <div className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary-text">
                <Smartphone className="size-4" />
              </div>
              <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary-text group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="mt-2">
              <h2 className="text-callout font-bold text-foreground truncate">Mobile App (APK)</h2>
              <p className="text-caption text-muted-foreground truncate">Android & PWA release</p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              openFirstRunTour();
            }}
            className="p-3 sm:p-3.5 rounded-xl bg-card border border-border-control hover:border-border-control/80 text-left transition-all flex flex-col justify-between group shadow-xs automation-card"
          >
            <div className="flex items-center justify-between">
              <div className="grid size-7 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="size-4" />
              </div>
              <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="mt-2">
              <h2 className="text-callout font-bold text-foreground truncate">Product Tour</h2>
              <p className="text-caption text-muted-foreground truncate">Replay first-run tour</p>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Sticky Category Navigator */}
      <div className="sticky top-16 z-30 -mx-2 px-2 sm:mx-0 sm:px-0 py-2 bg-background/90 backdrop-blur-md border-b border-border-control/60">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: 'rhythm', label: 'Rhythm & Timezone', icon: Flame },
            { id: 'focus', label: 'Focus & Display', icon: Target },
            { id: 'integrations', label: 'Telegram & Alerts', icon: Send },
            { id: 'automation', label: 'AI & Safety', icon: Cpu },
            { id: 'system', label: 'Updates & Backup', icon: Database },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeSection === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToSection(cat.id as any)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-semibold whitespace-nowrap transition-all tap-target-expand ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-card/[0.04] text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={13} className={isSelected ? 'text-primary-foreground' : 'text-primary-text'} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Section Chapters */}
      <div className="space-y-10">
        {/* CHAPTER 1: Rhythm & Timezone */}
        <div id="section-rhythm" className="scroll-mt-32 space-y-6">
          <section className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Flame size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Rhythm &amp; Timezone</h2>
                <p className="text-caption text-muted-foreground">
                  Scheduling windows, quiet hours, and the wall-clock zone your day runs on.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-caption font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Daily rhythm
              </p>
              <SettingsRow
                label="24-hour flexible rhythm"
                description="When on, work hours are ignored and the scheduler may place work at any hour."
                control="toggle"
                checked={flexible24h.value}
                onCheckedChange={(checked) => {
                  soundFX.playTactileClick();
                  flexible24h.setValue(checked);
                }}
                state={flexible24h.state}
                error={flexible24h.error}
                onRetry={flexible24h.retry}
              />

              {notifSettings ? (
                <TimeRangeControl
                  label="Schedulable workday"
                  start={workHours.value.start}
                  end={workHours.value.end}
                  timezone={notifSettings.timezone}
                  tone="accent"
                  startLabel="Workday starts"
                  endLabel="Workday ends"
                  helperText="Tasks and auto-placed blocks only land inside this window. The sweep will offer to move anything that lands outside it."
                  onChange={(next) => workHours.setValue(next)}
                  state={workHours.state}
                  error={workHours.error}
                  onRetry={workHours.retry}
                  testId="time-range-work-hours"
                />
              ) : (
                <div
                  className="h-48 settings-skeleton-min-h animate-pulse rounded-xl border border-border bg-card"
                  data-testid="settings-loading"
                />
              )}
            </div>

            <div className="space-y-3 border-t border-border-control/60 pt-4">
              <p className="text-caption font-mono font-bold uppercase tracking-wider text-muted-foreground">
                Zone &amp; quiet hours
              </p>
              <SettingsRow
                label="IANA timezone identifier"
                description={`Browser detected: ${timezone()}. Saves automatically; a "Saved" note appears when it lands.`}
                state={tz.state}
                error={tz.error}
                onRetry={tz.retry}
                testId="settings-row-timezone"
              >
                <div className="w-full sm:w-80">
                  <label htmlFor="settings-input-timezone" className="sr-only">
                    IANA timezone identifier
                  </label>
                  <TimezoneSelect
                    id="settings-input-timezone"
                    value={tz.value ?? ''}
                    onChange={(eventValue) => tz.setValue(eventValue)}
                    onSave={() => tz.saveNow()}
                    testId="input-timezone"
                  />
                </div>
              </SettingsRow>

              {notifSettings ? (
                <TimeRangeControl
                  label="Quiet hours"
                  start={quietHours.value.start}
                  end={quietHours.value.end}
                  timezone={notifSettings.timezone}
                  tone="warning"
                  allowEqual
                  equalValueNote="Start equals end, so the quiet window is switched off."
                  startLabel="Quiet starts"
                  endLabel="Quiet ends"
                  helperText="Due reminders wait out the quiet window instead of waking you."
                  onChange={(next) => quietHours.setValue(next)}
                  state={quietHours.state}
                  error={quietHours.error}
                  onRetry={quietHours.retry}
                  testId="time-range-quiet-hours"
                />
              ) : (
                <div
                  className="h-28 animate-pulse rounded-xl border border-border bg-card"
                  data-testid="settings-loading"
                />
              )}
            </div>
          </section>
        </div>

        {/* CHAPTER 2: Focus & Display */}
        <div id="section-focus" className="scroll-mt-32 space-y-6">
          {/* Daily Focus Target */}
          <section className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Target size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Daily Focus Target</h2>
                <p className="text-caption text-muted-foreground">
                  Number of intentional rounds aimed for each day.
                </p>
              </div>
            </div>

            <SettingsRow
              label="Rounds per day"
              state={updateFocus.isPending ? 'saving' : focusSaved ? 'saved' : 'idle'}
              testId="settings-row-focus-target"
            >
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Decrease daily focus target"
                    onClick={() => {
                      soundFX.playClick();
                      setDailyTarget((prev) => Math.max(1, prev - 1));
                    }}
                    data-testid="button-focus-target-decrement"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    −
                  </button>
                  <span className="w-20 text-center font-mono text-body font-bold text-foreground">
                    {dailyTarget} {dailyTarget === 1 ? 'round' : 'rounds'}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase daily focus target"
                    onClick={() => {
                      soundFX.playClick();
                      setDailyTarget((prev) => Math.min(20, prev + 1));
                    }}
                    data-testid="button-focus-target-increment"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveFocus}
                  disabled={updateFocus.isPending || dailyTarget === focusSettings?.dailyTarget}
                  data-testid="button-save-focus-target"
                  className="btn-primary inline-flex h-11 items-center rounded-lg px-3.5 text-caption font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {updateFocus.isPending ? 'Saving…' : 'Save target'}
                </button>
              </div>
            </SettingsRow>
          </section>

          {/* Interface Sounds & Haptics */}
          <section className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/15 text-status-success-text">
                {soundEnabled ? (
                  <Volume2 size={18} aria-hidden="true" />
                ) : (
                  <VolumeX size={18} aria-hidden="true" />
                )}
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Tactile Audio Feedback</h2>
                <p className="text-caption text-muted-foreground">
                  Studio-grade Web Audio synthesis for completions, focus rounds, and clicks.
                </p>
              </div>
            </div>

            <SettingsRow
              label="Sound effects"
              description="This preference lives on this device only — it is not part of your synced settings."
              control="toggle"
              checked={soundEnabled}
              onCheckedChange={() => {
                soundFX.playTactileClick();
                toggleSound();
              }}
              toggleTestId="button-toggle-sound"
              testId="settings-row-sound"
            />
          </section>

          {/* Accessibility & Motion Preferences */}
          <section data-testid="section-accessibility-motion" className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                <Eye size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Accessibility &amp; Motion</h2>
                <p className="text-caption text-muted-foreground">
                  Vestibular safety controls and interface animation preferences (WCAG 2.3.3).
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <SettingsRow
                label="Reduced motion"
                description={
                  motionControl.preference === 'reduce'
                    ? 'Always reduce — all interface transitions, rings, and spring animations are de-animated.'
                    : motionControl.preference === 'no-preference'
                      ? 'Full motion — all animations and transitions are active.'
                      : 'System default — following your operating system accessibility preferences.'
                }
                testId="settings-row-reduced-motion"
              >
                <div className="inline-flex rounded-lg border border-border-control p-0.5 bg-muted/40">
                  {(['system', 'reduce', 'no-preference'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        motionControl.setPreference(mode);
                      }}
                      data-testid={`button-motion-${mode}`}
                      aria-pressed={motionControl.preference === mode}
                      aria-label={`Set reduced motion to ${mode}`}
                      className={`min-h-9 px-3 text-caption font-semibold rounded-md transition-all tap-target-expand ${
                        motionControl.preference === mode
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'system' ? 'System' : mode === 'reduce' ? 'Reduce' : 'Full Motion'}
                    </button>
                  ))}
                </div>
              </SettingsRow>

              <SettingsRow
                label="Display density"
                description={
                  density === 'comfortable'
                    ? 'Comfortable — 56px rows and spacious touch margins (recommended for mobile).'
                    : density === 'compact'
                      ? 'Compact — 38px rows and dense spacing for high-information scanning.'
                      : 'Default — 50px balanced rows and standard touch targets.'
                }
                testId="settings-row-density"
              >
                <div className="inline-flex rounded-lg border border-border-control p-0.5 bg-muted/40">
                  {(['comfortable', 'default', 'compact'] as const)
                    .filter((mode) => mode !== 'compact' || compactAllowed)
                    .map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          soundFX.playClick();
                          setDensity(mode);
                        }}
                        data-testid={`button-density-${mode}`}
                        aria-pressed={density === mode}
                        aria-label={`Set display density to ${mode}`}
                        className={`min-h-9 px-3 text-caption font-semibold rounded-md transition-all tap-target-expand ${
                          density === mode
                            ? 'bg-card text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                </div>
                {!compactAllowed ? (
                  <p className="mt-1 text-footnote text-muted-foreground">
                    Compact is unavailable on touch devices — it reduces row height below the 44px
                    touch target minimum.
                  </p>
                ) : null}
              </SettingsRow>
            </div>
          </section>
        </div>

        {/* CHAPTER 3: Telegram & Gateway Integrations */}
        <div id="section-integrations" className="scroll-mt-32 space-y-6">
          <Suspense
            fallback={
              <div
                data-testid="messaging-integrations-loading"
                className="h-64 rounded-xl border border-border bg-card animate-pulse"
              />
            }
          >
            <MessagingIntegrationsView />
          </Suspense>
        </div>

        {/* CHAPTER 4: AI & Automation Safety */}
        <div id="section-automation" className="scroll-mt-32 space-y-6">
          {/* In-app BYOK: agent LLM provider key */}
          <Suspense
            fallback={
              <div
                data-testid="agent-settings-loading"
                className="h-64 rounded-xl border border-border bg-card animate-pulse"
              />
            }
          >
            <AgentSettingsView />
          </Suspense>

          {/* Automation & Safety Kill Switches (P17.1) */}
          <section data-testid="section-automation-flags" className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Power size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Automation &amp; Safety Controls</h2>
                <p className="text-caption text-muted-foreground">
                  Global kill switches for reminders dispatch and automated rescheduling.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <SettingsRow
                label="Reminders Dispatcher"
                description="Background daemon that sends Telegram, push, and email notifications for due tasks."
                control="toggle"
                checked={remindersFlag}
                onCheckedChange={() => {
                  soundFX.playTactileClick();
                  void setAutomationFlag('reminders', !remindersFlag);
                }}
                toggleTestId="button-toggle-reminders-flag"
                testId="settings-row-automation-reminders"
              />

              <SettingsRow
                label="Auto-Reschedule Engine"
                description="Automatic shifting of overdue and missed tasks during morning and evening sweeps."
                control="toggle"
                checked={rescheduleFlag}
                onCheckedChange={() => {
                  soundFX.playTactileClick();
                  void setAutomationFlag('reschedule', !rescheduleFlag);
                }}
                toggleTestId="button-toggle-reschedule-flag"
                testId="settings-row-automation-reschedule"
              />
            </div>
          </section>
        </div>

        {/* CHAPTER 5: System, Updates & Backup */}
        <div id="section-system" className="scroll-mt-32 space-y-6">
          {/* Mobile App & System Updates */}
          <section data-testid="section-system-updates" className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border-control/60">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
                  <Smartphone size={18} aria-hidden="true" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-headline font-bold text-foreground">Mobile App &amp; System Updates</h2>
                    <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-caption font-semibold text-primary-text">
                      v{APP_VERSION_INFO.version}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground mt-0.5">
                    Runtime:{' '}
                    <span className="font-medium text-foreground">
                      {isStandalone ? 'Installed Standalone App (PWA/TWA)' : 'Web Browser'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdate}
                  data-testid="button-check-updates"
                  className="inline-flex control-md-h items-center gap-2 rounded-control border border-border-control bg-card px-4 text-caption font-bold text-foreground hover:bg-card/[0.08] transition-colors disabled:opacity-50 tap-target-expand"
                >
                  <RefreshCw size={14} className={checkingUpdate ? 'animate-spin text-primary-text' : ''} />
                  <span>{checkingUpdate ? 'Checking…' : 'Check for Updates'}</span>
                </button>

                <Link
                  href="/download"
                  onClick={() => soundFX.playClick()}
                  className="inline-flex control-md-h items-center gap-1.5 rounded-control bg-primary px-4 text-caption font-bold text-primary-foreground shadow-md hover:brightness-110 active:scale-98 transition-all tap-target-expand"
                >
                  <span>Download Portal</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {/* Runtime Context Notice */}
            {!isStandalone ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-border-control bg-card/[0.04] p-3 text-caption text-muted-foreground">
                <Info size={16} className="mt-0.5 shrink-0 text-primary-text" aria-hidden="true" />
                <p className="leading-relaxed">
                  <strong className="text-foreground">Web Browser Mode:</strong> You are accessing Cadence via web browser. To launch directly from your home screen with full-screen display and offline resilience, install Cadence as a PWA or download the native Android APK.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-border-control bg-card/[0.04] p-3 text-caption text-muted-foreground">
                <Info size={16} className="mt-0.5 shrink-0 text-primary-text" aria-hidden="true" />
                <p className="leading-relaxed">
                  <strong className="text-foreground">Standalone App Mode:</strong> Running as an installed application. If an Android update displays a top browser bar, clear Chrome's browsing cache (<code className="font-mono text-caption text-foreground">Settings → Privacy → Clear Cached Images</code>) to restore immersive full-screen display.
                </p>
              </div>
            )}

            {/* Changelog Accordion */}
            <div className="border-t border-border-control/60 pt-3">
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setChangelogOpen(!changelogOpen);
                }}
                className="flex w-full items-center justify-between py-1 text-caption font-semibold text-foreground hover:text-primary-text transition-colors tap-target-expand"
              >
                <span className="flex items-center gap-2">
                  <Sparkles size={14} className="text-primary-text" />
                  <span>What's New &amp; Release History</span>
                </span>
                {changelogOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {changelogOpen && (
                <div className="mt-3 space-y-4 pt-1 animate-in fade-in duration-base">
                  {APP_VERSION_INFO.changelogHistory.map((release, i) => (
                    <div key={i} className="rounded-xl border border-border-control bg-card/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-caption font-bold text-foreground">{release.version}</span>
                        <span className="font-mono text-caption text-muted-foreground">{release.date}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-caption text-muted-foreground list-disc list-inside">
                        {release.items.map((item, j) => (
                          <li key={j} className="leading-relaxed">{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Data Export & Backup */}
          <section className="rounded-xl border border-border-control bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-border-control/60">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Download size={18} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-headline font-bold text-foreground">Export Data</h2>
                <p className="text-caption text-muted-foreground">
                  Export all tasks, completed logs, and metadata as a portable JSON backup.
                </p>
              </div>
            </div>

            <SettingsRow
              label="Portable backup"
              description="Downloads a JSON file you own. Nothing is sent anywhere."
              testId="settings-row-export"
            >
              <button
                type="button"
                onClick={handleExportData}
                disabled={exporting}
                aria-busy={exporting || undefined}
                data-testid="button-export-json"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-4 text-caption font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Download size={14} aria-hidden="true" />
                <span>{exporting ? 'Preparing…' : 'Export JSON'}</span>
              </button>
            </SettingsRow>
          </section>

          {/* Architecture & Security Badge */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-caption text-muted-foreground">
            <ShieldCheck size={16} className="shrink-0 text-status-success-text" aria-hidden="true" />
            <span>
              Secured with Clerk Third-Party Auth &amp; Supabase PostgreSQL Row-Level Security (RLS).
              All data is strictly isolated per user.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
