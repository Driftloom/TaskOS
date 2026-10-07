import { useMemo, useState } from 'react';
import {
  Folder,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  MoreVertical,
  X,
  Palette,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListProjectsQueryKey,
  getListTasksQueryKey,
  useCreateProject,
  useCreateTask,
  useDeleteProject,
  useListProjects,
  useListTasks,
  useUpdateProject,
  type Project,
  type Task,
} from '@workspace/api-client-react';
import { soundFX } from '@/lib/sound-fx';
import { toast } from 'sonner';
import { ErrorState, SectionHeading, SkeletonList } from '@/components/shared/StateViews';
import { TaskRow } from '@/components/task/TaskRow';
import { TaskEditor } from '@/components/task/TaskEditor';

import { tokens } from '@/styles/tokens.generated';

const colorPalette = tokens['global-color'];

export const PROJECT_COLORS = [
  { label: 'Blue', value: colorPalette['global-color-blue']['global-color-blue-600'] },
  { label: 'Orange', value: colorPalette['global-color-orange']['global-color-orange-600'] },
  { label: 'Green', value: colorPalette['global-color-green']['global-color-green-600'] },
  { label: 'Purple', value: colorPalette['global-color-categorical']['global-color-categorical-4'] },
  { label: 'Red', value: colorPalette['global-color-red']['global-color-red-600'] },
  { label: 'Yellow', value: colorPalette['global-color-yellow']['global-color-yellow-600'] },
  { label: 'Teal', value: colorPalette['global-color-teal']['global-color-teal-500'] },
];

/**
 * Enterprise Projects Screen (/projects).
 *
 * Implements System Requirements spec §3 IA:
 * `/projects` — Projects (Project list; per-project task view).
 */
