import { useState } from 'react';
import { FolderKanban, Tag as TagIcon, Plus, Trash2, Loader2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTaskSummaryQueryKey,
  getListTasksQueryKey,
  useListProjects,
  useListTags,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useDeleteTag,
} from '@workspace/api-client-react';
import { today, timezone } from '@/lib/date-utils';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Request failed';
}

const SWATCHES = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--success))', 'hsl(var(--destructive))', 'hsl(var(--ai-fill))', 'hsl(var(--muted-foreground))'];

/**
 * Projects and tags, both of which had a full CRUD API and no UI at all.
 * Renaming a project is inline; deletion is confirmed because it re-files
 * tasks rather than deleting them.
 */
export function WorkspacePanel() {
  const queryClient = useQueryClient();
  const { data: projects } = useListProjects();
  const { data: tags } = useListTags();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const deleteTag = useDeleteTag();

  const [newProject, setNewProject] = useState('');
  const [newColor, setNewColor] = useState(SWATCHES[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  const summaryKey = getGetTaskSummaryQueryKey({ date: today(), timezone: timezone() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    queryClient.invalidateQueries({ queryKey: summaryKey });
  };

  const addProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    soundFX.playClick();
    createProject.mutate(
      { data: { name, color: newColor } },
      {
        onSuccess: () => {
          invalidate();
          setNewProject('');
          toast.success(`Project "${name}" created`);
        },
        onError: (err) => toast.error('Could not create project', { description: errorMessage(err) }),
      },
    );
  };

  const saveRename = (id: number) => {
    const name = editingName.trim();
    if (!name) return;
    updateProject.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          invalidate();
          setEditingId(null);
          toast.success('Project renamed');
        },
        onError: (err) => toast.error('Could not rename', { description: errorMessage(err) }),
      },
    );
  };

  const removeProject = (id: number, name: string) => {
    soundFX.playTactileClick();
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast.success(`"${name}" deleted`, {
            description: 'Its tasks were kept and are now unfiled.',
          });
        },
        onError: (err) => toast.error('Could not delete', { description: errorMessage(err) }),
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="workspace-panel">
      {/* Projects */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderKanban className="size-4 text-primary-text" />
          <h2 className="text-micro font-bold uppercase tracking-wider text-muted-foreground">
            Projects
          </h2>
          <span className="text-caption text-muted-foreground">({projects?.length ?? 0})</span>
        </div>

        {/* 44px floor, and this row is the reason it needed a layout answer
            rather than tap-target-expand. The swatches were `size-5` on a
            `gap-1` pitch, i.e. 24px between centres -- six of them, so
            expanding them would have produced six mutually overlapping hit
            areas. Instead each swatch is now a 44x44 button wrapping the same
            20px colour chip, and the cluster is allowed to wrap: at 390px the
            swatch row drops below the field instead of overflowing. `min-w-40`
            on the field is what makes that wrap happen predictably. */}
        <form onSubmit={addProject} className="flex flex-wrap items-center gap-2">
          <input
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            placeholder="New project name"
            aria-label="New project name"
            className="h-11 min-w-40 flex-1 rounded-lg border border-border-control bg-muted px-3 text-caption outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap items-center gap-0.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={newColor === c}
                className="grid size-11 shrink-0 place-items-center rounded-lg"
              >
                <span
                  className={`block size-5 rounded-md border-2 transition-all ${
                    newColor === c ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!newProject.trim() || createProject.isPending}
            aria-label="Create project"
            className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 transition-all active:scale-95"
          >
            {createProject.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
          </button>
        </form>

        {projects?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((p) => (
              // py-3, not py-2: the row has to be at least 36px tall for two
              // vertically adjacent 44px expanded controls to stay 44px apart
              // (36 + the grid's 8px gap). At py-2 the delete buttons in
              // consecutive rows were 2px from overlapping.
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-border-control bg-card px-3 py-3"
              >
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color ?? 'hsl(var(--muted-foreground))' }}
                />
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => saveRename(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(p.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={`Rename ${p.name}`}
                    className="flex-1 bg-transparent text-caption text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditingName(p.name);
                    }}
                    className="flex-1 text-left text-caption text-foreground truncate hover:text-primary-text transition-colors tap-target-expand"
                    title="Rename"
                  >
                    {p.name}
                  </button>
                )}
                <button
                  onClick={() => removeProject(p.id, p.name)}
                  disabled={deleteProject.isPending}
                  aria-label={`Delete project ${p.name}`}
                  className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 tap-target-expand"
                  title="Delete project"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">
            No projects yet. Tasks start unfiled; you can group them whenever you want.
          </p>
        )}
      </section>

      {/* Tags */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TagIcon className="size-4 text-ai-text" />
          <h2 className="text-micro font-bold uppercase tracking-wider text-muted-foreground">
            Tags
          </h2>
          <span className="text-caption text-muted-foreground">({tags?.length ?? 0})</span>
        </div>

        {tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-ai/30 bg-ai/10 px-2.5 py-1 text-caption text-ai-text"
              >
                {t.name}
                {/* This was `opacity-0 group-hover:opacity-100` wrapping a bare
                    12px <X/>, which is not a tap-target problem but a
                    functional one: on touch there is no hover, so the control
                    that deletes a tag could not be reached at all. It is now
                    permanently visible (at 70% ink, full on hover) and grown to
                    44x44 with tap-target-expand. Dense-cluster check: adjacent
                    chips are `gap-2` apart and even a one-character name puts
                    the two remove-button centres ~60px apart, so the expanded
                    boxes do not overlap. `aria-label` rather than visually
                    hidden text, because sr-only text inside the chip would make
                    the chip's text "engRemove eng" and break the e2e text
                    target that matches this chip by its exact text. */}
                <button
                  onClick={() => {
                    soundFX.playTactileClick();
                    deleteTag.mutate(
                      { id: t.id },
                      {
                        onSuccess: () => {
                          invalidate();
                          toast(`Tag "${t.name}" removed`);
                        },
                        onError: (err) =>
                          toast.error('Could not remove tag', { description: errorMessage(err) }),
                      },
                    );
                  }}
                  aria-label={`Remove ${t.name}`}
                  className="grid size-3 place-items-center text-ai-text/70 transition-colors hover:text-destructive tap-target-expand"
                  title={`Remove ${t.name}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-caption text-muted-foreground">
            No tags yet. Tags are created automatically when you type them while editing a task.
          </p>
        )}
      </section>
    </div>
  );
}
