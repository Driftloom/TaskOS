import { useState } from 'react';
import { Bell, Link2, Plus, Trash2, Loader2, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListTaskReminders,
  useCreateTaskReminder,
  useCreateAutoReminders,
  useUpdateReminder,
  useDeleteReminder,
  useListTaskFiles,
  useCreateTaskFile,
  useDeleteTaskFile,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Request failed';
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Reminders and link attachments for one task.
 *
 * Both had complete server routes and no client surface. Reminders are
 * Telegram-only because that is the channel the dispatcher can actually
 * deliver on; the panel does not pretend otherwise.
 */
export function TaskAttachments({
  taskId,
  dueAt,
}: {
  taskId: number;
  dueAt: string | null;
}) {
  const queryClient = useQueryClient();
  const { data: reminders } = useListTaskReminders(taskId);
  const { data: files } = useListTaskFiles(taskId);

  const createReminder = useCreateTaskReminder();
  const createAuto = useCreateAutoReminders();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const createFile = useCreateTaskFile();
  const deleteFile = useDeleteTaskFile();

  const [remindAt, setRemindAt] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId, 'reminders'] });
    queryClient.invalidateQueries({ queryKey: ['task', taskId, 'files'] });
  };

  const addReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remindAt) return;
    soundFX.playClick();
    createReminder.mutate(
      { id: taskId, data: { remindAt: new Date(remindAt).toISOString() } },
      {
        onSuccess: () => {
          invalidate();
          setRemindAt('');
          toast.success('Reminder scheduled');
        },
        onError: (err) => toast.error('Could not schedule', { description: errorMessage(err) }),
      },
    );
  };

  const addAutoReminders = () => {
    soundFX.playClick();
    createAuto.mutate(
      { id: taskId, data: dueAt ? { dueAt } : {} },
      {
        onSuccess: () => {
          invalidate();
          toast.success('Auto reminders created', {
            description: 'Derived from the due date across standard lead times.',
          });
        },
        onError: (err) =>
          toast.error('Could not create reminders', { description: errorMessage(err) }),
      },
    );
  };

  return (
    <div className="space-y-5 pt-4 border-t border-white/[0.06]">
      {/* Reminders */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="size-3.5 text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Reminders
          </h4>
          <span className="text-xs text-muted-foreground">Telegram only</span>
        </div>

        {reminders?.length ? (
          <div className="space-y-1.5">
            {reminders.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-card px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono text-muted-foreground shrink-0">
                  {fmt(r.remindAt)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-xs uppercase shrink-0 ${
                    r.status === 'sent'
                      ? 'bg-success/15 text-success'
                      : r.status === 'canceled'
                        ? 'bg-white/[0.06] text-muted-foreground'
                        : 'bg-accent/15 text-accent'
                  }`}
                >
                  {r.status}
                </span>
                {r.lastError && (
                  <span className="text-destructive truncate" title={r.lastError}>
                    {r.lastError}
                  </span>
                )}
                <span className="flex-1" />
                {r.status === 'pending' && (
                  <button
                    onClick={() =>
                      updateReminder.mutate(
                        { id: r.id, data: { status: 'canceled' } },
                        {
                          onSuccess: invalidate,
                          onError: (err) =>
                            toast.error('Could not cancel', { description: errorMessage(err) }),
                        },
                      )
                    }
                    className="text-muted-foreground hover:text-foreground text-xs shrink-0"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() =>
                    deleteReminder.mutate(
                      { id: r.id },
                      {
                        onSuccess: invalidate,
                        onError: (err) =>
                          toast.error('Could not delete', { description: errorMessage(err) }),
                      },
                    )
                  }
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Delete reminder"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No reminders on this task.</p>
        )}

        <form onSubmit={addReminder} className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className="h-8 flex-1 rounded-lg border border-border-control bg-card px-2.5 text-xs outline-none focus:border-accent text-foreground [color-scheme:dark]"
          />
          <button
            type="submit"
            disabled={!remindAt || createReminder.isPending}
            className="grid size-8 place-items-center rounded-lg bg-accent text-white disabled:opacity-50 transition-all active:scale-95 shrink-0 tap-target-expand"
            title="Add reminder"
          >
            {createReminder.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
          </button>
        </form>

        <button
          onClick={addAutoReminders}
          disabled={createAuto.isPending}
          className="flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
        >
          <Zap className="size-3" />
          {createAuto.isPending ? 'CreatingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦' : 'Auto-schedule from due date'}
        </button>
      </section>

      {/* Links */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="size-3.5 text-ai" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Links
          </h4>
        </div>

        {files?.length ? (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-card px-2.5 py-1.5 text-xs"
              >
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 truncate text-accent hover:underline"
                >
                  {f.name || f.url}
                </a>
                <button
                  onClick={() =>
                    deleteFile.mutate(
                      { id: f.id },
                      {
                        onSuccess: invalidate,
                        onError: (err) =>
                          toast.error('Could not remove', { description: errorMessage(err) }),
                      },
                    )
                  }
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Remove link"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No links attached.</p>
        )}

        <AddLink
          pending={createFile.isPending}
          onCreate={(name, url) =>
            createFile.mutate(
              { id: taskId, data: { name: name || null, url } },
              {
                onSuccess: () => {
                  invalidate();
                  toast.success('Link attached');
                },
                onError: (err) =>
                  toast.error('Could not attach link', { description: errorMessage(err) }),
              },
            )
          }
        />
      </section>
    </div>
  );
}

function AddLink({
  onCreate,
  pending,
}: {
  pending: boolean;
  onCreate: (name: string, url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-ai hover:underline"
      >
        <Plus className="size-3" />
        Attach a link
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        onCreate(name.trim(), url.trim());
        setName('');
        setUrl('');
        setOpen(false);
      }}
      className="space-y-2"
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"
        className="h-8 w-full rounded-lg border border-border-control bg-card px-2.5 text-xs outline-none focus:border-ai text-foreground"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Label (optional)"
        className="h-8 w-full rounded-lg border border-border-control bg-card px-2.5 text-xs outline-none focus:border-ai text-foreground"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!url.trim() || pending}
          className="h-7 px-3 rounded-lg bg-ai text-white text-xs font-semibold disabled:opacity-50 tap-target-expand"
        >
          Attach
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground tap-target-expand"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
