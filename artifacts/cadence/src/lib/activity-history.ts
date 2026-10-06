import { useEffect, useState } from 'react';

export type ActivityType =
  | 'task_created'
  | 'task_completed'
  | 'task_reopened'
  | 'task_deleted'
  | 'task_rescheduled'
  | 'focus_session_completed'
  | 'ritual_completed'
  | 'agent_action';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: string; // ISO-8601
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'cadence_activity_history_v1';
const BACKUP_STORAGE_KEY = 'cadence_activity_backup_v1';
const EVENT_NAME = 'cadence:activity-updated';
const MAX_ENTRIES = 1000;

export function getActivityHistory(): ActivityEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Fallback check to backup key in case of partial clearance
      const backupRaw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
      if (backupRaw) {
        const parsedBackup = JSON.parse(backupRaw);
        if (Array.isArray(parsedBackup)) return parsedBackup;
      }
      return [];
    }
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
      // Deduplicate by ID if already recorded
      const filtered = current.filter((item) => item.id !== entry.id);
      const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
      
      const serialized = JSON.stringify(updated);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      // Secondary backup for zero data loss
      window.localStorage.setItem(BACKUP_STORAGE_KEY, serialized);

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
    window.localStorage.removeItem(BACKUP_STORAGE_KEY);
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

export interface ActivityFilterOptions {
  type?: 'all' | ActivityType;
  dateRange?: 'today' | 'yesterday' | 'week' | 'month' | 'all';
  searchQuery?: string;
}

export function filterActivities(
  activities: ActivityEntry[],
  options: ActivityFilterOptions,
): ActivityEntry[] {
  const { type = 'all', dateRange = 'all', searchQuery = '' } = options;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const query = searchQuery.trim().toLowerCase();

  return activities.filter((item) => {
    // 1. Type filter
    if (type !== 'all' && item.type !== type) {
      return false;
    }

    // 2. Date range filter
    const itemDateStr = item.timestamp.slice(0, 10);
    const itemDate = new Date(item.timestamp);

    if (dateRange === 'today' && itemDateStr !== todayStr) {
      return false;
    }
    if (dateRange === 'yesterday' && itemDateStr !== yesterdayStr) {
      return false;
    }
    if (dateRange === 'week' && itemDate < sevenDaysAgo) {
      return false;
    }
    if (dateRange === 'month' && itemDate < thirtyDaysAgo) {
      return false;
    }

    // 3. Search query filter
    if (query) {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchDesc = item.description?.toLowerCase().includes(query) ?? false;
      if (!matchTitle && !matchDesc) {
        return false;
      }
    }

    return true;
  });
}

export function exportActivitiesJson(activities: ActivityEntry[]): void {
  if (typeof window === 'undefined') return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activities, null, 2));
  const anchor = document.createElement('a');
  anchor.setAttribute('href', dataStr);
  anchor.setAttribute('download', `cadence-activity-log-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function exportActivitiesCsv(activities: ActivityEntry[]): void {
  if (typeof window === 'undefined') return;
  const headers = ['Timestamp', 'Type', 'Title', 'Description'];
  const rows = activities.map((item) => [
    `"${item.timestamp}"`,
    `"${item.type}"`,
    `"${item.title.replace(/"/g, '""')}"`,
    `"${(item.description || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
  const anchor = document.createElement('a');
  anchor.setAttribute('href', dataStr);
  anchor.setAttribute('download', `cadence-activity-log-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
