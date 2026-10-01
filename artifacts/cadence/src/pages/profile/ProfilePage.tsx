import { useState, useEffect, useMemo } from 'react';
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
import {
  useListTasks,
  useGetTaskSummary,
  useGetMomentum,
  useListMemoryFacts,
  useGetIntegrationsStatus,
  useGetNotificationSettings,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { SectionHeading } from '@/components/shared/StateViews';
import { today, timezone } from '@/lib/date-utils';

export function ProfilePage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  // Fetch summary and tasks for lifetime stats
  const { data: summary } = useGetTaskSummary({ date: today(), timezone: timezone() });
  const { data: tasks } = useListTasks();
  // streakDays lives on Momentum, not TaskSummary.
  const { data: momentum } = useGetMomentum({ date: today(), timezone: timezone() });
  // Real learned patterns + real channel state. Previously this card showed
  // hardcoded numbers (a 2.3x multiplier, a 21:00-23:45 window, "PRIMARY
  // CHANNEL ACTIVE") that were copied from a mock seed array.
  const { data: memory } = useListMemoryFacts({ archived: false });
  const { data: telegramStatus } = useGetIntegrationsStatus();
  const { data: notificationSettings } = useGetNotificationSettings();

  const memoryFacts = useMemo(() => memory?.facts ?? [], [memory]);
  // The user's configured timezone drives the clock; the browser's zone is
  // only a fallback before settings load.
  const displayTimeZone = notificationSettings?.timezone ?? timezone();

  // Live Local Time Display
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: displayTimeZone,
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
  }, [displayTimeZone]);

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

  const completedCount = tasks?.filter((t) => t.status === 'completed').length ?? 0;
  const streakCount = momentum?.streakDays ?? 0;

  // No invented identity: a signed-in Clerk user always has an id, and
  // inventing "Rohit" / "personal@cadence.os" / "usr_cadence_owner" would
  // render a fabricated account on a real screen.
  const displayName =
    user?.fullName ??
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ??
    'Signed-in user';

  const email = user?.primaryEmailAddress?.emailAddress ?? 'No email on file';
  const clerkId = user?.id ?? 'unknown';
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
          timezone: displayTimeZone,
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
              <div className="grid size-20 place-items-center rounded-2xl bg-primary text-primary-foreground font-black text-2xl shadow-[0_8px_24px_rgba(255,159,10,0.35)]">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-success border-2 border-card flex items-center justify-center text-primary-foreground">
                <Check size={12} strokeWidth={3} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black text-foreground tracking-tight">{displayName}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-primary/15 text-primary-text border border-primary/30">
                  Active User
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
              <div className="flex items-center gap-2 mt-2">
                <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border-control">
                  {clerkId}
                </code>
                <span className="text-xs text-muted-foreground">· Single User Safe</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex-1 sm:flex-none btn-secondary text-xs h-11 px-4"
              data-testid="button-profile-export"
            >
              <Download size={14} className="mr-1.5" />
              {exporting ? 'Exporting...' : 'Export Backup'}
            </button>
            {/* WCAG 1.4.11: the boundary of a control has to reach 3:1 against
                its own surface. `border-destructive/30` composited to 1.51:1 in
                dark and 1.42:1 in light (measured), and a solid `destructive`
                is still only 2.997:1 in light, because tokens.json gives
                `color.destructive` the SAME hsl(4 100% 61%) for light and dark.
                `--status-danger-text` is the theme-aware text-safe danger token
                (a brighter red in dark, a deeper one in light), so the same
                class clears 3:1 either side -- measured 4.49 dark / 4.73 light. */}
            <button
              onClick={() => setConfirmSignOut(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center h-11 px-4 rounded-xl border border-status-danger-text bg-destructive/10 text-foreground hover:bg-destructive/20 text-xs font-bold transition-all"
              data-testid="button-profile-signout"
            >
              {/* The LABEL is `text-foreground`, not a red: measured on this
                  button's own surface, `text-destructive` is 2.997:1 in BOTH
                  themes, and even `--status-danger-text` is 4.49:1 in dark --
                  0.01 short of the 4.5:1 SC 1.4.3 wants at this label's
                  rendered 16px/400. No red token clears 4.5:1 on a 10%-tinted
                  destructive fill, so the hue moves to the places that carry
                  semantics rather than legibility: the fill, the 4.49:1
                  boundary, the LogOut glyph, and the confirm dialog. */}
              <LogOut size={14} className="mr-1.5" aria-hidden="true" />
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
              <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Clock size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Primary Timezone & Clock</h3>
                <p className="text-xs text-muted-foreground">
                  {displayTimeZone}
                  {notificationSettings
                    ? ` (${Intl.DateTimeFormat().resolvedOptions().timeZone === displayTimeZone ? 'your setting' : 'set in Settings'})`
                    : ' (from this device)'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted border border-border-control font-mono text-xs font-bold text-primary-text">
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>{currentTime || 'Loading...'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border-control flex items-center justify-between gap-4">
            <div>
              {/* WCAG 4.1.2: the rhythm checkbox was the only control on this
                  card and it had NO label element and no aria-label, so it had
                  no accessible name at all. The visible title is now the real
                  <label>, which also makes the whole caption tappable. */}
              <label
                htmlFor="profile-rhythm-24h"
                className="block text-xs font-bold text-foreground cursor-pointer"
              >
                24-Hour Working Rhythm
              </label>
              <p className="text-xs text-muted-foreground" id="profile-rhythm-24h-state">
                {is24Hours ? 'Active: No artificial working hour cutoffs.' : 'Constrained: 09:00 - 18:00.'}
              </p>
            </div>
            {/* The 20px native box is kept as authored and grown to 44x44 by
                tap-target-expand. Dense-cluster check: the only interactive
                neighbour is nothing -- the caption to the left is plain text
                and the 24px card padding absorbs the 12px of horizontal
                overhang on the right (verified in the browser, not assumed). */}
            <input
              id="profile-rhythm-24h"
              type="checkbox"
              checked={is24Hours}
              onChange={(e) => toggle24Hours(e.target.checked)}
              aria-describedby="profile-rhythm-24h-state"
              data-testid="checkbox-profile-24h"
              className="size-5 shrink-0 accent-primary rounded cursor-pointer tap-target-expand"
            />
          </div>
        </div>

        {/* What Cadence Has Actually Learned */}
        <div className="card-hig p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-ai/15 text-ai-text">
              <Sparkles size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Learned Patterns</h3>
              <p className="text-xs text-muted-foreground">From your own focus and completion data</p>
            </div>
          </div>

          <div className="pt-2 border-t border-border-control space-y-2">
            {memoryFacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing learned yet. Patterns appear here after the nightly analysis has real
                completed tasks to work from.
              </p>
            ) : (
              memoryFacts.slice(0, 3).map((fact) => (
                <div key={fact.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground truncate">{fact.title}</span>
                  <span className="font-mono font-bold text-ai-text shrink-0">
                    {fact.rule9Multiplier != null
                      ? `${fact.rule9Multiplier}x`
                      : `${fact.confidence}%`}
                  </span>
                </div>
              ))
            )}
            <Link
              href="/memory"
              className="pt-1 inline-flex items-center gap-1 text-xs font-bold text-primary-text hover:underline tap-target-expand"
            >
              Review everything Cadence knows
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. MOMENTUM & PRODUCTIVITY STATS */}
      <div className="card-hig p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-success/15 text-status-success-text">
              <Flame size={18} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">Momentum & Consistency</h3>
              <p className="text-xs text-muted-foreground">Compound progress across activity rings</p>
            </div>
          </div>
          <Link
            href="/review"
            className="text-xs font-bold text-primary-text flex items-center gap-1 hover:underline tap-target-expand"
          >
            Open Review
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-muted border border-border-control">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Completed</p>
            <p className="text-2xl font-black text-foreground mt-1">{completedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Lifetime tasks done</p>
          </div>

          <div className="p-4 rounded-2xl bg-muted border border-border-control">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Streak</p>
            <p className="text-2xl font-black text-primary-text mt-1">{streakCount} Days</p>
            <p className="text-xs text-muted-foreground mt-0.5">Strict, no freeze</p>
          </div>

          <div className="p-4 rounded-2xl bg-muted border border-border-control">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Focus</p>
            <p className="text-2xl font-black text-status-success-text mt-1">{summary?.focusMinutes ?? 0}m</p>
            <p className="text-xs text-muted-foreground mt-0.5">Minutes logged today</p>
          </div>

          <div className="p-4 rounded-2xl bg-muted border border-border-control">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Rounds Aim</p>
            <p className="text-2xl font-black text-accent mt-1">{momentum?.roundTarget ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Target focus blocks</p>
          </div>
        </div>
      </div>

      {/* 4. CONNECTED CHANNELS & HARDWARE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Telegram Integration */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-accent/15 text-accent grid place-items-center">
              <Send size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Telegram Bot</h4>
              <p className="text-xs text-muted-foreground">Two-way Nudges</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {telegramStatus?.telegram.configured
              ? `Linked to bot dispatch as @${telegramStatus.telegram.botUsername ?? 'your bot'}. Reply directly to reschedule, snooze, or mark complete.`
              : 'No Telegram bot is connected yet. Connect one to receive nudges and reply to them directly.'}
          </p>
          {telegramStatus?.telegram.configured ? (
            <div className="flex items-center gap-1.5 text-xs font-mono text-status-success-text bg-success/10 px-2.5 py-1 rounded-lg border border-success/20">
              <span className="size-1.5 rounded-full bg-success" />
              <span>PRIMARY CHANNEL ACTIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border-control">
              <span>NOT CONNECTED</span>
            </div>
          )}
        </div>

        {/* Web Push */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-caution/15 text-caution grid place-items-center">
              <Bell size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Web Push & VAPID</h4>
              <p className="text-xs text-muted-foreground">Secondary Browser Alerts</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Not available yet. There is no web-push delivery in this build, so this card will not
            claim to be standing by.
          </p>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border-control">
            <span>NOT IMPLEMENTED</span>
          </div>
        </div>

        {/* Studio Acoustics */}
        <div className="card-hig p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-ai/15 text-ai-text grid place-items-center">
              <Volume2 size={15} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Web Audio Synthesis</h4>
              <p className="text-xs text-muted-foreground">Studio Micro-Acoustics</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Butterworth 2800Hz low-pass, Tibetan focus bell, and digital crown clicks.
          </p>
          {/* WCAG 1.4.11: `border-primary/20` measured 1.49:1 in dark and
              1.15:1 in light. A solid `border-primary` does NOT fix light --
              light `--primary` is still the bright orange hsl(36 100% 50%),
              which composites to 1.97:1 on this button's own light surface.
              `--primary-text` is the theme-aware text-safe accent, and it is
              what this label already uses, so the boundary is drawn in the
              same token the text is: 6.91 dark / 5.33 light. 38px -> 44px too:
              `py-1.5` left it two taps short of the AGENTS.md 44px floor, and
              this row holds no second control, so the box was raised rather
              than expanded. */}
          <button
            onClick={handleTestSound}
            className="w-full min-h-11 inline-flex items-center justify-center text-xs font-bold text-primary-text bg-primary/10 hover:bg-primary/20 rounded-lg border border-primary-text transition-colors"
          >
            Play Test Chime
          </button>
        </div>
      </div>

      {/* 5. PRIVACY & SECURITY LEDGER */}
      <div className="card-hig p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary-text">
            <Shield size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Zero-Trust & Privacy Ledger</h3>
            <p className="text-xs text-muted-foreground">Built multi-user-safe from day one (spec/system-requirements.md §4)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="p-3.5 rounded-xl bg-muted border border-border-control">
            <p className="font-bold text-foreground">Row-Level Security</p>
            <p className="text-xs text-muted-foreground mt-1">
              Every query executes with <code className="text-primary-text font-mono text-xs">runWithRls</code> binding Clerk sub claims.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-muted border border-border-control">
            <p className="font-bold text-foreground">Zero Third-Party Trackers</p>
            <p className="text-xs text-muted-foreground mt-1">
              No ad pixels, no tracking cookies, and no cross-site fingerprinting.
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-muted border border-border-control">
            <p className="font-bold text-foreground">Transparent Memory</p>
            <p className="text-xs text-muted-foreground mt-1">
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
          className="p-5 rounded-2xl bg-card border border-ai/30 hover:border-ai/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-ai/20 text-ai-text">
              <Brain className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">What Cadence Knows</h3>
              <p className="text-xs text-muted-foreground">Inspect memory facts & confirmation queue</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-ai-text group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Link
          href="/onboarding"
          onClick={() => soundFX.playClick()}
          className="p-5 rounded-2xl bg-card border border-primary/30 hover:border-primary/60 transition-all flex items-center justify-between group shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary/20 text-primary-text">
              <Compass className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Setup Wizard</h3>
              <p className="text-xs text-muted-foreground">Re-calibrate timezone and automation dial</p>
            </div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary-text group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>

      {/* CONFIRM SIGN OUT MODAL */}
      {confirmSignOut && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4">
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
              {/* WCAG 4.1.2 + 2.5.8: this was the only icon-only button on the
                  page with no accessible name at all (a bare <X size={16}/>),
                  and it offered a 32px target. `size-8` is deliberately kept
                  so the structural e2e selector still resolves it; the hit
                  area is grown to 44x44 by tap-target-expand. Dense-cluster
                  check: the modal is max-w-md with p-6, so the 22px of
                  expansion stays inside the padding and clears the title block
                  (measured 116px away) by a wide margin. */}
              <button
                onClick={() => setConfirmSignOut(false)}
                aria-label="Dismiss sign-out dialog"
                className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground grid place-items-center tap-target-expand"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              All tasks, focus stats, and memory facts are securely backed up to Supabase. You can sign back in at any time.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              {/* 40px -> 44px. `min-h-11` rather than tap-target-expand: the
                  neighbouring "Confirm Sign Out" is 152px wide, so the two
                  centres are ~127px apart and the row is not a dense cluster,
                  but matching the confirm button's height is also the better
                  visual answer than a taller invisible box. */}
              <button
                onClick={() => setConfirmSignOut(false)}
                className="min-h-11 inline-flex items-center px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={executeSignOut}
                /* min-h-11, not py-2.5: this is a destructive CONFIRM inside a dialog, and a
                   36px target for "Sign out for real" is not acceptable. Padding was
                   the only thing sizing it, which meant it silently shrank to 36px
                   the moment the `font: inherit` fix let text-xs finally apply --
                   which is the kind of coupling that makes a type fix look like a
                   layout regression. An explicit floor cannot drift like that. */
                  className="min-h-11 px-5 rounded-xl bg-destructive text-foreground font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition-all"
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