export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'completed'>('open');

  // Form states for project create/edit
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState(PROJECT_COLORS[0].value);

  // Quick task input for current project
  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  // Fetch projects
  const {
    data: projects,
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
  } = useListProjects();

  // Fetch all user tasks
  const {
    data: allTasks,
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useListTasks();

  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const createTask = useCreateTask();

  const projectList = projects ?? [];
  const taskList = allTasks ?? [];

  // Active project selection fallback
  const activeProject = useMemo(() => {
    if (selectedProjectId !== null) {
      const found = projectList.find((p) => p.id === selectedProjectId);
      if (found) return found;
    }
    return projectList[0] ?? null;
  }, [projectList, selectedProjectId]);

  // Tasks for the active project
  const projectTasks = useMemo(() => {
    if (!activeProject) return [];
    return taskList.filter((task) => task.projectId === activeProject.id);
  }, [taskList, activeProject]);

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'open') return projectTasks.filter((t) => t.status !== 'completed');
    if (taskFilter === 'completed') return projectTasks.filter((t) => t.status === 'completed');
    return projectTasks;
  }, [projectTasks, taskFilter]);

  const handleOpenCreate = () => {
    soundFX.playClick();
    setProjectName('');
    setProjectColor(PROJECT_COLORS[0].value);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (project: Project) => {
    soundFX.playClick();
    setEditingProject(project);
    setProjectName(project.name);
    setProjectColor(project.color || PROJECT_COLORS[0].value);
  };

  const handleSaveProject = () => {
    if (!projectName.trim()) {
      toast.error('Project name cannot be empty');
      return;
    }

    if (editingProject) {
      updateProject.mutate(
        {
          id: editingProject.id,
          data: { name: projectName.trim(), color: projectColor },
        },
        {
          onSuccess: () => {
            soundFX.playCompletion();
            toast.success(`Project "${projectName}" updated`);
            setEditingProject(null);
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          },
          onError: (err: any) => {
            toast.error(err?.message || 'Failed to update project');
          },
        },
      );
    } else {
      createProject.mutate(
        {
          data: { name: projectName.trim(), color: projectColor },
        },
        {
          onSuccess: (newProj) => {
            soundFX.playCompletion();
            toast.success(`Project "${newProj.name}" created`);
            setIsCreateOpen(false);
            setSelectedProjectId(newProj.id);
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          },
          onError: (err: any) => {
            toast.error(err?.message || 'Failed to create project');
          },
        },
      );
    }
  };

  const handleDeleteProject = (projectId: number, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? Tasks in this project will not be deleted.`)) {
      return;
    }
    soundFX.playClick();
    deleteProject.mutate(
      { id: projectId },
      {
        onSuccess: () => {
          toast.success(`Project "${name}" deleted`);
          if (selectedProjectId === projectId) {
            setSelectedProjectId(null);
          }
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Failed to delete project');
        },
      },
    );
  };

  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim() || !activeProject) return;

    soundFX.playCompletion();
    createTask.mutate(
      {
        data: {
          title: quickTaskTitle.trim(),
          projectId: activeProject.id,
          priority: 'medium',
        },
      },
      {
        onSuccess: () => {
          setQuickTaskTitle('');
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err?.message || 'Failed to add task');
        },
      },
    );
  };

  if (projectsError) {
    return (
      <div className="animate-enter py-8">
        <ErrorState onRetry={() => refetchProjects()} />
      </div>
    );
  }

  return (
    <div className="animate-enter space-y-6">
      {/* Page Header */}
      <SectionHeading
        eyebrow="Workspaces & Lists"
        title="Projects"
        detail={`${projectList.length} active lists · Group tasks by client, initiative, or domain`}
        action={
          <button
            onClick={handleOpenCreate}
            data-testid="button-create-project"
            className="flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-caption font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 tap-target-expand"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Project</span>
          </button>
        }
      />

      {projectsLoading ? (
        <div className="calendar-cell">
          <SkeletonList />
        </div>
      ) : projectList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-control bg-muted/50 px-6 py-10 text-center transition-all">
          <div className="mx-auto grid size-9 place-items-center rounded-lg border border-border-control bg-card/[0.03] text-muted-foreground">
            <Layers size={18} />
          </div>
          <h3 className="mt-3 text-micro font-semibold text-foreground">No projects created yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-caption leading-5 text-muted-foreground">
            Group your tasks by client, initiative, or domain with custom color accents.
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border-control bg-card/[0.04] px-3.5 text-caption font-medium text-foreground hover:border-border-control hover:bg-card/[0.08] hover:text-foreground transition-all active:scale-[0.98] tap-target-expand"
          >
            <Plus size={14} />
            <span>Create First Project</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Project Sidebar Cards */}
          <div className="lg:col-span-4 space-y-2">
            <span className="font-mono text-caption uppercase tracking-wider text-muted-foreground font-semibold px-1">
              All Projects ({projectList.length})
            </span>

            <div className="space-y-1.5">
              {projectList.map((project) => {
                const isSelected = activeProject?.id === project.id;
                const projectTaskCount = taskList.filter((t) => t.projectId === project.id).length;
                const completedCount = taskList.filter(
                  (t) => t.projectId === project.id && t.status === 'completed',
                ).length;
                const accentColor = project.color || 'hsl(var(--primary))';

                return (
                  <div
                    key={project.id}
                    onClick={() => {
                      soundFX.playClick();
                      setSelectedProjectId(project.id);
                    }}
                    className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer tap-target-expand ${
                      isSelected
                        ? 'bg-card border-primary ring-1 ring-primary/30 shadow-md'
                        : 'bg-card/60 border-border-control hover:bg-card hover:border-border-control/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="size-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: accentColor }}
                      />
                      <div className="min-w-0">
                        <p className={`text-micro truncate font-semibold ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>
                          {project.name}
                        </p>
                        <p className="font-mono text-caption text-muted-foreground">
                          {projectTaskCount - completedCount} open · {completedCount} done
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(project);
                        }}
                        className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                        title="Edit project"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id, project.name);
                        }}
                        className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete project"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Project Task View */}
          <div className="lg:col-span-8 space-y-4">
            {activeProject ? (
              <div className="card-enterprise rounded-lg border border-border-control bg-card p-5 shadow-lg space-y-5">
                {/* Active Project Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border-control gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-4 rounded-full shrink-0 shadow-md"
                      style={{ backgroundColor: activeProject.color || 'hsl(var(--primary))' }}
                    />
                    <div>
                      <h2 className="text-macro font-bold tracking-tight text-foreground">
                        {activeProject.name}
                      </h2>
                      <p className="font-mono text-caption text-muted-foreground">
                        {projectTasks.length} tasks total ({projectTasks.filter((t) => t.status !== 'completed').length} pending)
                      </p>
                    </div>
                  </div>

                  {/* Task Status Filters */}
                  <div className="flex items-center gap-1 rounded-lg border border-border-control bg-muted/60 p-1 self-start sm:self-auto">
                    {(['open', 'completed', 'all'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          soundFX.playClick();
                          setTaskFilter(filter);
                        }}
                        className={`rounded-md px-2.5 py-1 text-caption font-semibold capitalize transition-colors tap-target-expand ${
                          taskFilter === filter
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Add Task to Project */}
                <form onSubmit={handleQuickAddTask} className="flex gap-2">
                  <input
                    type="text"
                    value={quickTaskTitle}
                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                    placeholder={`Add task to ${activeProject.name}...`}
                    className="flex-1 rounded-xl border border-border-control bg-muted/40 px-3.5 py-2 text-caption font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!quickTaskTitle.trim()}
                    className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-caption font-semibold text-primary-foreground shadow-sm transition-all disabled:opacity-40"
                  >
                    <Plus size={15} />
                    <span>Add</span>
                  </button>
                </form>

                {/* Task List */}
                <div className="space-y-2 pt-2">
                  {filteredTasks.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-caption text-muted-foreground font-mono">
                        No {taskFilter} tasks in this project.
                      </p>
                    </div>
                  ) : (
                    filteredTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onEdit={(t) => setEditingTask(t)}
                        onRefresh={() => refetchTasks()}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Create / Edit Project Modal */}
      {(isCreateOpen || editingProject) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-enter"
          onClick={() => {
            setIsCreateOpen(false);
            setEditingProject(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border-control bg-card p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border-control">
              <h3 className="text-callout font-bold text-foreground">
                {editingProject ? 'Edit Project' : 'New Project'}
              </h3>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingProject(null);
                }}
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-caption font-semibold text-foreground mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Mobile App Redesign, Tax Filing"
                  autoFocus
                  className="w-full rounded-xl border border-border-control bg-muted px-3 py-2 text-caption font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-caption font-semibold text-foreground mb-2">
                  Color Accent
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {PROJECT_COLORS.map(({ label, value }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setProjectColor(value)}
                      title={label}
                      className={`size-7 rounded-full transition-transform ${
                        projectColor === value
                          ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card'
                          : 'hover:scale-105 opacity-80'
                      }`}
                      style={{ backgroundColor: value }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border-control">
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingProject(null);
                }}
                className="rounded-xl border border-border-control px-4 py-2 text-caption font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={!projectName.trim()}
                className="rounded-xl bg-primary px-4 py-2 text-caption font-semibold text-primary-foreground shadow-sm transition-all disabled:opacity-40"
              >
                {editingProject ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Editor Modal when editing a task */}
      {editingTask && (
        <TaskEditor
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null);
            refetchTasks();
          }}
        />
      )}
    </div>
  );
}

export default ProjectsPage;
