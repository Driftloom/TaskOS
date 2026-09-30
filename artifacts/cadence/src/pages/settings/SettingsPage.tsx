import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Globe,
  ShieldCheck,
  Target,
  Volume2,
  VolumeX,
  Brain,
  Compass,
  Flame,
  ArrowRight,
} from 'lucide-react';
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
import { MessagingIntegrationsView } from './MessagingIntegrationsView';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: focusSettings } = useGetFocusSettings();
  const updateFocus = useUpdateFocusSettings();

  // Notification/rhythm preferences are server-owned. They were previously
  // local-only state that was never written anywhere, so a change here
  // vanished on reload and never reached the reschedule sweep.
  const { data: notifSettings } = useGetNotificationSettings();
  const updateNotif = useUpdateNotificationSettings();

  const [soundEnabled, setSoundEnabled] = useState(soundFX.isEnabled());
  const [dailyTarget, setDailyTarget] = useState(focusSettings?.dailyTarget ?? 4);
  const [focusSaved, setFocusSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  /**
   * P13: settings autosave (debounced ~600ms) with a quiet inline "Saved".
   * Each row owns its own draft, so one failing row never rolls back another.
   *
   * `committed` is memoised on purpose: useAutosave compares it by identity to
   * decide when the server moved. A fresh object every render would make it look
   * like the server changed on every keystroke and wipe the draft.
   */
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
  // Locked decision: the product defaults to 24-hour flexibility, and the
  // timezone defaults to whatever the browser reports. Both are adopted from the
  // server as soon as it answers.
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
    // Quiet hours allow start === end: the product documents that as "the window
    // is switched off", so TimeRangeControl is told allowEqual for this row.
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

  // P17.1: the quiet confirmation is transient.
  useEffect(() => {
    if (!focusSaved) return;
    const timer = setTimeout(() => setFocusSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [focusSaved]);

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

  return (
    <div className="animate-enter max-w-3xl space-y-8 pb-16">
      <SectionHeading
        eyebrow="Preferences -- your rules"
        title="Settings & Boundaries"
        detail="Set your schedule constraints, 24-hour rhythm, sound feedback, and connected channels."
      />

      {/* Quick Jump Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/memory"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-2xl bg-card border border-ai/30 hover:border-ai/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-ai/20 text-ai-text">
              <Brain className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">What Cadence Knows</h3>
              <p className="text-xs text-muted-foreground">Memory facts & scheduling rules</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-ai-text group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/onboarding"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-2xl bg-card border border-accent/30 hover:border-accent/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-accent/20 text-accent">
              <Compass className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Setup Wizard</h3>
              <p className="text-xs text-muted-foreground">Re-run 3-step onboarding flow</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>

      {/* 24-Hour Work Rhythm */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
            <Flame size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-headline text-foreground">24-Hour Working Rhythm</h2>
            <p className="text-caption text-muted-foreground">
              Flexible day &amp; night scheduling with no artificial cutoffs.
            </p>
          </div>
        </div>

        <div className="space-y-3">
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
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
              data-testid="settings-loading"
            />
          )}
        </div>
      </section>

      {/* Focus & Productivity */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-text">
            <Target size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-headline text-foreground">Daily Focus Target</h2>
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
                className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                className="inline-flex min-h-9 w-9 items-center justify-center rounded-lg border border-border-control bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={handleSaveFocus}
              disabled={updateFocus.isPending || dailyTarget === focusSettings?.dailyTarget}
              data-testid="button-save-focus-target"
              className="btn-primary inline-flex min-h-9 items-center rounded-lg px-3.5 text-caption font-bold disabled:opacity-50"
            >
              {updateFocus.isPending ? 'Saving…' : 'Save target'}
            </button>
          </div>
        </SettingsRow>
      </section>

      {/* Timezone & Wall-clock Hours */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
            <Globe size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-headline text-foreground">Timezone &amp; Local Time</h2>
            <p className="text-caption text-muted-foreground">
              Natural language dates and time blocks are evaluated in this zone.
            </p>
          </div>
        </div>

        <div className="space-y-3">
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
              <input
                id="settings-input-timezone"
                value={tz.value ?? ''}
                onChange={(event) => tz.setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    tz.saveNow();
                  }
                }}
                spellCheck={false}
                autoComplete="off"
                data-testid="input-timezone"
                className="h-11 w-full rounded-lg border border-border-control bg-card px-3 font-mono text-caption text-foreground outline-none"
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
              // Quiet hours keep the documented "start equals end disables the
              // window" behaviour, so an equal range is legal here.
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

      {/* Hermes-Style Messaging & Gateway Integrations */}
      <MessagingIntegrationsView />

      {/* Interface Sounds & Haptics */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
            {soundEnabled ? (
              <Volume2 size={18} aria-hidden="true" />
            ) : (
              <VolumeX size={18} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="text-headline text-foreground">Tactile Audio Feedback</h2>
            <p className="text-caption text-muted-foreground">
              Studio-grade Web Audio synthesis for completions, focus rounds, and clicks.
            </p>
          </div>
        </div>

        <SettingsRow
          label="Sound effects"
          description="This preference lives on this device only — it is not part of your synced settings."
          testId="settings-row-sound"
        >
          <button
            type="button"
            onClick={toggleSound}
            data-testid="button-toggle-sound"
            className={`inline-flex min-h-11 items-center rounded-lg px-4 text-caption font-bold transition-colors ${
              soundEnabled
                ? 'bg-primary text-primary-foreground'
                : 'border border-border-control text-muted-foreground hover:bg-muted'
            }`}
          >
            {soundEnabled ? 'Enabled' : 'Muted'}
          </button>
        </SettingsRow>
      </section>

      {/* Data Export & Backup */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Download size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-headline text-foreground">Export Data</h2>
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-control bg-card px-4 text-caption font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download size={14} aria-hidden="true" />
            <span>{exporting ? 'Preparing…' : 'Export JSON'}</span>
          </button>
        </SettingsRow>
      </section>

      {/* Architecture & Security Badge */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-caption text-muted-foreground">
        <ShieldCheck size={16} className="shrink-0 text-success" aria-hidden="true" />
        <span>
          Secured with Clerk Third-Party Auth &amp; Supabase PostgreSQL Row-Level Security (RLS).
          All data is strictly isolated per user.
        </span>
      </div>
    </div>
  );
}
export default SettingsPage;

