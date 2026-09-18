import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Command,
  Focus,
  Inbox,
  ListChecks,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import {
  getGetTaskSummaryQueryKey,
  getListFocusSessionsQueryKey,
  getListTasksQueryKey,
  useCreateFocusSession,
  useCreateTask,
  useDeleteTask,
  useGetTaskSummary,
  useListFocusSessions,
  useListTasks,
  useUpdateFocusSession,
  useUpdateTask,
  type FocusSession,
  type Task,
  type TaskPriority,
} from '@workspace/api-client-react';
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#ff7b35',
    colorForeground: '#f2f0ea',
    colorMutedForeground: '#9a9ca8',
    colorDanger: '#ef6b63',
    colorBackground: '#1a1d2a',
    colorInput: '#202433',
    colorInputForeground: '#f2f0ea',
    colorNeutral: '#383c4c',
    fontFamily: 'Manrope, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#1a1d2a] rounded-3xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f2f0ea] font-extrabold tracking-tight',
    headerSubtitle: 'text-[#9a9ca8]',
    socialButtonsBlockButtonText: 'text-[#f2f0ea]',
    formFieldLabel: 'text-[#f2f0ea]',
    footerActionLink: 'text-[#ff7b35]',
    footerActionText: 'text-[#9a9ca8]',
    dividerText: 'text-[#9a9ca8]',
    formButtonPrimary: 'bg-[#ff7b35] text-[#171923] hover:bg-[#ff8c4e]',
    formFieldInput: 'bg-[#202433] text-[#f2f0ea] border-[#383c4c]',
    socialButtonsBlockButton: 'bg-[#202433] border-[#383c4c] hover:bg-[#292e40]',
    dividerLine: 'bg-[#383c4c]',
    alert: 'bg-[#ef6b63]/10 border-[#ef6b63]/30',
    alertText: 'text-[#f2f0ea]',
  },
};
const today = () => {
  const value = new Date();
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const dateKey = (value: Date) => {
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const parseDateKey = (value: string) => new Date(`${value}T12:00:00`);
const shiftDate = (value: string, days: number) => {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const monthStart = (value: string) => {
  const date = parseDateKey(value);
  date.setDate(1);
  return dateKey(date);
};
const monthEnd = (value: string) => {
  const date = parseDateKey(value);
  date.setMonth(date.getMonth() + 1, 0);
  return dateKey(date);
};
const startOfWeek = (value: string) => {
  const date = parseDateKey(value);
  date.setDate(date.getDate() - date.getDay());
  return dateKey(date);
};
const dateHeading = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseDateKey(value));
const monthHeading = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parseDateKey(value));
const formatTimer = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const dateLabel = () => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
const shortTime = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
const plural = (value: number, singular: string, suffix = 's') => `${value} ${value === 1 ? singular : singular + suffix}`;

type PageKey = '/today' | '/inbox' | '/focus' | '/calendar' | '/review';
const navItems: { href: PageKey; label: string; icon: typeof CalendarDays }[] = [
  { href: '/today', label: 'Today', icon: Target },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/focus', label: 'Focus', icon: Focus },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/review', label: 'Review', icon: ListChecks },
];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [captureOpen, setCaptureOpen] = useState(false);
  const { signOut } = useClerk();
  const { user } = useUser();
  const displayName =
    user?.firstName ??
    user?.username ??
    user?.primaryEmailAddress?.emailAddress ??
    'You';
  const initials = displayName.slice(0, 1).toUpperCase();
  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[236px] flex-col border-r border-border/80 bg-[hsl(225_24%_10%/.78)] px-5 py-7 backdrop-blur-xl lg:flex">
        <Link href="/today" data-testid="link-brand" className="mb-12 flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_30px_hsl(25_97%_57%/.2)]">
            <span className="font-mono text-sm font-medium">C</span>
          </span>
          <span className="text-[17px] font-extrabold tracking-[-0.04em]">cadence</span>
        </Link>
        <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">Workspace</p>
        <nav className="space-y-1" aria-label="Primary navigation">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(`${href}/`);
            return (
              <Link
                href={href}
                key={href}
                data-testid={`link-nav-${label.toLowerCase()}`}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${active ? 'bg-primary/[.11] text-primary' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'}`}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 1.8} />
                <span>{label}</span>
                {label === 'Inbox' && <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <button onClick={() => setCaptureOpen(true)} data-testid="button-sidebar-capture" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0">
            <Plus size={17} strokeWidth={2.6} /> Capture task
          </button>
          <div className="mt-5 flex items-center gap-2 px-2 text-[11px] text-muted-foreground">
            <Command size={12} /> <span>Quick capture</span><span className="ml-auto font-mono">N</span>
          </div>
        </div>
      </aside>
      <div className="min-h-[100dvh] lg:pl-[236px]">
        <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-border/60 bg-background/80 px-5 backdrop-blur-xl sm:px-8 lg:px-12">
          <Link href="/today" data-testid="link-mobile-brand" className="flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">C</span>
            <span className="font-extrabold tracking-[-.04em]">cadence</span>
          </Link>
          <div className="hidden items-center gap-2 text-muted-foreground lg:flex">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[.18em]">Personal time OS</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">{dateLabel()}</span>
            <button onClick={() => setCaptureOpen(true)} data-testid="button-header-capture" className="grid size-10 place-items-center rounded-xl border border-border bg-card text-primary transition-colors hover:bg-muted lg:hidden" aria-label="Capture task">
              <Plus size={19} />
            </button>
            <button
              onClick={() => signOut({ redirectUrl: basePath || '/' })}
              data-testid="button-profile"
              className="grid size-9 place-items-center rounded-full border border-border bg-muted text-xs font-bold text-muted-foreground"
              aria-label={`Sign out ${displayName}`}
              title={`Sign out ${displayName}`}
            >
              {initials}
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1160px] px-5 pb-28 pt-8 sm:px-8 sm:pt-11 lg:px-12 lg:pb-14">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 flex h-[66px] items-center justify-around rounded-2xl border border-border/90 bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href || location.startsWith(`${href}/`);
          return <Link href={href} key={href} data-testid={`link-mobile-${label.toLowerCase()}`} className={`flex h-full min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${active ? 'bg-primary/[.13] text-primary' : 'text-muted-foreground'}`}><Icon size={18} /><span>{label}</span></Link>;
        })}
      </nav>
      {captureOpen && <TaskEditor onClose={() => setCaptureOpen(false)} onSaved={() => setCaptureOpen(false)} />}
    </div>
  );
}

function SectionHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-7 flex items-end justify-between gap-4">
    <div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.19em] text-primary">{eyebrow}</p><h1 className="text-3xl font-extrabold tracking-[-.06em] text-foreground sm:text-[38px]">{title}</h1>{detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}</div>
    {action}
  </div>;
}

function ProgressRing({ completed, total, size = 122 }: { completed: number; total: number; size?: number }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * percent / 100;
  return <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="progress-ring">
    <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(225 16% 20%)" strokeWidth="7" /><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(25 97% 57%)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} className="transition-all duration-700" /></svg>
    <div className="absolute inset-0 grid place-items-center text-center"><strong className="block text-2xl font-extrabold tracking-[-.07em]">{percent}%</strong><span className="mt-[-25px] font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">done</span></div>
  </div>;
}

function SkeletonList() {
  return <div className="space-y-3" data-testid="loading-tasks">{[1, 2, 3].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl border border-border/70 bg-card/70" />)}</div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-2xl border border-destructive/30 bg-destructive/[.07] p-7 text-center" data-testid="status-error"><p className="font-semibold">The workspace could not load.</p><p className="mt-1 text-sm text-muted-foreground">Your tasks are safe. Try reconnecting.</p><button onClick={onRetry} data-testid="button-retry" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold hover:bg-muted"><RotateCcw size={14} /> Try again</button></div>;
}

function EmptyState({ inbox = false }: { inbox?: boolean }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center" data-testid={inbox ? 'empty-inbox' : 'empty-tasks'}><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">{inbox ? <Inbox size={21} /> : <Sparkles size={21} />}</div><h3 className="mt-4 font-bold">{inbox ? 'Inbox is clear' : 'A clean slate'}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{inbox ? 'Loose ends have a place. Capture the next one whenever it arrives.' : 'Capture one thing to give the day a shape.'}</p></div>;
}

function TaskRow({ task, onEdit, onRefresh }: { task: Task; onEdit: (task: Task) => void; onRefresh: () => void }) {
  const queryClient = useQueryClient();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [deleting, setDeleting] = useState(false);
  const completed = task.status === 'completed';
  const toggle = () => update.mutate({ id: task.id, data: { status: completed ? 'open' : 'completed' } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }) }); onRefresh(); } });
  const deleteItem = () => { if (window.confirm('Delete this task?')) { setDeleting(true); remove.mutate({ id: task.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }) }); onRefresh(); }, onSettled: () => setDeleting(false) }); } };
  return <div className={`group flex min-h-[76px] items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3 transition-all hover:border-primary/35 hover:bg-card/90 ${completed ? 'opacity-60' : ''}`} data-testid={`row-task-${task.id}`}>
    <button onClick={toggle} disabled={update.isPending} data-testid={`button-complete-task-${task.id}`} aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`} className={`grid size-7 shrink-0 place-items-center rounded-full border transition-all ${completed ? 'border-emerald-400 bg-emerald-400 text-[hsl(224_27%_8%)] animate-check-pop' : 'border-muted-foreground/50 text-transparent hover:border-primary hover:text-primary'}`}><Check size={15} strokeWidth={3} /></button>
    <button onClick={() => onEdit(task)} data-testid={`button-edit-task-${task.id}`} className="min-w-0 flex-1 text-left"><span className={`block truncate text-sm font-semibold ${completed ? 'line-through' : ''}`}>{task.title}</span><span className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">{task.dueAt && <><Clock3 size={11} /> {shortTime(task.dueAt)}</>}<span className={`size-1.5 rounded-full ${task.priority === 'high' ? 'bg-primary' : task.priority === 'medium' ? 'bg-accent' : 'bg-muted-foreground/60'}`} />{plural(task.durationMin, 'min', '')}</span></button>
    <button onClick={() => onEdit(task)} data-testid={`button-pencil-task-${task.id}`} className="grid size-9 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100" aria-label={`Edit ${task.title}`}><Pencil size={15} /></button>
    <button onClick={deleteItem} disabled={deleting} data-testid={`button-delete-task-${task.id}`} className="grid size-9 place-items-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/[.12] hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>
  </div>;
}

function TaskEditor({ task, defaultDate, onClose, onSaved }: { task?: Task; defaultDate?: string; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateTask();
  const update = useUpdateTask();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [duration, setDuration] = useState(String(task?.durationMin ?? 30));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [dueAt, setDueAt] = useState(task?.dueAt ? task.dueAt.slice(0, 16) : defaultDate ? `${defaultDate}T09:00` : '');
  const [dueText, setDueText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaveError(null);
    const words = dueText.trim();
    const data = { title: title.trim(), notes: notes.trim() || null, durationMin: Math.max(5, Number(duration) || 30), priority, ...(words ? { dueText: words, timezone: timezone() } : { dueAt: dueAt ? new Date(dueAt).toISOString() : task ? null : new Date().toISOString() }), ...(task ? {} : { status: 'open' as const }) };
    const finish = () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }) }); onSaved(); };
    const fail = (error: Error) => setSaveError(error.message || 'Could not save. Try again.');
    if (task) update.mutate({ id: task.id, data }, { onSuccess: finish, onError: fail }); else create.mutate({ data }, { onSuccess: finish, onError: fail });
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(224_27%_5%/.76)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={task ? 'Edit task' : 'Capture task'}>
    <form onSubmit={submit} className="w-full max-w-[500px] rounded-3xl border border-border bg-card p-6 shadow-2xl sm:p-8" data-testid="form-task-editor">
      <div className="mb-7 flex items-start justify-between"><div><p className="mb-2 font-mono text-[10px] uppercase tracking-[.18em] text-primary">{task ? 'Refine task' : 'Quick capture'}</p><h2 className="text-2xl font-extrabold tracking-[-.05em]">{task ? 'Edit task' : 'What needs doing?'}</h2></div><button type="button" onClick={onClose} data-testid="button-close-editor" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X size={19} /></button></div>
      <label className="block"><span className="sr-only">Task title</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={240} placeholder="e.g. Send the proposal" data-testid="input-task-title" className="w-full border-b border-border bg-transparent pb-3 text-lg font-semibold outline-none placeholder:text-muted-foreground/55 focus:border-primary" /></label>
      <label className="mt-6 block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Notes <span className="normal-case tracking-normal opacity-60">optional</span></span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} placeholder="A little context for future you" data-testid="input-task-notes" className="w-full resize-none rounded-xl border border-border bg-muted/50 p-3 text-sm outline-none placeholder:text-muted-foreground/55 focus:border-primary" /></label>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><label><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Minutes</span><input type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="input-task-duration" className="h-11 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none focus:border-primary" /></label><label><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">When</span><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} data-testid="input-task-due" className="h-11 w-full rounded-xl border border-border bg-muted/50 px-3 text-xs outline-none focus:border-primary [color-scheme:dark]" /></label><label><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} data-testid="select-task-priority" className="h-11 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none focus:border-primary"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
      <label className="mt-4 block"><span className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Due in words <span className="normal-case tracking-normal opacity-60">optional · overrides "When"</span></span><input value={dueText} onChange={(e) => setDueText(e.target.value)} maxLength={120} placeholder="e.g. tomorrow 5pm" data-testid="input-task-duetext" className="h-11 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm outline-none placeholder:text-muted-foreground/55 focus:border-primary" /></label>
      {saveError && <p role="alert" data-testid="status-save-error" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/[.07] p-3 text-sm text-foreground">{saveError}</p>}
      <div className="mt-8 flex justify-end gap-3"><button type="button" onClick={onClose} data-testid="button-cancel-editor" className="min-h-11 rounded-xl px-4 text-sm font-bold text-muted-foreground hover:bg-muted">Cancel</button><button type="submit" disabled={pending || !title.trim()} data-testid="button-save-task" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Saving…' : task ? 'Save changes' : 'Add to today'}</button></div>
    </form>
  </div>;
}

function TaskList({ tasks, onRefresh, onEdit, emptyInbox = false }: { tasks: Task[]; onRefresh: () => void; onEdit: (task: Task) => void; emptyInbox?: boolean }) {
  if (!tasks.length) return <EmptyState inbox={emptyInbox} />;
  return <div className="space-y-3">{tasks.map((task) => <TaskRow task={task} key={task.id} onEdit={onEdit} onRefresh={onRefresh} />)}</div>;
}

function TodayPage() {
  const params = useMemo(() => ({ date: today(), scope: 'today' as const, timezone: timezone() }), []);
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, { query: { queryKey: getListTasksQueryKey(params) } });
  const summaryParams = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading: summaryLoading } = useGetTaskSummary(summaryParams, { query: { queryKey: getGetTaskSummaryQueryKey(summaryParams) } });
  const [capture, setCapture] = useState('');
  const [editing, setEditing] = useState<Task>();
  const create = useCreateTask();
  const queryClient = useQueryClient();
  const taskList = tasks ?? [];
   const submitCapture = (event: FormEvent) => { event.preventDefault(); if (!capture.trim()) return; create.mutate({ data: { title: capture.trim(), status: 'open', priority: 'medium', durationMin: 30, dueAt: new Date().toISOString() } }, { onSuccess: () => { setCapture(''); queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetTaskSummaryQueryKey(summaryParams) }); } }); };
  const next = taskList.find((task) => task.status !== 'completed');
  return <div className="animate-enter">
    <SectionHeading eyebrow="Today · ready when you are" title="Make room for the day." detail={dateLabel()} action={<button onClick={() => setEditing({} as Task)} data-testid="button-add-task" className="hidden min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:border-primary/50 hover:bg-muted sm:flex"><Plus size={16} /> Add task</button>} />
    <div className="grid gap-5 xl:grid-cols-[1fr_288px]">
      <div className="min-w-0">
        <form onSubmit={submitCapture} className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/35 bg-[hsl(25_97%_57%/.06)] p-3 shadow-[0_16px_40px_hsl(25_97%_57%/.04)]" data-testid="form-quick-capture"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Plus size={18} /></div><input value={capture} onChange={(e) => setCapture(e.target.value)} placeholder="Capture a task and keep moving…" data-testid="input-quick-capture" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/70" /><button type="submit" disabled={!capture.trim() || create.isPending} data-testid="button-submit-capture" className="hidden min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground disabled:opacity-40 sm:flex">Add <ArrowRight size={13} /></button></form>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-extrabold tracking-[-.02em]">Today's shape</h2><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{summaryLoading ? '—' : plural(summary?.open ?? 0, 'open')}</span></div>
        {isLoading ? <SkeletonList /> : isError ? <ErrorState onRetry={() => refetch()} /> : <TaskList tasks={taskList} onRefresh={() => refetch()} onEdit={setEditing} />}
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5" data-testid="card-progress"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Progress</p><MoreHorizontal size={16} className="text-muted-foreground" /></div><div className="mt-5 flex items-center gap-5"><ProgressRing completed={summary?.completed ?? 0} total={summary?.total ?? taskList.length} /><div><p className="font-mono text-xs text-muted-foreground">completed</p><p className="mt-1 text-xl font-extrabold tracking-[-.05em]">{summary?.completed ?? 0}<span className="text-sm font-medium text-muted-foreground"> / {summary?.total ?? taskList.length}</span></p></div></div><div className="mt-6 grid grid-cols-2 gap-2 border-t border-border pt-4"><div><p className="font-mono text-[10px] text-muted-foreground">OPEN</p><p className="mt-1 font-bold">{summary?.open ?? 0}</p></div><div><p className="font-mono text-[10px] text-muted-foreground">FOCUS TIME</p><p className="mt-1 font-bold">{summary?.focusMinutes ?? 0}<span className="ml-1 text-xs font-normal text-muted-foreground">min</span></p></div></div></div>
        <div className="rounded-2xl border border-border bg-card p-5" data-testid="card-next-task"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Next up</p><ChevronRight size={15} className="text-muted-foreground" /></div>{next ? <><p className="mt-5 text-sm font-bold leading-6">{next.title}</p><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 size={13} /> {next.durationMin} min</span><Link href="/focus" data-testid="link-start-focus" className="flex items-center gap-1 font-bold text-primary hover:underline">Start focus <ArrowRight size={13} /></Link></div></> : <p className="mt-5 text-sm leading-6 text-muted-foreground">Nothing waiting. Add a task when it earns a place here.</p>}</div>
      </aside>
    </div>
    {editing && <TaskEditor task={editing.id ? editing : undefined} onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)} />}
  </div>;
}

function InboxPage() {
  const params = useMemo(() => ({ scope: 'inbox' as const }), []);
  const { data: tasks, isLoading, isError, refetch } = useListTasks(params, { query: { queryKey: getListTasksQueryKey(params) } });
  const [editing, setEditing] = useState<Task>();
  const queryClient = useQueryClient();
  const update = useUpdateTask();
  const schedule = (task: Task) => update.mutate({ id: task.id, data: { status: 'open', dueAt: new Date().toISOString() } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey(params) }); queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ date: today(), scope: 'today' }) }); setEditing(undefined); } });
  return <div className="animate-enter"><SectionHeading eyebrow="Inbox · loose threads" title="Give it a place." detail="Unscheduled captures, waiting for a little attention." action={<span className="rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[10px] text-muted-foreground">{tasks?.length ?? 0} waiting</span>} /><div className="max-w-[760px]">{isLoading ? <SkeletonList /> : isError ? <ErrorState onRetry={() => refetch()} /> : !tasks?.length ? <EmptyState inbox /> : <div className="space-y-3">{tasks.map((task) => <div key={task.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid={`card-inbox-task-${task.id}`}><div className="flex items-start gap-3"><Circle size={19} className="mt-0.5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="font-semibold">{task.title}</p>{task.notes && <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.notes}</p>}<p className="mt-3 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{plural(task.durationMin, 'min', '')} · captured {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(task.createdAt))}</p></div><button onClick={() => setEditing(task)} data-testid={`button-edit-inbox-${task.id}`} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil size={15} /></button></div><div className="mt-4 flex justify-end border-t border-border pt-3"><button onClick={() => schedule(task)} disabled={update.isPending} data-testid={`button-schedule-task-${task.id}`} className="flex min-h-10 items-center gap-2 rounded-lg bg-primary/[.12] px-3 text-xs font-extrabold text-primary hover:bg-primary/[.18]">Schedule for today <ArrowRight size={14} /></button></div></div>)}</div>}</div>{editing && <TaskEditor task={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refetch(); }} />}</div>;
}

function FocusPage() {
  const params = useMemo(
    () => ({ date: today(), scope: 'today' as const, timezone: timezone() }),
    [],
  );
  const { data: tasks, isLoading } = useListTasks(params, {
    query: { queryKey: getListTasksQueryKey(params) },
  });
  const { data: sessions } = useListFocusSessions(params, {
    query: { queryKey: getListFocusSessionsQueryKey(params) },
  });
  const create = useCreateFocusSession();
  const update = useUpdateFocusSession();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<FocusSession>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const baseSeconds = useRef(0);
  const next = tasks?.find((task) => task.status !== 'completed');
  const currentTask = tasks?.find((task) => task.id === session?.taskId) ?? next;

  useEffect(() => {
    if (session || !sessions?.length) return;
    const existing = sessions.find((item) => item.status === 'active' || item.status === 'paused');
    if (!existing) return;
    setSession(existing);
    baseSeconds.current = existing.elapsedMinutes * 60;
    setElapsedSeconds(baseSeconds.current);
    if (existing.status === 'active') setRunStartedAt(Date.now());
  }, [session, sessions]);

  useEffect(() => {
    if (!session || session.status !== 'active' || runStartedAt === null) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(
        baseSeconds.current + Math.floor((Date.now() - runStartedAt) / 1000),
      );
    }, 1000);
    return () => window.clearInterval(interval);
  }, [runStartedAt, session?.status]);

  const refreshFocus = () => {
    queryClient.invalidateQueries({ queryKey: getListFocusSessionsQueryKey(params) });
    queryClient.invalidateQueries({
      queryKey: getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() }),
    });
  };
  const start = () => {
    if (!currentTask) return;
    create.mutate(
      { data: { taskId: currentTask.id, plannedMinutes: currentTask.durationMin } },
      {
        onSuccess: (created) => {
          baseSeconds.current = 0;
          setElapsedSeconds(0);
          setSession(created);
          setRunStartedAt(Date.now());
        },
      },
    );
  };
  const transition = (status: 'active' | 'paused' | 'completed') => {
    if (!session) return;
    const nowSeconds =
      session.status === 'active' && runStartedAt !== null
        ? baseSeconds.current + Math.floor((Date.now() - runStartedAt) / 1000)
        : elapsedSeconds;
    const data = {
      status,
      elapsedMinutes: Math.floor(nowSeconds / 60),
      ...(status === 'completed'
        ? { endedAt: new Date().toISOString() }
        : {}),
    };
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
        eyebrow="Focus · one thing at a time"
        title="Your attention, here."
        detail="Start a real round, pause when life interrupts, and keep the minutes that actually happened."
      />
      <div className="mx-auto max-w-[700px]">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-7 sm:p-10">
          <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/[.06] blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.15em] text-primary">
                <span className={`size-1.5 rounded-full ${isRunning ? 'animate-pulse bg-primary' : 'bg-muted-foreground'}`} />
                {isFinished ? 'Round complete' : isRunning ? 'In focus' : session ? 'Paused' : 'Ready'}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {session?.plannedMinutes ?? currentTask?.durationMin ?? 25} min round
              </span>
            </div>
            {isLoading ? (
              <div className="mt-16 h-28 animate-pulse rounded-2xl bg-muted" />
            ) : currentTask ? (
              <>
                <p className="mt-14 max-w-lg text-3xl font-extrabold leading-tight tracking-[-.06em]">
                  {currentTask.title}
                </p>
                <div className="mt-8">
                  <div className="flex items-end justify-between">
                    <span className="font-mono text-6xl font-medium tracking-[-.08em]">
                      {formatTimer(elapsedSeconds)}
                    </span>
                    <span className="font-mono text-xs text-primary">{percent}%</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <p className="mt-5 text-sm text-muted-foreground">
                  {isFinished
                    ? 'This round is recorded in today’s review.'
                    : session
                      ? 'Your elapsed time is saved when you pause or finish.'
                      : 'One deliberate round is enough to begin.'}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  {!session ? (
                    <button onClick={start} disabled={create.isPending} data-testid="button-begin-focus" className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50">
                      <Play size={17} /> {create.isPending ? 'Starting…' : 'Begin focus'}
                    </button>
                  ) : !isFinished ? (
                    <>
                      <button onClick={() => transition(isRunning ? 'paused' : 'active')} disabled={update.isPending} data-testid="button-toggle-focus" className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-50">
                        {isRunning ? <Pause size={17} /> : <Play size={17} />}
                        {isRunning ? 'Pause' : 'Resume'}
                      </button>
                      <button onClick={() => transition('completed')} disabled={update.isPending} data-testid="button-complete-focus" className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-5 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                        <Square size={15} /> Finish round
                      </button>
                    </>
                  ) : (
                    <button onClick={() => { setSession(undefined); setElapsedSeconds(0); baseSeconds.current = 0; }} data-testid="button-new-focus" className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground">
                      <Focus size={17} /> Start another
                    </button>
                  )}
                  <Link href="/today" data-testid="link-return-today" className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-5 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground">
                    Back to today
                  </Link>
                </div>
              </>
            ) : (
              <div className="py-16 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted"><Focus size={23} className="text-muted-foreground" /></div>
                <h2 className="mt-5 text-xl font-extrabold">Nothing queued for focus</h2>
                <p className="mt-2 text-sm text-muted-foreground">Add a task to today and it will be ready here.</p>
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {['A task at a time', 'Saved when paused', 'Real progress'].map((item, index) => (
            <div className="rounded-xl border border-border/70 bg-card/50 p-4" key={item}>
              <p className="font-mono text-[10px] text-primary">0{index + 1}</p>
              <p className="mt-3 text-xs font-bold">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const [editing, setEditing] = useState<Task>();
  const dayParams = useMemo(
    () => ({ date: selectedDate, scope: 'today' as const, timezone: timezone() }),
    [selectedDate],
  );
  const allParams = useMemo(() => ({ scope: 'all' as const }), []);
  const { data: dayTasks, isLoading, isError, refetch } = useListTasks(dayParams, {
    query: { queryKey: getListTasksQueryKey(dayParams) },
  });
  const { data: allTasks } = useListTasks(allParams, {
    query: { queryKey: getListTasksQueryKey(allParams) },
  });
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(startOfWeek(selectedDate), index));
  const firstOfMonth = parseDateKey(monthStart(selectedDate));
  const daysInMonth = parseDateKey(monthEnd(selectedDate)).getDate();
  const monthCells = Array.from(
    { length: firstOfMonth.getDay() + daysInMonth },
    (_, index) => index - firstOfMonth.getDay() + 1,
  );
  const tasksOn = (value: string) =>
    allTasks?.filter((task) => task.dueAt && dateKey(new Date(task.dueAt)) === value) ?? [];
  const move = (amount: number) => {
    if (view === 'day') setSelectedDate(shiftDate(selectedDate, amount));
    else if (view === 'week') setSelectedDate(shiftDate(selectedDate, amount * 7));
    else {
      const date = parseDateKey(selectedDate);
      date.setMonth(date.getMonth() + amount);
      setSelectedDate(dateKey(date));
    }
  };
  const heading = view === 'month' ? monthHeading(selectedDate) : dateHeading(selectedDate);

  return (
    <div className="animate-enter">
      <SectionHeading
        eyebrow="Calendar · the wider view"
        title="See the shape of time."
        detail="Schedule a day without losing the flexibility to move with it."
        action={<button onClick={() => setEditing({} as Task)} data-testid="button-calendar-add" className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:border-primary/50 hover:bg-muted"><Plus size={16} /> Add task</button>}
      />
      <div className="rounded-3xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="flex items-center gap-2">
            <button onClick={() => move(-1)} aria-label="Previous period" className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted"><ChevronLeft size={16} /></button>
            <button onClick={() => setSelectedDate(today())} className="rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground hover:bg-muted">Today</button>
            <button onClick={() => move(1)} aria-label="Next period" className="grid size-9 place-items-center rounded-lg border border-border hover:bg-muted"><ChevronRight size={16} /></button>
            <h2 className="ml-2 text-lg font-extrabold tracking-[-.04em]">{heading}</h2>
          </div>
          <div className="flex rounded-xl border border-border bg-muted/40 p-1">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button key={item} onClick={() => setView(item)} className={`rounded-lg px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.12em] ${view === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>
            ))}
          </div>
        </div>
        {view === 'day' && (
          <div className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-primary">{dayTasks?.length ?? 0} scheduled</p>
              <span className="font-mono text-[10px] text-muted-foreground">{timezone()}</span>
            </div>
            {isLoading ? <SkeletonList /> : isError ? <ErrorState onRetry={() => refetch()} /> : <TaskList tasks={dayTasks ?? []} onRefresh={() => refetch()} onEdit={setEditing} />}
          </div>
        )}
        {view === 'week' && (
          <div className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day) => (
              <button key={day} onClick={() => { setSelectedDate(day); setView('day'); }} className={`min-h-32 rounded-2xl border p-3 text-left transition-colors hover:border-primary/50 ${day === selectedDate ? 'border-primary bg-primary/[.08]' : 'border-border bg-muted/20'}`}>
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(parseDateKey(day))}</span>
                <span className="mt-2 block text-xl font-extrabold">{parseDateKey(day).getDate()}</span>
                <span className="mt-5 block font-mono text-[10px] text-primary">{tasksOn(day).length} task{tasksOn(day).length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        )}
        {view === 'month' && (
          <div className="pt-6">
            <div className="mb-2 grid grid-cols-7 gap-2 text-center font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthCells.map((day, index) => {
                const value = day < 1 || day > daysInMonth ? '' : dateKey(new Date(parseDateKey(selectedDate).getFullYear(), parseDateKey(selectedDate).getMonth(), day));
                return value ? <button key={value} onClick={() => { setSelectedDate(value); setView('day'); }} className={`min-h-20 rounded-xl border p-2 text-left ${value === selectedDate ? 'border-primary bg-primary/[.08]' : 'border-border bg-muted/20 hover:border-primary/50'}`}><span className="text-sm font-bold">{day}</span><span className="mt-3 block font-mono text-[10px] text-primary">{tasksOn(value).length ? `${tasksOn(value).length} task${tasksOn(value).length === 1 ? '' : 's'}` : ''}</span></button> : <span key={`empty-${index}`} className="min-h-20 rounded-xl border border-transparent" />;
              })}
            </div>
          </div>
        )}
      </div>
      {editing && <TaskEditor task={editing.id ? editing : undefined} defaultDate={selectedDate} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refetch(); }} />}
    </div>
  );
}

