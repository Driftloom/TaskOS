import { useEffect, useState } from 'react';

export type ActivityType =
  | 'task_created'
  | 'task_completed'
  | 'task_reopened'
  | 'task_deleted'
  | 'focus_session_completed'
  | 'ritual_completed';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string; // ISO-8601
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'cadence_activity_history_v1';
const EVENT_NAME = 'cadence:activity-updated';
const MAX_ENTRIES = 500;

export function getActivityHistory(): ActivityEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function recordActivity(
  input: Omit<ActivityEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
): ActivityEntry {
  const entry: ActivityEntry = {
    id: input.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    timestamp: input.timestamp || new Date().toISOString(),
    type: input.type,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  if (typeof window !== 'undefined') {
    try {
      const current = getActivityHistory();
      const updated = [entry, ...current].slice(0, MAX_ENTRIES);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: entry }));
    } catch (e) {
      console.warn('Could not record activity to localStorage:', e);
    }
  }

  return entry;
}

export function clearActivityHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch (e) {
    console.warn('Could not clear activity history:', e);
  }
}

export function useActivityHistory() {
  const [activities, setActivities] = useState<ActivityEntry[]>(() => getActivityHistory());

  useEffect(() => {
    const handler = () => {
      setActivities(getActivityHistory());
    };

    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return {
    activities,
    clearHistory: clearActivityHistory,
    count: activities.length,
  };
}
