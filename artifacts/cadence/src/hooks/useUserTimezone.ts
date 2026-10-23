import { useGetNotificationSettings } from '@workspace/api-client-react';
import { timezone } from '@/lib/date-utils';

/**
 * The user's stored IANA timezone (from `notification_settings.timezone`),
 * falling back to the browser timezone until the settings query resolves.
 *
 * Every client-side day-boundary calculation (`today()`, `dateKey()`,
 * `shiftDate()`, `monthStart()`, `monthEnd()`, `startOfWeek()`) must use this
 * value instead of `timezone()` so the client and server agree on what "today"
 * means for the user.
 */
export function useUserTimezone(): string {
  const { data } = useGetNotificationSettings();
  return data?.timezone ?? timezone();
}
