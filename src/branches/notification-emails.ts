import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isEmail,
} from 'class-validator';

/**
 * A branch's notification email may name several people — the office and the
 * head, say — written comma-separated. Semicolons and line breaks are taken
 * as separators too, since that is how addresses get pasted.
 */
export function parseNotificationEmails(value: unknown): string[] {
  const parts = String(value ?? '')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  // One person written twice is one email, not two; the first spelling stays.
  const seen = new Set<string>();
  return parts.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The stored form: "a@x.com, b@y.com", or null when there are none. */
export function formatNotificationEmails(value: unknown): string | null {
  const list = parseNotificationEmails(value);
  return list.length ? list.join(', ') : null;
}

@ValidatorConstraint({ name: 'notificationEmailList', async: false })
export class NotificationEmailListConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string') return false;
    const list = parseNotificationEmails(value);
    return list.length > 0 && list.every((address) => isEmail(address));
  }

  defaultMessage(args: ValidationArguments): string {
    const bad = parseNotificationEmails(args.value).filter(
      (address) => !isEmail(address),
    );
    return bad.length
      ? `notificationEmail has an address that is not valid: ${bad.join(', ')}`
      : 'notificationEmail must be one or more email addresses, separated by commas';
  }
}
