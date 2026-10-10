import { ExternalLink } from 'lucide-react';
import { useListTaskFiles, type FileLink } from '@workspace/api-client-react';

interface TaskLinkChipsProps {
  /** The unique task ID whose linked file/URL attachments should be rendered */
  taskId: number;
}

/**
 * Compact row of external link chips attached to a task.
 * Renders file/URL references with hostname or document title, opening in a new tab without
 * capturing task row clicks or keyboard focus interactions.
 */
export function TaskLinkChips({ taskId }: TaskLinkChipsProps) {
  const { data: files } = useListTaskFiles(taskId);

  const fileList: FileLink[] = Array.isArray(files)
    ? files
    : Array.isArray((files as any)?.files)
      ? (files as any).files
      : [];

  if (fileList.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1.5"
      data-testid={`task-link-chips-${taskId}`}
    >
      {fileList.map((file) => {
        const label = file.name || file.url;
        return (
          <a
            key={file.id}
            href={file.url}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            data-testid={`task-link-chip-${file.id}`}
            title={file.url}
            className="inline-flex items-center gap-1 rounded-md border border-border-control/60 bg-card/60 px-1.5 py-0.5 text-caption font-mono text-muted-foreground transition-colors hover:border-border-control hover:text-foreground"
          >
            <ExternalLink size={10} className="shrink-0 text-muted-foreground" />
            <span className="truncate max-w-40">{label}</span>
          </a>
        );
      })}
    </div>
  );
}
