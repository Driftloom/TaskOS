import { describe, expect, it } from 'vitest';
import {
  GetAgentUsageResponse,
  GetAutomationFlagsResponse,
  GetFocusSettingsResponse,
  GetIntegrationsStatusResponse,
  GetNotificationSettingsResponse,
  GetRescheduleSettingsResponse,
  GetSlippageReportResponse,
  GetVapidPublicKeyResponse,
  HealthCheckResponse,
  ListAgentActionsResponse,
  ListAgentCredentialsResponse,
  ListAgentModelsResponse,
  ListBlocksResponse,
  ListMemoryConfirmationsResponse,
  ListMemoryFactsResponse,
  ListProjectsResponse,
  ListRescheduleProposalsResponse,
  SaveAgentCredentialResponse,
  SendTestPushNotificationResponse,
  SubscribePushNotificationsResponse,
  UnsubscribePushNotificationsResponse,
} from '@workspace/api-zod';
import { MOCK_RESPONSES } from './fixtures';

/**
 * Every static mock response body in `MOCK_RESPONSES` must satisfy its
 * generated Zod contract. The registry is the single place a new mock entry
 * is wired to a schema, so a new mock cannot be added without a schema check.
 *
 * The keys must stay in 1:1 correspondence with `MOCK_RESPONSES`: both
 * directions are asserted below.
 */
const SCHEMAS: Record<string, { safeParse: (input: unknown) => { success: boolean } }> = {
  '/api/healthz': HealthCheckResponse,
  '/api/integrations/status': GetIntegrationsStatusResponse,
  '/api/integrations/push/vapid-key': GetVapidPublicKeyResponse,
  '/api/integrations/push/subscribe': SubscribePushNotificationsResponse,
  '/api/integrations/push/unsubscribe': UnsubscribePushNotificationsResponse,
  '/api/integrations/push/test': SendTestPushNotificationResponse,
  '/api/automation/flags': GetAutomationFlagsResponse,
  '/api/settings/rescheduling': GetRescheduleSettingsResponse,
  '/api/settings/notifications': GetNotificationSettingsResponse,
  '/api/settings/focus': GetFocusSettingsResponse,
  '/api/agent/usage': GetAgentUsageResponse,
  '/api/agent/actions': ListAgentActionsResponse,
  '/api/agent/credentials': ListAgentCredentialsResponse,
  '/api/agent/models/:provider': ListAgentModelsResponse,
  '/api/agent/credentials/:provider': SaveAgentCredentialResponse,
  '/api/reschedule/proposals': ListRescheduleProposalsResponse,
  '/api/analytics/slippage': GetSlippageReportResponse,
  '/api/memory/facts': ListMemoryFactsResponse,
  '/api/memory/confirmations': ListMemoryConfirmationsResponse,
  '/api/projects': ListProjectsResponse,
  '/api/blocks': ListBlocksResponse,
};

describe('E2E mock responses satisfy the API contract', () => {
  it('every mock response has a registered schema', () => {
    for (const path of Object.keys(MOCK_RESPONSES)) {
      expect(SCHEMAS).toHaveProperty(path);
    }
  });

  it('every registered schema has a mock response', () => {
    for (const path of Object.keys(SCHEMAS)) {
      expect(MOCK_RESPONSES).toHaveProperty(path);
    }
  });

  for (const [path, schema] of Object.entries(SCHEMAS)) {
    it(path, () => {
      expect(schema.safeParse(MOCK_RESPONSES[path]).success).toBe(true);
    });
  }
});
