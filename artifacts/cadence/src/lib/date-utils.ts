// Timezone and date arithmetic utilities for Cadence

export const timezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
};

export const today = (timeZone = timezone()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    const value = new Date();
    const offset = value.getTimezoneOffset();
    return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }
};

export const dateKey = (value: Date, timeZone = timezone()): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(value);
  } catch {
    const offset = value.getTimezoneOffset();
    return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 10);
  }
};

/** Converts a UTC ISO string to a local "YYYY-MM-DDTHH:mm" string for <input type="datetime-local">. */
export const toLocalDatetimeInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/** Converts a local "YYYY-MM-DDTHH:mm" input string back to an ISO UTC string. */
export const fromLocalDatetimeInput = (localStr: string | null | undefined): string | null => {
  if (!localStr || !localStr.trim()) return null;
  const d = new Date(localStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

export const parseDateKey = (value: string): Date => {
  return new Date(`${value}T12:00:00`);
};

export const shiftDate = (value: string, days: number): string => {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

export const monthStart = (value: string): string => {
  const date = parseDateKey(value);
  date.setDate(1);
  return dateKey(date);
};

export const monthEnd = (value: string): string => {
  const date = parseDateKey(value);
  date.setMonth(date.getMonth() + 1, 0);
  return dateKey(date);
};

export const startOfWeek = (value: string): string => {
  const date = parseDateKey(value);
  date.setDate(date.getDate() - date.getDay());
  return dateKey(date);
};

export const dateHeading = (value: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(parseDateKey(value));
};

export const monthHeading = (value: string): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parseDateKey(value));
};

export const formatTimer = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const dateLabel = (): string => {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
};

export const shortTime = (value: string | null | undefined): string => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

export const plural = (value: number, singular: string, suffix = 's'): string => {
  return `${value} ${value === 1 ? singular : singular + suffix}`;
};
