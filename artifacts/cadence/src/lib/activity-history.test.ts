import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearActivityHistory,
  getActivityHistory,
  recordActivity,
} from './activity-history';

describe('activity-history — client-side audit logging', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('records activities and retrieves them in newest-first order', () => {
    recordActivity({
      type: 'task_created',
      title: 'First task',
      description: 'Captured task',
    });

    recordActivity({
      type: 'task_completed',
      title: 'First task',
      description: 'Marked completed',
    });

    const history = getActivityHistory();
    expect(history.length).toBe(2);
    expect(history[0].type).toBe('task_completed');
    expect(history[1].type).toBe('task_created');
  });

  it('clears activity history', () => {
    recordActivity({
      type: 'focus_session_completed',
      title: 'Focus round',
    });
    expect(getActivityHistory().length).toBe(1);

    clearActivityHistory();
    expect(getActivityHistory().length).toBe(0);
  });
});
