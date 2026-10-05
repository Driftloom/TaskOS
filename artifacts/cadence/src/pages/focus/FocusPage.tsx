import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Minus, Plus, Target } from 'lucide-react';
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
import { today, timezone } from '@/lib/date-utils';
import {
  anchorMatches,
  elapsedFromAnchor,
  minutesOf,
  readAnchor,
  writeAnchor,
} from '@/lib/focus/runAnchor';
import { soundFX } from '@/lib/sound-fx';
import { SectionHeading } from '@/components/shared/StateViews';
import { FocusTimer, resolveFocusTimerState } from '@/components/task/FocusTimer';
import { NotificationBanner } from '@/components/shared/NotificationBanner';
import { sendLocalNotification } from '@/lib/notifications';
import { recordActivity } from '@/lib/activity-history';

/**
 * §P11.1 FocusTimer non-negotiable: "state survives backgrounding and reopen."
 *
 * The server's `elapsed_minutes` is floor-rounded to whole minutes and is only
 * written once a minute, so it cannot by itself tell you how long a round has
 * really been running. The two pieces that make the readout survive a suspended
 * tab, a closed PWA, and a cold start now live in
 * `@/lib/focus/runAnchor` (pure, unit-tested):
 *
 *  1. **Wall-clock deltas.** While running, elapsed is always
 *     `elapsedFromAnchor({ runStartedAt, baseSeconds })`, never a tick counter.
 *     A throttled or frozen interval therefore cannot lose time — it just
 *     recomputes on resume.
 *  2. **A persisted run anchor.** `runStartedAt` and `baseSeconds` live in
 *     `localStorage` while a round is active, so a reopen can rebuild the exact
 *     same delta instead of restarting the clock from `elapsedMinutes`. This is
 *     what puts the page into FocusTimer's `recovered` state.
 *
 * The server stays authoritative for the session itself (status, task, planned
 * minutes); the anchor is only a local timing hint and is discarded the moment a
 * round pauses or completes.
 */

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
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const baseSeconds = useRef(0);
  const lastPersistedMinutes = useRef(0);

  const openTasks = tasks?.filter((task) => task.status !== 'completed') ?? [];
  const next = openTasks[0];
  const chosenTask = selectedTaskId ? tasks?.find((task) => task.id === selectedTaskId) : null;
  const currentTask = tasks?.find((task) => task.id === session?.taskId) ?? chosenTask ?? next;

  // Adopt an unfinished round on load — the reopen path.
  useEffect(() => {
    if (session || !sessions?.length) return;
    const existing = sessions.find((item) => item.status === 'active' || item.status === 'paused');
    if (!existing) return;

    if (existing.status === 'paused') {
      baseSeconds.current = existing.elapsedMinutes * 60;
      lastPersistedMinutes.current = existing.elapsedMinutes;
      setElapsedSeconds(baseSeconds.current);
      setRunStartedAt(null);
      setRecovered(false);
      setSyncFailed(false);
      writeAnchor(null);
      setSession(existing);
      return;
    }

    const anchor = readAnchor();
    if (anchor && anchorMatches(anchor, existing.id)) {
      // The app went away mid-round. Wall clock is the truth — not the
      // minute-rounded value the server last saw.
      const seconds = elapsedFromAnchor(anchor, Date.now());
      baseSeconds.current = seconds;
      lastPersistedMinutes.current = minutesOf(seconds);
      setElapsedSeconds(seconds);
      setRunStartedAt(anchor.runStartedAt);
      setRecovered(true);
      setSyncFailed(false);
      setSession(existing);

      // Catch the server up immediately rather than waiting for the next minute
      // boundary, so Review does not show a stale round if the app dies again.
      if (minutesOf(seconds) !== existing.elapsedMinutes) {
        update.mutate(
          { id: existing.id, data: { elapsedMinutes: minutesOf(seconds) } },
          { onError: () => setSyncFailed(true) },
        );
      }
      return;
    }

    // No anchor (storage unavailable, or the round was started elsewhere).
    baseSeconds.current = existing.elapsedMinutes * 60;
    lastPersistedMinutes.current = existing.elapsedMinutes;
    setElapsedSeconds(baseSeconds.current);
    setRunStartedAt(Date.now());
    setRecovered(false);
    setSyncFailed(false);
    writeAnchor({ sessionId: existing.id, runStartedAt: Date.now(), baseSeconds: baseSeconds.current });
    setSession(existing);
  }, [session, sessions, update]);

  // Running clock. Recomputes from the wall clock, and re-syncs on the way back
  // to the foreground so the digits are correct the instant you return.
  useEffect(() => {
    if (!session || session.status !== 'active' || runStartedAt === null) return;
    const sessionId = session.id;

    const tick = () => {
      const seconds = elapsedFromAnchor(
        { sessionId, runStartedAt, baseSeconds: baseSeconds.current },
        Date.now(),
      );
      setElapsedSeconds(seconds);

      const minutes = minutesOf(seconds);
      if (minutes > lastPersistedMinutes.current) {
        lastPersistedMinutes.current = minutes;
        update.mutate(
          { id: sessionId, data: { elapsedMinutes: minutes } },
          {
            onSuccess: () => setSyncFailed(false),
            // Keep counting. §P17.3 network error: the change is kept and
            // retried — never block the user's round on a flaky connection.
            onError: () => setSyncFailed(true),
          },
        );
      }
    };

    const interval = window.setInterval(tick, 1000);
    const onReturn = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
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
          const now = Date.now();
          baseSeconds.current = 0;
          lastPersistedMinutes.current = 0;
          setElapsedSeconds(0);
          setSession(created);
          setRunStartedAt(now);
          setRecovered(false);
          setSyncFailed(false);
          writeAnchor({ sessionId: created.id, runStartedAt: now, baseSeconds: 0 });
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
        ? elapsedFromAnchor(
            { sessionId: session.id, runStartedAt, baseSeconds: baseSeconds.current },
            Date.now(),
          )
        : elapsedSeconds;

    const data = {
      status,
      elapsedMinutes: minutesOf(nowSeconds),
      ...(status === 'completed' ? { endedAt: new Date().toISOString() } : {}),
    };

    if (status === 'completed') {
      soundFX.playFocusComplete();
      sendLocalNotification('Focus Round Complete! 🎉', {
        body: currentTask ? `Finished round on "${currentTask.title}". Great momentum!` : 'Focus round complete! Take a well-deserved break.',
        tag: 'cadence-focus-complete',
      });
      recordActivity({
        type: 'focus_session_completed',
        title: currentTask ? `Focused on "${currentTask.title}"` : 'Focus Round Complete',
        description: `Completed ${minutesOf(nowSeconds)}m focus session`,
      });
    }

    update.mutate(
      { id: session.id, data },
      {
        onSuccess: (updated) => {
          baseSeconds.current = nowSeconds;
          setElapsedSeconds(nowSeconds);
          setSession(updated);
          if (status === 'active') {
            const now = Date.now();
            setRunStartedAt(now);
            setRecovered(false);
            writeAnchor({ sessionId: session.id, runStartedAt: now, baseSeconds: nowSeconds });
          } else {
            setRunStartedAt(null);
            writeAnchor(null);
          }
          setSyncFailed(false);
          refreshFocus();
        },
        onError: () => setSyncFailed(true),
      },
    );
  };

  const retrySync = () => {
    if (!session) return;
    soundFX.playClick();
    update.mutate(
      { id: session.id, data: { elapsedMinutes: minutesOf(elapsedSeconds) } },
      {
        onSuccess: () => {
          setSyncFailed(false);
          refreshFocus();
        },
      },
    );
  };

  const resetRound = () => {
    soundFX.playClick();
    writeAnchor(null);
    setRecovered(false);
    setSyncFailed(false);
    setSession(undefined);
    setElapsedSeconds(0);
    setRunStartedAt(null);
    baseSeconds.current = 0;
    lastPersistedMinutes.current = 0;
  };

  const timerState = resolveFocusTimerState({
    hasSession: Boolean(session),
    sessionStatus: session?.status,
    recovered,
    syncFailed,
  });

  const dailyTarget = focusSettings?.dailyTarget ?? 4;

  return (
    <div className="animate-enter w-full space-y-6">
      <SectionHeading
        eyebrow="Focus"
        title="Your attention, here."
        detail="Commit to one deliberate round. Real progress replaces anxious multitasking."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
        {/* Primary Focus Timer Column */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <NotificationBanner context="focus" />

          {tasksLoading ? (
            <div className="card-enterprise rounded-2xl border border-border bg-card p-6 shadow-e3">
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : (
            <FocusTimer
              state={timerState}
              taskTitle={currentTask?.title ?? null}
              plannedMinutes={session?.plannedMinutes ?? currentTask?.durationMin ?? 25}
              elapsedSeconds={elapsedSeconds}
              busy={create.isPending || update.isPending}
              syncError={syncFailed ? 'Some minutes have not reached the server yet.' : null}
              onStart={start}
              onPause={() => transition('paused')}
              onResume={() => transition('active')}
              onFinish={() => transition('completed')}
              onReset={resetRound}
              onRetrySync={retrySync}
              secondaryActions={
                <Link
                  href="/today"
                  onClick={() => requestAnimationFrame(() => soundFX.playClick())}
                  data-testid="link-return-today"
                  /* Isolated in the control row: nearest neighbour is the
                     "Read time" button, separated by gap-3 (12px) and each box
                     already >=56px, so no expansion is needed and none is used. */
                  className="inline-flex min-h-14 items-center gap-1.5 rounded-lg border border-border-control bg-card px-5 text-body font-medium text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98 touch-manipulation"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back to today
                </Link>
              }
              footer={
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                      Daily Target
                    </p>
                    <p className="mt-0.5 text-footnote text-muted-foreground">
                      Rounds aimed for today
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setTarget(dailyTarget - 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-minus"
                      className="tap-target-expand grid size-7 place-items-center rounded-md border border-border-control bg-card text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-95"
                      aria-label="Decrease daily target"
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <span
                      data-testid="text-daily-target"
                      className="w-12 text-center font-mono text-headline font-bold tabular-nums text-foreground"
                    >
                      {dailyTarget}
                    </span>
                    <button
                      onClick={() => setTarget(dailyTarget + 1)}
                      disabled={updateSettings.isPending}
                      data-testid="button-target-plus"
                      className="tap-target-expand grid size-7 place-items-center rounded-md border border-border-control bg-card text-muted-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-95"
                      aria-label="Increase daily target"
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              }
            />
          )}

          {/* Focus Tips Triad (shown below timer on mobile/tablet) */}
          <div className="grid gap-2.5 sm:grid-cols-3 lg:hidden">
            {[
              ['01', 'Single Tasking', 'Lock attention onto one item until the bell.'],
              ['02', 'Zero Data Loss', 'Paused minutes are preserved even across tabs.'],
              ['03', 'Compound Momentum', 'Each round fills your Activity Rings.'],
            ].map(([num, title, desc]) => (
              <div
                key={num}
                className="card-enterprise rounded-xl border border-border bg-card p-3"
              >
                <span className="font-mono text-caption font-bold text-primary-text">{num}</span>
                <p className="mt-0.5 text-footnote font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-caption leading-4 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary Focus Context & Queue Column (visible on lg: screens) */}
        <div className="space-y-4 lg:col-span-5 xl:col-span-4">
          {/* Up Next in Queue Card */}
          <div className="card-enterprise rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-e2">
            <div className="flex items-center justify-between pb-3 border-b border-border-control">
              <div className="flex items-center gap-2">
                <Target size={15} className="text-primary-text" aria-hidden="true" />
                <h3 className="text-sm font-bold text-foreground">Up Next in Queue</h3>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {openTasks.length} open
              </span>
            </div>

            {openTasks.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                All planned tasks are complete for today.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {openTasks.slice(0, 5).map((task) => {
                  const isCurrent = currentTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => {
                        if (!session) {
                          soundFX.playTactileClick();
                          setSelectedTaskId(task.id);
                        }
                      }}
                      disabled={Boolean(session)}
                      className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        isCurrent
                          ? 'border-primary/50 bg-primary/10 text-foreground ring-1 ring-primary/30'
                          : 'border-border-control bg-card hover:bg-muted text-muted-foreground hover:text-foreground'
                      } ${session ? 'opacity-70 cursor-default' : 'cursor-pointer active:scale-98'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-semibold ${isCurrent ? 'text-primary-text font-bold' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                        <p className="text-caption text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{task.durationMin ? `${task.durationMin}m` : '25m'}</span>
                          {task.priority && (
                            <span className="uppercase text-caption font-mono font-medium">
                              · {task.priority}
                            </span>
                          )}
                        </p>
                      </div>
                      {isCurrent && (
                        <span className="shrink-0 font-mono text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary-text">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Today's Focus Momentum Card */}
          <div className="card-enterprise rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-e2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Today's Momentum
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black font-mono text-foreground">
                    {sessions?.filter((s) => s.status === 'completed').length ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    of {dailyTarget} rounds completed
                  </span>
                </div>
              </div>
              <div className="size-10 rounded-xl bg-status-success-fill/15 grid place-items-center text-status-success-text">
                <CheckCircle2 size={20} aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* Focus Tips Triad on Desktop */}
          <div className="hidden lg:grid gap-2.5">
            {[
              ['01', 'Single Tasking', 'Lock attention onto one item until the bell.'],
              ['02', 'Zero Data Loss', 'Paused minutes are preserved even across tabs.'],
              ['03', 'Compound Momentum', 'Each round fills your Activity Rings.'],
            ].map(([num, title, desc]) => (
              <div
                key={num}
                className="card-enterprise rounded-xl border border-border bg-card p-3"
              >
                <span className="font-mono text-caption font-bold text-primary-text">{num}</span>
                <p className="mt-0.5 text-footnote font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-caption leading-4 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}