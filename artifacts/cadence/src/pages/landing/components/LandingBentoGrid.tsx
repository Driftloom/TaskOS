import { useState } from 'react';
import {
  Flame,
  RotateCcw,
  Calendar,
  Volume2,
  CheckCircle2,
  Clock,
  Sparkles,
  Undo2,
  Moon,
  SunMedium,
  Check,
  SendHorizontal,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { TiltCard3D } from './TiltCard3D';
import { InteractiveCaptureSandbox } from './InteractiveCaptureSandbox';
import { ActivityRings3D } from './ActivityRings3D';
import { DecisionGyro3D } from './DecisionGyro3D';
import { TelegramPlane3D } from './TelegramPlane3D';
import { TimeGrid3D } from './TimeGrid3D';

interface TelegramChatMessage {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

export function LandingBentoGrid() {
  // Activity Rings state
  const [activeRing, setActiveRing] = useState<'all' | 'focus' | 'tasks'>('all');
  const [chimePlaying, setChimePlaying] = useState(false);
  const [ringViewMode, setRingViewMode] = useState<'3d' | 'classic'>('3d');

  // Time Blocking state (24h rhythm demonstration)
  const [rhythmMode, setRhythmMode] = useState<'day' | 'night'>('day');

  // 9-Rule Auto-Reschedule simulation state
  const [proposalState, setProposalState] = useState<'pending' | 'accepted' | 'declined'>('pending');

  // Two-Way Telegram chat simulation state
  const [planeBoost, setPlaneBoost] = useState(false);
  const [telegramMessages, setTelegramMessages] = useState<TelegramChatMessage[]>([
    {
      sender: 'bot',
      text: '🔔 Time block started: Deep work on architecture (90m). Due before lunch.',
      time: '10:00 AM',
    },
  ]);

  const handlePlayChime = () => {
    soundFX.playCompletion();
    setChimePlaying(true);
    setTimeout(() => {
      setChimePlaying(false);
    }, 1800);
  };

  const handleRhythmToggle = (mode: 'day' | 'night') => {
    soundFX.playClick();
    setRhythmMode(mode);
  };

  const handleProposalAction = (action: 'accepted' | 'declined' | 'pending') => {
    if (action === 'accepted') {
      soundFX.playCompletion();
    } else {
      soundFX.playClick();
    }
    setProposalState(action);
  };

  const handleTelegramAction = (command: 'done' | 'snooze' | 'list') => {
    soundFX.playClick();
    setPlaneBoost(true);
    setTimeout(() => setPlaneBoost(false), 800);

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (command === 'done') {
      setTelegramMessages((prev) => [
        ...prev,
        { sender: 'user', text: 'done', time: timeStr },
        {
          sender: 'bot',
          // No streak number: the demo completes nothing, so it has no streak
          // to report. Claiming one would be a fabricated metric.
          text: '✅ Marked "Deep work on architecture" complete.',
          time: timeStr,
        },
      ]);
      setTimeout(() => soundFX.playCompletion(), 350);
    } else if (command === 'snooze') {
      setTelegramMessages((prev) => [
        ...prev,
        { sender: 'user', text: 'snooze 1h', time: timeStr },
        {
          sender: 'bot',
          text: '⏰ Snoozed 1 hour. Time block shifted to 11:00 AM without overlap.',
          time: timeStr,
        },
      ]);
      setTimeout(() => soundFX.playCompletion(), 350);
    } else if (command === 'list') {
      setTelegramMessages((prev) => [
        ...prev,
        { sender: 'user', text: 'list today', time: timeStr },
        {
          sender: 'bot',
          text: '📋 Remaining today: 1. PR Review (11:00 AM) 2. Evening Ritual (08:30 PM)',
          time: timeStr,
        },
      ]);
      setTimeout(() => soundFX.playCompletion(), 350);
    }
  };

  return (
    <section className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      {/* Section Header */}
      <div className="text-left space-y-3 mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-control bg-card/80 px-3 py-1 font-mono text-caption uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur-md">
          <Sparkles size={12} className="text-primary-text" />
          <span>Interactive Preview · Sample Data</span>
        </div>
        <h2 className="text-title1 sm:text-display2 font-extrabold tracking-tight text-foreground">
          Built for how work actually happens.
        </h2>
        <p className="max-w-[65ch] text-caption sm:text-callout text-muted-foreground leading-relaxed">
          Four interconnected systems that replace the fragility of paper planners with computational precision.
          Everything below is an interactive preview running on sample data, not live account data.
        </p>
      </div>

      {/* 3D Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card 1: Natural Speed NLP Capture Sandbox (7 cols) */}
        <div className="lg:col-span-7">
          <TiltCard3D maxTilt={6} sheen glow="amber" className="h-full">
            <InteractiveCaptureSandbox />
          </TiltCard3D>
        </div>

        {/* Card 2: Activity Rings & Momentum in 3D (5 cols) */}
        <div className="lg:col-span-5">
          <TiltCard3D maxTilt={6} sheen glow="emerald" className="h-full p-6 sm:p-7 flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between" style={{ transform: 'translateZ(16px)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-control bg-primary/15 text-primary-text shadow-sm">
                    <Flame size={18} />
                  </div>
                  <div>
                    {/* Heading required by Playwright e2e */}
                    <h3 className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight">
                      Activity Rings
                    </h3>
                    <p className="text-caption text-muted-foreground">
                      Momentum that compounds daily without artificial freeze loopholes.
                    </p>
                  </div>
                </div>
                <span className="rounded-control border border-border-control bg-surface-elevated px-2.5 py-1 font-mono text-caption text-primary-text font-bold shadow-sm">
                  STRICT STREAKS
                </span>
              </div>

              {/* 3D Interactive WebGL Rings Display */}
              <div
                className="relative mt-6 flex flex-col sm:flex-row items-center gap-5 justify-around p-4 rounded-xl border border-border-control bg-surface-elevated/85 backdrop-blur-md shadow-inner overflow-hidden"
                style={{ transform: 'translateZ(28px)' }}
              >
                {/* Celebratory Harmonic Ripple on Chime Play */}
                {chimePlaying && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                    <div className="size-28 rounded-full border-2 border-primary animate-ping opacity-75" />
                    <div className="size-44 rounded-full border border-status-success-text animate-ping opacity-50" />
                  </div>
                )}

                {/* 3D Volumetric Activity Rings */}
                <div className="relative flex flex-col items-center">
                  <ActivityRings3D
                    focusPercent={75}
                    tasksPercent={80}
                    streakPercent={90}
                    interactive
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-title3 font-extrabold text-foreground">80%</span>
                    <span className="text-caption text-muted-foreground font-medium">momentum</span>
                  </div>
                </div>

                {/* Metrics & Interactive Chime Button */}
                <div className="space-y-2.5 text-left w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handlePlayChime}
                    onMouseEnter={() => setActiveRing('focus')}
                    onMouseLeave={() => setActiveRing('all')}
                    className={`flex items-center gap-2.5 p-1.5 rounded-control transition-all w-full text-left ${
                      activeRing === 'focus' ? 'bg-primary/15' : 'hover:bg-surface-elevated'
                    }`}
                  >
                    <span className="size-2.5 rounded-full bg-primary shadow-sm" />
                    <span className="font-mono text-caption text-foreground font-semibold">
                      3 / 4 Focus (75 min)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePlayChime}
                    onMouseEnter={() => setActiveRing('tasks')}
                    onMouseLeave={() => setActiveRing('all')}
                    className={`flex items-center gap-2.5 p-1.5 rounded-control transition-all w-full text-left ${
                      activeRing === 'tasks' ? 'bg-status-success-text/15' : 'hover:bg-surface-elevated'
                    }`}
                  >
                    <span className="size-2.5 rounded-full bg-status-success-text shadow-sm" />
                    <span className="font-mono text-caption text-foreground font-semibold">
                      8 / 10 Completed
                    </span>
                  </button>

                  <div className="pt-1.5">
                    <button
                      type="button"
                      onClick={handlePlayChime}
                      className="inline-flex items-center gap-2 rounded-control border border-border-control bg-card px-3 py-1.5 font-mono text-caption text-foreground font-semibold shadow-sm transition-all hover:border-primary/50 hover:bg-surface-elevated active:scale-95 touch-manipulation"
                    >
                      <Volume2 size={13} className={chimePlaying ? 'text-primary animate-bounce' : 'text-muted-foreground'} />
                      <span>{chimePlaying ? 'Playing Major 7th...' : 'Play completion chime'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-5 text-caption leading-5 text-muted-foreground" style={{ transform: 'translateZ(14px)' }}>
              Web Audio synthesized Major 7th arpeggios celebrate closed rings without synthetic dopamine traps.
            </p>
          </TiltCard3D>
        </div>

        {/* Card 3: 24-Hour Time Blocking with 3D Modules (7 cols) */}
        <div className="lg:col-span-7">
          <TiltCard3D maxTilt={6} sheen glow="cyan" className="h-full p-6 sm:p-7 flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between" style={{ transform: 'translateZ(16px)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-control bg-primary/15 text-primary-text shadow-sm">
                    <Calendar size={18} />
                  </div>
                  <div>
                    {/* Heading required by Playwright e2e */}
                    <h3 className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight">
                      Time Blocking
                    </h3>
                    <p className="text-caption text-muted-foreground">
                      Visual hour grid with overlap prevention and quiet-hour safety.
                    </p>
                  </div>
                </div>

                {/* Interactive Rhythm Switcher */}
                <div className="inline-flex rounded-full border border-border-control bg-surface-elevated p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => handleRhythmToggle('day')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-caption font-bold transition-all ${
                      rhythmMode === 'day'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <SunMedium size={12} />
                    <span>09:00</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRhythmToggle('night')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-caption font-bold transition-all ${
                      rhythmMode === 'night'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Moon size={12} />
                    <span>00:00–23:59</span>
                  </button>
                </div>
              </div>

              {/* Time Blocks Timeline Preview with 3D Isometric Module Accent */}
              <div
                className="mt-6 flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-border-control bg-surface-elevated/80 p-4 backdrop-blur-md shadow-inner"
                style={{ transform: 'translateZ(28px)' }}
              >
                {/* 3D Isometric Time Block Modules */}
                <div className="hidden sm:flex flex-col items-center justify-center p-2 rounded-lg bg-card/60 border border-border-control/50">
                  <TimeGrid3D mode={rhythmMode} />
                  <span className="mt-1 font-mono text-micro text-muted-foreground font-semibold">
                    {rhythmMode === 'day' ? 'DAY FOCUS' : 'NIGHT SHIFT'}
                  </span>
                </div>

                <div className="flex-1 space-y-2 w-full">
                  {rhythmMode === 'day' ? (
                    <>
                      <div className="flex items-center gap-3 group">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">09:00</span>
                        <div className="flex-1 rounded-control border border-border-control bg-card p-2.5 flex items-center justify-between shadow-sm transition-transform group-hover:-translate-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-primary" />
                            <span className="text-caption font-bold text-foreground">Deep Work: Monorepo Architecture</span>
                          </div>
                          <span className="font-mono text-caption text-muted-foreground">90 min</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">10:30</span>
                        <div className="flex-1 rounded-control border border-dashed border-border-control/60 p-2 text-center text-caption text-muted-foreground flex items-center justify-center gap-2">
                          <Clock size={12} className="text-primary-text animate-pulse" />
                          <span>Rest buffer · Zero overlap allowed</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 group">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">11:00</span>
                        <div className="flex-1 rounded-control border border-border-control bg-card p-2.5 flex items-center justify-between shadow-sm transition-transform group-hover:-translate-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-status-success-text" />
                            <span className="text-caption font-bold text-foreground">PR Review & Verification Ladder</span>
                          </div>
                          <span className="font-mono text-caption text-muted-foreground">45 min</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 group">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">23:00</span>
                        <div className="flex-1 rounded-control border border-primary/40 bg-card p-2.5 flex items-center justify-between shadow-sm transition-transform group-hover:-translate-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-accent" />
                            <span className="text-caption font-bold text-foreground">Late Night: Architecture RFC Deep Dive</span>
                          </div>
                          <span className="font-mono text-caption text-primary-text font-semibold">120 min</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">01:00</span>
                        <div className="flex-1 rounded-control border border-dashed border-border-control/60 p-2 text-center text-caption text-muted-foreground flex items-center justify-center gap-2">
                          <Moon size={12} className="text-accent" />
                          <span>Night shift boundary · Zero arbitrary cutoffs</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 group">
                        <span className="w-14 font-mono text-caption text-muted-foreground text-right">01:30</span>
                        <div className="flex-1 rounded-control border border-border-control bg-card p-2.5 flex items-center justify-between shadow-sm transition-transform group-hover:-translate-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-status-info-text" />
                            <span className="text-caption font-bold text-foreground">Night Verification Run & Sweep</span>
                          </div>
                          <span className="font-mono text-caption text-muted-foreground">30 min</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-5 text-caption leading-5 text-muted-foreground" style={{ transform: 'translateZ(14px)' }}>
              Supports non-standard night work rhythms (`00:00–23:59`) with strict local IANA timezone persistence.
            </p>
          </TiltCard3D>
        </div>

        {/* Card 4: 9-Rule Auto-Reschedule Engine with 3D Gyroscope (5 cols) */}
        <div className="lg:col-span-5">
          <TiltCard3D maxTilt={6} sheen glow="amber" className="h-full p-6 sm:p-7 flex flex-col justify-between">
            <div>
              {/* Header with 3D Gyroscope */}
              <div className="flex items-center justify-between" style={{ transform: 'translateZ(16px)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-control bg-accent/15 text-accent shadow-sm">
                    <RotateCcw size={18} />
                  </div>
                  <div>
                    <h3 className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight">
                      9-Rule Auto-Reschedule
                    </h3>
                    <p className="text-caption text-muted-foreground">
                      Shows its work. Never silently moves calendar events.
                    </p>
                  </div>
                </div>

                {/* 3D Decision Gyroscope Mini-Scene */}
                <div className="hidden sm:block">
                  <DecisionGyro3D status={proposalState} />
                </div>
              </div>

              {/* Proposal Preview Box with Interactive Decision Simulation */}
              <div
                className="mt-6 space-y-3 rounded-xl border border-border-control bg-surface-elevated/80 p-4 backdrop-blur-md shadow-md"
                style={{ transform: 'translateZ(28px)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-caption font-bold text-primary-text">
                    RULE 9 · ADAPTIVE MULTIPLIER
                  </span>
                  <span className="rounded-control bg-primary/10 px-2 py-0.5 text-caption text-primary-text font-bold">
                    {proposalState === 'accepted' ? 'ACCEPTED' : proposalState === 'declined' ? 'KEPT' : 'PROPOSAL'}
                  </span>
                </div>

                <p className="text-caption font-semibold text-foreground">
                  "Draft Q4 Architecture RFC"
                </p>

                <div className="text-caption text-muted-foreground space-y-1">
                  <p>• Historical duration: 72m (multiplier 1.25x applied → 90m)</p>
                  <p>• Proposed slot: Tomorrow 09:30 – 11:00 AM</p>
                  <p>• Respects quiet hours & non-overlapping focus blocks</p>
                </div>

                {/* Interactive Action Buttons */}
                <div className="pt-2 flex items-center gap-2">
                  {proposalState === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleProposalAction('accepted')}
                        className="flex-1 rounded-control bg-primary py-2 px-3 text-caption font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover active:scale-95 touch-manipulation"
                      >
                        Accept Move
                      </button>
                      <button
                        type="button"
                        onClick={() => handleProposalAction('declined')}
                        className="flex-1 rounded-control border border-border-control bg-card py-2 px-3 text-caption font-bold text-foreground shadow-sm transition-all hover:bg-surface-elevated active:scale-95 touch-manipulation"
                      >
                        Keep Original
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-status-success-text">
                        <Check size={14} />
                        <span>In the live app this is written to the action log, with one-tap undo.</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleProposalAction('pending')}
                        className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground font-mono"
                      >
                        <Undo2 size={12} />
                        <span>Undo</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-caption font-mono text-muted-foreground pt-1 border-t border-border-control/40">
                  <span>Auto-move cap: 5 max</span>
                  <span className="text-status-success-text">1-click Reversible</span>
                </div>
              </div>
            </div>

            <p className="mt-5 text-caption leading-5 text-muted-foreground" style={{ transform: 'translateZ(14px)' }}>
              Tasks slipping more than 5 times flag "needs attention" instead of endless unreviewed moves.
            </p>
          </TiltCard3D>
        </div>

        {/* Card 5: Two-Way Telegram Bot with 3D Paper Plane (12 cols) */}
        <div className="lg:col-span-12">
          <TiltCard3D maxTilt={4} sheen glow="cyan" className="p-6 sm:p-7">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Description & Feature Points */}
              <div className="lg:col-span-5 space-y-4 text-left" style={{ transform: 'translateZ(20px)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center rounded-control bg-accent/15 text-accent shadow-sm">
                      <SendHorizontal size={18} />
                    </div>
                    <div>
                      <h3 className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight">
                        Two-Way Telegram Bot
                      </h3>
                      <p className="text-caption text-muted-foreground">
                        Primary mobile notification channel you actually respond to.
                      </p>
                    </div>
                  </div>

                  {/* 3D Paper Plane */}
                  <div className="block" title="3D Webhook Signal Plane">
                    <TelegramPlane3D triggerBoost={planeBoost} />
                  </div>
                </div>

                <p className="text-caption leading-relaxed text-muted-foreground">
                  Send free-form messages to capture tasks instantly on the go.
                  Tap interactive buttons to mark done, snooze, or sweep tasks with zero app-opening friction.
                </p>

                <div className="flex flex-wrap items-center gap-4 text-caption font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className="size-2 rounded-full bg-muted-foreground/60" />
                    Simulated webhook feed (sample data)
                  </span>
                  <span>·</span>
                  <span>Live accounts receive Telegram updates over the bot webhook</span>
                </div>
              </div>

              {/* Right Column: Interactive Chat Simulation Feed */}
              <div className="lg:col-span-7" style={{ transform: 'translateZ(30px)' }}>
                <div className="rounded-xl border border-border-control bg-surface-elevated/90 p-4 backdrop-blur-md shadow-md space-y-3">
                  {/* Message Stream */}
                  <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                    {telegramMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex flex-col text-left ${
                          msg.sender === 'user' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-2.5 text-caption shadow-sm ${
                            msg.sender === 'user'
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'bg-card border border-border-control text-foreground'
                          }`}
                        >
                          {msg.sender === 'bot' && (
                            <div className="flex items-center justify-between gap-3 text-caption font-mono text-muted-foreground pb-1 mb-1 border-b border-border-control/30">
                              <span className="font-bold text-primary-text">Cadence Bot</span>
                              <span>{msg.time}</span>
                            </div>
                          )}
                          <p>{msg.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Interactive Reply Actions */}
                  <div className="pt-2 border-t border-border-control/50 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTelegramAction('done')}
                      className="flex-1 min-w-24 rounded-control border border-border-control bg-card py-2 px-3 text-caption font-bold text-foreground shadow-sm transition-all hover:bg-surface-elevated hover:border-status-success-text active:scale-95 touch-manipulation"
                    >
                      ✅ Done
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTelegramAction('snooze')}
                      className="flex-1 min-w-24 rounded-control border border-border-control bg-card py-2 px-3 text-caption font-bold text-foreground shadow-sm transition-all hover:bg-surface-elevated hover:border-primary active:scale-95 touch-manipulation"
                    >
                      ⏱ +1h
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTelegramAction('list')}
                      className="flex-1 min-w-24 rounded-control border border-border-control bg-card py-2 px-3 text-caption font-bold text-foreground shadow-sm transition-all hover:bg-surface-elevated hover:border-accent active:scale-95 touch-manipulation"
                    >
                      📋 List
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-caption leading-5 text-muted-foreground text-left" style={{ transform: 'translateZ(14px)' }}>
              Built directly on Telegram Bot API with two-way webhook authentication and batch summary delivery.
            </p>
          </TiltCard3D>
        </div>
      </div>
    </section>
  );
}
