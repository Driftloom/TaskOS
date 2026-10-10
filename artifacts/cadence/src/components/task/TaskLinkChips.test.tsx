import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskLinkChips } from './TaskLinkChips';

const mockFiles = [
  {
    id: 1,
    taskId: 10,
    url: 'https://github.com/Driftloom/TaskOS/pull/14',
    name: 'PR #14: 10-Gate CI Alignment',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    taskId: 10,
    url: 'https://figma.com/file/12345/design',
    name: null,
    createdAt: new Date().toISOString(),
  },
];

vi.mock('@workspace/api-client-react', () => ({
  useListTaskFiles: (taskId: number) => {
    if (taskId === 10) {
      return { data: mockFiles, isLoading: false };
    }
    if (taskId === 50) {
      return { data: { error: 'Unauthorized' } as any, isLoading: false };
    }
    return { data: [], isLoading: false };
  },
}));

describe('TaskLinkChips', () => {
  it('renders nothing when there are no attached files', () => {
    const { container } = render(<TaskLinkChips taskId={99} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing and does not throw when files is not an array (e.g. error object)', () => {
    const { container } = render(<TaskLinkChips taskId={50} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders external link chips with appropriate labels and URLs', () => {
    render(<TaskLinkChips taskId={10} />);

    const chip1 = screen.getByTestId('task-link-chip-1');
    expect(chip1).toBeInTheDocument();
    expect(chip1).toHaveAttribute('href', 'https://github.com/Driftloom/TaskOS/pull/14');
    expect(chip1).toHaveAttribute('target', '_blank');
    expect(chip1).toHaveAttribute('rel', 'noreferrer noopener');
    expect(chip1).toHaveTextContent('PR #14: 10-Gate CI Alignment');

    const chip2 = screen.getByTestId('task-link-chip-2');
    expect(chip2).toBeInTheDocument();
    expect(chip2).toHaveAttribute('href', 'https://figma.com/file/12345/design');
    expect(chip2).toHaveTextContent('https://figma.com/file/12345/design');
  });

  it('stops event propagation on click so parent row handlers do not fire', () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <TaskLinkChips taskId={10} />
      </div>,
    );

    const chip1 = screen.getByTestId('task-link-chip-1');
    fireEvent.click(chip1);

    expect(parentClick).not.toHaveBeenCalled();
  });
});
