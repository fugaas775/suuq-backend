import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProcurementWebhookRemediationActionQueryDto } from './procurement-webhook-remediation-action-query.dto';
import { ProcurementWebhookReplayOperationQueryDto } from './procurement-webhook-replay-operation-query.dto';
import { ProcurementWebhookReplayOperationSummaryQueryDto } from './procurement-webhook-replay-operation-summary-query.dto';
import {
  ProcurementWebhookReplayExecutionMode,
  ProcurementWebhookReplayOperationScope,
  ProcurementWebhookSubscriptionRemediationActionType,
} from './procurement-webhook-response.dto';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('Procurement webhook DTO validation', () => {
  describe('ProcurementWebhookReplayOperationQueryDto', () => {
    it('transforms valid replay operation filters into typed values', () => {
      const { instance, errors } = validateDto(
        ProcurementWebhookReplayOperationQueryDto,
        {
          page: '2',
          cursor: 'cursor_123',
          limit: '50',
          subscriptionId: '8',
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED,
          replayScope: ProcurementWebhookReplayOperationScope.SUBSCRIPTION,
          actorId: '14',
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
          previewConfirmed: 'true',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          page: 2,
          cursor: 'cursor_123',
          limit: 50,
          subscriptionId: 8,
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED,
          replayScope: ProcurementWebhookReplayOperationScope.SUBSCRIPTION,
          actorId: 14,
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
          previewConfirmed: true,
        }),
      );
    });

    it('rejects malformed replay operation filters', () => {
      const { errors } = validateDto(
        ProcurementWebhookReplayOperationQueryDto,
        {
          page: '0',
          limit: '500',
          subscriptionId: 'abc',
          replayExecutionMode: 'NOT_A_REAL_MODE',
          replayScope: 'NOT_A_REAL_SCOPE',
          actorId: '-4',
          actorEmail: 'not-an-email',
          from: 'not-a-date',
          to: 'also-not-a-date',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'page',
          'limit',
          'subscriptionId',
          'replayExecutionMode',
          'replayScope',
          'actorId',
          'actorEmail',
          'from',
          'to',
        ]),
      );
    });

    it('normalizes previewConfirmed strings to booleans', () => {
      const { instance, errors } = validateDto(
        ProcurementWebhookReplayOperationQueryDto,
        {
          previewConfirmed: 'false',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          previewConfirmed: false,
        }),
      );
    });
  });

  describe('ProcurementWebhookReplayOperationSummaryQueryDto', () => {
    it('transforms valid replay summary filters into typed values', () => {
      const { instance, errors } = validateDto(
        ProcurementWebhookReplayOperationSummaryQueryDto,
        {
          subscriptionId: '8',
          actorId: '14',
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          subscriptionId: 8,
          actorId: 14,
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
        }),
      );
    });

    it('rejects malformed replay summary filters', () => {
      const { errors } = validateDto(
        ProcurementWebhookReplayOperationSummaryQueryDto,
        {
          subscriptionId: '0',
          actorId: '-1',
          actorEmail: 'not-an-email',
          from: 'not-a-date',
          to: 'also-not-a-date',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'subscriptionId',
          'actorId',
          'actorEmail',
          'from',
          'to',
        ]),
      );
    });
  });

  describe('ProcurementWebhookRemediationActionQueryDto', () => {
    it('transforms valid remediation filters into typed values', () => {
      const { instance, errors } = validateDto(
        ProcurementWebhookRemediationActionQueryDto,
        {
          page: '3',
          cursor: 'cursor_999',
          limit: '25',
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_REQUESTED,
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED,
          replayScope: ProcurementWebhookReplayOperationScope.TENANT,
          actorId: '14',
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
          previewConfirmed: 'true',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          page: 3,
          cursor: 'cursor_999',
          limit: 25,
          actionType:
            ProcurementWebhookSubscriptionRemediationActionType.REPLAY_REQUESTED,
          replayExecutionMode:
            ProcurementWebhookReplayExecutionMode.PREVIEW_CONFIRMED,
          replayScope: ProcurementWebhookReplayOperationScope.TENANT,
          actorId: 14,
          actorEmail: 'ops@example.com',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-21T00:00:00.000Z',
          previewConfirmed: true,
        }),
      );
    });

    it('rejects malformed remediation filters', () => {
      const { errors } = validateDto(
        ProcurementWebhookRemediationActionQueryDto,
        {
          page: '0',
          limit: '500',
          actionType: 'NOT_A_REAL_ACTION',
          replayExecutionMode: 'NOT_A_REAL_MODE',
          replayScope: 'NOT_A_REAL_SCOPE',
          actorId: '-4',
          actorEmail: 'not-an-email',
          from: 'not-a-date',
          to: 'also-not-a-date',
        },
      );

      expect(errorProperties(errors)).toEqual(
        expect.arrayContaining([
          'page',
          'limit',
          'actionType',
          'replayExecutionMode',
          'replayScope',
          'actorId',
          'actorEmail',
          'from',
          'to',
        ]),
      );
    });

    it('normalizes previewConfirmed strings to booleans', () => {
      const { instance, errors } = validateDto(
        ProcurementWebhookRemediationActionQueryDto,
        {
          previewConfirmed: 'false',
        },
      );

      expect(errors).toHaveLength(0);
      expect(instance).toEqual(
        expect.objectContaining({
          previewConfirmed: false,
        }),
      );
    });
  });
});
