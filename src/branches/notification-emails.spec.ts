import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchWorkspaceDto } from '../seller-workspace/dto/update-branch-workspace.dto';
import {
  formatNotificationEmails,
  parseNotificationEmails,
} from './notification-emails';

const errorsFor = async (notificationEmail: unknown) =>
  (
    await validate(
      plainToInstance(UpdateBranchWorkspaceDto, {
        notificationEmail,
      }) as object,
    )
  ).filter((e) => e.property === 'notificationEmail');

describe('branch notification emails', () => {
  it('splits on commas, semicolons and line breaks, and drops repeats', () => {
    expect(
      parseNotificationEmails(' a@x.com,b@y.com ; A@X.com\nc@z.com ,, '),
    ).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    expect(parseNotificationEmails(null)).toEqual([]);
  });

  it('stores the tidy form, or null for none', () => {
    expect(formatNotificationEmails('a@x.com;b@y.com')).toBe(
      'a@x.com, b@y.com',
    );
    expect(formatNotificationEmails(' , ')).toBeNull();
  });

  it('accepts one address or several', async () => {
    expect(await errorsFor('office@school.example')).toHaveLength(0);
    expect(
      await errorsFor('office@school.example, head@school.example'),
    ).toHaveLength(0);
    expect(await errorsFor(null)).toHaveLength(0);
    expect(await errorsFor('')).toHaveLength(0);
  });

  it('names the address that is not valid', async () => {
    const [error] = await errorsFor('office@school.example, head@');
    expect(Object.values(error.constraints ?? {})).toContain(
      'notificationEmail has an address that is not valid: head@',
    );
  });
});