function ReviewPage() {
  const params = useMemo(() => ({ date: today(), timezone: timezone() }), []);
  const { data: summary, isLoading, isError, refetch } = useGetTaskSummary(params, { query: { queryKey: getGetTaskSummaryQueryKey(params) } });
  const listParams = useMemo(() => ({ date: today(), scope: 'today' as const, timezone: timezone() }), []);
  const { data: tasks } = useListTasks(listParams, { query: { queryKey: getListTasksQueryKey(listParams) } });
  return <div className="animate-enter"><SectionHeading eyebrow="Review · close the loop" title="Notice what moved." detail="A small read on today's work, based on what actually happened." />{isLoading ? <div className="grid gap-4 sm:grid-cols-2"><div className="h-52 animate-pulse rounded-2xl bg-card" /><div className="h-52 animate-pulse rounded-2xl bg-card" /></div> : isError ? <ErrorState onRetry={() => refetch()} /> : <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-border bg-card p-6 sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">Today's progress</p><div className="mt-8 flex items-center gap-7"><ProgressRing completed={summary?.completed ?? 0} total={summary?.total ?? 0} size={142} /><div><p className="text-3xl font-extrabold tracking-[-.07em]">{summary?.completed ?? 0}</p><p className="mt-1 text-sm text-muted-foreground">of {summary?.total ?? 0} tasks completed</p></div></div><div className="mt-8 border-t border-border pt-5"><p className="text-sm leading-6 text-muted-foreground">{summary?.completed ? `You moved ${plural(summary.completed, 'task', '')} forward today.` : 'The day is still open. One clear task is enough to begin.'}</p></div></div><div className="rounded-2xl border border-border bg-card p-6 sm:p-8"><div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">The ledger</p><span className="font-mono text-xs text-primary">{summary?.focusMinutes ?? 0} min focused</span></div><div className="mt-7 space-y-4">{tasks?.filter((task) => task.status === 'completed').slice(0, 5).map((task) => <div key={task.id} className="flex items-center gap-3" data-testid={`review-task-${task.id}`}><span className="grid size-6 place-items-center rounded-full bg-emerald-400/15 text-emerald-400"><Check size={13} strokeWidth={3} /></span><span className="truncate text-sm font-semibold">{task.title}</span><span className="ml-auto font-mono text-[10px] text-muted-foreground">{task.durationMin}m</span></div>)}{!tasks?.some((task) => task.status === 'completed') && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Completed tasks will settle here.</div>}</div></div></div>}</div>;
}

