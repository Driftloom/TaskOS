import { useState } from 'react';
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
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

export function OnboardingPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Timezone & Rhythm (defaults to 24h flexible per user preference)
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [is24Hours, setIs24Hours] = useState(true);
  const [workStart, setWorkStart] = useState('00:00');
  const [workEnd, setWorkEnd] = useState('23:59');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('00:00');
  const [quietEnd, setQuietEnd] = useState('07:00');

  // Step 2: Automation Mode
  const [automationMode, setAutomationMode] = useState<'auto' | 'ask' | 'off'>('auto');
  const [rescheduleCap, setRescheduleCap] = useState(5);

  // Step 3: Notification Channels & Telegram
  const [telegramChatId, setTelegramChatId] = useState('');
  const [webPushEnabled, setWebPushEnabled] = useState(true);
  const [telegramVerified, setTelegramVerified] = useState(false);

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

  const handleComplete = () => {
    soundFX.playCelebration();
    // Persist settings locally
    const settings = {
      timezone,
      workingHours: is24Hours ? '24 Hours Flexible' : `${workStart} - ${workEnd}`,
      quietHours: quietHoursEnabled ? `${quietStart} - ${quietEnd}` : 'Disabled',
      automationMode,
      rescheduleCap,
      telegramChatId: telegramChatId.trim(),
      webPushEnabled,
      onboardingCompleted: true,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('cadence_user_onboarding', JSON.stringify(settings));
    }

    toast.success('Cadence setup complete!', {
      description: 'Your 24-hour rhythm and scheduling engine are primed.',
    });

    setLocation('/today');
  };

  const handleVerifyTelegram = () => {
    if (!telegramChatId.trim()) {
      toast.error('Please enter your numeric Telegram Chat ID');
      return;
    }
    soundFX.playCompletion();
    setTelegramVerified(true);
    toast.success('Telegram Bot linked successfully!', {
      description: `Linked to Chat ID ${telegramChatId}. You will receive two-way nudges.`,
    });
  };

  return (
    <div className="min-h-[85dvh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#1C1C1E] border border-white/[0.08] rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 animate-enter">
        {/* Progress Stepper */}
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-6">
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#FF9F0A]">
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
                    ? 'bg-[#FF9F0A] scale-125'
                    : step > s
                    ? 'bg-[#30D158]'
                    : 'bg-[#2C2C2E]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1 Content */}
        {step === 1 && (
          <div className="space-y-6 animate-enter">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Globe className="size-4 text-[#FF9F0A]" />
                Primary Timezone (IANA)
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-2 w-full px-4 py-3 rounded-2xl bg-[#262628] border border-white/[0.08] text-foreground text-sm focus:outline-none focus:border-[#FF9F0A]"
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
            <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Flame className="size-5 text-[#FF9F0A]" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">24-Hour Flexible Rhythm</h4>
                    <p className="text-xs text-muted-foreground">
                      No artificial working hour cutoffs. Schedule blocks anytime day or night.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={is24Hours}
                  onChange={(e) => setIs24Hours(e.target.checked)}
                  className="size-5 accent-[#FF9F0A] rounded cursor-pointer"
                />
              </div>

              {!is24Hours && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                  <div>
                    <label className="text-xs text-muted-foreground">Work Starts</label>
                    <input
                      type="time"
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-[#1C1C1E] border border-white/[0.08] text-foreground text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Work Ends</label>
                    <input
                      type="time"
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-[#1C1C1E] border border-white/[0.08] text-foreground text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Quiet Hours */}
            <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Moon className="size-5 text-[#5E5CE6]" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Quiet Hours Suppression</h4>
                    <p className="text-xs text-muted-foreground">
                      Suppress non-urgent reminders during sleep or downtime.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                  className="size-5 accent-[#5E5CE6] rounded cursor-pointer"
                />
              </div>

              {quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                  <div>
                    <label className="text-xs text-muted-foreground">Quiet Starts</label>
                    <input
                      type="time"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-[#1C1C1E] border border-white/[0.08] text-foreground text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Quiet Ends</label>
                    <input
                      type="time"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-[#1C1C1E] border border-white/[0.08] text-foreground text-xs"
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
                <Sliders className="size-4 text-[#FF9F0A]" />
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
                        ? 'bg-[#FF9F0A]/10 border-[#FF9F0A] shadow-md'
                        : 'bg-[#262628] border-white/[0.08] hover:border-white/[0.2]'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.08] text-foreground">
                        {dial.badge}
                      </span>
                      <h4 className="text-sm font-bold text-foreground mt-2">{dial.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{dial.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06] flex items-center justify-between">
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
                  className="size-8 rounded-lg bg-[#1C1C1E] text-foreground font-bold hover:bg-[#3A3A3C]"
                >
                  -
                </button>
                <span className="font-mono text-sm font-extrabold w-8 text-center text-[#FF9F0A]">
                  {rescheduleCap}
                </span>
                <button
                  onClick={() => {
                    soundFX.playTactileClick();
                    setRescheduleCap(Math.min(10, rescheduleCap + 1));
                  }}
                  className="size-8 rounded-lg bg-[#1C1C1E] text-foreground font-bold hover:bg-[#3A3A3C]"
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
            {/* Telegram Bot Pairing */}
            <div className="p-5 rounded-2xl bg-[#262628] border border-[#0A84FF]/30 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-[#0A84FF]/20 text-[#0A84FF]">
                  <Send className="size-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-foreground">Telegram Two-Way Assistant (Primary Channel)</h4>
                  <p className="text-xs text-muted-foreground">
                    Reply `done`, `snooze 1h`, or `list today` directly from Telegram (free & reliable).
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Open Telegram and message your bot (or <code className="text-[#FF9F0A]">@userinfobot</code>) to get your Chat ID.</li>
                  <li>Paste your numeric Chat ID below:</li>
                </ol>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 192847192"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#1C1C1E] border border-white/[0.08] text-foreground text-xs focus:outline-none focus:border-[#0A84FF]"
                  />
                  <button
                    onClick={handleVerifyTelegram}
                    className="px-4 py-2.5 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-bold text-xs shrink-0 active:scale-95 transition-all"
                  >
                    {telegramVerified ? 'Verified ✓' : 'Verify'}
                  </button>
                </div>
              </div>
            </div>

            {/* Web Push */}
            <div className="p-4 rounded-2xl bg-[#262628] border border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Bell className="size-5 text-[#30D158]" />
                <div>
                  <h4 className="text-sm font-bold text-foreground">Web Push (Secondary)</h4>
                  <p className="text-xs text-muted-foreground">
                    Native browser alerts when the PWA is running on desktop or Android.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={webPushEnabled}
                onChange={(e) => setWebPushEnabled(e.target.checked)}
                className="size-5 accent-[#30D158] rounded cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-6">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#262628] hover:bg-[#323236] text-muted-foreground hover:text-foreground font-semibold text-xs active:scale-95 transition-all"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#FF9F0A] hover:bg-[#FF9F0A]/90 text-black font-extrabold text-xs shadow-md active:scale-95 transition-all"
            >
              Next Step
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="flex items-center gap-2 px-7 py-3 rounded-xl bg-[#30D158] hover:bg-[#30D158]/90 text-black font-black text-sm shadow-xl active:scale-95 transition-all"
            >
              Complete Setup & Enter Cadence
              <CheckCircle2 className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default OnboardingPage;
