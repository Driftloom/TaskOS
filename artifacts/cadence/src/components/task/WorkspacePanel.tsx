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

const SWATCHES = ['#FF9500', '#0A84FF', '#30D158', '#FF453A', '#5E5CE6', '#98989D'];

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
          <FolderKanban className="size-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Projects
          </h2>
          <span className="text-xs text-muted-foreground">({projects?.length ?? 0})</span>
        </div>

        <form onSubmit={addProject} className="flex items-center gap-2">
          <input
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            placeholder="New project name"
            className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-[#111113] px-3 text-xs outline-none focus:border-primary text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                aria-label={`Colour ${c}`}
                className={`size-5 rounded-md border-2 transition-all ${
                  newColor === c ? 'border-foreground scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={!newProject.trim() || createProject.isPending}
            className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 transition-all active:scale-95 shrink-0"
          >
            {createProject.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </button>
        </form>

        {projects?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1C1C1E] px-3 py-2"
              >
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color ?? '#98989D' }}
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
                    className="flex-1 bg-transparent text-xs outline-none text-foreground"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditingName(p.name);
                    }}
                    className="flex-1 text-left text-xs text-foreground truncate hover:text-primary transition-colors"
                    title="Rename"
                  >
                    {p.name}
                  </button>
                )}
                <button
                  onClick={() => removeProject(p.id, p.name)}
                  disabled={deleteProject.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
                  title="Delete project"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No projects yet. Tasks start unfiled; you can group them whenever you want.
          </p>
        )}
      </section>

      {/* Tags */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <TagIcon className="size-4 text-[#5E5CE6]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Tags
          </h2>
          <span className="text-xs text-muted-foreground">({tags?.length ?? 0})</span>
        </div>

        {tags?.length ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t.id}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-[#5E5CE6]/30 bg-[#5E5CE6]/10 px-2.5 py-1 text-xs text-[#5E5CE6]"
              >
                {t.name}
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
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                  title={`Remove ${t.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No tags yet. Tags are created automatically when you type them while editing a task.
          </p>
        )}
      </section>
    </div>
  );
}
