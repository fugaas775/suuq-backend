/**
 * Where a subscription is paid — and the ONLY places.
 *
 * Subscriptions are settled by a transfer the customer makes themselves, then
 * verified by an admin against the receipt they attach. Every bill the platform
 * shows prints these two destinations and no others; they are served to the
 * screens from here so no screen carries its own copy of an account number.
 *
 * Changing a number is a code change on purpose: a pay-to account must never be
 * editable from a form or an environment someone else can reach.
 */
export type SubscriptionPaymentChannel = 'EBIRR' | 'CBE';

export interface SubscriptionPaymentDestination {
  channel: SubscriptionPaymentChannel;
  /** What the customer sees: "Ebirr", "CBE account". */
  label: string;
  /** The number to send money to. */
  account: string;
  /** The name the customer should see on the receiving side. */
  accountName: string;
}

export const SUBSCRIPTION_PAYMENT_DESTINATIONS: readonly SubscriptionPaymentDestination[] =
  [
    {
      channel: 'EBIRR',
      label: 'Ebirr',
      account: '0915333513',
      accountName: 'Suuq S App',
    },
    {
      channel: 'CBE',
      label: 'CBE account',
      account: '1000285447578',
      accountName: 'Ugas Fuad Ugasafi',
    },
  ] as const;

export const SUBSCRIPTION_PAYMENT_CHANNELS: readonly SubscriptionPaymentChannel[] =
  SUBSCRIPTION_PAYMENT_DESTINATIONS.map((entry) => entry.channel);

export function findSubscriptionPaymentDestination(
  channel: string | null | undefined,
): SubscriptionPaymentDestination | undefined {
  const normalized = String(channel || '')
    .trim()
    .toUpperCase();
  return SUBSCRIPTION_PAYMENT_DESTINATIONS.find(
    (entry) => entry.channel === normalized,
  );
}
