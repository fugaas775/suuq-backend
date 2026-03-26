import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { AdminNotificationHistoryQueryDto } from './admin-notification-history-query.dto';

const validateDto = <T extends object>(cls: new () => T, input: object) => {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance as object);

  return { instance, errors };
};

const errorProperties = (errors: { property: string }[]) =>
  errors.map((error) => error.property);

describe('AdminNotificationHistoryQueryDto', () => {
  it('transforms valid notification history filters', () => {
    const { instance, errors } = validateDto(AdminNotificationHistoryQueryDto, {
      page: '2',
      limit: '50',
      type: NotificationType.ORDER,
      userId: '7',
    });

    expect(errors).toHaveLength(0);
    expect(instance).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 50,
        type: NotificationType.ORDER,
        userId: 7,
      }),
    );
  });

  it('rejects malformed notification history filters', () => {
    const { errors } = validateDto(AdminNotificationHistoryQueryDto, {
      page: '0',
      limit: 'abc',
      type: 'NOT_REAL',
      userId: '-5',
    });

    expect(errorProperties(errors)).toEqual(
      expect.arrayContaining(['page', 'limit', 'type', 'userId']),
    );
  });
});
