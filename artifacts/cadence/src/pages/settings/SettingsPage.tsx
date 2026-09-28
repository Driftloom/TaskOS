import { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Clock,
  Download,
  Globe,
  MessageSquare,
  Moon,
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

  const [localTz, setLocalTz] = useState(timezone());
  const [soundEnabled, setSoundEnabled] = useState(soundFX.isEnabled());
  const [dailyTarget, setDailyTarget] = useState(focusSettings?.dailyTarget ?? 4);
  const [is24Hours, setIs24Hours] = useState(true);
  const [workStart, setWorkStart] = useState(9);
  const [workEnd, setWorkEnd] = useState(18);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);
  const [exporting, setExporting] = useState(false);

  const { data: allTasks } = useListTasks({ scope: 'all' });

  useEffect(() => {
    if (focusSettings?.dailyTarget) {
      setDailyTarget(focusSettings.dailyTarget);
    }
  }, [focusSettings?.dailyTarget]);

  // Load stored preferences into the form once they arrive.
  useEffect(() => {
    if (!notifSettings) return;
    setLocalTz(notifSettings.timezone);
    setIs24Hours(notifSettings.flexible24h);
    setWorkStart(notifSettings.workStart);
    setWorkEnd(notifSettings.workEnd);
    setQuietStart(notifSettings.quietStart);
    setQuietEnd(notifSettings.quietEnd);
  }, [notifSettings]);

  const handleSaveFocus = () => {
    soundFX.playClick();
    updateFocus.mutate(
      { data: { dailyTarget } },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          queryClient.invalidateQueries({ queryKey: getGetFocusSettingsQueryKey() });
          toast.success('Daily focus target updated');
        },
        onError: () => toast.error('Could not save the focus target'),
      },
    );
  };

  const saveNotif = (patch: Parameters<typeof updateNotif.mutate>[0]['data']) => {
    updateNotif.mutate(
      { data: patch },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          queryClient.invalidateQueries({
            queryKey: getGetNotificationSettingsQueryKey(),
          });
        },
        onError: () => {
          toast.error('Could not save that preference');
          // Re-sync from the server so the UI never shows an unsaved value.
          queryClient.invalidateQueries({
            queryKey: getGetNotificationSettingsQueryKey(),
          });
        },
      },
    );
  };

  const toggle24Hours = (checked: boolean) => {
    soundFX.playTactileClick();
    setIs24Hours(checked);
    saveNotif({ flexible24h: checked });
    toast(checked ? '24-hour flexible rhythm enabled' : 'Custom work hours active');
  };

  const handleSaveTimezone = () => {
    soundFX.playClick();
    saveNotif({ timezone: localTz });
    toast.success('Timezone saved');
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
        timezone: localTz,
        flexible24h: is24Hours,
        workStart,
        workEnd,
        quietStart,
        quietEnd,
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
        eyebrow="Preferences · your rules"
        title="Settings & Boundaries"
        detail="Set your schedule constraints, 24-hour rhythm, sound feedback, and connected channels."
      />

      {/* Quick Jump Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/memory"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-2xl bg-[#1C1C1E] border border-[#7A78FF]/30 hover:border-[#7A78FF]/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#7A78FF]/20 text-[#7A78FF]">
              <Brain className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">What Cadence Knows</h3>
              <p className="text-xs text-muted-foreground">Memory facts & scheduling rules</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-[#7A78FF] group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/onboarding"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-2xl bg-[#1C1C1E] border border-[#0A84FF]/30 hover:border-[#0A84FF]/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#0A84FF]/20 text-[#0A84FF]">
              <Compass className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Setup Wizard</h3>
              <p className="text-xs text-muted-foreground">Re-run 3-step onboarding flow</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-[#0A84FF] group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>

      {/* 24-Hour Work Rhythm */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#0A84FF]/15 text-[#0A84FF]">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">24-Hour Working Rhythm</h2>
              <p className="text-xs text-muted-foreground">
                Flexible day & night scheduling with no artificial cutoffs.
              </p>
            </div>
          </div>

          <input
            type="checkbox"
            checked={is24Hours}
            disabled={updateNotif.isPending}
            onChange={(e) => toggle24Hours(e.target.checked)}
            className="size-5 accent-[#0A84FF] rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        {!is24Hours && (
          <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap items-end gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Workday starts
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={workStart}
                onChange={(e) => setWorkStart(Number(e.target.value))}
                onBlur={() => saveNotif({ workStart })}
                className="h-10 w-24 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm font-mono outline-none focus:border-primary text-foreground"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Workday ends
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={workEnd}
                onChange={(e) => setWorkEnd(Number(e.target.value))}
                onBlur={() => saveNotif({ workEnd })}
                className="h-10 w-24 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-sm font-mono outline-none focus:border-primary text-foreground"
              />
            </div>
            <p className="text-[11px] text-muted-foreground flex-1 min-w-[180px]">
              Hours are 0&ndash;23 in your timezone and may wrap past midnight.
            </p>
          </div>
        )}
      </section>

      {/* Focus & Productivity */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Target size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Daily Focus Target</h2>
            <p className="text-xs text-muted-foreground">Number of intentional rounds aimed for each day.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundFX.playClick();
                setDailyTarget((prev) => Math.max(1, prev - 1));
              }}
              className="grid size-10 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground active:scale-95"
            >
              -
            </button>
            <span className="w-20 text-center font-mono text-lg font-extrabold text-foreground">
              {dailyTarget} {dailyTarget === 1 ? 'round' : 'rounds'}
            </span>
            <button
              onClick={() => {
                soundFX.playClick();
                setDailyTarget((prev) => Math.min(20, prev + 1));
              }}
              className="grid size-10 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground active:scale-95"
            >
              +
            </button>
          </div>

          <button
            onClick={handleSaveFocus}
            disabled={updateFocus.isPending || dailyTarget === focusSettings?.dailyTarget}
            className="min-h-[40px] rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow transition-all hover:brightness-110 disabled:opacity-40"
          >
            {updateFocus.isPending ? 'Saving…' : 'Save target'}
          </button>
        </div>
      </section>

      {/* Timezone & Wall-clock Hours */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
            <Globe size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Timezone & Local Time</h2>
            <p className="text-xs text-muted-foreground">
              Natural language dates and time blocks are evaluated in this zone.
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              IANA Timezone Identifier
            </label>
            <input
              value={localTz}
              onChange={(e) => setLocalTz(e.target.value)}
              onBlur={handleSaveTimezone}
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-primary text-foreground"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Browser detected: <span className="text-foreground font-mono">{timezone()}</span>
              {' · '}
              {notifSettings ? 'saved' : 'not saved yet'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Quiet hours start
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={quietStart}
                onChange={(e) => setQuietStart(Number(e.target.value))}
                onBlur={() => saveNotif({ quietStart })}
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-primary text-foreground"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Quiet hours end
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={quietEnd}
                onChange={(e) => setQuietEnd(Number(e.target.value))}
                onBlur={() => saveNotif({ quietEnd })}
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-primary text-foreground"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Due reminders wait out the quiet window instead of waking you. Start equals end
            disables it.
          </p>
        </div>
      </section>

      {/* Hermes-Style Messaging & Gateway Integrations */}
      <MessagingIntegrationsView />

      {/* Interface Sounds & Haptics */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Tactile Audio Feedback</h2>
              <p className="text-xs text-muted-foreground">
                Studio-grade Web Audio synthesis for completions, focus rounds, and clicks.
              </p>
            </div>
          </div>

          <button
            onClick={toggleSound}
            className={`min-h-[38px] rounded-xl px-4 text-xs font-bold transition-all ${
              soundEnabled
                ? 'bg-primary text-primary-foreground shadow'
                : 'border border-white/[0.1] text-muted-foreground hover:bg-white/10'
            }`}
          >
            {soundEnabled ? 'Enabled' : 'Muted'}
          </button>
        </div>
      </section>

      {/* Data Export & Backup */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-muted-foreground">
              <Download size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Export Data</h2>
              <p className="text-xs text-muted-foreground">
                Export all tasks, completed logs, and metadata as a portable JSON backup.
              </p>
            </div>
          </div>

          <button
            onClick={handleExportData}
            disabled={exporting}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-xs font-bold text-foreground hover:bg-white/10 transition-colors"
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </section>

      {/* Architecture & Security Badge */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3 text-xs text-muted-foreground">
        <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
        <span>
          Secured with Clerk Third-Party Auth & Supabase PostgreSQL Row-Level Security (RLS). All data is strictly isolated per user.
        </span>
      </div>
    </div>
  );
}
export default SettingsPage;