function LoadingScreen() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background text-foreground">
      <div className="text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_30px_hsl(25_97%_57%/.2)]">
          <span className="font-mono text-sm font-medium">C</span>
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
          Loading your cadence
        </p>
      </div>
    </div>
  );
}

function LandingPage() {
  return (
    <main className="noise grid min-h-[100dvh] place-items-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-[720px] text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_40px_hsl(25_97%_57%/.25)]">
          <span className="font-mono text-lg font-medium">C</span>
        </div>
        <p className="mt-8 font-mono text-[10px] uppercase tracking-[.25em] text-primary">
          A personal time OS
        </p>
        <h1 className="mt-4 text-5xl font-extrabold tracking-[-.08em] sm:text-7xl">
          Make room for the day.
        </h1>
        <p className="mx-auto mt-6 max-w-[500px] text-base leading-7 text-muted-foreground sm:text-lg">
          Capture what matters, choose your next move, and build momentum without
          turning your life into an admin dashboard.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href="/sign-up"
            data-testid="link-landing-sign-up"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Create your cadence <ArrowRight size={16} className="ml-2" />
          </Link>
          <Link
            href="/sign-in"
            data-testid="link-landing-sign-in"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold text-foreground hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
        <div className="mt-16 grid gap-3 text-left sm:grid-cols-3">
          {[
            ['01', 'Capture quickly', 'Get the thought out of your head.'],
            ['02', 'See today clearly', 'Know what deserves your attention now.'],
            ['03', 'Move with focus', 'Let real progress replace noisy motivation.'],
          ].map(([number, title, detail]) => (
            <div key={number} className="rounded-2xl border border-border bg-card/70 p-5">
              <p className="font-mono text-[10px] text-primary">{number}</p>
              <p className="mt-4 text-sm font-extrabold">{title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/today" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function ProtectedRouter() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();

  if (!isLoaded) return <LoadingScreen />;
  if (!isSignedIn) return <Redirect to="/" />;

  return (
    <ErrorBoundary resetKey={location}>
      <AppShell>
        <Switch>
          <Route path="/today" component={TodayPage} />
          <Route path="/inbox" component={InboxPage} />
          <Route path="/focus" component={FocusPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/review" component={ReviewPage} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </ErrorBoundary>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { userId } = useAuth();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const currentQueryClient = useQueryClient();

  useEffect(() => {
    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== userId
    ) {
      currentQueryClient.clear();
    }
    previousUserId.current = userId;
  }, [currentQueryClient, userId]);

  return null;
}

function Router() {
  const [location] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to return to your cadence',
          },
        },
        signUp: {
          start: {
            title: 'Create your cadence',
            subtitle: 'A clearer day starts here',
          },
        },
      }}
      routerPush={(to) => {
        window.history.pushState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
      routerReplace={(to) => {
        window.history.replaceState({}, '', stripBase(to));
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={ProtectedRouter} />
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <Router />
      </WouterRouter>
    </TooltipProvider>
  );
}

export default App;