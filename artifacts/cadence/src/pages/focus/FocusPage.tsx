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
    soundFX.playFocusStart();

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
        eyebrow="Focus"
        title="Your attention, here."
        detail="Commit to one deliberate round. Real progress replaces anxious multitasking."
      />

      <div className="mx-auto max-w-2xl">
        {/* Main Focus Card */}
        <div className="card-enterprise relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121214] p-6 shadow-2xl sm:p-8">
          {/* Subtle Ambient Light */}
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative">
            {/* Status Pill */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary font-semibold">
                <span
                  className={`size-1.5 rounded-full ${
                    isRunning ? 'animate-pulse bg-primary' : 'bg-zinc-500'
                  }`}
                />
                {isFinished ? 'Round complete' : isRunning ? 'In focus' : session ? 'Paused' : 'Ready'}
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {session?.plannedMinutes ?? currentTask?.durationMin ?? 25} min planned
              </span>
            </div>

            {tasksLoading ? (
              <div className="mt-10 h-24 animate-pulse rounded-xl bg-white/[0.04]" />
            ) : currentTask ? (
              <>
                <p className="mt-8 text-xl sm:text-2xl font-bold leading-tight tracking-tight text-white">
                  {currentTask.title}
                </p>

                {/* Big Timer Display */}
                <div className="mt-6">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-4xl sm:text-5xl font-bold tracking-tight text-white">
                      {formatTimer(elapsedSeconds)}
                    </span>
                    <span className="font-mono text-sm font-bold text-primary">{percent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 shadow-[0_0_8px_rgba(255,159,10,0.5)]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-400">
                  {isFinished
                    ? 'This round is logged in today’s review ledger.'
                    : session
                    ? 'Minutes are saved automatically when you pause or complete.'
                    : 'Start the timer when you are ready to begin.'}
                </p>

                {/* Controls */}
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  {!session ? (
                    <button
                      onClick={start}
                      disabled={create.isPending}
                      data-testid="button-begin-focus"
                      className="btn-primary flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold text-black shadow-sm transition-all hover:brightness-105 active:scale-95"
                    >
                      <Play size={14} />
                      <span>{create.isPending ? 'Starting…' : 'Begin focus'}</span>
                    </button>
                  ) : !isFinished ? (
                    <>
                      <button
                        onClick={() => transition(isRunning ? 'paused' : 'active')}
                        disabled={update.isPending}
                        data-testid="button-toggle-focus"
                        className="btn-primary flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold text-black shadow-sm transition-all hover:brightness-105 active:scale-95"
                      >
                        {isRunning ? <Pause size={14} /> : <Play size={14} />}
                        <span>{isRunning ? 'Pause' : 'Resume'}</span>
                      </button>

                      <button
                        onClick={() => transition('completed')}
                        disabled={update.isPending}
                        data-testid="button-complete-focus"
                        className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-white transition-all active:scale-95"
                      >
                        <Square size={12} />
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
                      className="btn-primary flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold text-black shadow-sm transition-all hover:brightness-105 active:scale-95"
                    >
                      <Focus size={14} />
                      <span>Start another round</span>
                    </button>
                  )}

                  <Link
                    href="/today"
                    onClick={() => soundFX.playClick()}
                    data-testid="link-return-today"
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 transition-colors"
                  >
                    <ArrowLeft size={13} />
                    <span>Back to today</span>
                  </Link>
                </div>

                {/* Daily Target Stepper */}
                <div
                  className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4"
                  data-testid="row-daily-target"
                >
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 font-semibold">
                      Daily Target
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">Rounds aimed for today</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setTarget((focusSettings?.dailyTarget ?? 4) - 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-minus"
                      className="grid size-7 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08] hover:text-white active:scale-95"
                      aria-label="Decrease daily target"
                    >
                      -
                    </button>
                    <span
                      data-testid="text-daily-target"
                      className="w-12 text-center text-xs font-bold font-mono text-zinc-200"
                    >
                      {focusSettings?.dailyTarget ?? 4}
                    </span>
                    <button
                      onClick={() => setTarget((focusSettings?.dailyTarget ?? 4) + 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-plus"
                      className="grid size-7 place-items-center rounded-md border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08] hover:text-white active:scale-95"
                      aria-label="Increase daily target"
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto grid size-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400">
                  <CheckCircle2 size={20} className="text-[#30D158]" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-zinc-200">
                  No open tasks in today's queue
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-400">
                  Add a task to Today or schedule one from your Inbox to start focusing.
                </p>
                <Link
                  href="/today"
                  className="mt-4 inline-flex h-8 items-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-white"
                >
                  Return to Today
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Focus Tips Triad */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {[
            ['01', 'Single Tasking', 'Lock attention onto one item until the bell.'],
            ['02', 'Zero Data Loss', 'Paused minutes are preserved even across tabs.'],
            ['03', 'Compound Momentum', 'Each round fills your Activity Rings.'],
          ].map(([num, title, desc]) => (
            <div
              key={num}
              className="card-enterprise rounded-xl border border-white/[0.06] bg-[#121214] p-3"
            >
              <span className="font-mono text-[10px] text-primary font-bold">{num}</span>
              <p className="mt-0.5 text-xs font-semibold text-zinc-200">{title}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
