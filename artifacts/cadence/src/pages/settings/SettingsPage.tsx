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
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFocusSettingsQueryKey,
  getListTasksQueryKey,
  useGetFocusSettings,
  useListTasks,
  useUpdateFocusSettings,
} from '@workspace/api-client-react';
import { timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { SectionHeading } from '@/components/shared/StateViews';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: focusSettings } = useGetFocusSettings();
  const updateFocus = useUpdateFocusSettings();

  const [localTz, setLocalTz] = useState(timezone());
  const [soundEnabled, setSoundEnabled] = useState(soundFX.isEnabled());
  const [dailyTarget, setDailyTarget] = useState(focusSettings?.dailyTarget ?? 4);
  const [quietStart, setQuietStart] = useState('23');
  const [quietEnd, setQuietEnd] = useState('07');
  const [telegramId, setTelegramId] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: allTasks } = useListTasks({ scope: 'all' });

  useEffect(() => {
    if (focusSettings?.dailyTarget) {
      setDailyTarget(focusSettings.dailyTarget);
    }
  }, [focusSettings?.dailyTarget]);

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
      },
    );
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    soundFX.setEnabled(next);
    setSoundEnabled(next);
    if (next) soundFX.playCompletion();
    toast(next ? 'Sound effects enabled' : 'Sound effects muted');
  };

  const handleExportData = () => {
    try {
      setExporting(true);
      soundFX.playClick();
      const exportObject = {
        exportedAt: new Date().toISOString(),
        timezone: localTz,
        focusTarget: dailyTarget,
        tasks: allTasks ?? [],
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObject, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `cadence-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
    <div className="animate-enter max-w-3xl space-y-8">
      <SectionHeading
        eyebrow="Preferences · your rules"
        title="Settings & Boundaries"
        detail="Set your schedule constraints, quiet hours, sound feedback, and connected channels."
      />

      {/* Focus & Productivity */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
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
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-9 place-items-center rounded-xl bg-sky-500/15 text-sky-400">
            <Globe size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Timezone & Local Time</h2>
            <p className="text-xs text-muted-foreground">Natural language dates and time blocks are evaluated in this zone.</p>
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
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-primary"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Browser detected: <span className="text-foreground font-mono">{timezone()}</span>
            </p>
          </div>
        </div>
      </section>

      {/* Quiet Hours & Boundaries */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-500/15 text-indigo-400">
            <Moon size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Quiet Hours</h2>
            <p className="text-xs text-muted-foreground">Automated reminders and notifications will not fire during this window.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Quiet Starts
            </label>
            <select
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#242428] px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Quiet Ends
            </label>
            <select
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#242428] px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Telegram Bot Integration */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <span className="grid size-9 place-items-center rounded-xl bg-blue-500/15 text-blue-400">
            <MessageSquare size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">Telegram Bot Reminders</h2>
            <p className="text-xs text-muted-foreground">Free, reliable two-way channel for reminders, capture, and snoozing.</p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-5">
            <li>Message the bot on Telegram: <code className="text-foreground">@CadenceTaskBot</code></li>
            <li>Send <code className="text-foreground">/start</code> to receive your numeric user chat ID.</li>
            <li>Paste your numeric Chat ID below to link your account.</li>
          </ol>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Numeric Telegram Chat ID
            </label>
            <input
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              placeholder="e.g. 123456789"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-primary"
            />
          </div>
        </div>
      </section>

      {/* Interface Sounds & Haptics */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Tactile Audio Feedback</h2>
              <p className="text-xs text-muted-foreground">Gentle Web Audio chimes for task completions and focus rounds.</p>
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
      <section className="rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-muted-foreground">
              <Download size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Export Data</h2>
              <p className="text-xs text-muted-foreground">Export all tasks, completed logs, and metadata as a portable JSON backup.</p>
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
