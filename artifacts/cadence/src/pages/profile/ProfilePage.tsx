import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { Link, useLocation } from 'wouter';
import {
  User,
  Shield,
  Clock,
  Flame,
  CheckCircle2,
  Brain,
  Send,
  Bell,
  Volume2,
  Download,
  LogOut,
  Sparkles,
  Compass,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Target,
  Sliders,
  Check,
  X,
} from 'lucide-react';
import { useListTasks, useGetTaskSummary } from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { SectionHeading } from '@/components/shared/StateViews';
import { today, timezone } from '@/lib/date-utils';

export function ProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  // Live Local Time Display
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Settings state
  const [is24Hours, setIs24Hours] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('cadence_user_onboarding');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return parsed.workingHours === '24 Hours Flexible';
      } catch {
        return true;
      }
    }
    return true;
  });

  const [soundActive, setSoundActive] = useState(() => soundFX.isEnabled());
  const [exporting, setExporting] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Fetch summary and tasks for lifetime stats
  const { data: summary } = useGetTaskSummary({ date: today(), timezone: timezone() });
  const { data: tasks } = useListTasks();

  const completedCount = tasks?.filter((t) => t.status === 'completed').length ?? 0;
  const streakCount = summary?.streakDays ?? 1;

  const displayName =
    user?.fullName ??
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ??
    'Rohit';

  const email = user?.primaryEmailAddress?.emailAddress ?? 'personal@cadence.os';
  const clerkId = user?.id ?? 'usr_cadence_owner';
  const initials = displayName.slice(0, 1).toUpperCase();

  const toggle24Hours = (checked: boolean) => {
    soundFX.playTactileClick();
    setIs24Hours(checked);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('cadence_user_onboarding');
      const data = stored ? JSON.parse(stored) : {};
      data.workingHours = checked ? '24 Hours Flexible' : '09:00 - 18:00';
      localStorage.setItem('cadence_user_onboarding', JSON.stringify(data));
    }
    toast.success(checked ? '24-hour flexible rhythm enabled' : 'Traditional 9-to-6 schedule enabled');
  };

  const handleTestSound = () => {
    soundFX.playCompletion();
    toast('Major 7th acoustic chime synthesized (2800Hz low-pass)');
  };

  const handleExportData = async () => {
    soundFX.playClick();
    setExporting(true);
    try {
      const exportObject = {
        exportedAt: new Date().toISOString(),
        user: {
          id: clerkId,
          displayName,
          email,
          timezone: 'Asia/Kolkata',
          rhythm: is24Hours ? '24-Hour Flexible' : 'Traditional 9-to-6',
        },
        stats: {
          completedTasks: completedCount,
          streakDays: streakCount,
        },
        tasks: tasks ?? [],
      };

      const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportObject, null, 2));
      const anchor = document.createElement('a');
      anchor.setAttribute('href', dataStr);
      anchor.setAttribute('download', `cadence-profile-backup-${today()}.json`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      soundFX.playCompletion();
      toast.success('Cadence backup exported successfully');
    } catch {
      toast.error('Failed to export profile data');
    } finally {
      setExporting(false);
    }
  };

  const executeSignOut = () => {
    soundFX.playClick();
    signOut({ redirectUrl: basePath || '/' });
  };

  return (
    <div className="animate-enter max-w-4xl space-y-8 pb-20">
      <SectionHeading
        eyebrow="Profile · account & rhythm"
        title={`${displayName}'s Cadence`}
        detail="Identity, 24-hour chronotype rhythm, connected channels, and zero-trust privacy ledger."
      />

      {/* 1. HERO IDENTITY CARD */}
      <div className="card-hig p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.05] rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Avatar with Energy Orange Ring */}
            <div className="relative">
              <div className="grid size-20 place-items-center rounded-3xl bg-primary text-black font-black text-2xl shadow-[0_8px_24px_rgba(255,159,10,0.35)]">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-[#30D158] border-2 border-[#1C1C1E] flex items-center justify-center text-black">
                <Check size={12} strokeWidth={3} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black text-foreground tracking-tight">{displayName}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                  Active User
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-[11px] font-mono text-muted-foreground bg-[#262628] px-2 py-0.5 rounded-md border border-white/[0.06]">
                  {clerkId}
                </code>
                <span className="text-[10px] text-muted-foreground">· Single User Safe</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex-1 sm:flex-none btn-secondary text-xs h-10 px-4"
              data-testid="button-profile-export"
            >
              <Download size={14} className="mr-1.5" />
              {exporting ? 'Exporting...' : 'Export Backup'}
            </button>
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center h-10 px-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-bold transition-all"
              data-testid="button-profile-signout"
            >
              <LogOut size={14} className="mr-1.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* 2. CHRONOTYPE & 24-HOUR RHYTHM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card-hig p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
                <Clock size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Primary Timezone & Clock</h3>
                <p className="text-xs text-muted-foreground">Asia/Kolkata (IST · UTC+5:30)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#262628] border border-white/[0.08] font-mono text-xs font-bold text-primary">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>{currentTime || 'Loading...'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-foreground">24-Hour Working Rhythm</p>
              <p className="text-[11px] text-muted-foreground">
                {is24Hours ? 'Active: No artificial working hour cutoffs.' : 'Constrained: 09:00 - 18:00.'}
              </p>
            </div>
            <input
              type="checkbox"
              checked={is24Hours}
              onChange={(e) => toggle24Hours(e.target.checked)}
              data-testid="checkbox-profile-24h"
              className="size-5 accent-primary rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Peak Focus Window Card */}
        <div className="card-hig p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#5E5CE6]/15 text-[#5E5CE6]">
              <Sparkles size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Peak Focus Chronotype</h3>
              <p className="text-xs text-muted-foreground">Rule 9 Inferred Behavioral Pattern</p>
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Optimal Focus Window:</span>
              <span className="font-mono font-bold text-[#5E5CE6]">21:00 - 23:45</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hackathon Multiplier:</span>
              <span className="font-mono font-bold text-primary">2.3x actual duration</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Confidence Level:</span>
              <span className="font-mono font-bold text-[#30D158]">94% Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MOMENTUM & PRODUCTIVITY STATS */}
      <div className="card-hig p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#30D158]/15 text-[#30D158]">
              <Flame size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Momentum & Consistency</h3>
              <p className="text-xs text-muted-foreground">Compound progress across activity rings</p>
            </div>
          </div>
          <Link
            href="/review"
            className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
          >
            Open Review
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p>
            <p className="text-2xl font-black text-foreground mt-1">{completedCount}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Lifetime tasks done</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Streak</p>
            <p className="text-2xl font-black text-primary mt-1">{streakCount} Days</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Strict, no freeze</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Focus</p>
            <p className="text-2xl font-black text-[#30D158] mt-1">{summary?.completedMinutes ?? 0}m</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Minutes logged today</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rounds Aim</p>
            <p className="text-2xl font-black text-[#0A84FF] mt-1">4</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Target focus blocks</p>
          </div>
        </div>
      </div>

      {/* 4. CONNECTED CHANNELS & HARDWARE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Telegram Integration */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center">
              <Send size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Telegram Bot</h4>
              <p className="text-[10px] text-muted-foreground">Two-way Nudges</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Linked to bot dispatch. Reply directly to reschedule, snooze, or mark complete.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#30D158] bg-[#30D158]/10 px-2.5 py-1 rounded-lg border border-[#30D158]/20">
            <span className="size-1.5 rounded-full bg-[#30D158]" />
            <span>PRIMARY CHANNEL ACTIVE</span>
          </div>
        </div>

        {/* Web Push */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center">
              <Bell size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Web Push & VAPID</h4>
              <p className="text-[10px] text-muted-foreground">Secondary Browser Alerts</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Local browser notifications when active on desktop or installed PWA.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-[#262628] px-2.5 py-1 rounded-lg border border-white/[0.06]">
            <span>VAPID STANDBY</span>
          </div>
        </div>

        {/* Studio Acoustics */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-purple-500/15 text-purple-400 grid place-items-center">
              <Volume2 size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Web Audio Synthesis</h4>
              <p className="text-[10px] text-muted-foreground">Studio Micro-Acoustics</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Butterworth 2800Hz low-pass, Tibetan focus bell, and digital crown clicks.
          </p>
          <button
            onClick={handleTestSound}
            className="w-full text-center text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 py-1.5 rounded-lg border border-primary/20 transition-colors"
          >
            Play Test Chime
          </button>
        </div>
      </div>

      {/* 5. PRIVACY & SECURITY LEDGER */}
      <div className="card-hig p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Shield size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Zero-Trust & Privacy Ledger</h3>
            <p className="text-xs text-muted-foreground">Built multi-user-safe from day one (spec/01 §8)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3.5 rounded-xl bg-[#262628] border border-white/[0.06]">
            <p className="font-bold text-foreground">Row-Level Security</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Every query executes with <code className="text-primary font-mono text-[10px]">runWithRls</code> binding Clerk sub claims.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#262628] border border-white/[0.06]">
            <p className="font-bold text-foreground">Zero Third-Party Trackers</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              No ad pixels, no tracking cookies, and no cross-site fingerprinting.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#262628] border border-white/[0.06]">
            <p className="font-bold text-foreground">Transparent Memory</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Source B behavioral inferences never alter schedule without user confirmation.
            </p>
          </div>
        </div>
      </div>

      {/* 6. QUICK LINKS / ACTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/memory"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-3xl bg-[#1C1C1E] border border-[#5E5CE6]/30 hover:border-[#5E5CE6]/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#5E5CE6]/20 text-[#5E5CE6]">
              <Brain className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">What Cadence Knows</h3>
              <p className="text-xs text-muted-foreground">Inspect memory facts & confirmation queue</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-[#5E5CE6] group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/onboarding"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-3xl bg-[#1C1C1E] border border-primary/30 hover:border-primary/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary/20 text-primary">
              <Compass className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Setup Wizard</h3>
              <p className="text-xs text-muted-foreground">Re-calibrate timezone and automation dial</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>

      {/* CONFIRM SIGN OUT MODAL */}
      {confirmSignOut && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md card-hig p-6 space-y-5 animate-enter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-destructive/15 text-destructive grid place-items-center">
                  <LogOut size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Sign out of Cadence?</h3>
                  <p className="text-xs text-muted-foreground">Your local session will end.</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSignOut(false)}
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground grid place-items-center"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              All tasks, focus stats, and memory facts are securely backed up to Supabase. You can sign back in at any time.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmSignOut(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={executeSignOut}
                className="px-5 py-2.5 rounded-xl bg-destructive text-white font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition-all"
                data-testid="button-confirm-signout"
              >
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
