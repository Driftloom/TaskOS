import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
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
import { soundFX } from '@/lib/sound-fx';
import { SectionHeading } from '@/components/shared/StateViews';
import { FocusTimer, resolveFocusTimerState } from '@/components/task/FocusTimer';

/**
 * §P11.1 FocusTimer non-negotiable: "state survives backgrounding and reopen."
 *
 * The server's `elapsed_minutes` is floor-rounded to whole minutes and is only
 * written once a minute, so it cannot by itself tell you how long a round has
 * really been running. Two pieces make the readout survive a suspended tab, a
 * closed PWA, and a cold start:
 *
 *  1. **Wall-clock deltas.** While running, elapsed is always
 *     `baseSeconds + (now - runStartedAt)`, never a tick counter. A throttled or
 *     frozen interval therefore cannot lose time — it just recomputes on resume.
 *  2. **A persisted run anchor.** `runStartedAt` and `baseSeconds` live in
 *     `localStorage` while a round is active, so a reopen can rebuild the exact
 *     same delta instead of restarting the clock from `elapsedMinutes`. This is
 *     what puts the page into FocusTimer's `recovered` state.
 *
 * The server stays authoritative for the session itself (status, task, planned
 * minutes); the anchor is only a local timing hint and is discarded the moment a
 * round pauses or completes.
 */
const ANCHOR_KEY = 'cadence.focus.anchor.v1';

interface RunAnchor {
  sessionId: number;
  runStartedAt: number;
  baseSeconds: number;
}

const readAnchor = (): RunAnchor | null => {
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    const parsed: Partial<RunAnchor> = JSON.parse(raw);
    if (
      typeof parsed.sessionId !== 'number' ||
      typeof parsed.runStartedAt !== 'number' ||
      typeof parsed.baseSeconds !== 'number'
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      runStartedAt: parsed.runStartedAt,
      baseSeconds: parsed.baseSeconds,
    };
  } catch {
    // Private mode / disabled storage. The round still runs in memory; it just
    // falls back to `elapsedMinutes` if the app is killed while running.
    return null;
  }
};

const writeAnchor = (anchor: RunAnchor | null) => {
  try {
    if (anchor) window.localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
    else window.localStorage.removeItem(ANCHOR_KEY);
  } catch {
    // See readAnchor — non-fatal by design.
  }
};

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
  const [recovered, setRecovered] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const baseSeconds = useRef(0);
  const lastPersistedMinutes = useRef(0);

  const openTasks = tasks?.filter((task) => task.status !== 'completed') ?? [];
  const next = openTasks[0];
  const currentTask = tasks?.find((task) => task.id === session?.taskId) ?? next;

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
    if (anchor && anchor.sessionId === existing.id) {
      // The app went away mid-round. Wall clock is the truth — not the
      // minute-rounded value the server last saw.
      const seconds = anchor.baseSeconds + Math.floor((Date.now() - anchor.runStartedAt) / 1000);
      baseSeconds.current = seconds;
      lastPersistedMinutes.current = Math.floor(seconds / 60);
      setElapsedSeconds(seconds);
      setRunStartedAt(anchor.runStartedAt);
      setRecovered(true);
      setSyncFailed(false);
      setSession(existing);

      // Catch the server up immediately rather than waiting for the next minute
      // boundary, so Review does not show a stale round if the app dies again.
      if (Math.floor(seconds / 60) !== existing.elapsedMinutes) {
        update.mutate(
          { id: existing.id, data: { elapsedMinutes: Math.floor(seconds / 60) } },
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
      const seconds = baseSeconds.current + Math.floor((Date.now() - runStartedAt) / 1000);
      setElapsedSeconds(seconds);

      const minutes = Math.floor(seconds / 60);
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
      { id: session.id, data: { elapsedMinutes: Math.floor(elapsedSeconds / 60) } },
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
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Focus"
        title="Your attention, here."
        detail="Commit to one deliberate round. Real progress replaces anxious multitasking."
      />

      <div className="mx-auto max-w-2xl">
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
                onClick={() => soundFX.playClick()}
                data-testid="link-return-today"
                /* Isolated in the control row: nearest neighbour is the
                   "Read time" button, separated by gap-3 (12px) and each box
                   already >=56px, so no expansion is needed and none is used. */
                className="inline-flex min-h-14 items-center gap-1.5 rounded-lg border border-border-control bg-card px-5 text-body font-medium text-foreground transition-colors [@media(hover:hover)]:hover:bg-muted active:scale-98"
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
                    /* Tap-target geometry: the two steppers are separated by a
                       48px read-out and 6px gaps, so their centres are 88px
                       apart. That is well beyond the 44px floor, so expanding
                       both hit areas cannot make them overlap — expansion is
                       safe here and the 28px visual box stays as authored. */
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
                    /* Same geometry as the minus stepper above. */
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

        {/* Focus Tips Triad */}
        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {[
            ['01', 'Single Tasking', 'Lock attention onto one item until the bell.'],
            ['02', 'Zero Data Loss', 'Paused minutes are preserved even across tabs.'],
            ['03', 'Compound Momentum', 'Each round fills your Activity Rings.'],
          ].map(([num, title, desc]) => (
            <div
              key={num}
              className="card-enterprise rounded-xl border border-border bg-card p-3"
            >
              <span className="font-mono text-caption font-bold text-primary">{num}</span>
              <p className="mt-0.5 text-footnote font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 text-caption leading-4 text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}