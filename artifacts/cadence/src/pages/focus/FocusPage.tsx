import { useEffect, useMemo, useRef, useState } from 'react';
import { Focus, Pause, Play, Square, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetFocusSettingsQueryKey,
  getGetTaskSummaryQueryKey,
  getListFocusSessionsQueryKey,
  getListTasksQueryKey,
  useCreateFocusSession,
  useGetFocusSettings,
  useListFocusSessions,
  useListTasks,
  useUpdateFocusSession,
  useUpdateFocusSettings,
  type FocusSession,
} from '@workspace/api-client-react';
import { formatTimer, today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { SectionHeading } from '@/components/shared/StateViews';

export function FocusPage() {
  const queryClient = useQueryClient();
  const params = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );

  const { data: tasks, isLoading: tasksLoading } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });
  const { data: sessions } = useListFocusSessions(params, {
    query: { queryKey: getListFocusSessionsQueryKey(params) },
  });

  const { data: focusSettings } = useGetFocusSettings();
  const updateSettings = useUpdateFocusSettings();
  const create = useCreateFocusSession();
  const update = useUpdateFocusSession();

  const [session, setSession] = useState<FocusSession>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const baseSeconds = useRef(0);
  const lastPersistedMinutes = useRef(0);

  const openTasks = tasks?.filter((task) => task.status !== 'completed') ?? [];
  const next = openTasks[0];
  const currentTask = tasks?.find((task) => task.id === session?.taskId) ?? next;

  // Sync active session from backend
  useEffect(() => {
    if (session || !sessions?.length) return;
    const existing = sessions.find((item) => item.status === 'active' || item.status === 'paused');
    if (!existing) return;

    setSession(existing);
    baseSeconds.current = existing.elapsedMinutes * 60;
    lastPersistedMinutes.current = existing.elapsedMinutes;
    setElapsedSeconds(baseSeconds.current);
    if (existing.status === 'active') {
      setRunStartedAt(Date.now());
    }
  }, [session, sessions]);

  // Interval timer with periodic server persistence
  useEffect(() => {
    if (!session || session.status !== 'active' || runStartedAt === null) return;
    const sessionId = session.id;

    const interval = window.setInterval(() => {
      const seconds = baseSeconds.current + Math.floor((Date.now() - runStartedAt) / 1000);
      setElapsedSeconds(seconds);

      const minutes = Math.floor(seconds / 60);
      if (minutes > lastPersistedMinutes.current) {
        lastPersistedMinutes.current = minutes;
        update.mutate({ id: sessionId, data: { elapsedMinutes: minutes } });
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [runStartedAt, session?.status, update, session?.id]);

  const refreshFocus = () => {
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey(params) });
    queryClient.invalidateQueries({
      queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
    });
  };

  const start = () => {
    if (!currentTask) return;
    soundFX.playClick();

    create.mutate(
      { data: { taskId: currentTask.id, plannedMinutes: currentTask.durationMin } },
      {
        onSuccess: (created) => {
          baseSeconds.current = 0;
          lastPersistedMinutes.current = 0;
          setElapsedSeconds(0);
          setSession(created);
          setRunStartedAt(Date.now());
          refreshFocus();
        },
      },
    );
  };

  const setTarget = (nextTarget: number) => {
    soundFX.playClick();
    const clamped = Math.min(20, Math.max(1, nextTarget));
    updateSettings.mutate(
      { data: { dailyTarget: clamped } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetFocusSettingsQueryKey() }) },
    );
  };

  const transition = (status: 'active' | 'paused' | 'completed') => {
    if (!session) return;
    soundFX.playClick();

    const nowSeconds =
      session.status === 'active' && runStartedAt !== null
        ? baseSeconds.current + Math.floor((Date.now() - runStartedAt) / 1000)
        : elapsedSeconds;

    const data = {
      status,
      elapsedMinutes: Math.floor(nowSeconds / 60),
      ...(status === 'completed' ? { endedAt: new Date().toISOString() } : {}),
    };

    if (status === 'completed') {
      soundFX.playFocusComplete();
    }

    update.mutate(
      { id: session.id, data },
      {
        onSuccess: (updated) => {
          baseSeconds.current = nowSeconds;
          setElapsedSeconds(nowSeconds);
          setSession(updated);
          setRunStartedAt(status === 'active' ? Date.now() : null);
          refreshFocus();
        },
      },
    );
  };

  const plannedSeconds = (session?.plannedMinutes ?? currentTask?.durationMin ?? 25) * 60;
  const percent = Math.min(100, Math.round((elapsedSeconds / plannedSeconds) * 100));
  const isRunning = session?.status === 'active';
  const isFinished = session?.status === 'completed';

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Focus · one deliberate thing"
        title="Your attention, here."
        detail="Commit to one deliberate round. Real progress replaces anxious multitasking."
      />

      <div className="mx-auto max-w-2xl">
        {/* Main Focus Card */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#1C1C1E] p-6 shadow-2xl sm:p-10">
          {/* Subtle Ambient Light */}
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Status Pill */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                <span
                  className={`size-1.5 rounded-full ${
                    isRunning ? 'animate-pulse bg-primary' : 'bg-muted-foreground'
                  }`}
                />
                {isFinished ? 'Round complete' : isRunning ? 'In focus' : session ? 'Paused' : 'Ready'}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {session?.plannedMinutes ?? currentTask?.durationMin ?? 25} min planned
              </span>
            </div>

            {tasksLoading ? (
              <div className="mt-12 h-28 animate-pulse rounded-2xl bg-white/[0.04]" />
            ) : currentTask ? (
              <>
                <p className="mt-10 text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight text-foreground">
                  {currentTask.title}
                </p>

                {/* Big Timer Display */}
                <div className="mt-8">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
                      {formatTimer(elapsedSeconds)}
                    </span>
                    <span className="font-mono text-sm font-bold text-primary">{percent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 shadow-[0_0_8px_rgba(255,159,10,0.6)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  {isFinished
                    ? 'This round is logged in today’s review ledger.'
                    : session
                    ? 'Minutes are saved automatically when you pause or complete.'
                    : 'Start the timer when you are ready to begin.'}
                </p>

                {/* Controls */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {!session ? (
                    <button
                      onClick={start}
                      disabled={create.isPending}
                      data-testid="button-begin-focus"
                      className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-98"
                    >
                      <Play size={16} />
                      <span>{create.isPending ? 'Starting…' : 'Begin focus'}</span>
                    </button>
                  ) : !isFinished ? (
                    <>
                      <button
                        onClick={() => transition(isRunning ? 'paused' : 'active')}
                        disabled={update.isPending}
                        data-testid="button-toggle-focus"
                        className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:brightness-110 active:scale-98"
                      >
                        {isRunning ? <Pause size={16} /> : <Play size={16} />}
                        <span>{isRunning ? 'Pause' : 'Resume'}</span>
                      </button>

                      <button
                        onClick={() => transition('completed')}
                        disabled={update.isPending}
                        data-testid="button-complete-focus"
                        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-[#242428] px-5 text-sm font-bold text-foreground hover:bg-white/10 transition-all active:scale-98"
                      >
                        <Square size={14} />
                        <span>Finish round</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        soundFX.playClick();
                        setSession(undefined);
                        setElapsedSeconds(0);
                        baseSeconds.current = 0;
                      }}
                      data-testid="button-new-focus"
                      className="flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow transition-all hover:brightness-110 active:scale-98"
                    >
                      <Focus size={16} />
                      <span>Start another round</span>
                    </button>
                  )}

                  <Link
                    href="/today"
                    onClick={() => soundFX.playClick()}
                    data-testid="link-return-today"
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 text-xs font-semibold text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                  >
                    <ArrowLeft size={14} />
                    <span>Back to today</span>
                  </Link>
                </div>

                {/* Daily Target Stepper */}
                <div
                  className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-5"
                  data-testid="row-daily-target"
                >
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Daily Target
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Rounds aimed for today</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTarget((focusSettings?.dailyTarget ?? 4) - 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-minus"
                      className="grid size-8 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground active:scale-95"
                      aria-label="Decrease daily target"
                    >
                      -
                    </button>
                    <span
                      data-testid="text-daily-target"
                      className="w-16 text-center text-sm font-bold text-foreground"
                    >
                      {focusSettings?.dailyTarget ?? 4}
                    </span>
                    <button
                      onClick={() => setTarget((focusSettings?.dailyTarget ?? 4) + 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-plus"
                      className="grid size-8 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-muted-foreground hover:bg-white/10 hover:text-foreground active:scale-95"
                      aria-label="Increase daily target"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-14 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[0.04] text-muted-foreground">
                  <CheckCircle2 size={22} className="text-emerald-400" />
                </div>
                <h3 className="mt-4 text-base font-bold text-foreground">
                  No open tasks in today's queue
                </h3>
                <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
                  Add a task to Today or schedule one from your Inbox to start focusing.
                </p>
                <Link
                  href="/today"
                  className="mt-5 inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground"
                >
                  Return to Today
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Focus Tips Triad */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['01', 'Single Tasking', 'Lock attention onto one item until the bell.'],
            ['02', 'Zero Data Loss', 'Paused minutes are preserved even across tabs.'],
            ['03', 'Compound Momentum', 'Each round fills your Activity Rings.'],
          ].map(([num, title, desc]) => (
            <div
              key={num}
              className="rounded-2xl border border-white/[0.08] bg-[#1C1C1E]/60 p-4"
            >
              <span className="font-mono text-[10px] text-primary">{num}</span>
              <p className="mt-1 text-xs font-bold text-foreground">{title}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
