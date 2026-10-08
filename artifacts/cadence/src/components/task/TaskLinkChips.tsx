import { ExternalLink } from 'lucide-react';
import { useListTaskFiles } from '@workspace/api-client-react';

interface TaskLinkChipsProps {
  taskId: number;
}

export function TaskLinkChips({ taskId }: TaskLinkChipsProps) {
  const { data: files } = useListTaskFiles(taskId);

  if (!files || files.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1.5"
      data-testid={`task-link-chips-${taskId}`}
    >
      {files.map((file) => {
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
